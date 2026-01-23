import { StellarService } from '../services/stellar.service.js';
import prisma from '../config/prisma.js';

/**
 * Controller para operações de Tesouraria (OpEx)
 */
export class TreasuryController {
    /**
     * Solicita uma retirada do tesouro para despesas operacionais
     * POST /api/admin/treasury/withdraw
     */
    static async withdraw(req, res) {
        try {
            const { destination, amount, assetCode, description } = req.body;

            if (!destination || !amount || !assetCode || !description) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: destination, amount, assetCode, description',
                });
            }

            const result = await StellarService.withdrawFromTreasury(
                destination,
                amount,
                assetCode,
                description
            );

            if (result.status === 'pending_multisig') {
                return res.status(202).json({
                    success: true,
                    status: 'pending_multisig',
                    message: 'Withdrawal request queued for MultiSig approval',
                    data: result
                });
            }

            res.json({
                success: true,
                message: 'Withdrawal processed successfully',
                data: result
            });
        } catch (error) {
            console.error('[TreasuryController] Withdrawal error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to process treasury withdrawal',
                details: error.message
            });
        }
    }

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
            console.error('[TreasuryController] Balances error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch treasury balances',
                details: error.message
            });
        }
    }
}
