import { query, getClient } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script para limpar completamente o banco de dados
 * ATENÇÃO: Isso apaga TODOS os dados do banco!
 */
const cleanDatabase = async () => {
  const client = await getClient();
  
  try {
    console.log('🚨 Iniciando limpeza do banco de dados...\n');
    
    // Desabilitar verificações de foreign key temporariamente
    await client.query('SET session_replication_role = replica;');
    
    // Descobrir todas as tabelas do banco automaticamente
    const tablesResult = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    
    const tables = tablesResult.rows.map(row => row.tablename);
    
    // Ordenar para limpar schema_migrations por último
    const sortedTables = [
      ...tables.filter(t => t !== 'schema_migrations'),
      ...tables.filter(t => t === 'schema_migrations')
    ];
    
    console.log('📋 Tabelas encontradas:', sortedTables.length);
    
    // Deletar dados de cada tabela
    for (const table of sortedTables) {
      try {
        const result = await client.query(`DELETE FROM ${table}`);
        console.log(`✓ Limpou tabela: ${table} (${result.rowCount} registros removidos)`);
      } catch (error) {
        // Tabela pode não existir ainda, ignorar erro
        if (error.message.includes('does not exist')) {
          console.log(`⚠️  Tabela ${table} não existe, pulando...`);
        } else {
          throw error;
        }
      }
    }
    
    // Reabilitar verificações de foreign key
    await client.query('SET session_replication_role = DEFAULT;');
    
    // Resetar todas as sequences (auto-increment) automaticamente
    const sequencesResult = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public'
      ORDER BY sequence_name;
    `);
    
    const sequences = sequencesResult.rows.map(row => row.sequence_name);
    
    console.log('\n🔄 Resetando sequences...');
    for (const sequence of sequences) {
      try {
        await client.query(`ALTER SEQUENCE ${sequence} RESTART WITH 1`);
        console.log(`✓ Resetou sequence: ${sequence}`);
      } catch (error) {
        console.warn(`⚠️  Erro ao resetar ${sequence}:`, error.message);
      }
    }
    
    console.log('\n✅ Banco de dados limpo com sucesso!');
    console.log('💡 Execute "npm run migrate" para recriar o schema.');
    
  } catch (error) {
    console.error('\n❌ Erro ao limpar banco de dados:', error);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
};

// Executar limpeza
cleanDatabase().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

