import { AppError } from '../../shared/errors';
import { Database } from './database';

/**
 * Ordered, append-only schema migrations. Never edit a migration that has
 * shipped; add a new one instead. Pending migrations run together in one
 * transaction, so a failed upgrade leaves the schema unchanged.
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
  {
    version: 2,
    name: 'payee lists',
    sql: `
      -- Options for an expense's "Paid to" and a budget payment's payee.
      -- Not foreign keys: renames and in-use checks are done by the app, so
      -- names already stored on transactions never block this migration.
      CREATE TABLE payees (
        name        TEXT PRIMARY KEY CHECK (length(btrim(name)) BETWEEN 1 AND 100),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX payees_name_ci_idx ON payees (lower(name));

      CREATE TABLE budget_payers (
        name        TEXT PRIMARY KEY CHECK (length(btrim(name)) BETWEEN 1 AND 100),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX budget_payers_name_ci_idx ON budget_payers (lower(name));

      INSERT INTO payees (name, sort_order)
      SELECT name, row_number() OVER (ORDER BY lower(name))
      FROM (SELECT DISTINCT ON (lower(payee)) payee AS name
            FROM expenses WHERE btrim(payee) <> ''
            GROUP BY payee
            -- Keep the most used spelling, then the earliest, then capitalised.
            ORDER BY lower(payee), count(*) DESC, min(created_at),
                     payee COLLATE "C") AS names;

      INSERT INTO budget_payers (name, sort_order)
      SELECT name, row_number() OVER (ORDER BY lower(name))
      FROM (SELECT DISTINCT ON (lower(paid_by)) paid_by AS name
            FROM budget_receipts WHERE btrim(paid_by) <> ''
            GROUP BY paid_by
            -- Keep the most used spelling, then the earliest, then capitalised.
            ORDER BY lower(paid_by), count(*) DESC, min(created_at),
                     paid_by COLLATE "C") AS names;

      -- One spelling per name, so renames and in-use checks match exactly.
      UPDATE expenses e SET payee = p.name
      FROM payees p WHERE lower(e.payee) = lower(p.name) AND e.payee <> p.name;
      UPDATE budget_receipts r SET paid_by = p.name
      FROM budget_payers p
      WHERE lower(r.paid_by) = lower(p.name) AND r.paid_by <> p.name;
    `,
  },
  {
    version: 3,
    name: 'month closing',
    sql: `
      -- Months end-dated before the current month are closed (read-only)
      -- unless listed here. Reopening adds a row; closing again removes it.
      CREATE TABLE reopened_months (
        month        CHAR(7) PRIMARY KEY
                     CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        reopened_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 4,
    name: 'employees',
    sql: `
      -- An expense's "Paid to" and a budget payment's payee are now picked
      -- from employees, which replace the separate payee lists. Names already
      -- stored on transactions are kept as they are.
      CREATE TABLE employees (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name           TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
        iqama_no       TEXT NOT NULL CHECK (length(btrim(iqama_no)) BETWEEN 1 AND 30),
        designation    TEXT NOT NULL DEFAULT '',
        project_name   TEXT NOT NULL DEFAULT '',
        phone_no       TEXT NOT NULL DEFAULT '',
        insurance_no   TEXT NOT NULL DEFAULT '',
        iqama_expiry   DATE,
        camp_name      TEXT NOT NULL DEFAULT '',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX employees_iqama_no_ci_idx ON employees (lower(iqama_no));
      CREATE INDEX employees_name_idx ON employees (lower(name));

      DROP TABLE payees;
      DROP TABLE budget_payers;
    `,
  },
  {
    version: 5,
    name: 'employee nickname and salary',
    sql: `
      ALTER TABLE employees
        ADD COLUMN nickname TEXT NOT NULL DEFAULT '',
        ADD COLUMN salary   NUMERIC(14, 2) CHECK (salary >= 0);
    `,
  },
  {
    version: 6,
    name: 'employee role',
    sql: `
      ALTER TABLE employees
        ADD COLUMN role TEXT NOT NULL DEFAULT 'company_worker'
          CHECK (role IN ('company_worker', 'outsource_worker', 'staff',
                          'outsource_camp_worker'));
      CREATE INDEX employees_role_idx ON employees (role);
    `,
  },
  {
    version: 7,
    name: 'attendance and payroll',
    sql: `
      -- Hours beyond work_hours_per_day are overtime. Outsource workers are
      -- paid hourly_rate per hour worked.
      ALTER TABLE employees
        ADD COLUMN work_hours_per_day NUMERIC(4, 2) NOT NULL DEFAULT 8
          CHECK (work_hours_per_day > 0 AND work_hours_per_day <= 24),
        ADD COLUMN hourly_rate NUMERIC(14, 2) CHECK (hourly_rate >= 0);

      -- Payroll history is never deleted with an employee: every reference
      -- is ON DELETE RESTRICT, and the app explains why a delete is refused.
      CREATE TABLE attendance (
        employee_id  UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        work_date    DATE NOT NULL,
        status       TEXT NOT NULL
                     CHECK (status IN ('present', 'absent', 'leave', 'holiday')),
        hours        NUMERIC(4, 2) NOT NULL DEFAULT 0
                     CHECK (hours >= 0 AND hours <= 24),
        note         TEXT NOT NULL DEFAULT '',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (employee_id, work_date),
        CHECK (status = 'present' OR hours = 0)
      );
      CREATE INDEX attendance_date_idx ON attendance (work_date);

      CREATE TABLE salary_advances (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id   UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        advance_date  DATE NOT NULL,
        amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        note          TEXT NOT NULL DEFAULT '',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX salary_advances_employee_idx
        ON salary_advances (employee_id, advance_date);

      -- One payslip per employee per month. Amounts are stored as edited;
      -- overtime and net pay are derived here so they always add up.
      -- Employee details are copied so a payslip reads the same later.
      CREATE TABLE payslips (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id        UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        month              CHAR(7) NOT NULL
                           CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        employee_name      TEXT NOT NULL,
        iqama_no           TEXT NOT NULL,
        role               TEXT NOT NULL,
        designation        TEXT NOT NULL DEFAULT '',
        project_name       TEXT NOT NULL DEFAULT '',
        camp_name          TEXT NOT NULL DEFAULT '',
        working_days       SMALLINT NOT NULL DEFAULT 0 CHECK (working_days BETWEEN 0 AND 31),
        present_days       SMALLINT NOT NULL DEFAULT 0 CHECK (present_days BETWEEN 0 AND 31),
        absent_days        SMALLINT NOT NULL DEFAULT 0 CHECK (absent_days BETWEEN 0 AND 31),
        leave_days         SMALLINT NOT NULL DEFAULT 0 CHECK (leave_days BETWEEN 0 AND 31),
        holiday_days       SMALLINT NOT NULL DEFAULT 0 CHECK (holiday_days BETWEEN 0 AND 31),
        hours_worked       NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (hours_worked >= 0),
        basic_salary       NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
        hourly_rate        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
        basic_pay          NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (basic_pay >= 0),
        overtime_hours     NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
        overtime_rate      NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (overtime_rate >= 0),
        allowance          NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (allowance >= 0),
        absence_deduction  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (absence_deduction >= 0),
        absence_fine       NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (absence_fine >= 0),
        advance_deduction  NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (advance_deduction >= 0),
        other_deduction    NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (other_deduction >= 0),
        overtime_pay       NUMERIC(14, 2)
                           GENERATED ALWAYS AS (round(overtime_hours * overtime_rate, 2)) STORED,
        net_pay            NUMERIC(14, 2)
                           GENERATED ALWAYS AS (
                             basic_pay + round(overtime_hours * overtime_rate, 2)
                             + allowance - absence_deduction - absence_fine
                             - advance_deduction - other_deduction) STORED,
        status             TEXT NOT NULL DEFAULT 'unpaid'
                           CHECK (status IN ('unpaid', 'paid')),
        paid_date          DATE,
        note               TEXT NOT NULL DEFAULT '',
        created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (employee_id, month),
        CHECK ((status = 'paid') = (paid_date IS NOT NULL))
      );
      CREATE INDEX payslips_month_idx ON payslips (month);

      -- A single row of payroll defaults.
      CREATE TABLE payroll_settings (
        id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        overtime_base_rate      NUMERIC(14, 2) NOT NULL DEFAULT 20
                                CHECK (overtime_base_rate >= 0),
        overtime_multiplier     NUMERIC(6, 2) NOT NULL DEFAULT 1.5
                                CHECK (overtime_multiplier >= 0),
        absence_fine            NUMERIC(14, 2) NOT NULL DEFAULT 20
                                CHECK (absence_fine >= 0),
        absence_fine_free_days  SMALLINT NOT NULL DEFAULT 1
                                CHECK (absence_fine_free_days BETWEEN 0 AND 31),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO payroll_settings DEFAULT VALUES;
    `,
  },
  {
    version: 8,
    name: 'vacation and paid leave',
    sql: `
      ALTER TABLE attendance DROP CONSTRAINT attendance_status_check;
      ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
        CHECK (status IN ('present', 'absent', 'leave', 'vacation', 'holiday'));

      ALTER TABLE payslips
        ADD COLUMN vacation_days SMALLINT NOT NULL DEFAULT 0
          CHECK (vacation_days BETWEEN 0 AND 31);

      -- Leave is unpaid and vacation paid unless changed here.
      ALTER TABLE payroll_settings
        ADD COLUMN leave_paid BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN vacation_paid BOOLEAN NOT NULL DEFAULT true;
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// Arbitrary constant so two app instances never migrate at the same time.
const MIGRATION_LOCK_ID = 727_120_301;

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
