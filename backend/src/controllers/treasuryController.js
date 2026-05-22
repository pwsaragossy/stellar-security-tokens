import logger from '../utils/logger.js';
const log = logger.scope('TreasuryController');

/**
 * Controller para operações de Tesouraria (OpEx)
 * Note: Treasury withdrawals are managed directly via Freighter.
 * This controller only provides read-only balance information.
 */
export class TreasuryController {

    /**
     * Obtém o saldo atual das contas de tesouraria
     * GET /api/admin/treasury/balances
     */
    static async getBalances(req, res) {
        try {
            const treasuryKeypair = await import('../config/stellar.js').then(m => m.getTreasuryKeypair());
            const stellarServer = await import('../config/stellar.js').then(m => m.stellarServer);

            const account = await stellarServer.loadAccount(treasuryKeypair.publicKey());

            res.json({
                success: true,
                data: {
                    publicKey: treasuryKeypair.publicKey(),
                    balances: account.balances
                }
            });
        } catch (error) {
            log.error('Balances error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch treasury balances',
                details: error.message
            });
        }
    }
}
