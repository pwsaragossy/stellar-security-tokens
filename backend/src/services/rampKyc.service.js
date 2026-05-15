/**
 * RampKycService — programmatic onboarding of a Radox investor into EtherFuse.
 *
 * Flow per investor, called from POST /api/ramp/kyc:
 *   1. Idempotently create the EtherFuse child organization (= customer)
 *      via POST /ramp/organization, embedding the investor's Soroban C-address
 *      as the wallet. EtherFuse delivers TESOURO directly to the contract
 *      via SAC transfer (Path A, empirically confirmed in sandbox 2026-05-15).
 *   2. Submit identity data via POST /ramp/customer/{id}/kyc. In sandbox the
 *      customer auto-approves and the wallet's KYC flips to `approved`,
 *      making it order-eligible immediately.
 *   3. Persist RampCustomer + RampWallet rows locally.
 *
 * "Separate but blocking" UX contract:
 *   - getReadiness(investorId) returns the full ramp-onboarding state. The
 *     frontend uses this to redirect to /investor/ramp-kyc until everything
 *     is green.
 *   - Quote / order endpoints (in rampController.js) call assertReady()
 *     before touching EtherFuse — single source of truth for the gate.
 *
 * Idempotency:
 *   - First call creates the EtherFuse customer + KYC + local rows.
 *   - Re-submission updates identity data (re-POSTs to KYC endpoint). EtherFuse
 *     accepts re-submission of identity for a still-proposed customer.
 *   - We never recreate the org — etherfuseCustomerId is sticky once written.
 */
import { randomUUID } from 'node:crypto';

import prisma from '../config/prisma.js';
import logger from '../utils/logger.js';
import EtherFuseClient, { EtherFuseApiError } from './etherfuse.service.js';

const log = logger.scope('RampKycService');

/**
 * Required fields on Investor before we can build a valid EtherFuse KYC
 * payload. Frontend validation should match this list — kept in sync via
 * the OpenAPI-derived /api/ramp/readiness response.
 */
const REQUIRED_KYC_FIELDS = [
  'givenName',
  'familyName',
  'document', // CPF for BR investors
  'email',
  'phone',
  'occupation',
  'dateOfBirth',
  'addressLine1',
  'city',
  'region',
  'postalCode',
  'country',
];

export class RampReadinessError extends Error {
  constructor(reason, details = {}) {
    super(`Ramp gate: ${reason}`);
    this.name = 'RampReadinessError';
    this.reason = reason; // machine-readable code
    this.details = details;
    this.status = 403;
  }
}

