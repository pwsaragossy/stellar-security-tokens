/**
 * IssuerWatcher — Chain-side compromise detector for the security-token issuer.
 *
 * THREAT MODEL
 * ------------
 * The security token is a raw Stellar Asset Contract (SAC). Every SAC admin op
 * (mint / clawback / set_admin / set_authorized) authorizes against the issuer
 * account's Soroban `require_auth` at MEDIUM threshold. The platform set the
 * issuer's med_threshold=2 and gave the hot "Operations" key weight 2 so it can
 * auto-authorize investors on purchase (`set_authorized`). Side effect: that
 * same hot key can ALSO mint unlimited tokens or claw holders back. Threshold
 * cannot separate "authorize" from "mint/clawback" — all are medium. So the
 * only mitigation is DETECTION + ALERTING: mint/clawback/config-change are rare
 * and operator-initiated, so an unexpected alert == probable key compromise.
 *
 * WHAT IT WATCHES (two complementary detectors, both off-by-default-safe)
 * ----------------------------------------------------------------------
 *   (A) SAC contract events via Soroban RPC getEvents — catches mint / clawback
 *       / set_admin / set_authorized on each security-token SAC. These run as
 *       `invoke_host_function`, NOT classic ops, so this is the ONLY way to see
 *       a SAC mint/clawback. Mirrors SorobanEventIndexer exactly (getEvents +
 *       cursor in SystemConfig). SAC ids come from the Token registry
 *       (`Token.sacContractId`), falling back to StellarService.getSACContractId.
 *
 *   (B) Issuer classic operations via Horizon streaming — catches issuer config
 *       changes (`set_options` -> threshold/signer/flag edits, `account_merge`)
 *       and any CLASSIC-path issuance/clawback (`payment` sourced by the issuer,
 *       `clawback`, `clawback_claimable_balance`). Mirrors PaymentMonitor's
 *       Horizon stream (reconnect/backoff, dedupe by paging_token).
 *
 * ALERTING
 * --------
 * Every detection -> EmailService.sendAdminAlert(ADMIN_ALERT_EMAIL, ...) (the same
 * mechanism WalletMonitorService uses) + structured log + admin DB notifications.
 * Alerting on EVERY mint and EVERY clawback is intentional: they are rare and
 * each one should be human-confirmed.
 *
 * LIFECYCLE
 * ---------
 * Object-literal start()/stop() mirroring WalletMonitorService / DormantAlertMonitor.
 * Idempotent, never throws into the event loop, registered from src/index.js at
 * startup with graceful SIGTERM shutdown. Gated by ENABLE_ISSUER_WATCHER
 * (default ON — this is a security control, not a feature).
 */

import { Asset, xdr, scValToNative } from '@stellar/stellar-sdk';
import { stellarServer, getSorobanServer } from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import { EmailService } from './email.service.js';
import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';

const log = logger.scope('IssuerWatcher');

// --- Tunables (env-overridable, sane defaults) ---
const RECONNECT_DELAY = parseInt(process.env.ISSUER_WATCHER_RECONNECT_DELAY || '5000', 10);
const SAC_POLL_INTERVAL_MS = parseInt(process.env.ISSUER_WATCHER_SAC_POLL_MS || '30000', 10); // 30s, like SorobanEventIndexer
const INITIAL_LOOKBACK_LEDGERS = 60; // ~5 min at 5s/ledger — matches SorobanEventIndexer
const MAX_EVENTS = 100;
const MAX_RECONNECT_ATTEMPTS = 10;
// In-memory dedupe cap so a long-lived process doesn't grow unbounded.
const SEEN_OP_CAP = 5000;

// SystemConfig key prefix for SAC-event cursors (key column is varchar(50);
// contract ids are 56 chars -> prefix + last 40 chars stays within budget).
const CURSOR_PREFIX = 'secwatch_';
const cursorKey = (contractId) => `${CURSOR_PREFIX}${contractId.slice(-40)}`;

