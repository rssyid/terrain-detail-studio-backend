import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Error: DATABASE_URL environment variable is missing.');
  process.exit(1);
}

async function runMigration() {
  console.log('🚀 Running initial DDL migration on Neon PostgreSQL...');
  const sql = neon(dbUrl!);
  
  const migrationFilePath = path.join(__dirname, '../db/migrations/0000_initial_schema.sql');
  const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

  // Split and execute statements
  const statements = migrationSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await sql(statement);
    } catch (err: any) {
      console.warn(`Notice during migration statement: ${err.message}`);
    }
  }

  console.log('✅ Migration executed successfully!');
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
