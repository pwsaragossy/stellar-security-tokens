import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Cria e configura o transporter do Nodemailer com credenciais SMTP
 * @returns {Object|null} Transporter configurado ou null se credenciais não estiverem configuradas
 * @private
 */
const createTransporter = () => {
  const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
    console.log('ℹ️  Email service: Not configured (SMTP credentials not set)');
    console.log('   Email notifications will be skipped. System will continue to work normally.');
    console.log('   To enable emails, configure SMTP_USER and SMTP_PASSWORD in .env');
    console.log('   See EMAIL_SETUP.md for instructions.');
    return null;
  }

  const transporter = nodemailer.createTransport(smtpConfig);
  
  // Verificar conexão ao inicializar (assíncrono, não bloqueia)
  transporter.verify().then(() => {
    console.log('✅ Email service configured successfully');
    console.log(`   SMTP Host: ${smtpConfig.host}:${smtpConfig.port}`);
    console.log(`   From: ${process.env.SMTP_FROM || smtpConfig.auth.user}`);
  }).catch((error) => {
    console.warn('⚠️  SMTP connection verification failed:', error.message);
    console.warn('   Email sending may not work. Please check your SMTP configuration.');
    console.warn('   Run "npm run test:email" to diagnose the issue.');
    console.warn('   System will continue to work, but emails will be skipped.');
  });

  return transporter;
};

const transporter = createTransporter();

/**
 * Serviço para envio de emails usando Nodemailer
 */
export class EmailService {
  /**
   * Envia email de confirmação de pagamento de juros para investidor
   * @param {string} investorEmail - Email do investidor
   * @param {string} investorName - Nome do investidor
   * @param {number|string} amount - Valor do pagamento em USDC
   * @param {string} transactionHash - Hash da transação Stellar
   * @param {string} paymentDate - Data do pagamento (formato legível)
   * @returns {Promise<Object>} Resultado do envio
   * @returns {boolean} returns.success - Indica sucesso no envio
   * @returns {string} [returns.messageId] - ID da mensagem (se enviado)
   * @returns {string} [returns.message] - Mensagem de status
   * @throws {Error} Se houver erro ao enviar email
   */
  static async sendInterestPaymentConfirmation(investorEmail, investorName, amount, transactionHash, paymentDate) {
    if (!transporter) {
      // Email não configurado - retornar silenciosamente (já foi logado na inicialização)
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: `Pagamento de Juros - ${paymentDate}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4A90E2; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .amount { font-size: 24px; font-weight: bold; color: #4A90E2; }
              .transaction { font-family: monospace; background-color: #e8e8e8; padding: 10px; border-radius: 4px; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Pagamento de Juros Recebido</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Informamos que seu pagamento de juros foi processado com sucesso.</p>
                <p><strong>Valor:</strong> <span class="amount">${amount} USDC</span></p>
                <p><strong>Data do Pagamento:</strong> ${paymentDate}</p>
                <p><strong>Hash da Transação:</strong></p>
                <div class="transaction">${transactionHash}</div>
                <p>Você pode verificar a transação no Stellar Explorer usando o hash acima.</p>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Pagamento de Juros Recebido

          Olá ${investorName},

          Informamos que seu pagamento de juros foi processado com sucesso.

          Valor: ${amount} USDC
          Data do Pagamento: ${paymentDate}
          Hash da Transação: ${transactionHash}

          Você pode verificar a transação no Stellar Explorer usando o hash acima.

          Atenciosamente,
          Equipe Stellar Security Tokens
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${investorEmail}:`, info.messageId);
      
      return {
        success: true,
        messageId: info.messageId,
        message: 'Email sent successfully',
      };
    } catch (error) {
      console.error(`Error sending email to ${investorEmail}:`, error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

