import prisma from './config/prisma.js';
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
    const existing = await prisma.platformAdmin.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
      },
    });

    if (existing) {
      console.error(`❌ Admin com email ${email} já existe!`);
      await prisma.$disconnect();
      process.exit(1);
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Criar admin
    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        passwordHash,
        name,
        role: role.toLowerCase(),
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    
    console.log('✅ Admin criado com sucesso!');
    console.log(`   ID: ${admin.id}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Nome: ${admin.name}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Ativo: ${admin.isActive}`);
    console.log(`\n📝 Credenciais de login:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao criar admin:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
}

createAdmin();

