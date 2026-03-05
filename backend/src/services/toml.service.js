import { getNetworkPassphrase } from '../config/stellar.js';
import { keyManager } from './KeyManager.js';
import prisma from '../config/prisma.js';
import { ipfsService } from './ipfs.service.js';

export class TomlService {
    /**
     * Generates the stellar.toml content dynamically
     * @returns {Promise<string>} TOML formatted string
     */
    static async generateToml() {
        const issuerKey = keyManager.getIssuerPublicKey();
        const networkPassphrase = getNetworkPassphrase();

        // Fetch all tokens from DB with their related offers to get legal documents
        const tokens = await prisma.token.findMany({
            include: {
                offer: true
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

        let toml = `# Stellar TOML File
# Generated dynamically for compliance

VERSION="2.0.0"
NETWORK_PASSPHRASE="${networkPassphrase}"

[DOCUMENTATION]
ORG_NAME="${configMap.org_name || 'Radox'}"
ORG_URL="${process.env.FRONTEND_URL || 'http://localhost:5173'}"
ORG_DESCRIPTION="${configMap.org_description || 'Fixed Income Tokenization Platform'}"

ACCOUNTS=[
  "${issuerKey}"
]

`;

        // Add currencies section
        for (const token of tokens) {
            const offer = token.offer;

            // Build rich conditions string with terms + IPFS doc links
            const conditionsParts = ['Restricted to authorized investors only.'];

            if (offer) {
                if (offer.annualInterestRate) {
                    conditionsParts.push(`Annual interest rate: ${offer.annualInterestRate}%.`);
                }
                if (offer.maturityDate) {
                    conditionsParts.push(`Maturity: ${new Date(offer.maturityDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`);
                }
                if (offer.paymentType) {
                    const paymentLabels = { monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: 'Semi-Annual', annual: 'Annual', bullet: 'Bullet (At Maturity)' };
                    conditionsParts.push(`Payments: ${paymentLabels[offer.paymentType] || offer.paymentType}.`);
                }

                // Embed IPFS document URLs directly in conditions for explorer visibility
                const docs = offer.legalDocuments || {};
                const docLinks = [];
                if (docs.contract && docs.contract.hash) {
                    docLinks.push(`Contract: ${ipfsService.getGatewayUrl(docs.contract.hash)}`);
                }
                if (docs.prospectus && docs.prospectus.hash) {
                    docLinks.push(`Prospectus: ${ipfsService.getGatewayUrl(docs.prospectus.hash)}`);
                }
                if (docs.terms && docs.terms.hash) {
                    docLinks.push(`Terms: ${ipfsService.getGatewayUrl(docs.terms.hash)}`);
                }
                if (docLinks.length > 0) {
                    conditionsParts.push(`Legal documents: ${docLinks.join(' | ')}`);
                }
            }

            toml += `[[CURRENCIES]]
code="${token.assetCode}"
issuer="${token.issuerPublicKey}"
display_decimals=7
name="${token.assetCode} Token"
desc="${token.description || 'Tokenized Fixed Income Asset'}"
conditions="${conditionsParts.join(' ')}"
is_asset_withheld=false
is_stackable=false
`;

            // If we have an offer related, add structured IPFS fields for programmatic consumers
            if (offer) {
                toml += `status="live"\n`;

                const docs = offer.legalDocuments || {};

                if (docs.contract && docs.contract.hash) {
                    toml += `ipfs_contract_hash="${docs.contract.hash}"\n`;
                    toml += `ipfs_contract_url="${ipfsService.getGatewayUrl(docs.contract.hash)}"\n`;
                }

                if (docs.prospectus && docs.prospectus.hash) {
                    toml += `ipfs_prospectus_hash="${docs.prospectus.hash}"\n`;
                    toml += `ipfs_prospectus_url="${ipfsService.getGatewayUrl(docs.prospectus.hash)}"\n`;
                }

                if (docs.terms && docs.terms.hash) {
                    toml += `ipfs_terms_hash="${docs.terms.hash}"\n`;
                    toml += `ipfs_terms_url="${ipfsService.getGatewayUrl(docs.terms.hash)}"\n`;
                }
            }

            toml += '\n';
        }

        return toml;
    }
}
