import { query } from '../config/database.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script para criar o primeiro admin da plataforma
 * Uso: node backend/database/createAdmin.js <email> <password> <name>
 * Exemplo: node backend/database/createAdmin.js admin@platform.com admin123 "Admin Name"
 */
async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Uso: node createAdmin.js <email> <password> <name> [role]');
    console.error('Exemplo: node createAdmin.js admin@platform.com admin123 "Admin Name" super_admin');
    process.exit(1);
  }

  const [email, password, name, role = 'super_admin'] = args;

  try {
    // Verificar se já existe admin com esse email
    const existing = await query(
      'SELECT id, email FROM platform_admins WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      console.error(`❌ Admin com email ${email} já existe!`);
      process.exit(1);
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Criar admin
    const result = await query(
      `INSERT INTO platform_admins (email, password_hash, name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
       RETURNING id, email, name, role, is_active, created_at`,
      [email, passwordHash, name, role]
    );

    const admin = result.rows[0];
    
    console.log('✅ Admin criado com sucesso!');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Nome: ${admin.name}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Ativo: ${admin.is_active}`);
    console.log(`\n📝 Credenciais de login:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar admin:', error.message);
    process.exit(1);
  }
}

createAdmin();

