#!/usr/bin/env node
/**
 * EtherFuse Webhook Subscription Registrar
 * ────────────────────────────────────────
 * Registers a webhook subscription against EtherFuse, captures the
 * one-time-returned HMAC secret, and writes it to the repo's .env as
 * `ETHERFUSE_WEBHOOK_SECRET`.
 *
 * EtherFuse's webhook API binds one subscription to one event type. For
 * Phase 1 we register `order_updated` only — that's what drives the
 * user-visible status pill. Customer / KYC / bank-account events are
 * nice-to-have and can be added later by re-running this script with
 * --event-type=<other>.
 *
 * Usage:
 *   node --env-file=.env scripts/etherfuse-register-webhook.mjs
 *   node --env-file=.env scripts/etherfuse-register-webhook.mjs --event-type=customer_updated
 *   node --env-file=.env scripts/etherfuse-register-webhook.mjs --list
 *   node --env-file=.env scripts/etherfuse-register-webhook.mjs --delete <webhook-id>
 *
 * Required env vars (already present in .env after the probe):
 *   ETHERFUSE_API_KEY               sandbox or production key
 *   ETHERFUSE_API_BASE_URL          defaults to sandbox
 *   ETHERFUSE_WEBHOOK_URL           public callback URL — falls back to
 *                                   https://dev.radox.net/api/webhooks/etherfuse
 *
 * After this runs successfully, restart the backend container so it picks
 * up the new ETHERFUSE_WEBHOOK_SECRET:
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d backend
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

const API_BASE = process.env.ETHERFUSE_API_BASE_URL || 'https://api.sand.etherfuse.com';
const API_KEY = process.env.ETHERFUSE_API_KEY;
const WEBHOOK_URL =
  process.env.ETHERFUSE_WEBHOOK_URL || 'https://dev.radox.net/api/webhooks/etherfuse';

if (!API_KEY) {
  console.error('❌ ETHERFUSE_API_KEY not set. Run with `node --env-file=.env`.');
  process.exit(1);
}

const HEADERS = { Authorization: API_KEY, 'Content-Type': 'application/json' };

async function call(method, urlPath, body) {
  const url = `${API_BASE}${urlPath}`;
  const opts = { method, headers: HEADERS };
  if (body !== undefined) opts.body = JSON.stringify(body);

  console.log(`→ ${method} ${url}`);
  if (body) console.log(`  body: ${JSON.stringify(body)}`);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`← ${res.status} ${res.statusText}`);
  console.log(typeof data === 'string' ? `  ${data}` : JSON.stringify(data, null, 2).split('\n').map(l => `  ${l}`).join('\n'));
  return { status: res.status, ok: res.ok, data };
}

/**
 * Replace (or append) an env-var line in the repo's .env file. Preserves
 * surrounding lines and comments. Idempotent: subsequent runs overwrite
 * the same key in place.
 */
function writeEnvVar(key, value) {
  let current = '';
  try { current = fs.readFileSync(ENV_PATH, 'utf8'); } catch { /* file may not exist */ }

  const lineRe = new RegExp(`^${key}=.*$`, 'm');
  const newLine = `${key}=${value}`;

  let updated;
  if (lineRe.test(current)) {
    updated = current.replace(lineRe, newLine);
  } else {
    updated = current + (current.endsWith('\n') || current === '' ? '' : '\n') + newLine + '\n';
  }
  fs.writeFileSync(ENV_PATH, updated, 'utf8');
  console.log(`\n✅ Wrote ${key} to ${ENV_PATH}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modes
// ─────────────────────────────────────────────────────────────────────────────

async function modeList() {
  console.log(`\n──── Existing webhook subscriptions ────`);
  const res = await call('GET', '/ramp/webhook');
  if (!res.ok) {
    console.error('❌ Failed to list webhooks.');
    process.exit(1);
  }
  const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? res.data?.webhooks ?? []);
  if (items.length === 0) {
    console.log('(no subscriptions registered yet)');
  }
  return items;
}

async function modeDelete(webhookId) {
  console.log(`\n──── Deleting webhook ${webhookId} ────`);
  const res = await call('DELETE', `/ramp/webhook/${webhookId}`);
  if (!res.ok) {
    console.error('❌ Delete failed.');
    process.exit(1);
  }
  console.log('✅ Deleted.');
}

async function modeCreate(eventType) {
  console.log(`\n──── Registering webhook (eventType=${eventType}) ────`);
  console.log(`  url: ${WEBHOOK_URL}`);

  const id = randomUUID();
  const res = await call('POST', '/ramp/webhook', { id, url: WEBHOOK_URL, eventType });
  if (!res.ok) {
    console.error('\n❌ Webhook registration failed.');
    if (res.status === 409 || (typeof res.data === 'object' && /already/i.test(JSON.stringify(res.data)))) {
      console.error('   It looks like a subscription with this URL + eventType already exists.');
      console.error('   Run with --list to see current subscriptions, then --delete <id> if you need to rotate the secret.');
    }
    process.exit(1);
  }

  const secret = res.data?.secret;
  if (!secret) {
    console.error('\n⚠ Subscription was created but the response did not include a `secret` field.');
    console.error('  Inspect the response above; the field may be at a different path.');
    process.exit(1);
  }

  console.log(`\n✅ Subscription created. ID: ${res.data?.id ?? '(not in response)'}`);
  console.log(`   Secret captured (length ${secret.length} chars).`);
  writeEnvVar('ETHERFUSE_WEBHOOK_SECRET', secret);

  console.log('\nNext steps:');
  console.log('  1. Restart the backend so it loads the new secret:');
  console.log('       docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d backend');
  console.log('  2. (Optional) Trigger a real on-ramp via /api/ramp/dev/fiat-received/:id to');
  console.log('     verify the webhook receiver writes a row to ramp_webhook_events.');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const arg = (flag, fallback = null) => {
  const idx = args.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (idx === -1) return fallback;
  if (args[idx].includes('=')) return args[idx].split('=', 2)[1];
  return args[idx + 1] ?? fallback;
};

(async () => {
  console.log(`EtherFuse webhook registrar → ${API_BASE}`);

  if (args.includes('--list')) {
    await modeList();
    return;
  }
  if (args.includes('--delete')) {
    const id = arg('--delete');
    if (!id) {
      console.error('❌ Pass the webhook id: --delete <webhook-id>');
      process.exit(1);
    }
    await modeDelete(id);
    return;
  }

  const eventType = arg('--event-type', 'order_updated');
  const allowed = ['order_updated', 'customer_updated', 'bank_account_updated', 'kyc_updated', 'quote_updated', 'swap_updated'];
  if (!allowed.includes(eventType)) {
    console.error(`❌ Unknown event type "${eventType}". Allowed: ${allowed.join(', ')}`);
    process.exit(1);
  }

  await modeCreate(eventType);
})().catch((err) => {
  console.error('\n💥 Crash:', err);
  process.exit(1);
});
