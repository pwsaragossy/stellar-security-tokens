/**
 * ContractController — Admin endpoints for Soroban sale contract management.
 *
 * Wires existing SorobanSaleService methods to HTTP endpoints.
 * All write ops: validate → resolve contractId → build XDR → TransactionManager → 202.
 */
import prisma from '../config/prisma.js';
import { SorobanSaleService } from '../services/sorobanSale.service.js';
import { StellarService } from '../services/stellar.service.js';
import { TransactionManager } from '../services/transactionManager.service.js';
import logger from '../utils/logger.js';

const _log = logger.scope('ContractCtrl');

// ─── Helpers ───

/** Resolve offerId → offer with sorobanContractId or throw 404 */
async function resolveContract(offerId, { rich = false } = {}) {
    const include = rich ? {
        tokens: true,
        company: { select: { id: true, name: true, cnpj: true, stellarContractId: true } },
        _count: { select: { investments: true } },
    } : { tokens: true };

    const offer = await prisma.offer.findUnique({
        where: { id: parseInt(offerId) },
        include,
    });
    if (!offer) {
        const err = new Error('Offer not found');
        err.status = 404;
        throw err;
    }
    if (!offer.sorobanContractId) {
        const err = new Error('Offer has no deployed Soroban contract');
        err.status = 400;
        throw err;
    }
    return offer;
}

/** Validate amount > 0 */
function validateAmount(amount, field = 'amount') {
    const n = Number(amount);
    if (!amount || isNaN(n) || n <= 0) {
        const err = new Error(`${field} must be a positive number`);
        err.status = 400;
        throw err;
    }
    return n;
}

/** Validate Stellar address (G... or C...) */
function validateAddress(addr, field = 'address') {
    if (!addr || typeof addr !== 'string' || addr.length !== 56 ||
        (!addr.startsWith('G') && !addr.startsWith('C'))) {
        const err = new Error(`${field} must be a valid 56-char Stellar address (G... or C...)`);
        err.status = 400;
        throw err;
    }
}

/** Require X-Confirm header for destructive ops */
function requireConfirm(req) {
    if (req.headers['x-confirm'] !== 'true') {
        const err = new Error('Destructive operation requires X-Confirm: true header');
        err.status = 400;
        throw err;
    }
}

export class ContractController {

    // ═══════════════════════════════════════
    // READ — List & Detail
    // ═══════════════════════════════════════

