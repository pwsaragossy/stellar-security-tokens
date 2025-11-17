import { query } from '../config/database.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationFile = process.argv[2] || '019_add_stellar_wallet_to_all_users.sql';

const runMigration = async () => {
  try {
    console.log(`Executando migration: ${migrationFile}`);
    const sql = readFileSync(join(__dirname, 'migrations', migrationFile), 'utf8');
    
    await query(sql);
    
    // Registrar migration
    const version = migrationFile.split('_')[0];
    const name = migrationFile.replace('.sql', '').replace(/^\d+_/, '');
    
    await query(
      'INSERT INTO schema_migrations (version, name, executed_at, execution_time_ms) VALUES ($1, $2, NOW(), 0) ON CONFLICT (version) DO NOTHING',
      [version, name]
    );
    
    console.log(`✓ Migration ${version} - ${name} executada com sucesso!`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Erro:', error.message);
    process.exit(1);
  }
};

runMigration();

