import { getNetworkPassphrase } from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import prisma from '../config/prisma.js';
import { ipfsService } from './ipfs.service.js';

/**
 * Escapes special characters for TOML string values.
 * Handles newlines, quotes, and backslashes.
 */
function tomlEscape(str) {
    if (!str) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '');
}

export class TomlService {
    /**
     * Generates the stellar.toml content dynamically (SEP-1 compliant).
     *
     * SEP-1 reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md
     *
     * Standard fields used by Stellar Expert and wallets:
     *   code, issuer, name, desc, conditions, display_decimals, status,
     *   is_asset_anchored, anchor_asset_type, anchor_asset,
     *   attestation_of_reserve, redemption_instructions,
     *   image, regulated, approval_server
     *
     * Non-standard fields (kept for programmatic API consumers):
     *   ipfs_contract_hash, ipfs_contract_url, etc.
     *
     * @returns {Promise<string>} TOML formatted string
     */
    static async generateToml() {
        const issuerKey = keyManager.getIssuerPublicKey();
        const networkPassphrase = getNetworkPassphrase();

        // Fetch all tokens from DB with their related offers + company
        const tokens = await prisma.token.findMany({
            include: {
                offer: {
                    include: { company: true }
                }
            },
            take: 1000,
            orderBy: { createdAt: 'desc' }
        });

        // Fetch system settings for organizational info
        const configs = await prisma.systemConfig.findMany();
        const configMap = configs.reduce((acc, item) => {
            acc[item.key] = item.value;
            return acc;
        }, {});

        const orgUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const orgLogo = configMap.org_logo || `${orgUrl}/logo.png`;

        let toml = `# Stellar TOML File (SEP-1)
# Generated dynamically for compliance
# https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md

VERSION="2.0.0"
NETWORK_PASSPHRASE="${networkPassphrase}"
ACCOUNTS=[
  "${issuerKey}"
]

[DOCUMENTATION]
ORG_NAME="${tomlEscape(configMap.org_name || 'Radox')}"
ORG_DBA="${tomlEscape(configMap.org_dba || 'Radox')}"
ORG_URL="${orgUrl}"
ORG_LOGO="${orgLogo}"
ORG_DESCRIPTION="${tomlEscape(configMap.org_description || 'Fixed Income Tokenization Platform')}"

`;

        // ── CURRENCIES ──
        for (const token of tokens) {
            const offer = token.offer;
            const docs = (offer?.legalDocuments || {});

            // ── conditions: human-readable terms ──
            const conditionsParts = ['Restricted to authorized investors only.'];

            if (offer) {
                if (offer.annualInterestRate) {
                    conditionsParts.push(`Annual interest rate: ${offer.annualInterestRate}%.`);
                }
                if (offer.investorRate) {
                    conditionsParts.push(`Investor yield: ${offer.investorRate}%.`);
                }
                if (offer.maturityDate) {
                    conditionsParts.push(`Maturity: ${new Date(offer.maturityDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`);
                }
                if (offer.paymentType) {
                    const paymentLabels = { monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-Annual', annual: 'Annual', bullet: 'Bullet (At Maturity)' };
                    conditionsParts.push(`Payments: ${paymentLabels[offer.paymentType] || offer.paymentType}.`);
                }
            }

            // ── Map offer type to SEP-1 anchor_asset_type ──
            // SEP-1 values: fiat, crypto, nft, stock, bond, commodity, realestate, other
            let anchorAssetType = 'bond'; // Default for fixed-income
            let anchorAsset = token.assetCode;
            if (offer) {
                if (offer.offerType === 'collateral' && offer.collateralType === 'real_estate') {
                    anchorAssetType = 'realestate';
                    anchorAsset = offer.collateralDescription
                        ? tomlEscape(offer.collateralDescription.slice(0, 80))
                        : token.assetCode;
                }
            }

            // ── attestation_of_reserve: PRIMARY IPFS link (standard SEP-1 field) ──
            // Stellar Expert and wallets render this as a clickable link.
            // We pick the most important document: contract > prospectus > terms
            let attestationUrl = '';
            if (docs.contract?.hash) {
                attestationUrl = ipfsService.getGatewayUrl(docs.contract.hash);
            } else if (docs.prospectus?.hash) {
                attestationUrl = ipfsService.getGatewayUrl(docs.prospectus.hash);
            } else if (docs.terms?.hash) {
                attestationUrl = ipfsService.getGatewayUrl(docs.terms.hash);
            }

            // ── redemption_instructions: embed ALL IPFS doc links ──
            const redeemParts = [];
            if (docs.contract?.hash) redeemParts.push(`Contract: ${ipfsService.getGatewayUrl(docs.contract.hash)}`);
            if (docs.prospectus?.hash) redeemParts.push(`Prospectus: ${ipfsService.getGatewayUrl(docs.prospectus.hash)}`);
            if (docs.terms?.hash) redeemParts.push(`Terms: ${ipfsService.getGatewayUrl(docs.terms.hash)}`);
            // Additional collateral docs
            if (docs.matricula?.hash) redeemParts.push(`Matricula: ${ipfsService.getGatewayUrl(docs.matricula.hash)}`);
            if (docs.laudo?.hash) redeemParts.push(`Laudo: ${ipfsService.getGatewayUrl(docs.laudo.hash)}`);

            // ── Build [[CURRENCIES]] entry using only standard SEP-1 fields ──
            toml += `[[CURRENCIES]]\n`;
            toml += `code="${token.assetCode}"\n`;
            toml += `issuer="${token.issuerPublicKey}"\n`;
            toml += `display_decimals=7\n`;
            toml += `name="${tomlEscape(offer?.offerName || `${token.assetCode} Token`)}"\n`;
            toml += `desc="${tomlEscape(token.description || offer?.description || 'Tokenized Fixed Income Asset')}"\n`;
            toml += `conditions="${tomlEscape(conditionsParts.join(' '))}"\n`;
            toml += `is_asset_anchored=true\n`;
            toml += `anchor_asset_type="${anchorAssetType}"\n`;
            toml += `anchor_asset="${tomlEscape(anchorAsset)}"\n`;

            if (attestationUrl) {
                toml += `attestation_of_reserve="${attestationUrl}"\n`;
            }

            if (redeemParts.length > 0) {
                toml += `redemption_instructions="${tomlEscape(redeemParts.join(' | '))}"\n`;
            }

            // regulated = true means transfers require authorization (AUTH_REQUIRED flag)
            toml += `regulated=true\n`;

            if (offer) {
                toml += `status="live"\n`;

                // ── Non-standard fields: kept for programmatic API consumers ──
                if (docs.contract?.hash) {
                    toml += `ipfs_contract_hash="${docs.contract.hash}"\n`;
                    toml += `ipfs_contract_url="${ipfsService.getGatewayUrl(docs.contract.hash)}"\n`;
                }
                if (docs.prospectus?.hash) {
                    toml += `ipfs_prospectus_hash="${docs.prospectus.hash}"\n`;
                    toml += `ipfs_prospectus_url="${ipfsService.getGatewayUrl(docs.prospectus.hash)}"\n`;
                }
                if (docs.terms?.hash) {
                    toml += `ipfs_terms_hash="${docs.terms.hash}"\n`;
                    toml += `ipfs_terms_url="${ipfsService.getGatewayUrl(docs.terms.hash)}"\n`;
                }
            }

            toml += '\n';
        }

        return toml;
    }
}