    /** GET /api/admin/contracts */
    static async list(req, res, next) {
        try {
            const offers = await prisma.offer.findMany({
                where: { sorobanContractId: { not: null } },
                select: {
                    id: true,
                    offerName: true,
                    assetCode: true,
                    sorobanContractId: true,
                    sorobanInitStatus: true,
                    sorobanInitError: true,
                    status: true,
                    unitPrice: true,
                    totalSupply: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            res.json({ contracts: offers });
        } catch (err) {
            next(err);
        }
    }

    /** GET /api/admin/contracts/:offerId */
    static async detail(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId, { rich: true });
            const contractId = offer.sorobanContractId;

            // Parallel on-chain queries
            const settlementId = offer.sorobanSettlementContractId;
            const onChainQueries = [
                SorobanSaleService.getOffer(contractId).catch(() => null),
                SorobanSaleService.getBalance(contractId).catch(() => null),
                SorobanSaleService.getVersion(contractId).catch(() => null),
            ];
            // If settlement contract exists, query its balance
            if (settlementId) {
                const { SorobanSettlementService } = await import('../services/sorobanSettlement.service.js');
                onChainQueries.push(
                    SorobanSettlementService.getContractBalance(offer.id).catch(() => null)
                );
            }
            const [onChainOffer, balance, version, settlementBalance] = await Promise.all(onChainQueries);

            const token = offer.tokens?.[0] || null;

            // BigInt-safe serialization (Soroban RPC returns BigInts)
            const payload = {
                offer: {
                    id: offer.id,
                    offerName: offer.offerName,
                    assetCode: offer.assetCode,
                    sorobanContractId: contractId,
                    sorobanInitStatus: offer.sorobanInitStatus,
                    sorobanInitError: offer.sorobanInitError,
                    status: offer.status,
                    unitPrice: offer.unitPrice,
                    totalSupply: offer.totalSupply,
                    sacContractId: token?.sacContractId || null,
                    // Enriched fields
                    offerType: offer.offerType,
                    paymentType: offer.paymentType,
                    annualInterestRate: offer.annualInterestRate,
                    maturityDate: offer.maturityDate,
                    description: offer.description,
                    isTokenLocked: offer.isTokenLocked,
                    createdAt: offer.createdAt,
                    investmentCount: offer._count?.investments || 0,
                },
                company: offer.company || null,
                token: token ? {
                    id: token.id,
                    assetCode: token.assetCode,
                    sacContractId: token.sacContractId,
                    issuerPublicKey: token.issuerPublicKey,
                    totalSupply: token.totalSupply,
                    issuanceTransactionHash: token.issuanceTransactionHash,
                } : null,
                onChain: {
                    offer: onChainOffer,
                    balance: balance?.toString() || '0',
                    version,
                },
                settlementContract: settlementId ? {
                    contractId: settlementId,
                    balance: settlementBalance?.toString() || '0',
                } : null,
            };
            const safe = JSON.parse(JSON.stringify(payload, (_, v) => typeof v === 'bigint' ? v.toString() : v));
            res.json(safe);
        } catch (err) {
            next(err);
        }
    }

    // ═══════════════════════════════════════
    // DAY-TO-DAY OPS (🟢)
    // ═══════════════════════════════════════

    /** POST /api/admin/contracts/:offerId/pause */
    static async pause(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const result = await SorobanSaleService.buildSetActiveXdr(offer.sorobanContractId, false);
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_pause',
                metadata: { offerId: offer.id, contractId: offer.sorobanContractId },
                description: `Pause sale contract for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/resume */
    static async resume(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const result = await SorobanSaleService.buildSetActiveXdr(offer.sorobanContractId, true);
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_resume',
                metadata: { offerId: offer.id, contractId: offer.sorobanContractId },
                description: `Resume sale contract for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/deposit — 2-TX chain: authorize → transfer */
    static async deposit(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const amount = validateAmount(req.body.amount);
            const amountStroops = BigInt(Math.round(parseFloat(amount.toFixed(7)) * 1e7));

            const sacContractId = offer.tokens?.[0]?.sacContractId;
            if (!sacContractId) {
                return res.status(400).json({ error: 'Offer token has no SAC deployed' });
            }

            // Step 1: Authorize the sale contract to hold the sell token
            const authResult = await SorobanSaleService.buildSacAuthorizeXdr(
                sacContractId, offer.sorobanContractId, true
            );
            const submitted = await TransactionManager.submit({
                xdr: authResult.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_deposit_auth',
                metadata: {
                    offerId: offer.id,
                    contractId: offer.sorobanContractId,
                    sacContractId,
                    amount: amountStroops.toString(),
                    assetCode: offer.assetCode,
                },
                description: `Authorize + deposit ${amount} ${offer.assetCode} to sale contract`,
                initiatorId: req.user?.id,
            });

            res.status(202).json({
                ...submitted,
                note: 'Step 1 of 2: authorizing contract. Transfer will chain automatically after signing.',
            });
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/price */
    static async updatePrice(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const sellPrice = parseInt(req.body.sellPrice);
            const buyPrice = parseInt(req.body.buyPrice);
            if (!sellPrice || sellPrice <= 0 || !buyPrice || buyPrice <= 0) {
                return res.status(400).json({ error: 'sellPrice and buyPrice must be positive integers' });
            }
            const result = await SorobanSaleService.buildUpdatePriceXdr(
                offer.sorobanContractId, sellPrice, buyPrice
            );
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_price',
                metadata: { offerId: offer.id, sellPrice, buyPrice },
                description: `Update price for ${offer.assetCode}: ${sellPrice}/${buyPrice}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/ttl — ops pays, no Freighter needed */
    static async extendTtl(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const result = await StellarService.extendContractTTL(offer.sorobanContractId);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/batch/ttl */
    static async batchExtendTtl(req, res, next) {
        try {
            const { offerIds } = req.body;
            if (!Array.isArray(offerIds) || offerIds.length === 0) {
                return res.status(400).json({ error: 'offerIds must be a non-empty array' });
            }
            const results = [];
            for (const id of offerIds.slice(0, 20)) { // cap at 20
                try {
                    const offer = await resolveContract(id);
                    const r = await StellarService.extendContractTTL(offer.sorobanContractId);
                    results.push({ offerId: id, success: true, ...r });
                } catch (e) {
                    results.push({ offerId: id, success: false, error: e.message });
                }
            }
            res.json({ results });
        } catch (err) {
            next(err);
        }
    }

    // ═══════════════════════════════════════
    // SENSITIVE OPS (⚠️)
    // ═══════════════════════════════════════

    /** POST /api/admin/contracts/:offerId/withdraw */
    static async withdraw(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const amount = validateAmount(req.body.amount);
            const amountStroops = BigInt(Math.round(amount * 1e7));
            const tokenAddress = req.body.tokenAddress || offer.tokens?.[0]?.sacContractId;
            if (!tokenAddress) {
                return res.status(400).json({ error: 'tokenAddress required (SAC contract ID)' });
            }
            const result = await SorobanSaleService.buildWithdrawXdr(
                offer.sorobanContractId, tokenAddress, amountStroops
            );
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_withdraw',
                metadata: { offerId: offer.id, amount: amountStroops.toString(), tokenAddress },
                description: `Withdraw ${amount} tokens from ${offer.assetCode} contract`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/freeze */
    static async freeze(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const { buyerAddress } = req.body;
            const frozen = req.body.frozen !== false && req.body.frozen !== 'false';
            validateAddress(buyerAddress, 'buyerAddress');
            const result = await SorobanSaleService.buildFreezeBuyerXdr(
                offer.sorobanContractId, buyerAddress, frozen
            );
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_freeze',
                metadata: { offerId: offer.id, buyerAddress, frozen },
                description: `${frozen ? 'Freeze' : 'Unfreeze'} buyer ${buyerAddress.slice(0, 8)}… on ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    // ═══════════════════════════════════════
    // DESTRUCTIVE OPS (🔴 — X-Confirm required)
    // ═══════════════════════════════════════

    /** POST /api/admin/contracts/:offerId/drain */
    static async drain(req, res, next) {
        try {
            requireConfirm(req);
            const offer = await resolveContract(req.params.offerId);
            const result = await SorobanSaleService.buildEmergencyDrainXdr(offer.sorobanContractId);
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_drain',
                metadata: { offerId: offer.id, contractId: offer.sorobanContractId },
                description: `EMERGENCY DRAIN: pause + withdraw ALL from ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/propose-admin */
    static async proposeAdmin(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const { newAdmin } = req.body;
            validateAddress(newAdmin, 'newAdmin');
            const result = await SorobanSaleService.buildProposeAdminXdr(
                offer.sorobanContractId, newAdmin
            );
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_propose_admin',
                metadata: { offerId: offer.id, newAdmin },
                description: `Propose admin transfer to ${newAdmin.slice(0, 8)}… for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/accept-admin */
    static async acceptAdmin(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const result = await SorobanSaleService.buildAcceptAdminXdr(offer.sorobanContractId);
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_accept_admin',
                metadata: { offerId: offer.id },
                description: `Accept admin role for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    /** POST /api/admin/contracts/:offerId/upgrade */
    static async upgrade(req, res, next) {
        try {
            requireConfirm(req);
            const offer = await resolveContract(req.params.offerId);
            const { wasmHash } = req.body;
            if (!wasmHash || typeof wasmHash !== 'string' || !/^[0-9a-f]{64}$/i.test(wasmHash)) {
                return res.status(400).json({ error: 'wasmHash must be a 64-character hex string' });
            }
            const result = await SorobanSaleService.buildUpgradeXdr(
                offer.sorobanContractId, wasmHash
            );
            const submitted = await TransactionManager.submit({
                xdr: result.xdr,
                signingRole: 'ISSUER',
                operationType: 'contract_upgrade',
                metadata: { offerId: offer.id, wasmHash },
                description: `UPGRADE contract WASM for ${offer.assetCode}`,
                initiatorId: req.user?.id,
            });
            res.status(202).json(submitted);
        } catch (err) {
            next(err);
        }
    }

    // ═══════════════════════════════════════
    // BUYER QUERIES
    // ═══════════════════════════════════════

    /** GET /api/admin/contracts/:offerId/buyers/:addr */
    static async buyerInfo(req, res, next) {
        try {
            const offer = await resolveContract(req.params.offerId);
            const addr = req.params.addr;
            validateAddress(addr, 'buyer address');

            const [spent, frozen] = await Promise.all([
                SorobanSaleService.getBuyerSpent(offer.sorobanContractId, addr).catch(() => 0n),
                SorobanSaleService.isFrozen(offer.sorobanContractId, addr).catch(() => false),
            ]);

            res.json({
                buyerAddress: addr,
                totalSpent: spent.toString(),
                isFrozen: frozen,
                contractId: offer.sorobanContractId,
                assetCode: offer.assetCode,
            });
        } catch (err) {
            next(err);
        }
    }
}
