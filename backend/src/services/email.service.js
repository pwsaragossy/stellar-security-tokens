import { Resend } from 'resend';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
const log = logger.scope('EmailService');

dotenv.config();

// ---------------------------------------------------------------------------
// Resend client initialization
// ---------------------------------------------------------------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Radox <noreply@mail.radox.net>';

let resend = null;

if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
  log.info('✅ Email service configured (Resend HTTP API)');
  log.info(`   From: ${EMAIL_FROM}`);
} else {
  log.info('ℹ️  Email service: Dev Mode (logging to console)');
}

/**
 * Internal helper — sends email via Resend or logs in dev mode.
 * @param {Object} opts – { to, subject, html, text }
 * @returns {Promise<{success:boolean, messageId?:string, message?:string}>}
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!resend) {
    log.info('\n📧 [DEV MODE] Sending Email:');
    log.info(`   To: ${to}`);
    log.info(`   Subject: ${subject}`);
    log.info(`   From: ${EMAIL_FROM}`);
    log.info('   --- Text Content ---');
    log.info(text);
    log.info('   --------------------\n');
    return { success: true, messageId: `dev-mock-${Date.now()}`, message: 'Dev mode – logged to console' };
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { success: true, messageId: data?.id, message: 'Email sent successfully' };
};


/**
 * Serviço para envio de emails usando Resend HTTP API
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
   * @throws {Error} Se houver erro ao enviar email
   */
  static async sendInterestPaymentConfirmation(investorEmail, investorName, amount, transactionHash, paymentDate) {
    try {
      return await sendEmail({
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento de Juros Recebido\n\nOlá ${investorName},\n\nInformamos que seu pagamento de juros foi processado com sucesso.\n\nValor: ${amount} USDC\nData do Pagamento: ${paymentDate}\nHash da Transação: ${transactionHash}\n\nVocê pode verificar a transação no Stellar Explorer usando o hash acima.\n\nAtenciosamente,\nEquipe Radox`,
      });
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
    try {
      return await sendEmail({
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
                  <p class="footer-text">This is an automated message from <span class="brand">Radox</span>.<br>Please do not reply to this email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Your Stellar Tokens verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
      });
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
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
      const verificationLink = `${frontendUrl}/investor/verify-email?token=${verificationToken}`;

      return await sendEmail({
        to: investorEmail,
        subject: 'Confirme seu email - Radox',
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
                  <p class="text">Obrigado por se cadastrar na plataforma Radox!</p>
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
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Radox</span>.<br>Por favor, não responda este email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Confirme seu Email\n\nOlá ${investorName},\n\nObrigado por se cadastrar na plataforma Radox!\n\nPara continuar com a criação da sua conta e carteira digital, por favor confirme seu email acessando o link abaixo:\n\n${verificationLink}\n\nEste link é válido por 24 horas.\n\nSe você não solicitou este cadastro, por favor ignore este email.\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending verification email to ${investorEmail}:`, error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  /**
   * Resend verification email
   */
  static async resendVerificationEmail(investorEmail, investorName, verificationToken) {
    return this.sendVerificationEmail(investorEmail, investorName, verificationToken);
  }

  /**
   * Send welcome email after email verification and wallet creation
   */
  static async sendWelcomeEmail(investorEmail, investorName, contractId) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';

      return await sendEmail({
        to: investorEmail,
        subject: 'Bem-vindo! Sua carteira foi criada - Radox',
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
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Radox</span>.<br>Por favor, não responda este email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Bem-vindo!\n\nOlá ${investorName},\n\nParabéns! Sua conta foi verificada e sua carteira digital Stellar foi criada com sucesso!\n\nEndereço da sua Carteira: ${contractId}\n\nPróximos passos:\n1. Complete seu KYC para poder investir\n2. Explore as ofertas de tokens disponíveis\n3. Faça seu primeiro investimento\n\nSua carteira é protegida por passkey (biometria). Você não precisa guardar senhas ou chaves privadas!\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending welcome email to ${investorEmail}:`, error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  /**
   * Send bullet payment confirmation email
   */
  static async sendBulletPaymentConfirmation(email, data) {
    try {
      const { investorName, paymentDate, transactionHash, totalAmount, payments } = data;

      return await sendEmail({
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento Bullet Processado\n\nOlá ${investorName},\n\nSeu pagamento bullet foi processado com sucesso!\n\nValor Total: ${totalAmount.toFixed(2)} USDC\nData: ${paymentDate}\nHash: ${transactionHash}\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending bullet payment email to ${email}:`, error);
      throw new Error(`Failed to send bullet payment email: ${error.message}`);
    }
  }

  /**
   * Send quarterly payment confirmation email
   */
  static async sendQuarterlyPaymentConfirmation(email, data) {
    try {
      const { investorName, paymentDate, transactionHash, totalAmount } = data;

      return await sendEmail({
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento de Juros Trimestral\n\nOlá ${investorName},\n\nSeu pagamento de juros trimestral foi processado com sucesso!\n\nValor: ${totalAmount.toFixed(2)} USDC\nData: ${paymentDate}\nHash: ${transactionHash}\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending quarterly payment email to ${email}:`, error);
      throw new Error(`Failed to send quarterly payment email: ${error.message}`);
    }
  }

  /**
   * Send semi-annual payment confirmation email
   */
  static async sendSemiAnnualPaymentConfirmation(email, data) {
    try {
      const { investorName, paymentDate, transactionHash, totalAmount } = data;

      return await sendEmail({
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Pagamento de Juros Semestral\n\nOlá ${investorName},\n\nSeu pagamento de juros semestral foi processado com sucesso!\n\nValor: ${totalAmount.toFixed(2)} USDC\nData: ${paymentDate}\nHash: ${transactionHash}\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending semi-annual payment email to ${email}:`, error);
      throw new Error(`Failed to send semi-annual payment email: ${error.message}`);
    }
  }

  /**
   * Envia email de confirmação de investimento
   */
  static async sendInvestmentConfirmation(investorEmail, investment, distribution) {
    try {
      const { assetCode, tokenAmount } = investment;
      const { transactionHash } = distribution;

      return await sendEmail({
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Investimento Confirmado - ${assetCode}\n\nSeu investimento foi processado com sucesso.\n\nTokens: ${tokenAmount} ${assetCode}\nHash da Transação: ${transactionHash}\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending investment confirmation to ${investorEmail}:`, error);
      throw new Error(`Failed to send investment confirmation: ${error.message}`);
    }
  }

  /**
   * Envia email de aprovação de KYC
   */
  static async sendKYCApprovalEmail(investorEmail, investorName) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
      const dashboardLink = `${frontendUrl}/investor/dashboard`;

      return await sendEmail({
        to: investorEmail,
        subject: 'Sua conta foi aprovada! - Radox',
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
              .success-box { background: linear-gradient(135deg, #e6f4ea 0%, #d4edda 100%); border-left: 4px solid #34a853; padding: 20px; border-radius: 0 12px 12px 0; margin: 24px 0; }
              .success-text { color: #137333; font-size: 15px; margin: 0; }
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
                  <div class="celebration">✅</div>
                  <div class="logo">✦ RADOX</div>
                  <div class="header-subtitle">Sua conta foi aprovada!</div>
                </div>
                <div class="content">
                  <p class="greeting">Olá ${investorName},</p>
                  <div class="success-box">
                    <p class="success-text">Sua verificação de identidade (KYC) foi aprovada com sucesso! Agora você pode investir em tokens de segurança na plataforma.</p>
                  </div>
                  <p class="text">Acesse o dashboard para ver as ofertas disponíveis e fazer seu primeiro investimento.</p>
                  <div class="button-container">
                    <a href="${dashboardLink}" class="button">Acessar Dashboard</a>
                  </div>
                  <p class="text">Atenciosamente,<br>Equipe Radox</p>
                </div>
                <div class="footer">
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Radox</span>.<br>Por favor, não responda este email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Sua conta foi aprovada!\n\nOlá ${investorName},\n\nSua verificação de identidade (KYC) foi aprovada!\n\nAcesse o dashboard: ${dashboardLink}\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending KYC approval email to ${investorEmail}:`, error);
      throw new Error(`Failed to send KYC approval email: ${error.message}`);
    }
  }

  /**
   * Envia email de rejeição de KYC
   */
  static async sendKYCRejectionEmail(investorEmail, investorName, reason) {
    try {
      return await sendEmail({
        to: investorEmail,
        subject: 'Atualização sobre sua conta - Radox',
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Atualização sobre sua conta\n\nOlá ${investorName},\n\nInfelizmente sua verificação de identidade não foi aprovada.\n\nMotivo: ${reason}\n\nPor favor, entre em contato com o suporte.\n\nAtenciosamente,\nEquipe Radox`,
      });
    } catch (error) {
      log.error(`Error sending KYC rejection email to ${investorEmail}:`, error);
      throw new Error(`Failed to send KYC rejection email: ${error.message}`);
    }
  }

  /**
   * Envia email de atualização de status da empresa
   */
  static async sendCompanyStatusUpdate(email, companyName, status, reason = '') {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost';
      const loginLink = `${frontendUrl}/login`;

      const statusMessages = {
        'approved': 'Aprovada',
        'rejected': 'Rejeitada',
        'pending': 'Em Análise'
      };

      const readableStatus = statusMessages[status] || status;

      const subject = status === 'approved'
        ? `🎉 Empresa Aprovada! - ${companyName}`
        : `Atualização de Status - ${companyName}`;

      const reasonHtml = reason ? `
        <div style="background-color: #fcebeb; border-left: 4px solid #e74c3c; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <strong>Motivo/Observações:</strong><br>
          ${reason}
        </div>
      ` : '';

      const loginButtonHtml = status === 'approved' ? `
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginLink}" style="display: inline-block; background: linear-gradient(135deg, #C9A962 0%, #a88a4a 100%); color: #0A1628; font-weight: 600; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 15px rgba(201,169,98,0.3);">Acessar Painel da Empresa</a>
        </div>
      ` : '';

      const approvedContent = status === 'approved' ? `
        <div style="background: linear-gradient(135deg, #e6f4ea 0%, #d4edda 100%); border-left: 4px solid #34a853; padding: 20px; border-radius: 0 12px 12px 0; margin: 24px 0;">
          <div style="color: #137333; font-size: 16px; font-weight: 600; margin-bottom: 8px;">✓ Cadastro Aprovado</div>
          <p style="color: #137333; font-size: 14px; margin: 0;">Sua empresa foi verificada e aprovada! Agora você pode acessar o painel para criar ofertas de tokens.</p>
        </div>
      ` : '';

      return await sendEmail({
        to: email,
        subject,
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
                  <p class="text">Atenciosamente,<br>Equipe Radox</p>
                </div>
                <div class="footer">
                  <p class="footer-text">Esta é uma mensagem automática da <span class="brand">Radox</span>.<br>Por favor, não responda este email.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Atualização de Status - ${companyName}\n\nNovo Status: ${readableStatus}\n${reason ? `Motivo: ${reason}\n` : ''}${status === 'approved' ? `\nAcesse o painel: ${loginLink}\n` : ''}\nAtenciosamente,\nEquipe Radox`
      });
    } catch (error) {
      log.error(`Error sending company status email to ${email}:`, error);
      throw new Error(`Failed to send company status email: ${error.message}`);
    }
  }

  /**
   * Envia email de atualização de status da oferta
   */
  static async sendOfferStatusUpdate(email, offerTitle, status, reason = '') {
    try {
      const subject = `Atualização de Oferta - ${offerTitle}`;

      const reasonHtml = reason ? `
        <div style="background-color: #fcebeb; border-left: 4px solid #e74c3c; padding: 10px; margin: 15px 0;">
          <strong>Motivo/Observações:</strong><br>
          ${reason}
        </div>
      ` : '';

      return await sendEmail({
        to: email,
        subject,
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
                <p>Atenciosamente,<br>Equipe Radox</p>
              </div>
              <div class="footer">
                <p>Este é um email automático.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Atualização de Oferta - ${offerTitle}\n\nNovo Status: ${status}\n${reason ? `Motivo: ${reason}\n` : ''}\nAtenciosamente,\nEquipe Radox`
      });
    } catch (error) {
      log.error(`Error sending offer status email to ${email}:`, error);
      throw new Error(`Failed to send offer status email: ${error.message}`);
    }
  }
}
