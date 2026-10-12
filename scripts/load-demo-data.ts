/* eslint-disable no-console */
/**
 * Loads the demo company into an empty PostgreSQL database:
 *
 *   DATABASE_URL=postgres://user:password@localhost:5432/moon_finance_demo npm run demo:load
 *
 * Creates the app's tables, then restores demo/moon-finance-demo.mfbackup
 * (or the file given as the first argument). It refuses a database that
 * already holds data, so real data is never replaced.
 */
import fs from 'fs';
import path from 'path';
import { restoreBackupData } from '../src/main/backup/backupData';
import { parseBackup } from '../src/main/backup/backupFormat';
import { Database } from '../src/main/db/database';
import { migrate } from '../src/main/db/migrations';

const TABLES = [
  'employees',
  'expenses',
  'budget_receipts',
  'attendance',
  'salary_advances',
  'payslips',
  'documents',
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Set DATABASE_URL to an empty database, e.g.\n' +
        '  DATABASE_URL=postgres://moon_finance:password@localhost:5432/moon_finance_demo npm run demo:load',
    );
  }
  const file = path.resolve(
    process.argv[2] ??
      path.join(__dirname, '..', 'demo', 'moon-finance-demo.mfbackup'),
  );
  const backup = parseBackup(fs.readFileSync(file));
  const db = new Database({ connectionString });
  try {
    const version = await migrate(db);
    console.log(`Database ready (schema v${version}).`);
    const counts = await db.query<{ table: string; rows: number }>(
      TABLES.map(
        (table) =>
          `SELECT '${table}' AS table, count(*)::int AS rows FROM ${table}`,
      ).join(' UNION ALL '),
    );
    const used = counts.rows.filter((row) => row.rows > 0);
    if (used.length) {
      throw new Error(
        `This database already has data (${used
          .map((row) => `${row.rows} ${row.table}`)
          .join(
            ', ',
          )}), so the demo was not loaded. Use a new, empty database.`,
      );
    }
    const restored = await restoreBackupData(db, backup.data);
    console.log(`Loaded the demo company from ${path.basename(file)}:`);
    Object.entries(restored).forEach(([name, count]) =>
      console.log(`  ${name}: ${count}`),
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
