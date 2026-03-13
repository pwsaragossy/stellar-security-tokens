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

const logOptions = ['error', 'warn'];

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

// Backup: snapshot user creation events via $extends (Prisma 7+)
const BACKUP_MODELS = ['Investor', 'CompanyUser', 'PlatformAdmin'];

function createBackupExtension() {
  const queryHooks = {};
  for (const model of BACKUP_MODELS) {
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    queryHooks[key] = {
      async create({ args, query }) {
        const result = await query(args);
        // Fire-and-forget: never block the request
        import('../services/backup.service.js')
          .then(({ BackupService }) => BackupService.snapshotUserCreation(model, result))
          .catch(() => { });
        return result;
      },
    };
  }
  return { query: queryHooks };
}

const extendedPrisma = prisma.$extends(createBackupExtension());

export default extendedPrisma;

