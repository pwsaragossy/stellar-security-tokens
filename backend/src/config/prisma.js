import { PrismaClient } from '../../prisma/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

/**
 * Prisma Client singleton instance
 * Reusa a mesma instância em todo o aplicativo para evitar múltiplas conexões
 */
let prisma;

const logOptions = process.env.NODE_ENV === 'test' ? ['error', 'warn'] : ['query', 'error', 'warn'];

if (process.env.NODE_ENV === 'production') {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  prisma = new PrismaClient({ adapter });
} else {
  // Em desenvolvimento, usar global para hot-reload
  if (!global.prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    global.prisma = new PrismaClient({
      adapter,
      log: logOptions,
    });
  }
  prisma = global.prisma;
}

// Desconectar ao encerrar o processo
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;

