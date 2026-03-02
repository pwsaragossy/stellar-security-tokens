import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
const log = logger.scope('EmailService');

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
    log.info('ℹ️  Email service: Dev Mode (logging to console)');
    // Return mock transporter for Dev Mode
    return {
      sendMail: async (options) => {
        log.info('\n📧 [DEV MODE] Sending Email:');
        log.info(`   To: ${options.to}`);
        log.info(`   Subject: ${options.subject}`);
        log.info(`   From: ${options.from}`);
        log.info('   --- Text Content ---');
        log.info(options.text);
        log.info('   --------------------\n');
        return { messageId: `dev-mock-${Date.now()}` };
      },
      verify: async () => true
    };
  }

  const transporter = nodemailer.createTransport(smtpConfig);

  // Delay SMTP verification to allow Docker DNS to initialize
  // This prevents the "EAI_AGAIN" warning during container startup
  setTimeout(() => {
    transporter.verify().then(() => {
      log.info('✅ Email service configured successfully');
      log.info(`   SMTP Host: ${smtpConfig.host}:${smtpConfig.port}`);
      log.info(`   From: ${process.env.SMTP_FROM || smtpConfig.auth.user}`);
    }).catch((error) => {
      log.warn('⚠️  SMTP connection verification failed:', error.message);
      log.warn('   Email sending may not work. Please check your SMTP configuration.');
      log.warn('   Run "npm run test:email" to diagnose the issue.');
      log.warn('   System will continue to work, but emails will be skipped.');
    });
  }, 5000); // Wait 5 seconds for DNS to be ready

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
      log.info(`Email sent successfully to ${investorEmail}:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Email sent successfully',
      };
    } catch (error) {
      log.error(`Error sending email to ${investorEmail}:`, error);
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
   * Send 6-digit verification code email for email-first registration
   * @param {string} email - Email address
   * @param {string} code - 6-digit verification code
   * @returns {Promise<Object>} Result of email send
   */
  static async send6DigitVerificationCode(email, code) {
    if (!transporter) {
      log.warn('Email service not configured - verification code not sent');
      log.info(`[DEV MODE] Verification code for ${email}: ${code}`);
      return { success: true, message: 'Dev mode - code logged to console' };
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `${code} is your verification code - Stellar Tokens`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A1628; }
              .wrapper { width: 100%; background-color: #0A1628; padding: 40px 0; }
              .container { max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.3); }
              .header { background: linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%); padding: 40px 30px; text-align: center; }
              .logo { font-size: 28px; font-weight: 700; color: #C9A962; letter-spacing: 1px; margin-bottom: 8px; font-family: Georgia, 'Times New Roman', serif; }
              .header-subtitle { color: rgba(255,255,255,0.7); font-size: 14px; }
              .content { padding: 40px 30px; background-color: #ffffff; text-align: center; }
              .intro { color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }
              .code-box { background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border: 2px solid #C9A962; border-radius: 12px; padding: 24px; margin: 24px 0; }
              .code { font-size: 42px; font-weight: 700; color: #0A1628; letter-spacing: 12px; font-family: 'Courier New', monospace; }
              .expiry { color: #C9A962; font-size: 13px; font-weight: 600; margin-top: 24px; text-transform: uppercase; letter-spacing: 1px; }
              .note { color: #718096; font-size: 14px; line-height: 1.6; margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
              .footer { background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
              .footer-text { color: #a0aec0; font-size: 12px; line-height: 1.5; }
              .brand { color: #0A1628; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="container">
                <div class="header">
                  <div class="logo">✦ RADOX</div>
                  <div class="header-subtitle">Secure Digital Securities Platform</div>
                </div>
                <div class="content">
                  <p class="intro">Enter this verification code to continue creating your account:</p>
                  <div class="code-box">
                    <div class="code">${code}</div>
                  </div>
                  <div class="expiry">⏱ Expires in 10 minutes</div>
                  <p class="note">If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>
                </div>
                <div class="footer">
                  <p class="footer-text">This is an automated message from <span class="brand">Stellar Security Tokens</span>.<br>Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Your Stellar Tokens verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
      };

      const info = await transporter.sendMail(mailOptions);
      log.info(`6-digit verification code sent to ${email}:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Verification code sent successfully',
      };
    } catch (error) {
      log.error(`Error sending verification code to ${email}:`, error);
      throw new Error(`Failed to send verification code: ${error.message}`);
    }
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
      log.warn('Email service not configured - verification email not sent');
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
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
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A1628; }
              .wrapper { width: 100%; background-color: #0A1628; padding: 40px 0; }
              .container { max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.3); }
              .header { background: linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%); padding: 40px 30px; text-align: center; }
              .logo { font-size: 28px; font-weight: 700; color: #C9A962; letter-spacing: 1px; margin-bottom: 8px; font-family: Georgia, 'Times New Roman', serif; }
              .header-subtitle { color: rgba(255,255,255,0.7); font-size: 14px; }
              .content { padding: 40px 30px; background-color: #ffffff; }
              .greeting { color: #0A1628; font-size: 18px; font-weight: 600; margin-bottom: 16px; }
              .text { color: #4a5568; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
              .button-container { text-align: center; margin: 32px 0; }
              .button { display: inline-block; background: linear-gradient(135deg, #C9A962 0%, #a88a4a 100%); color: #0A1628; font-weight: 600; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 15px rgba(201,169,98,0.3); }
              .link-box { background-color: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 20px 0; word-break: break-all; font-size: 12px; color: #718096; font-family: 'Courier New', monospace; }
              .warning { color: #C9A962; font-size: 13px; font-weight: 500; margin-top: 20px; }
              .footer { background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
              .footer-text { color: #a0aec0; font-size: 12px; line-height: 1.5; }
              .brand { color: #0A1628; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="container">
                <div class="header">
                  <div class="logo">✦ RADOX</div>
                  <div class="header-subtitle">Secure Digital Securities Platform</div>
                </div>
                <div class="content">
                  <p class="greeting">Olá ${investorName},</p>
                  <p class="text">Obrigado por se cadastrar na plataforma Stellar Security Tokens!</p>
                  <p class="text">Para continuar com a criação da sua conta e carteira digital, por favor confirme seu email clicando no botão abaixo:</p>
                  <div class="button-container">
                    <a href="${verificationLink}" class="button">✓ Confirmar Email</a>
                  </div>
                  <p class="text">Ou copie e cole o link abaixo no seu navegador:</p>
                  <div class="link-box">${verificationLink}</div>
                  <p class="warning">⏱ Este link é válido por 24 horas.</p>
                  <p class="text">Se você não solicitou este cadastro, por favor ignore este email.</p>
                </div>
                <div class="footer">
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Stellar Security Tokens</span>.<br>Por favor, não responda este email.</p>
                </div>
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
      log.info(`Verification email sent to ${investorEmail}:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Verification email sent successfully',
      };
    } catch (error) {
      log.error(`Error sending verification email to ${investorEmail}:`, error);
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
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: 'Bem-vindo! Sua carteira foi criada - Stellar Security Tokens',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A1628; }
              .wrapper { width: 100%; background-color: #0A1628; padding: 40px 0; }
              .container { max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.3); }
              .header { background: linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%); padding: 48px 30px; text-align: center; }
              .celebration { font-size: 48px; margin-bottom: 16px; }
              .logo { font-size: 28px; font-weight: 700; color: #C9A962; letter-spacing: 1px; margin-bottom: 8px; font-family: Georgia, 'Times New Roman', serif; }
              .header-subtitle { color: rgba(255,255,255,0.7); font-size: 14px; }
              .content { padding: 40px 30px; background-color: #ffffff; }
              .greeting { color: #0A1628; font-size: 18px; font-weight: 600; margin-bottom: 16px; }
              .text { color: #4a5568; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
              .wallet-section { background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
              .wallet-label { color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
              .wallet-address { font-family: 'Courier New', monospace; font-size: 11px; color: #0A1628; word-break: break-all; background: #fff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
              .steps-section { background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0; }
              .steps-title { color: #0A1628; font-size: 16px; font-weight: 600; margin-bottom: 16px; }
              .step { display: flex; align-items: flex-start; margin: 12px 0; }
              .step-number { background: linear-gradient(135deg, #C9A962 0%, #a88a4a 100%); color: #0A1628; font-weight: 700; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 12px; flex-shrink: 0; }
              .step-text { color: #4a5568; font-size: 14px; line-height: 1.5; }
              .button-container { text-align: center; margin: 32px 0; }
              .button { display: inline-block; background: linear-gradient(135deg, #C9A962 0%, #a88a4a 100%); color: #0A1628; font-weight: 600; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 15px rgba(201,169,98,0.3); }
              .notice { background-color: #e6f4ea; border-left: 4px solid #34a853; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
              .notice-text { color: #137333; font-size: 14px; margin: 0; }
              .footer { background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
              .footer-text { color: #a0aec0; font-size: 12px; line-height: 1.5; }
              .brand { color: #0A1628; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="container">
                <div class="header">
                  <div class="celebration">🎉</div>
                  <div class="logo">✦ RADOX</div>
                  <div class="header-subtitle">Sua carteira digital foi criada com sucesso!</div>
                </div>
                <div class="content">
                  <p class="greeting">Olá ${investorName},</p>
                  <p class="text">Parabéns! Sua conta foi verificada e sua carteira digital Stellar está pronta para uso.</p>
                  
                  <div class="wallet-section">
                    <div class="wallet-label">Endereço da sua Carteira</div>
                    <div class="wallet-address">${contractId}</div>
                  </div>
                  
                  <div class="steps-section">
                    <div class="steps-title">Próximos passos</div>
                    <div class="step">
                      <span class="step-number">1</span>
                      <span class="step-text">Complete seu KYC para poder investir</span>
                    </div>
                    <div class="step">
                      <span class="step-number">2</span>
                      <span class="step-text">Explore as ofertas de tokens disponíveis</span>
                    </div>
                    <div class="step">
                      <span class="step-number">3</span>
                      <span class="step-text">Faça seu primeiro investimento</span>
                    </div>
                  </div>
                  
                  <div class="button-container">
                    <a href="${frontendUrl}/investor/dashboard" class="button">Acessar Dashboard</a>
                  </div>
                  
                  <div class="notice">
                    <p class="notice-text">🔐 <strong>Importante:</strong> Sua carteira é protegida por passkey (biometria). Você não precisa guardar senhas ou chaves privadas!</p>
                  </div>
                </div>
                <div class="footer">
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Stellar Security Tokens</span>.<br>Por favor, não responda este email.</p>
                </div>
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
      log.info(`Welcome email sent to ${investorEmail}:`, info.messageId);

      return {
        success: true,
        messageId: info.messageId,
        message: 'Welcome email sent successfully',
      };
    } catch (error) {
      log.error(`Error sending welcome email to ${investorEmail}:`, error);
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
      log.error(`Error sending bullet payment email to ${email}:`, error);
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
      log.error(`Error sending quarterly payment email to ${email}:`, error);
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
      log.error(`Error sending semi-annual payment email to ${email}:`, error);
      throw new Error(`Failed to send semi-annual payment email: ${error.message}`);
    }
  }
  /**
   * Envia email de confirmação de investimento
   * @param {string} investorEmail - Email do investidor
   * @param {Object} investment - Dados do investimento
   * @param {Object} distribution - Dados da distribuição de tokens
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendInvestmentConfirmation(investorEmail, investment, distribution) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const { assetCode, tokenAmount } = investment;
      const { transactionHash } = distribution;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: `Investimento Confirmado - ${assetCode}`,
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
                <h1>Investimento Confirmado!</h1>
              </div>
              <div class="content">
                <p>Olá,</p>
                <p>Seu investimento em <strong>${assetCode}</strong> foi confirmado e os tokens foram enviados para sua carteira.</p>
                <p><strong>Tokens Recebidos:</strong> <span class="amount">${tokenAmount} ${assetCode}</span></p>
                <p><strong>Hash da Transação:</strong></p>
                <div class="transaction">${transactionHash}</div>
                <p>Você já pode visualizar seus tokens no painel do investidor.</p>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Investimento Confirmado - ${assetCode}\n\nSeu investimento foi processado com sucesso.\n\nTokens: ${tokenAmount} ${assetCode}\nHash da Transação: ${transactionHash}\n\nAtenciosamente,\nEquipe Stellar Security Tokens`,
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      log.error(`Error sending investment confirmation to ${investorEmail}:`, error);
      // Don't throw here to avoid blocking payment processing flow? 
      // Actually keeping throw consistent with other methods is better for now.
      throw new Error(`Failed to send investment confirmation: ${error.message}`);
    }
  }

  /**
   * Envia email de aprovação de KYC
   * @param {string} investorEmail - Email do investidor
   * @param {string} investorName - Nome do investidor
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendKYCApprovalEmail(investorEmail, investorName) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
      const dashboardLink = `${frontendUrl}/investor/dashboard`;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: 'Sua conta foi aprovada! - Stellar Security Tokens',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A1628; }
              .wrapper { width: 100%; background-color: #0A1628; padding: 40px 0; }
              .container { max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.3); }
              .header { background: linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%); padding: 48px 30px; text-align: center; }
              .celebration { font-size: 48px; margin-bottom: 16px; }
              .logo { font-size: 28px; font-weight: 700; color: #C9A962; letter-spacing: 1px; margin-bottom: 8px; font-family: Georgia, 'Times New Roman', serif; }
              .header-subtitle { color: rgba(255,255,255,0.7); font-size: 14px; }
              .content { padding: 40px 30px; background-color: #ffffff; }
              .greeting { color: #0A1628; font-size: 18px; font-weight: 600; margin-bottom: 16px; }
              .text { color: #4a5568; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
              .highlight { background: linear-gradient(135deg, #e6f4ea 0%, #d4edda 100%); border-left: 4px solid #34a853; padding: 20px; border-radius: 0 12px 12px 0; margin: 24px 0; }
              .highlight-title { color: #137333; font-size: 16px; font-weight: 600; margin-bottom: 8px; }
              .highlight-text { color: #137333; font-size: 14px; margin: 0; }
              .button-container { text-align: center; margin: 32px 0; }
              .button { display: inline-block; background: linear-gradient(135deg, #C9A962 0%, #a88a4a 100%); color: #0A1628; font-weight: 600; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 15px rgba(201,169,98,0.3); }
              .footer { background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
              .footer-text { color: #a0aec0; font-size: 12px; line-height: 1.5; }
              .brand { color: #0A1628; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="container">
                <div class="header">
                  <div class="celebration">🎉</div>
                  <div class="logo">✦ RADOX</div>
                  <div class="header-subtitle">Conta Aprovada!</div>
                </div>
                <div class="content">
                  <p class="greeting">Olá ${investorName},</p>
                  <p class="text">Temos ótimas notícias!</p>
                  
                  <div class="highlight">
                    <div class="highlight-title">✓ Verificação Aprovada</div>
                    <p class="highlight-text">Sua verificação de identidade (KYC) foi aprovada com sucesso. Agora você tem acesso completo à plataforma.</p>
                  </div>
                  
                  <p class="text">Você já pode começar a investir nas ofertas de security tokens disponíveis. Explore o marketplace e encontre oportunidades de investimento.</p>
                  
                  <div class="button-container">
                    <a href="${dashboardLink}" class="button">Começar a Investir</a>
                  </div>
                  
                  <p class="text">Se tiver qualquer dúvida, nossa equipe de suporte está à disposição.</p>
                </div>
                <div class="footer">
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Stellar Security Tokens</span>.<br>Por favor, não responda este email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Conta Aprovada!\n\nOlá ${investorName},\n\nSua verificação de identidade foi aprovada. Voce já pode investir na plataforma.\n\nAcesse: ${dashboardLink}\n\nAtenciosamente,\nEquipe Stellar Security Tokens`,
      };

      const info = await transporter.sendMail(mailOptions);

      // Notification
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        const investor = await prisma.investor.findUnique({ where: { email: investorEmail } });

        if (investor) {
          const { NotificationService } = await import('./notification.service.js');
          await NotificationService.createNotification(
            investor.id,
            'investor',
            'success',
            'Conta Aprovada!',
            'Sua verificação de identidade (KYC) foi aprovada. Vocé já pode investir.',
            '/investor/dashboard'
          );
        }
      } catch (e) { log.error('Notification error:', e); }

      return { success: true, messageId: info.messageId };
    } catch (error) {
      log.error(`Error sending KYC approval email to ${investorEmail}:`, error);
      throw new Error(`Failed to send KYC approval email: ${error.message}`);
    }
  }

  /**
   * Envia email de rejeição de KYC
   * @param {string} investorEmail - Email do investidor
   * @param {string} investorName - Nome do investidor
   * @param {string} reason - Motivo da rejeição
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendKYCRejectionEmail(investorEmail, investorName, reason) {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: investorEmail,
        subject: 'Atualização sobre sua conta - Stellar Security Tokens',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .reason { background-color: #fcebeb; border-left: 4px solid #e74c3c; padding: 10px; margin: 15px 0; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Atenção Necessária</h1>
              </div>
              <div class="content">
                <p>Olá ${investorName},</p>
                <p>Infelizmente não foi possível aprovar sua verificação de identidade (KYC) neste momento.</p>
                <p><strong>Motivo:</strong></p>
                <div class="reason">
                  ${reason}
                </div>
                <p>Por favor, verifique se seus documentos estão legíveis e atualizados. Você pode entrar em contato com nosso suporte para mais detalhes ou tentar enviar novamente.</p>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Atualização sobre sua conta\n\nOlá ${investorName},\n\nInfelizmente sua verificação de identidade não foi aprovada.\n\nMotivo: ${reason}\n\nPor favor, entre em contato com o suporte.\n\nAtenciosamente,\nEquipe Stellar Security Tokens`,
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      log.error(`Error sending KYC rejection email to ${investorEmail}:`, error);
      throw new Error(`Failed to send KYC rejection email: ${error.message}`);
    }
  }

  /**
   * Envia email de atualização de status da empresa
   * @param {string} email - Email do usuário da empresa
   * @param {string} companyName - Nome da empresa
   * @param {string} status - Novo status
   * @param {string} reason - Motivo (opcional)
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendCompanyStatusUpdate(email, companyName, status, reason = '') {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
      const loginLink = `${frontendUrl}/login`;

      const statusMessages = {
        'approved': 'Aprovada',
        'rejected': 'Rejeitada',
        'pending': 'Em Análise'
      };

      const readableStatus = statusMessages[status] || status;

      // Different subject based on status
      const subject = status === 'approved'
        ? `🎉 Empresa Aprovada! - ${companyName}`
        : `Atualização de Status - ${companyName}`;

      const reasonHtml = reason ? `
        <div style="background-color: #fcebeb; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <strong>Motivo/Observações:</strong><br>
          ${reason}
        </div>
      ` : '';

      // Login button only for approved status
      const loginButtonHtml = status === 'approved' ? `
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginLink}" style="display: inline-block; background: linear-gradient(135deg, #C9A962 0%, #a88a4a 100%); color: #0A1628; font-weight: 600; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 15px rgba(201,169,98,0.3);">Acessar Painel da Empresa</a>
        </div>
      ` : '';

      // Approved message content
      const approvedContent = status === 'approved' ? `
        <div style="background: linear-gradient(135deg, #e6f4ea 0%, #d4edda 100%); border-left: 4px solid #34a853; padding: 20px; border-radius: 0 12px 12px 0; margin: 24px 0;">
          <div style="color: #137333; font-size: 16px; font-weight: 600; margin-bottom: 8px;">✓ Cadastro Aprovado</div>
          <p style="color: #137333; font-size: 14px; margin: 0;">Sua empresa foi verificada e aprovada! Agora você pode acessar o painel para criar ofertas de tokens.</p>
        </div>
      ` : '';

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0A1628; }
              .wrapper { width: 100%; background-color: #0A1628; padding: 40px 0; }
              .container { max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.3); }
              .header { background: linear-gradient(135deg, #0A1628 0%, #1a2d4a 100%); padding: 48px 30px; text-align: center; }
              .logo { font-size: 28px; font-weight: 700; color: #C9A962; letter-spacing: 1px; margin-bottom: 8px; font-family: Georgia, 'Times New Roman', serif; }
              .header-subtitle { color: rgba(255,255,255,0.7); font-size: 14px; }
              .content { padding: 40px 30px; background-color: #ffffff; }
              .greeting { color: #0A1628; font-size: 18px; font-weight: 600; margin-bottom: 16px; }
              .text { color: #4a5568; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
              .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px; }
              .status-approved { background-color: #e6f4ea; color: #137333; }
              .status-rejected { background-color: #fcebeb; color: #c72c41; }
              .status-pending { background-color: #fff3cd; color: #856404; }
              .footer { background-color: #f8f9fa; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
              .footer-text { color: #a0aec0; font-size: 12px; line-height: 1.5; }
              .brand { color: #0A1628; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="container">
                <div class="header">
                  ${status === 'approved' ? '<div style="font-size: 48px; margin-bottom: 16px;">🎉</div>' : ''}
                  <div class="logo">✦ RADOX</div>
                  <div class="header-subtitle">Atualização de Status da Empresa</div>
                </div>
                <div class="content">
                  <p class="greeting">Olá,</p>
                  <p class="text">O status da empresa <strong>${companyName}</strong> foi atualizado para:</p>
                  <p style="text-align: center; margin: 24px 0;">
                    <span class="status-badge status-${status}">${readableStatus}</span>
                  </p>
                  ${approvedContent}
                  ${reasonHtml}
                  ${loginButtonHtml}
                  <p class="text">Atenciosamente,<br>Equipe Stellar Security Tokens</p>
                </div>
                <div class="footer">
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Stellar Security Tokens</span>.<br>Por favor, não responda este email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Atualização de Status - ${companyName}\n\nNovo Status: ${readableStatus}\n${reason ? `Motivo: ${reason}\n` : ''}${status === 'approved' ? `\nAcesse o painel: ${loginLink}\n` : ''}\nAtenciosamente,\nEquipe Stellar Security Tokens`
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      log.error(`Error sending company status email to ${email}:`, error);
      throw new Error(`Failed to send company status email: ${error.message}`);
    }
  }

  /**
   * Envia email de atualização de status da oferta
   * @param {string} email - Email do responsável
   * @param {string} offerTitle - Título da oferta
   * @param {string} status - Novo status
   * @param {string} reason - Motivo (opcional)
   * @returns {Promise<Object>} Resultado do envio
   */
  static async sendOfferStatusUpdate(email, offerTitle, status, reason = '') {
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    try {
      const subject = `Atualização de Oferta - ${offerTitle}`;

      const reasonHtml = reason ? `
        <div style="background-color: #fcebeb; border-left: 4px solid #e74c3c; padding: 10px; margin: 15px 0;">
          <strong>Motivo/Observações:</strong><br>
          ${reason}
        </div>
      ` : '';

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: subject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #8e44ad; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .status { font-weight: bold; color: #8e44ad; }
              .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Atualização de Oferta</h1>
              </div>
              <div class="content">
                <p>Olá,</p>
                <p>A oferta <strong>${offerTitle}</strong> foi atualizada para o status: <span class="status">${status}</span></p>
                ${reasonHtml}
                <p>Acesse o painel para mais detalhes.</p>
                <p>Atenciosamente,<br>Equipe Stellar Security Tokens</p>
              </div>
              <div class="footer">
                <p>Este é um email automático.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Atualização de Oferta - ${offerTitle}\n\nNovo Status: ${status}\n${reason ? `Motivo: ${reason}\n` : ''}\nAtenciosamente,\nEquipe Stellar Security Tokens`
      };

      const info = await transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      log.error(`Error sending offer status email to ${email}:`, error);
      throw new Error(`Failed to send offer status email: ${error.message}`);
    }
  }
}

