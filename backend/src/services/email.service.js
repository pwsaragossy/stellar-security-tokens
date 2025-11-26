import nodemailer from 'nodemailer';
import crypto from 'crypto';
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

  /**
   * Generate a secure email verification token
   * @returns {string} Random hex token (64 characters)
   */
  static generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get verification token expiry date
   * @returns {Date} Expiry date based on EMAIL_VERIFICATION_EXPIRY_HOURS env var
   */
  static getVerificationExpiry() {
    const hours = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || '24', 10);
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + hours);
    return expiry;
  }

  /**
   * Send email verification email to new investor
   * @param {string} investorEmail - Email do investidor
   * @param {string} investorName - Nome do investidor
   * @param {string} verificationToken - Token de verificação
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendVerificationEmail(investorEmail, investorName, verificationToken) {
    if (!transporter) {
      console.warn('Email service not configured - verification email not sent');
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const verificationLink = `${frontendUrl}/investor/verify-email?token=${verificationToken}`;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: 'Confirme seu email - Stellar Security Tokens',
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
              .button { display: inline-block; background-color: #4A90E2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
              .button:hover { background-color: #357ABD; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              .warning { color: #e67e22; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Confirme seu Email</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Obrigado por se cadastrar na plataforma Stellar Security Tokens!</p>
                <p>Para continuar com a criação da sua conta e carteira digital, por favor confirme seu email clicando no botão abaixo:</p>
                <p style="text-align: center;">
                  <a href="${verificationLink}" class="button">Confirmar Email</a>
                </p>
                <p>Ou copie e cole o link abaixo no seu navegador:</p>
                <p style="word-break: break-all; font-size: 12px; background: #e8e8e8; padding: 10px; border-radius: 4px;">
                  ${verificationLink}
                </p>
                <p class="warning">Este link é válido por 24 horas. Após este período, você precisará solicitar um novo email de verificação.</p>
                <p>Se você não solicitou este cadastro, por favor ignore este email.</p>
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
          Confirme seu Email

          Olá ${investorName},

          Obrigado por se cadastrar na plataforma Stellar Security Tokens!

          Para continuar com a criação da sua conta e carteira digital, por favor confirme seu email acessando o link abaixo:

          ${verificationLink}

          Este link é válido por 24 horas.

          Se você não solicitou este cadastro, por favor ignore este email.

          Atenciosamente,
          Equipe Stellar Security Tokens
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${investorEmail}:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Verification email sent successfully',
      };
    } catch (error) {
      console.error(`Error sending verification email to ${investorEmail}:`, error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  /**
   * Resend verification email
   * @param {string} investorEmail - Email do investidor
   * @param {string} investorName - Nome do investidor
   * @param {string} verificationToken - Novo token de verificação
   * @returns {Promise<Object>} Resultado do envio
   */
  static async resendVerificationEmail(investorEmail, investorName, verificationToken) {
    return this.sendVerificationEmail(investorEmail, investorName, verificationToken);
  }

  /**
   * Send welcome email after email verification and wallet creation
   * @param {string} investorEmail - Email do investidor
   * @param {string} investorName - Nome do investidor  
   * @param {string} contractId - Smart wallet contract address
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendWelcomeEmail(investorEmail, investorName, contractId) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: 'Bem-vindo! Sua carteira foi criada - Stellar Security Tokens',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #27ae60; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .wallet-address { font-family: monospace; background-color: #e8e8e8; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px; }
              .button { display: inline-block; background-color: #27ae60; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
              .steps { background: #fff; padding: 15px; border-radius: 4px; margin: 15px 0; }
              .steps li { margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Bem-vindo!</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Parabéns! Sua conta foi verificada e sua carteira digital Stellar foi criada com sucesso!</p>
                
                <p><strong>Endereço da sua Carteira:</strong></p>
                <div class="wallet-address">${contractId}</div>
                
                <div class="steps">
                  <p><strong>Próximos passos:</strong></p>
                  <ol>
                    <li>Complete seu KYC para poder investir</li>
                    <li>Explore as ofertas de tokens disponíveis</li>
                    <li>Faça seu primeiro investimento</li>
                  </ol>
                </div>
                
                <p style="text-align: center;">
                  <a href="${frontendUrl}/investor/dashboard" class="button">Acessar Dashboard</a>
                </p>
                
                <p><strong>Importante:</strong> Sua carteira é protegida por passkey (biometria). Você não precisa guardar senhas ou chaves privadas!</p>
                
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
          Bem-vindo!

          Olá ${investorName},

          Parabéns! Sua conta foi verificada e sua carteira digital Stellar foi criada com sucesso!

          Endereço da sua Carteira: ${contractId}

          Próximos passos:
          1. Complete seu KYC para poder investir
          2. Explore as ofertas de tokens disponíveis
          3. Faça seu primeiro investimento

          Sua carteira é protegida por passkey (biometria). Você não precisa guardar senhas ou chaves privadas!

          Atenciosamente,
          Equipe Stellar Security Tokens
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Welcome email sent to ${investorEmail}:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Welcome email sent successfully',
      };
    } catch (error) {
      console.error(`Error sending welcome email to ${investorEmail}:`, error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  /**
   * Send bullet payment confirmation email
   * @param {string} email - Email do investidor
   * @param {Object} data - Dados do pagamento bullet
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendBulletPaymentConfirmation(email, data) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const { investorName, paymentDate, transactionHash, totalAmount, payments } = data;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `Pagamento Bullet Recebido - ${paymentDate}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #27ae60; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .amount { font-size: 24px; font-weight: bold; color: #27ae60; }
              .transaction { font-family: monospace; background-color: #e8e8e8; padding: 10px; border-radius: 4px; word-break: break-all; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Pagamento Bullet Processado</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Seu pagamento bullet foi processado com sucesso!</p>
                <p><strong>Valor Total:</strong> <span class="amount">${totalAmount.toFixed(2)} USDC</span></p>
                <p><strong>Data:</strong> ${paymentDate}</p>
                <p><strong>Hash da Transação:</strong></p>
                <div class="transaction">${transactionHash}</div>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento Bullet Processado\n\nOlá ${investorName},\n\nSeu pagamento bullet foi processado com sucesso!\n\nValor Total: ${totalAmount.toFixed(2)} USDC\nData: ${paymentDate}\nHash: ${transactionHash}\n\nAtenciosamente,\nEquipe Stellar Security Tokens`,
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`Error sending bullet payment email to ${email}:`, error);
      throw new Error(`Failed to send bullet payment email: ${error.message}`);
    }
  }

  /**
   * Send quarterly payment confirmation email
   * @param {string} email - Email do investidor
   * @param {Object} data - Dados do pagamento trimestral
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendQuarterlyPaymentConfirmation(email, data) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const { investorName, paymentDate, transactionHash, totalAmount } = data;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `Pagamento de Juros Trimestral - ${paymentDate}`,
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
              .transaction { font-family: monospace; background-color: #e8e8e8; padding: 10px; border-radius: 4px; word-break: break-all; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Pagamento de Juros Trimestral</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Seu pagamento de juros trimestral foi processado com sucesso!</p>
                <p><strong>Valor:</strong> <span class="amount">${totalAmount.toFixed(2)} USDC</span></p>
                <p><strong>Data:</strong> ${paymentDate}</p>
                <p><strong>Hash da Transação:</strong></p>
                <div class="transaction">${transactionHash}</div>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento de Juros Trimestral\n\nOlá ${investorName},\n\nSeu pagamento de juros trimestral foi processado com sucesso!\n\nValor: ${totalAmount.toFixed(2)} USDC\nData: ${paymentDate}\nHash: ${transactionHash}\n\nAtenciosamente,\nEquipe Stellar Security Tokens`,
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`Error sending quarterly payment email to ${email}:`, error);
      throw new Error(`Failed to send quarterly payment email: ${error.message}`);
    }
  }

  /**
   * Send semi-annual payment confirmation email
   * @param {string} email - Email do investidor
   * @param {Object} data - Dados do pagamento semestral
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendSemiAnnualPaymentConfirmation(email, data) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const { investorName, paymentDate, transactionHash, totalAmount } = data;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `Pagamento de Juros Semestral - ${paymentDate}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #9b59b6; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .amount { font-size: 24px; font-weight: bold; color: #9b59b6; }
              .transaction { font-family: monospace; background-color: #e8e8e8; padding: 10px; border-radius: 4px; word-break: break-all; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Pagamento de Juros Semestral</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Seu pagamento de juros semestral foi processado com sucesso!</p>
                <p><strong>Valor:</strong> <span class="amount">${totalAmount.toFixed(2)} USDC</span></p>
                <p><strong>Data:</strong> ${paymentDate}</p>
                <p><strong>Hash da Transação:</strong></p>
                <div class="transaction">${transactionHash}</div>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento de Juros Semestral\n\nOlá ${investorName},\n\nSeu pagamento de juros semestral foi processado com sucesso!\n\nValor: ${totalAmount.toFixed(2)} USDC\nData: ${paymentDate}\nHash: ${transactionHash}\n\nAtenciosamente,\nEquipe Stellar Security Tokens`,
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`Error sending semi-annual payment email to ${email}:`, error);
      throw new Error(`Failed to send semi-annual payment email: ${error.message}`);
    }
  }
}

