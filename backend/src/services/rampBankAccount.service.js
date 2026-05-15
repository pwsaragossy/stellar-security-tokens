/**
 * RampBankAccountService — register and manage the investor's BR PIX bank
 * account on EtherFuse.
 *
 * ⚠ STALE-API WORKAROUND (sandbox-confirmed 2026-05-15):
 *   EtherFuse's `POST /ramp/customer/{id}/bank-account` does NOT yet accept
 *   a BR/PIX schema programmatically — only MX (CLABE+CURP+RFC). However,
 *   the sandbox accepts the MX-personal shape with `birthCountryIsoCode: "BR"`
 *   and routes BRL → TESOURO orders through it correctly, even though the
 *   returned record has `currency: "mxn"` as a legacy label.
 *
 *   Until EtherFuse ships a real PIX programmatic schema:
 *     - We pre-fill CLABE/CURP/RFC with EtherFuse-friendly placeholder values
 *       (sandbox accepts these without validation).
 *     - The investor's REAL PIX key + key type are stored locally in
 *       RampBankAccount.pixKey / .pixKeyType for our own UI / future migration
 *       to the real API.
 *     - In production, we MUST verify EtherFuse accepts this shape before
 *       letting investors actually move BRL. If they enforce real CLABE
 *       validation in prod, the only recourse is hosted onboarding for the
 *       bank-account step.
 *
 * Required-on-Investor row: at least `givenName`, `familyName`, `dateOfBirth`,
 * `document` (CPF). RampKycService.saveKycFields() captures these from the
 * same form the user submits before this service runs.
 */
import { randomUUID } from 'node:crypto';

import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import EtherFuseClient from './etherfuse.service.js';

const log = logger.scope('RampBankAccountService');

const VALID_PIX_KEY_TYPES = new Set(['cpf', 'cnpj', 'email', 'phone', 'evp']);

/** Heuristic abbreviation for UI display — last 4 visible chars. */
function abbreviatePixKey(pixKey, pixKeyType) {
  if (!pixKey) return null;
  if (pixKeyType === 'email') {
    const [local, domain] = pixKey.split('@');
    return local ? `${local.slice(0, 2)}…@${domain ?? ''}` : pixKey;
  }
  if (pixKeyType === 'phone') {
    return `…${pixKey.slice(-4)}`;
  }
  // cpf / cnpj / evp — show last 4
  return `…${pixKey.slice(-4)}`;
}

