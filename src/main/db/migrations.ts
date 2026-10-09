import { AppError } from '../../shared/errors';
import { Database } from './database';

/**
 * Ordered, append-only schema migrations. Never edit a migration that has
 * shipped; add a new one instead. Each runs in its own transaction.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE categories (
        name        TEXT PRIMARY KEY CHECK (length(btrim(name)) BETWEEN 1 AND 40),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX categories_name_ci_idx ON categories (lower(name));

      CREATE TABLE departments (
        name        TEXT PRIMARY KEY CHECK (length(btrim(name)) BETWEEN 1 AND 40),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX departments_name_ci_idx ON departments (lower(name));

      -- Renaming a category/department cascades to expenses; deleting one
      -- that is still in use is refused.
      CREATE TABLE expenses (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_date          DATE NOT NULL,
        payee                 TEXT NOT NULL CHECK (length(btrim(payee)) > 0),
        particulars           TEXT NOT NULL DEFAULT '',
        category              TEXT NOT NULL
                              REFERENCES categories (name)
                              ON UPDATE CASCADE ON DELETE RESTRICT,
        department            TEXT
                              REFERENCES departments (name)
                              ON UPDATE CASCADE ON DELETE RESTRICT,
        payment_method        TEXT NOT NULL DEFAULT '',
        project_name          TEXT NOT NULL DEFAULT '',
        invoice_no            TEXT NOT NULL DEFAULT '',
        site_name             TEXT NOT NULL DEFAULT '',
        vat_no                TEXT NOT NULL DEFAULT '',
        amount_excluding_vat  NUMERIC(14, 2) NOT NULL CHECK (amount_excluding_vat >= 0),
        vat                   NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (vat >= 0),
        amount_including_vat  NUMERIC(14, 2)
                              GENERATED ALWAYS AS (amount_excluding_vat + vat) STORED,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX expenses_date_idx ON expenses (expense_date);
      CREATE INDEX expenses_payee_idx ON expenses (payee);

      -- Receipts are stored in the database so a backup is self-contained.
      CREATE TABLE expense_attachments (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expense_id  UUID NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
        file_name   TEXT NOT NULL,
        mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
        size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
        content     BYTEA NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX expense_attachments_expense_idx
        ON expense_attachments (expense_id);

      CREATE TABLE budget_receipts (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        received_date   DATE NOT NULL,
        amount          NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        paid_by         TEXT NOT NULL DEFAULT '',
        payment_method  TEXT CHECK (payment_method IN ('Cash', 'Card')),
        note            TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX budget_receipts_date_idx ON budget_receipts (received_date);

      INSERT INTO categories (name, sort_order) VALUES
        ('Materials', 1), ('Payroll', 2), ('Equipment', 3),
        ('Travel', 4), ('Other', 5);
      INSERT INTO departments (name, sort_order) VALUES
        ('Operations', 1), ('Field Services', 2),
        ('Administration', 3), ('Sales', 4);
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// Arbitrary constant so two app instances never migrate at the same time.
const MIGRATION_LOCK_ID = 727_120_301;

export async function currentSchemaVersion(db: Database): Promise<number> {
  const { rows } = await db.query<{ version: number | null }>(
    'SELECT max(version) AS version FROM schema_migrations',
  );
  return rows[0]?.version ?? 0;
}

export async function migrate(db: Database): Promise<number> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  return db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    const { rows } = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    );
    const applied = new Set(rows.map((row) => row.version));
    const newest = Math.max(0, ...applied);
    if (newest > LATEST_SCHEMA_VERSION) {
      throw new AppError(
        'CONNECTION_FAILED',
        `The database schema (v${newest}) is newer than this app supports (v${LATEST_SCHEMA_VERSION}). Update the app.`,
      );
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const migration of MIGRATIONS) {
      if (!applied.has(migration.version)) {
        // Migrations must run in order, one after another.
        // eslint-disable-next-line no-await-in-loop
        await client.query(migration.sql);
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name],
        );
      }
    }
    return LATEST_SCHEMA_VERSION;
  });
}