export class RampKycService {
  /**
   * Returns the investor's current ramp-onboarding state. Pure read; safe to
   * call from a frontend polling loop while the user completes KYC.
   *
   * Shape:
   *   {
   *     isReady: boolean,                       // can the investor create a quote?
   *     blockedReason: null | "missing_fields" | "customer_not_provisioned" | "kyc_pending" | "kyc_rejected" | "no_active_bank_account",
   *     missingFields: string[],                // present when blockedReason="missing_fields"
   *     customer: { etherfuseCustomerId, kycStatus, kycRejectionReason } | null,
   *     wallet: { kycStatus, publicKey } | null,
   *     bankAccounts: Array<{ id, etherfuseBankAccountId, status, abbrPixKey, isDefault }>,
   *   }
   */
  static async getReadiness(investorId) {
    const [investor, customer, wallet, bankAccounts] = await Promise.all([
      prisma.investor.findUnique({ where: { id: investorId } }),
      prisma.rampCustomer.findUnique({ where: { investorId } }),
      prisma.rampWallet.findFirst({ where: { investorId } }),
      prisma.rampBankAccount.findMany({
        where: { investorId, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    if (!investor) {
      throw new RampReadinessError('investor_not_found');
    }

    const missingFields = REQUIRED_KYC_FIELDS.filter((f) => investor[f] == null);
    const activeBank = bankAccounts.find((b) => b.status === 'active');

    let blockedReason = null;
    if (missingFields.length > 0) blockedReason = 'missing_fields';
    else if (!customer) blockedReason = 'customer_not_provisioned';
    else if (customer.kycStatus === 'rejected') blockedReason = 'kyc_rejected';
    else if (customer.kycStatus !== 'approved') blockedReason = 'kyc_pending';
    else if (!activeBank) blockedReason = 'no_active_bank_account';

    return {
      isReady: blockedReason == null,
      blockedReason,
      missingFields,
      customer: customer
        ? { etherfuseCustomerId: customer.etherfuseCustomerId, kycStatus: customer.kycStatus, kycRejectionReason: customer.kycRejectionReason }
        : null,
      wallet: wallet ? { kycStatus: wallet.kycStatus, publicKey: wallet.publicKey } : null,
      bankAccounts: bankAccounts.map((b) => ({
        id: b.id,
        etherfuseBankAccountId: b.etherfuseBankAccountId,
        status: b.status,
        abbrPixKey: b.abbrPixKey,
        isDefault: b.isDefault,
      })),
    };
  }

  /**
   * Convenience guard for ramp endpoints. Throws RampReadinessError with the
   * specific blocker reason when the investor cannot proceed.
   */
  static async assertReady(investorId) {
    const r = await this.getReadiness(investorId);
    if (!r.isReady) {
      throw new RampReadinessError(r.blockedReason, {
        missingFields: r.missingFields,
        kycStatus: r.customer?.kycStatus,
      });
    }
    return r;
  }

  /**
   * Persist the extended KYC fields on Investor BEFORE pushing to EtherFuse.
   * This is the single mutation point for the form data — submitKyc reads
   * straight from the Investor row afterwards.
   */
  static async saveKycFields(investorId, fields) {
    const data = {};
    for (const f of REQUIRED_KYC_FIELDS) {
      if (fields[f] !== undefined) {
        data[f] = f === 'dateOfBirth' ? new Date(fields[f]) : fields[f];
      }
    }
    // `document` is unique on Investor; let Prisma's P2002 surface as 409 in the controller.
    return prisma.investor.update({ where: { id: investorId }, data });
  }

  /**
   * Provision the EtherFuse customer if not already done. Idempotent — calling
   * twice for the same investor is a no-op on the second call (returns existing).
   */
  static async provisionCustomerIfMissing(investorId) {
    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    if (!investor) throw new Error(`Investor ${investorId} not found`);
    if (!investor.stellarContractId) {
      throw new Error(`Investor ${investorId} has no Soroban contract (stellarContractId) — passkey wallet must exist first`);
    }

    const existing = await prisma.rampCustomer.findUnique({ where: { investorId } });
    if (existing) {
      log.debug(`RampCustomer already exists for investor ${investorId} (${existing.etherfuseCustomerId})`);
      return existing;
    }

    const etherfuseCustomerId = randomUUID();
    log.info(`Provisioning EtherFuse customer for investor ${investorId} → ${etherfuseCustomerId}`);

    const orgRes = await EtherFuseClient.Organizations.create({
      id: etherfuseCustomerId,
      displayName: `radox-investor-${investorId}`,
      accountType: 'personal',
      wallets: [{ publicKey: investor.stellarContractId, blockchain: 'stellar' }],
      userInfo: { email: investor.email, displayName: investor.name },
    });

    // Persist customer + wallet rows.
    const walletRow = orgRes.wallets?.[0];
    const customer = await prisma.$transaction(async (tx) => {
      const cust = await tx.rampCustomer.create({
        data: {
          investorId,
          etherfuseCustomerId,
          accountType: 'personal',
          kycStatus: 'not_started',
        },
      });
      if (walletRow?.walletId) {
        await tx.rampWallet.create({
          data: {
            investorId,
            etherfuseWalletId: walletRow.walletId,
            publicKey: walletRow.publicKey ?? investor.stellarContractId,
            blockchain: walletRow.blockchain ?? 'stellar',
            kycStatus: walletRow.kycStatus ?? 'not_started',
            isAuthenticated: walletRow.isAuthenticated ?? false,
          },
        });
      }
      return cust;
    });

    // Update Investor.etherfuseCustomerId pointer (denormalized for fast lookup).
    await prisma.investor.update({
      where: { id: investorId },
      data: { etherfuseCustomerId },
    });

    return customer;
  }

  /**
   * Submit the KYC identity payload to EtherFuse. Pulls fields straight from
   * the Investor row — caller must have run saveKycFields() and
   * provisionCustomerIfMissing() first (or use the convenience runFullKyc()).
   *
   * In sandbox this auto-approves the customer and flips the wallet to
   * kycStatus=approved synchronously. In production EtherFuse review is async
   * — webhook will arrive with the final status.
   */
  static async submitIdentity(investorId) {
    const investor = await prisma.investor.findUnique({ where: { id: investorId } });
    const customer = await prisma.rampCustomer.findUnique({ where: { investorId } });
    if (!investor || !customer) {
      throw new Error('Customer must be provisioned before submitting KYC identity');
    }

    const missing = REQUIRED_KYC_FIELDS.filter((f) => investor[f] == null);
    if (missing.length > 0) {
      throw new Error(`Cannot submit KYC: missing required fields ${missing.join(', ')}`);
    }

    // BR investors use CPF as their idNumber; the schema also accepts CNPJ
    // but Radox's investor flow is individual-only today.
    const idNumberType = investor.country === 'BR' ? 'CPF' : 'CURP';
    const payload = {
      pubkey: investor.stellarContractId,
      identity: {
        id: investor.stellarContractId,
        email: investor.email,
        phoneNumber: investor.phone,
        occupation: investor.occupation,
        name: { givenName: investor.givenName, familyName: investor.familyName },
        dateOfBirth: investor.dateOfBirth?.toISOString().slice(0, 10),
        address: {
          street: [investor.addressLine1, investor.addressLine2].filter(Boolean).join(' '),
          city: investor.city,
          region: investor.region,
          postalCode: investor.postalCode,
          country: investor.country,
        },
        idNumbers: [{ value: investor.document, type: idNumberType }],
      },
    };

    log.info(`Submitting KYC for investor ${investorId} → EtherFuse customer ${customer.etherfuseCustomerId}`);
    const res = await EtherFuseClient.Customers.submitKyc(customer.etherfuseCustomerId, payload);

    // Sandbox returns status="approved" synchronously. Production returns
    // "proposed" and the real status arrives via kyc_updated webhook.
    const newStatus = res.status === 'approved' ? 'approved'
      : res.status === 'rejected' ? 'rejected'
      : 'proposed';

    await prisma.rampCustomer.update({
      where: { investorId },
      data: { kycStatus: newStatus, lastSyncedAt: new Date() },
    });

    // EtherFuse also auto-approves the wallet itself in sandbox after KYC.
    // Refresh our local mirror so the readiness gate sees it immediately.
    if (newStatus === 'approved') {
      await prisma.rampWallet.updateMany({
        where: { investorId },
        data: { kycStatus: 'approved' },
      });
    }

    return res;
  }

  /**
   * Convenience: end-to-end onboarding from a single REST call. Frontend
   * submits the form once, this function does the rest.
   */
  static async runFullKyc(investorId, fields) {
    await this.saveKycFields(investorId, fields);
    await this.provisionCustomerIfMissing(investorId);
    const submission = await this.submitIdentity(investorId);
    return {
      submission,
      readiness: await this.getReadiness(investorId),
    };
  }
}

export default RampKycService;
