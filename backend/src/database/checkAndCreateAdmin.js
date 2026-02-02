import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// SECURITY: Prevent running this script in production with hardcoded passwords
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: This script cannot be run in production environment.');
  console.error('   Use the createAdmin.js script with CLI arguments instead.');
  process.exit(1);
}

async function checkAndCreateAdmin() {
  try {
    console.log('🔍 Verificando admins existentes...\n');

    // Verificar admins existentes
    const existing = await prisma.platformAdmin.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (existing.length > 0) {
      console.log(`✅ Encontrados ${existing.length} admin(s):\n`);
      existing.forEach((admin, index) => {
        console.log(`${index + 1}. Email: ${admin.email}`);
        console.log(`   Nome: ${admin.name}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Ativo: ${admin.isActive ? 'Sim' : 'Não'}`);
        console.log(`   Criado em: ${admin.createdAt}`);
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

      const admin = await prisma.platformAdmin.create({
        data: {
          email: defaultEmail,
          passwordHash,
          name: defaultName,
          role: defaultRole.toLowerCase(),
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

      console.log('✅ Admin padrão criado com sucesso!\n');
      console.log('📋 Credenciais de login:');
      console.log(`   Email: ${admin.email}`);
      console.log(`   Password: ${defaultPassword}`);
      console.log(`   Nome: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   ID: ${admin.id}`);
      console.log(`\n⚠️  IMPORTANTE: Altere a senha após o primeiro login!`);
    }

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkAndCreateAdmin();