export class RampBankAccountService {
  /**
   * Register a PIX bank account for an investor. Idempotency: there's no
   * uniqueness constraint on (investorId, pixKey) — if a user re-submits
   * the same key, they'll get two rows. UI should prevent that; the API
   * layer doesn't enforce because operationally a user might re-add a key
   * they previously soft-deleted.
   *
   * @param {object} args
   * @param {number} args.investorId
   * @param {string} args.pixKey
   * @param {"cpf"|"cnpj"|"email"|"phone"|"evp"} args.pixKeyType
   * @param {string} [args.label] — investor-chosen label, e.g. "Conta principal"
   * @param {boolean} [args.makeDefault] — default true for the first account
   */
  static async register({ investorId, pixKey, pixKeyType, label, makeDefault }) {
    if (!pixKey || !pixKeyType) throw new Error('pixKey and pixKeyType are required');
    if (!VALID_PIX_KEY_TYPES.has(pixKeyType)) {
      throw new Error(`Invalid pixKeyType "${pixKeyType}". Must be one of: ${[...VALID_PIX_KEY_TYPES].join(', ')}`);
    }

    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    const customer = await prisma.rampCustomer.findUnique({ where: { investorId } });
    if (!investor) throw new Error(`Investor ${investorId} not found`);
    if (!customer) throw new Error(`Investor ${investorId} has no EtherFuse customer — run KYC first`);

    // EtherFuse payload (workaround shape). Real PIX info stored locally.
    const transactionId = randomUUID();
    const efPayload = {
      account: {
        transactionId,
        firstName: investor.givenName ?? investor.name?.split(' ')[0] ?? 'Investor',
        paternalLastName: investor.familyName ?? investor.name?.split(' ').slice(-1)[0] ?? 'Radox',
        maternalLastName: 'Radox',
        birthDate: investor.dateOfBirth
          ? investor.dateOfBirth.toISOString().slice(0, 10).replaceAll('-', '')
          : '19900101',
        birthCountryIsoCode: investor.country ?? 'BR',
        // Workaround filler — sandbox doesn't validate these for BR investors.
        // Replace with real PIX-shaped fields once EtherFuse ships the schema.
        curp: 'AAAA990101HDFRRN09',
        rfc: 'AAAA990101AAA',
        clabe: '012345678901234567',
      },
    };

    log.info(`Registering EtherFuse bank account (PIX workaround) for investor ${investorId}`);
    let efResponse;
    try {
      efResponse = await EtherFuseClient.Customers.registerBankAccount(
        customer.etherfuseCustomerId,
        efPayload
      );
    } catch (err) {
      log.error('EtherFuse bank-account registration rejected', {
        error: err.message,
        body: err.body,
      });
      throw err;
    }

    const etherfuseBankAccountId = efResponse?.bankAccountId ?? efResponse?.id;
    if (!etherfuseBankAccountId) {
      log.error('EtherFuse did not return a bankAccountId', { response: efResponse });
      throw new Error('EtherFuse bank-account registration succeeded but no bankAccountId returned');
    }

    // EtherFuse status values: pending | awaitingDepositVerification | active | inactive.
    // Map to our enum (snake_case).
    const efStatus = efResponse?.status ?? 'pending';
    const mappedStatus =
      efStatus === 'awaitingDepositVerification' ? 'awaiting_deposit_verification'
      : ['pending', 'active', 'inactive'].includes(efStatus) ? efStatus
      : 'pending';

    // EtherFuse deduplicates bank-account registrations server-side and can
    // return the same bankAccountId for a retried submission — upsert locally
    // so the second call is idempotent instead of throwing P2002.
    const existingDefault = await prisma.rampBankAccount.findFirst({
      where: { investorId, isDefault: true, deletedAt: null },
    });
    const existingForId = await prisma.rampBankAccount.findUnique({
      where: { etherfuseBankAccountId },
    });
    const shouldBeDefault =
      makeDefault === true ||
      (makeDefault !== false && !existingDefault) ||
      (existingForId?.isDefault ?? false);

    const row = await prisma.$transaction(async (tx) => {
      if (
        shouldBeDefault &&
        existingDefault &&
        existingDefault.etherfuseBankAccountId !== etherfuseBankAccountId
      ) {
        await tx.rampBankAccount.update({
          where: { id: existingDefault.id },
          data: { isDefault: false },
        });
      }
      return tx.rampBankAccount.upsert({
        where: { etherfuseBankAccountId },
        create: {
          investorId,
          etherfuseBankAccountId,
          label: label ?? null,
          pixKey,
          pixKeyType,
          abbrPixKey: abbreviatePixKey(pixKey, pixKeyType),
          status: mappedStatus,
          isDefault: shouldBeDefault,
        },
        update: {
          label: label ?? existingForId?.label ?? null,
          pixKey,
          pixKeyType,
          abbrPixKey: abbreviatePixKey(pixKey, pixKeyType),
          status: mappedStatus,
          isDefault: shouldBeDefault,
          deletedAt: null,
        },
      });
    });

    log.info(`Bank account registered`, {
      investorId,
      rampBankAccountId: row.id,
      etherfuseBankAccountId,
      status: mappedStatus,
      isDefault: shouldBeDefault,
    });

    return row;
  }

  /**
   * Soft-delete locally. We do NOT call EtherFuse — once a bank account has
   * been used in an order, EtherFuse keeps it for compliance / reversal
   * purposes. Frontend simply hides deleted-but-historically-used accounts.
   */
  static async softDelete({ investorId, bankAccountId }) {
    const row = await prisma.rampBankAccount.findFirst({
      where: { id: bankAccountId, investorId },
    });
    if (!row) throw new Error(`Bank account ${bankAccountId} not found for investor ${investorId}`);
    return prisma.rampBankAccount.update({
      where: { id: bankAccountId },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  /** List active bank accounts for an investor, default first. */
  static async list(investorId) {
    return prisma.rampBankAccount.findMany({
      where: { investorId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }
}

export default RampBankAccountService;
