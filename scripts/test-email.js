#!/usr/bin/env node

/**
 * Script de teste para verificar configuração de email
 * 
 * Uso: node scripts/test-email.js [email_destino]
 */

import dotenv from 'dotenv';
import { EmailService } from '../backend/services/email.service.js';

dotenv.config();

const testEmail = process.argv[2] || process.env.SMTP_USER || 'test@example.com';

console.log('🧪 Testando configuração de email...\n');
console.log(`📧 Email de destino: ${testEmail}`);
console.log(`📤 Remetente: ${process.env.SMTP_FROM || process.env.SMTP_USER || 'não configurado'}\n`);

// Verificar variáveis de ambiente
const requiredVars = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Variáveis de ambiente faltando:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Configure as variáveis no arquivo .env');
  console.error('💡 Veja EMAIL_SETUP.md para instruções detalhadas\n');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente configuradas');
console.log(`   SMTP_HOST: ${process.env.SMTP_HOST}`);
console.log(`   SMTP_PORT: ${process.env.SMTP_PORT || '587'}`);
console.log(`   SMTP_SECURE: ${process.env.SMTP_SECURE || 'false'}`);
console.log(`   SMTP_USER: ${process.env.SMTP_USER}`);
console.log(`   SMTP_FROM: ${process.env.SMTP_FROM || process.env.SMTP_USER}\n`);

// Testar envio
console.log('📨 Enviando email de teste...\n');

try {
  const result = await EmailService.sendInterestPaymentConfirmation(
    testEmail,
    'Teste de Email',
    '0.8333333',
    'TEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    new Date().toLocaleDateString('pt-BR')
  );

  if (result.success) {
    console.log('✅ Email enviado com sucesso!');
    console.log(`   Message ID: ${result.messageId}`);
    console.log(`   Mensagem: ${result.message}\n`);
    console.log('💡 Verifique sua caixa de entrada (e spam) para confirmar o recebimento.\n');
    process.exit(0);
  } else {
    console.error('❌ Falha ao enviar email');
    console.error(`   Erro: ${result.message}\n`);
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Erro ao enviar email:');
  console.error(`   ${error.message}\n`);
  
  if (error.message.includes('Invalid login')) {
    console.error('💡 Dica: Verifique suas credenciais SMTP');
    console.error('💡 Para Gmail, use uma App Password ao invés da senha normal\n');
  } else if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
    console.error('💡 Dica: Verifique SMTP_HOST e SMTP_PORT');
    console.error('💡 Verifique se há firewall bloqueando a conexão\n');
  } else if (error.message.includes('Authentication')) {
    console.error('💡 Dica: Verifique SMTP_USER e SMTP_PASSWORD');
    console.error('💡 Para SendGrid, use "apikey" como SMTP_USER\n');
  }
  
  process.exit(1);
}

