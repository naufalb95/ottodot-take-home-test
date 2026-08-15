import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const BASE_URL = 'postgres://postgres:postgres@localhost:5432';
const TEST_DB = 'trial_booking_test';

export async function setup() {
  const adminPool = new pg.Pool({ connectionString: `${BASE_URL}/postgres` });

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await adminPool.query(`CREATE DATABASE "${TEST_DB}"`);
  } finally {
    await adminPool.end();
  }

  const testPool = new pg.Pool({ connectionString: `${BASE_URL}/${TEST_DB}` });

  try {
    const migrationDir = path.join(
      import.meta.dirname,
      '../../../prisma/migrations',
    );
    const folders = fs
      .readdirSync(migrationDir)
      .filter((f) => !f.endsWith('.toml'))
      .sort();

    for (const folder of folders) {
      const sqlPath = path.join(migrationDir, folder, 'migration.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        await testPool.query(sql);
      }
    }
  } finally {
    await testPool.end();
  }

  console.log('[test] database ready');
}
