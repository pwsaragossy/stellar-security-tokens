import prisma from '../config/prisma.js';

export class ConfigService {
    /**
     * Obtém valor de configuração ou padrão
     * @param {string} key - Chave da configuração
     * @param {string} defaultValue - Valor padrão
     * @returns {Promise<string>} Valor configurado
     */
    static async get(key, defaultValue = '0') {
        const config = await prisma.systemConfig.findUnique({
            where: { key },
        });
        return config ? config.value : defaultValue;
    }

    /**
     * Obtém valor numérico ou padrão (float)
     * @param {string} key 
     * @param {number} defaultValue 
     * @returns {Promise<number>}
     */
    static async getFloat(key, defaultValue = 0) {
        const val = await this.get(key, defaultValue.toString());
        return parseFloat(val);
    }

    /**
     * Loga uma taxa cobrada no banco de dados
     * @param {Object} data 
     * @param {number} data.amount
     * @param {string} data.assetCode
     * @param {string} data.category
     * @param {number} [data.sourceId]
     * @param {string} [data.description]
     * @param {string} [data.transactionHash]
     */
    static async logFee({ amount, assetCode, category, sourceId, description, transactionHash }) {
        if (amount <= 0) return;
        try {
            await prisma.feeLog.create({
                data: {
                    amount,
                    assetCode,
                    category,
                    sourceId,
                    description,
                    transactionHash,
                },
            });
        } catch (error) {
            console.error('Failed to log fee:', error);
            // Não lançar erro para não bloquear fluxo principal?
        }
    }
}
