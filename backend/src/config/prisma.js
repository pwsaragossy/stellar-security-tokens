import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

/**
 * Prisma Client singleton instance
 * Reusa a mesma instância em todo o aplicativo para evitar múltiplas conexões
 */
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Em desenvolvimento, usar global para hot-reload
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.prisma;
}

// Desconectar ao encerrar o processo
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;