// --- SAC event classification (topic[0] symbol -> alert metadata) ---
// Topics per the canonical Stellar Asset Contract spec:
//   mint           -> ["mint", to],                data = amount (i128)
//   clawback       -> ["clawback", admin, to],     data = amount (i128)
//   set_admin      -> ["set_admin", admin],        data = new_admin (Address)
//   set_authorized -> ["set_authorized", id],      data = authorize (bool)
const SAC_EVENT_CONFIG = {
  mint: { severity: 'error', label: '🚨 SAC MINT detected', describe: (d) => `amount=${d?.amount ?? d}` },
  clawback: { severity: 'error', label: '🚨 SAC CLAWBACK detected', describe: (d) => `amount=${d?.amount ?? d}` },
  set_admin: { severity: 'error', label: '🚨 SAC set_admin (issuer admin handover)', describe: (d) => `new_admin=${d?.newAdmin ?? d}` },
  // set_authorized is the EXPECTED hot-path (investor authorization on purchase),
  // so it is logged but NOT alerted by default — alerting on it would be pure noise.
  set_authorized: { severity: 'info', alertOff: true, label: 'SAC set_authorized', describe: (d) => `authorize=${d}` },
};

// --- Horizon issuer-operation classification (op.type -> alert metadata) ---
// `payment` is special-cased: only alert when the issuer is the SOURCE (classic
// issuance/mint) — inbound payments TO the issuer are not issuance.
const ISSUER_OP_CONFIG = {
  set_options: { severity: 'error', label: '🚨 Issuer set_options (threshold/signer/flag change)' },
  account_merge: { severity: 'error', label: '🚨 Issuer account_merge' },
  set_admin: { severity: 'error', label: '🚨 Issuer set_admin' }, // not a classic op type, defensive
  clawback: { severity: 'error', label: '🚨 Classic CLAWBACK by issuer' },
  clawback_claimable_balance: { severity: 'error', label: '🚨 Classic clawback_claimable_balance by issuer' },
};

// --- Module state ---
let _started = false;
let _issuerPublicKey = null;

// Detector (A) — SAC event poller
let _sacIntervalId = null;

// Detector (B) — Horizon issuer-ops stream
let _opsStream = null;
let _opsRunning = false;
let _opsReconnectAttempts = 0;
let _opsLastCursor = 'now';
let _opsReconnecting = false;
let _opsStabilityTimer = null;

// Dedupe set for already-alerted operation/event ids (survives within a process).
const _seen = new Set();

