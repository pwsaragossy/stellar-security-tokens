import { query } from '../config/database.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

async function checkAndCreateAdmin() {
  try {
    console.log('🔍 Verificando admins existentes...\n');
    
    // Verificar admins existentes
    const existing = await query(
      'SELECT id, email, name, role, is_active, created_at FROM platform_admins ORDER BY created_at'
    );

    if (existing.rows.length > 0) {
      console.log(`✅ Encontrados ${existing.rows.length} admin(s):\n`);
      existing.rows.forEach((admin, index) => {
        console.log(`${index + 1}. Email: ${admin.email}`);
        console.log(`   Nome: ${admin.name}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Ativo: ${admin.is_active ? 'Sim' : 'Não'}`);
        console.log(`   Criado em: ${admin.created_at}`);
        console.log('');
      });
    } else {
      console.log('❌ Nenhum admin encontrado.\n');
      console.log('📝 Criando admin padrão...\n');
      
      // Criar admin padrão
      const defaultEmail = 'admin@platform.com';
      const defaultPassword = 'admin123456';
      const defaultName = 'Platform Admin';
      const defaultRole = 'super_admin';
      
      const passwordHash = await bcrypt.hash(defaultPassword, 10);
      
      const result = await query(
        `INSERT INTO platform_admins (email, password_hash, name, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
         RETURNING id, email, name, role, is_active, created_at`,
        [defaultEmail, passwordHash, defaultName, defaultRole]
      );

      const admin = result.rows[0];
      
      console.log('✅ Admin padrão criado com sucesso!\n');
      console.log('📋 Credenciais de login:');
      console.log(`   Email: ${admin.email}`);
      console.log(`   Password: ${defaultPassword}`);
      console.log(`   Nome: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   ID: ${admin.id}`);
      console.log(`\n⚠️  IMPORTANTE: Altere a senha após o primeiro login!`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkAndCreateAdmin();

