import { test, describe } from 'node:test';
import assert from 'node:assert';

// Nota: Estes testes requerem configuração SMTP ou mock adequado do nodemailer

describe('EmailService - Structure Tests', () => {
  test('EmailService exports correctly', async () => {
    const { EmailService } = await import('../../../services/email.service.js');
    assert.ok(EmailService);
    assert.ok(typeof EmailService.sendInterestPaymentConfirmation === 'function');
  });

  test('EmailService.sendInterestPaymentConfirmation is a function', async () => {
    const { EmailService } = await import('../../../services/email.service.js');
    assert.ok(typeof EmailService.sendInterestPaymentConfirmation === 'function');
  });

  test('EmailService handles missing SMTP config gracefully', async () => {
    // Remover configuração SMTP temporariamente
    const originalUser = process.env.SMTP_USER;
    const originalPass = process.env.SMTP_PASSWORD;
    
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    // Importar módulo com timestamp para forçar reload
    const { EmailService } = await import(`../../../services/email.service.js?t=${Date.now()}`);
    
    const result = await EmailService.sendInterestPaymentConfirmation(
      'test@example.com',
      'Test User',
      '0.8333333',
      'abc123',
      '2024-02-01'
    );

    // Deve retornar erro ou indicar que não está configurado
    assert.ok(result);
    assert.ok(result.success === false || result.message);

    // Restaurar configuração
    if (originalUser) process.env.SMTP_USER = originalUser;
    if (originalPass) process.env.SMTP_PASSWORD = originalPass;
  });
});