function _markSeen(id) {
  if (!id) return false;
  if (_seen.has(id)) return true;
  _seen.add(id);
  if (_seen.size > SEEN_OP_CAP) {
    // Drop the oldest ~20% (insertion order is preserved by Set).
    const drop = Math.floor(SEEN_OP_CAP * 0.2);
    let i = 0;
    for (const k of _seen) {
      _seen.delete(k);
      if (++i >= drop) break;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Alert dispatch — same path as WalletMonitorService (EmailService.sendAdminAlert)
// plus admin DB notifications (same path as SorobanEventIndexer.handleAlert).
// Non-blocking: never throws.
// ---------------------------------------------------------------------------
async function dispatchSecurityAlert({ severity, title, lines, txHash, actionUrl = '/admin/wallets' }) {
  const message = lines.filter(Boolean).join('\n');

  // 1) Structured log (always)
  if (severity === 'error' || severity === 'critical') {
    log.error(`${title} :: ${message.replace(/\n/g, ' | ')}`);
  } else {
    log.warn(`${title} :: ${message.replace(/\n/g, ' | ')}`);
  }

  // 2) Email to the operator (same mechanism as WalletMonitor)
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (adminEmail) {
    try {
      await EmailService.sendAdminAlert(adminEmail, 'Radox Security', {
        title,
        message:
          `Possível comprometimento da chave Operations/Issuer. Esta ação é rara e ` +
          `iniciada pelo operador — se você NÃO a executou, trate como incidente de segurança ` +
          `IMEDIATAMENTE (rotacione a chave Operations e revise os signatários do emissor).\n\n${message}`,
        actionUrl,
        actionLabel: 'Ver Wallets',
        severity: severity === 'critical' ? 'error' : severity,
      });
    } catch (e) {
      log.error(`Failed to send security alert email: ${e.message}`);
    }
  }

  // 3) In-app admin notifications (best-effort, mirrors SorobanEventIndexer)
  try {
    const admins = await prisma.platformAdmin.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (admins.length > 0) {
      const { NotificationService } = await import('./notification.service.js');
      const notifType = severity === 'critical' ? 'error' : (severity === 'error' ? 'error' : 'warning');
      for (const admin of admins) {
        await NotificationService.createNotification(
          admin.id,
          'platform_admin',
          notifType,
          title,
          message,
        );
      }
    }
  } catch (notifErr) {
    log.warn(`Admin notification dispatch failed (non-blocking): ${notifErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// DETECTOR (A): SAC contract events via Soroban RPC getEvents
//   - One cursor per SAC contract id, persisted in SystemConfig (secwatch_...).
//   - Mirrors SorobanEventIndexer.pollContract structure exactly.
// ---------------------------------------------------------------------------

/**
 * Resolve the set of security-token SAC contract ids to watch.
 * Primary source: the Token registry (`Token.sacContractId`). Fallback: derive
 * deterministically from (assetCode, issuer) via StellarService.getSACContractId
 * for tokens whose SAC id wasn't persisted. There can be multiple per-asset SACs;
 * we watch one canonical SAC per asset (the network-derived id).
 * @returns {Promise<Array<{contractId: string, assetCode: string}>>}
 */
async function getWatchedSacContracts() {
  const out = new Map(); // contractId -> assetCode (dedupe)
  try {
    const tokens = await prisma.token.findMany({
      select: { assetCode: true, issuerPublicKey: true, sacContractId: true },
    });

    // Lazy import to avoid a heavy module at boot / circular import risk.
    let StellarService = null;
    for (const t of tokens) {
      let cid = t.sacContractId;
      if (!cid) {
        try {
          if (!StellarService) {
            ({ StellarService } = await import('./stellar.service.js'));
          }
          const issuer = t.issuerPublicKey || _issuerPublicKey;
          cid = StellarService.getSACContractId(new Asset(t.assetCode, issuer));
        } catch (e) {
          log.warn(`Could not derive SAC id for ${t.assetCode}: ${e.message}`);
          continue;
        }
      }
      if (cid) out.set(cid, t.assetCode);
    }
  } catch (e) {
    log.error(`getWatchedSacContracts failed: ${e.message}`);
  }
  return [...out.entries()].map(([contractId, assetCode]) => ({ contractId, assetCode }));
}

async function getSacCursor(contractId) {
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: cursorKey(contractId) } });
    return cfg ? parseInt(cfg.value, 10) : null;
  } catch {
    return null;
  }
}

async function setSacCursor(contractId, ledger) {
  const key = cursorKey(contractId);
  await prisma.systemConfig.upsert({
    where: { key },
    create: { key, value: String(ledger), description: `SecWatch cursor: ...${contractId.slice(-12)}` },
    update: { value: String(ledger) },
  });
}

/**
 * Parse a raw Soroban event into { topic, data, ledger, txHash, contractId }.
 * Mirrors SorobanEventIndexer.parseEvent: topic[0] is a Symbol ScVal, value is
 * the data ScVal. Both arrive base64-encoded from the raw RPC response.
 */
function parseSacEvent(event) {
  try {
    const topicValues = event.topic || [];
    if (topicValues.length === 0) return null;

    const decodeScVal = (v) =>
      typeof v === 'string' ? xdr.ScVal.fromXDR(v, 'base64') : v;

    const topic = scValToNative(decodeScVal(topicValues[0]));

    // Decode all remaining topics (admin / from / id addresses) for context.
    const extraTopics = [];
    for (let i = 1; i < topicValues.length; i++) {
      try {
        extraTopics.push(scValToNative(decodeScVal(topicValues[i])));
      } catch {
        extraTopics.push(null);
      }
    }

    let data = null;
    if (event.value !== undefined && event.value !== null) {
      data = scValToNative(decodeScVal(event.value));
    }

    return {
      topic: typeof topic === 'string' ? topic : String(topic),
      extraTopics,
      data,
      ledger: event.ledger,
      txHash: event.txHash,
      contractId: event.contractId,
    };
  } catch {
    return null;
  }
}

async function pollSacContract(contract, rpcServer) {
  const { contractId, assetCode } = contract;

  let startLedger = await getSacCursor(contractId);
  if (!startLedger) {
    const latest = await rpcServer.getLatestLedger();
    startLedger = Math.max(1, latest.sequence - INITIAL_LOOKBACK_LEDGERS);
    log.info(`[SAC] First run for ${assetCode} (${contractId.slice(0, 8)}...), starting at ledger ${startLedger}`);
  } else {
    startLedger += 1;
  }

  let resp;
  try {
    resp = await rpcServer.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [contractId] }],
      limit: MAX_EVENTS,
    });
  } catch (err) {
    if (
      err.message?.includes('start is before oldest ledger') ||
      err.message?.includes('startLedger must be within the ledger range')
    ) {
      const latest = await rpcServer.getLatestLedger();
      const newStart = Math.max(1, latest.sequence - INITIAL_LOOKBACK_LEDGERS);
      log.warn(`[SAC] Cursor too old for ${assetCode}, resetting to ${newStart}`);
      await setSacCursor(contractId, newStart);
      return;
    }
    throw err;
  }

  if (!resp?.events?.length) {
    await setSacCursor(contractId, startLedger); // persist so next poll isn't a "first run"
    return;
  }

  let maxLedger = startLedger;
  for (const event of resp.events) {
    try {
      const parsed = parseSacEvent(event);
      if (!parsed) continue;
      if (event.ledger > maxLedger) maxLedger = event.ledger;

      const cfg = SAC_EVENT_CONFIG[parsed.topic];
      if (!cfg) continue; // not a security-relevant topic (e.g. transfer/approve/burn)

      // Dedupe by RPC event id (stable, unique per emitted event).
      if (_markSeen(`sac:${event.id || `${parsed.txHash}:${parsed.topic}:${parsed.ledger}`}`)) continue;

      if (cfg.alertOff) {
        log.info(`[SAC] ${assetCode} ${parsed.topic} (${cfg.describe(parsed.data)}) — logged only`);
        continue;
      }

      const actor = parsed.extraTopics?.[0]; // admin/from on mint/clawback/set_admin
      await dispatchSecurityAlert({
        severity: cfg.severity,
        title: `${cfg.label} — ${assetCode}`,
        lines: [
          `Asset: ${assetCode}`,
          `SAC contract: ${contractId}`,
          `Event: ${parsed.topic} (${cfg.describe(parsed.data)})`,
          actor ? `Actor/admin: ${actor}` : null,
          parsed.extraTopics?.[1] ? `Counterparty: ${parsed.extraTopics[1]}` : null,
          `Ledger: ${parsed.ledger}`,
          `TX: ${parsed.txHash || 'N/A'}`,
        ],
        txHash: parsed.txHash,
      });
    } catch (e) {
      log.warn(`[SAC] Failed to process event for ${assetCode}: ${e.message}`);
    }
  }

  if (maxLedger > startLedger) {
    await setSacCursor(contractId, maxLedger);
  }
}

async function pollAllSacContracts() {
  try {
    const contracts = await getWatchedSacContracts();
    if (contracts.length === 0) {
      log.debug('[SAC] No security-token SACs to watch yet');
      return;
    }
    const rpcServer = getSorobanServer();
    for (const contract of contracts) {
      try {
        await pollSacContract(contract, rpcServer);
      } catch (err) {
        log.error(`[SAC] Error polling ${contract.assetCode} (${contract.contractId.slice(0, 8)}...): ${err.message}`);
      }
    }
  } catch (err) {
    log.error(`[SAC] pollAllSacContracts failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// DETECTOR (B): Issuer classic operations via Horizon streaming
//   - Mirrors PaymentMonitor: reconnect/backoff, stability timer, dedupe.
// ---------------------------------------------------------------------------

function isRateLimitError(error) {
  if (!error) return false;
  if (error.status === 429 || error.response?.status === 429) return true;
  const m = error.message || error.toString() || '';
  return m.includes('429') || m.toLowerCase().includes('too many requests');
}

function isAccountNotFoundError(error) {
  if (!error) return false;
  if (error.status === 404 || error.response?.status === 404) return true;
  const m = error.message || error.toString() || '';
  return m.includes('404') || m.toLowerCase().includes('not found');
}

/**
 * Handle one issuer operation record from the Horizon stream.
 * Alerts on config changes (set_options/account_merge), classic clawback, and
 * `payment` where the issuer is the SOURCE (classic issuance). Everything else
 * (inbound payments, change_trust, etc.) is ignored.
 */
async function handleIssuerOperation(op) {
  // Dedupe by operation id (also covered by cursor, but guards reconnect overlap).
  if (_markSeen(`op:${op.id || op.paging_token}`)) return;

  // Classic issuance: a `payment` operation SOURCED by the issuer (the issuer
  // sending its own asset == minting into circulation).
  if (op.type === 'payment') {
    const sourcedByIssuer = (op.source_account === _issuerPublicKey) || (op.from === _issuerPublicKey);
    if (!sourcedByIssuer) return; // inbound / unrelated payment — not issuance
    const assetCode = op.asset_type === 'native' ? 'XLM' : (op.asset_code || '?');
    await dispatchSecurityAlert({
      severity: 'error',
      title: `🚨 Classic issuance (payment) from issuer — ${assetCode}`,
      lines: [
        `Issuer sent: ${op.amount} ${assetCode}`,
        `To: ${op.to}`,
        `Asset issuer: ${op.asset_issuer || '(self)'}`,
        `Op id: ${op.id}`,
        `TX: ${op.transaction_hash}`,
      ],
      txHash: op.transaction_hash,
    });
    return;
  }

  const cfg = ISSUER_OP_CONFIG[op.type];
  if (!cfg) return; // not a security-relevant op type

  const lines = [
    `Operation: ${op.type}`,
    `Source: ${op.source_account}`,
    `Op id: ${op.id}`,
    `TX: ${op.transaction_hash}`,
  ];

  // Enrich the high-value cases.
  if (op.type === 'set_options') {
    if (op.med_threshold !== undefined) lines.push(`med_threshold -> ${op.med_threshold}`);
    if (op.low_threshold !== undefined) lines.push(`low_threshold -> ${op.low_threshold}`);
    if (op.high_threshold !== undefined) lines.push(`high_threshold -> ${op.high_threshold}`);
    if (op.master_key_weight !== undefined) lines.push(`master_key_weight -> ${op.master_key_weight}`);
    if (op.signer_key) lines.push(`signer_key: ${op.signer_key} (weight ${op.signer_weight})`);
    if (op.set_flags_s?.length) lines.push(`set_flags: ${op.set_flags_s.join(', ')}`);
    if (op.clear_flags_s?.length) lines.push(`clear_flags: ${op.clear_flags_s.join(', ')}`);
    if (op.home_domain) lines.push(`home_domain -> ${op.home_domain}`);
  } else if (op.type === 'account_merge') {
    lines.push(`into: ${op.into}`);
  } else if (op.type === 'clawback') {
    lines.push(`asset: ${op.asset_code} from ${op.from}, amount ${op.amount}`);
  } else if (op.type === 'clawback_claimable_balance') {
    lines.push(`balance_id: ${op.balance_id}`);
  }

  await dispatchSecurityAlert({
    severity: cfg.severity,
    title: `${cfg.label}`,
    lines,
    txHash: op.transaction_hash,
  });
}

function startIssuerOpsStream() {
  // Close any existing stream before opening a new one (mirror PaymentMonitor).
  if (_opsStream) {
    try { _opsStream(); } catch { /* ignore */ }
    _opsStream = null;
  }

  _opsReconnecting = false;
  log.debug(`[Ops] Starting issuer operations stream (cursor: ${_opsLastCursor})`);

  try {
    _opsStream = stellarServer
      .operations()
      .forAccount(_issuerPublicKey)
      .cursor(_opsLastCursor)
      .stream({
        onmessage: async (op) => {
          try {
            if (op.paging_token) _opsLastCursor = op.paging_token;
            _opsReconnectAttempts = 0;
            await handleIssuerOperation(op);
          } catch (err) {
            log.error(`[Ops] Error handling issuer operation: ${err.message}`);
          }
        },
        onerror: (error) => {
          log.error('[Ops] Stream error:', error);
          handleOpsStreamError(error);
        },
      });

    log.info('[Ops] Issuer operations stream started successfully');

    if (_opsStabilityTimer) clearTimeout(_opsStabilityTimer);
    _opsStabilityTimer = setTimeout(() => {
      if (_opsRunning) {
        log.debug('[Ops] Connection stable for 60s. Resetting reconnection attempts.');
        _opsReconnectAttempts = 0;
      }
    }, 60000);
  } catch (error) {
    log.error(`[Ops] Failed to start stream: ${error.message}`);
    handleOpsStreamError(error);
  }
}

async function handleOpsStreamError(error) {
  if (_opsStabilityTimer) {
    clearTimeout(_opsStabilityTimer);
    _opsStabilityTimer = null;
  }
  if (_opsStream) {
    try { _opsStream(); } catch { /* ignore */ }
    _opsStream = null;
  }
  if (!_opsRunning) return;

  if (_opsReconnecting) {
    log.debug('[Ops] Reconnection already in progress, ignoring duplicate error.');
    return;
  }
  _opsReconnecting = true;
  _opsReconnectAttempts++;

  if (isAccountNotFoundError(error)) {
    log.warn('[Ops] Issuer account not found on Stellar (404). Will retry in 5 minutes.');
    _opsRunning = false;
    setTimeout(() => {
      log.info('[Ops] Retrying issuer stream after account-not-found...');
      _opsRunning = true;
      _opsReconnectAttempts = 0;
      startIssuerOpsStream();
    }, 5 * 60 * 1000);
    return;
  }

  if (_opsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error(`[Ops] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping issuer stream.`);
    _opsRunning = false;
    // Surface the watcher itself going dark — a blind security monitor is a risk.
    await dispatchSecurityAlert({
      severity: 'error',
      title: '⚠️ Issuer security watcher stream DOWN',
      lines: [
        'The Horizon issuer-operations watcher exhausted reconnection attempts and stopped.',
        'Mint/clawback config-change detection via the classic-ops path is currently BLIND.',
        `Last error: ${error?.message || error}`,
      ],
    }).catch(() => {});
    return;
  }

  const isRate = isRateLimitError(error);
  const baseDelay = isRate ? 30000 : RECONNECT_DELAY;
  const delay = baseDelay * Math.pow(2, Math.min(_opsReconnectAttempts - 1, 4));
  log.info(`[Ops] Reconnecting in ${delay}ms (attempt ${_opsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})${isRate ? ' [rate-limited]' : ''}...`);
  setTimeout(() => {
    if (_opsRunning) startIssuerOpsStream();
  }, delay);
}

// ---------------------------------------------------------------------------
// Public lifecycle
// ---------------------------------------------------------------------------

export const IssuerWatcher = {
  /**
   * Start both detectors. Idempotent. Gated by ENABLE_ISSUER_WATCHER
   * (default ON — security control). Disable explicitly with =false.
   */
  start() {
    if (_started) return;

    if (process.env.ENABLE_ISSUER_WATCHER === 'false') {
      log.warn('[IssuerWatcher] Disabled via ENABLE_ISSUER_WATCHER=false — issuer mint/clawback detection is OFF.');
      return;
    }

    // Resolve issuer public key (works in env and multisig modes).
    try {
      _issuerPublicKey = keyManager.getIssuerPublicKey();
    } catch (e) {
      log.error(`[IssuerWatcher] Cannot resolve issuer public key — watcher not started: ${e.message}`);
      return;
    }

    _started = true;

    if (!process.env.ADMIN_ALERT_EMAIL) {
      log.warn('[IssuerWatcher] ADMIN_ALERT_EMAIL not set — email alerts disabled (logs + in-app notifications still active).');
    }

    log.info(`[IssuerWatcher] Starting — issuer ${_issuerPublicKey}`);

    // Detector (A): SAC events poller. Slight startup delay so prisma/RPC settle.
    setTimeout(() => { pollAllSacContracts(); }, 15_000);
    _sacIntervalId = setInterval(() => { pollAllSacContracts(); }, SAC_POLL_INTERVAL_MS);
    log.info(`[IssuerWatcher] SAC event poller active — every ${SAC_POLL_INTERVAL_MS / 1000}s (mint/clawback/set_admin)`);

    // Detector (B): Horizon issuer-ops stream.
    _opsRunning = true;
    _opsReconnectAttempts = 0;
    _opsLastCursor = 'now';
    startIssuerOpsStream();
    log.info('[IssuerWatcher] Issuer classic-ops stream active (set_options/account_merge/clawback/issuance)');
  },

  /**
   * Stop both detectors. Called from gracefulShutdown. Safe if never started.
   */
  stop() {
    if (_sacIntervalId) {
      clearInterval(_sacIntervalId);
      _sacIntervalId = null;
    }
    _opsRunning = false;
    if (_opsStabilityTimer) {
      clearTimeout(_opsStabilityTimer);
      _opsStabilityTimer = null;
    }
    if (_opsStream) {
      try { _opsStream(); } catch { /* ignore */ }
      _opsStream = null;
    }
    _started = false;
    _seen.clear();
    log.info('[IssuerWatcher] Stopped.');
  },

  /** True if the watcher has been started. */
  isActive() {
    return _started;
  },

  // -- Exposed for unit testing (pure routing/classification, no I/O) --
  _config: { SAC_EVENT_CONFIG, ISSUER_OP_CONFIG },
  _parseSacEvent: parseSacEvent,
  _cursorKey: cursorKey,
};

export default IssuerWatcher;
