import { query } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const checkMigrations = async () => {
  try {
    const result = await query('SELECT version, name FROM schema_migrations ORDER BY version');
    console.log('Migrations executadas:');
    result.rows.forEach(row => {
      console.log(`  ${row.version} - ${row.name}`);
    });
    process.exit(0);
  } catch (error) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
};

checkMigrations();

