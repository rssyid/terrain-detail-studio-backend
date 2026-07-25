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

async function runSeed() {
  console.log('🌱 Starting database seeding to Neon PostgreSQL...');
  const sql = neon(dbUrl!);
  
  const seedFilePath = path.join(__dirname, '../db/seeds/seed.sql');
  const seedSql = fs.readFileSync(seedFilePath, 'utf8');

  // Split and execute statements
  const statements = seedSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await sql(statement);
    } catch (err: any) {
      console.warn(`Warning/Notice executing seed statement: ${err.message}`);
    }
  }

  console.log('✅ Database seeding completed successfully!');
}

runSeed().catch((err) => {
  console.error('❌ Database seeding failed:', err);
  process.exit(1);
});
