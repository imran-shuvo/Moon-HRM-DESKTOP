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
        ADD COLUMN work_hours_per_day NUMERIC(4, 2) NOT NULL DEFAULT 10
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
        overtime_multiplier     NUMERIC(6, 2) NOT NULL DEFAULT 1
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
  {
    version: 9,
    name: 'company defaults, termination and documents',
    sql: `
      -- Databases that ran an earlier build of migration 7 got 8 basic hours
      -- and an overtime multiplier of 1.5 as defaults. Move values nobody
      -- has changed since then to the company defaults (10 hours, 20 an
      -- hour); values someone saved later are kept.
      ALTER TABLE employees ALTER COLUMN work_hours_per_day SET DEFAULT 10;
      UPDATE employees SET work_hours_per_day = 10
      WHERE work_hours_per_day = 8
        AND updated_at <= (SELECT applied_at FROM schema_migrations
                           WHERE version = 7);
      ALTER TABLE payroll_settings ALTER COLUMN overtime_multiplier SET DEFAULT 1;
      UPDATE payroll_settings SET overtime_multiplier = 1
      WHERE overtime_multiplier = 1.5 AND overtime_base_rate = 20
        AND updated_at <= (SELECT applied_at FROM schema_migrations
                           WHERE version = 7);

      -- Pay stops after a terminated employee's last working day.
      ALTER TABLE employees ADD COLUMN termination_date DATE;

      -- Files such as signature sheets, filed by day and project. Stored in
      -- the database so every computer sees them and backups include them.
      -- Deleting an employee keeps their documents.
      CREATE TABLE documents (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title          TEXT NOT NULL DEFAULT '',
        category       TEXT NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 60),
        project_name   TEXT NOT NULL DEFAULT '',
        camp_name      TEXT NOT NULL DEFAULT '',
        document_date  DATE NOT NULL,
        employee_id    UUID REFERENCES employees (id) ON DELETE SET NULL,
        note           TEXT NOT NULL DEFAULT '',
        file_name      TEXT NOT NULL,
        mime_type      TEXT NOT NULL DEFAULT 'application/octet-stream',
        size_bytes     INTEGER NOT NULL CHECK (size_bytes >= 0),
        content        BYTEA NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX documents_date_idx ON documents (document_date);
      CREATE INDEX documents_project_idx ON documents (project_name);
    `,
  },
  {
    version: 10,
    name: 'company payroll policy',
    sql: `
      -- Overtime is now the per-hour salary (basic ÷ 30 ÷ basic hours) ×
      -- 1.25 on working days and × 1.5 on Fridays, and an unpaid day off is
      -- deducted a day's salary (basic ÷ 30). The flat overtime rate and the
      -- flat absence deduction no longer apply. overtime_multiplier used to
      -- multiply the flat rate, so it is set to the policy value.
      ALTER TABLE payroll_settings
        DROP COLUMN overtime_base_rate,
        DROP COLUMN absence_fine,
        ADD COLUMN weekend_overtime_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1.5
          CHECK (weekend_overtime_multiplier >= 0),
        ADD COLUMN salary_days NUMERIC(5, 2) NOT NULL DEFAULT 30
          CHECK (salary_days > 0 AND salary_days <= 31);
      ALTER TABLE payroll_settings
        RENAME COLUMN absence_fine_free_days TO paid_days_off;
      ALTER TABLE payroll_settings ALTER COLUMN overtime_multiplier SET DEFAULT 1.25;
      UPDATE payroll_settings
      SET overtime_multiplier = 1.25, weekend_overtime_multiplier = 1.5,
          salary_days = 30, updated_at = now();

      -- Payslips show Friday overtime separately. Rates keep 4 decimals
      -- (e.g. 10.8333 an hour). Saved payslips keep their amounts: their
      -- Friday overtime is 0 and their rates are unchanged.
      ALTER TABLE payslips DROP COLUMN net_pay, DROP COLUMN overtime_pay;
      ALTER TABLE payslips
        ALTER COLUMN overtime_rate TYPE NUMERIC(14, 4),
        ADD COLUMN weekend_overtime_hours NUMERIC(6, 2) NOT NULL DEFAULT 0
          CHECK (weekend_overtime_hours >= 0),
        ADD COLUMN weekend_overtime_rate NUMERIC(14, 4) NOT NULL DEFAULT 0
          CHECK (weekend_overtime_rate >= 0);
      ALTER TABLE payslips
        ADD COLUMN overtime_pay NUMERIC(14, 2) GENERATED ALWAYS AS (
          round(overtime_hours * overtime_rate, 2)
          + round(weekend_overtime_hours * weekend_overtime_rate, 2)) STORED,
        ADD COLUMN net_pay NUMERIC(14, 2) GENERATED ALWAYS AS (
          basic_pay
          + round(overtime_hours * overtime_rate, 2)
          + round(weekend_overtime_hours * weekend_overtime_rate, 2)
          + allowance - absence_deduction - absence_fine
          - advance_deduction - other_deduction) STORED;
    `,
  },
  {
    version: 11,
    name: 'petty cash',
    sql: `
      -- Cash handed to a worker ('given') and cash they paid back
      -- ('received'). Their balance in hand is given minus received.
      -- Like payroll, history is kept: an employee with petty cash on
      -- record cannot be deleted.
      CREATE TABLE petty_cash_transactions (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id       UUID NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
        transaction_date  DATE NOT NULL,
        kind              TEXT NOT NULL CHECK (kind IN ('given', 'received')),
        amount            NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        note              TEXT NOT NULL DEFAULT '',
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX petty_cash_transactions_employee_idx
        ON petty_cash_transactions (employee_id, transaction_date);

      -- Reference documents (receipts, signed slips), stored in the
      -- database like expense receipts so backups include them.
      CREATE TABLE petty_cash_attachments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id  UUID NOT NULL
                        REFERENCES petty_cash_transactions (id) ON DELETE CASCADE,
        file_name       TEXT NOT NULL,
        mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
        size_bytes      INTEGER NOT NULL CHECK (size_bytes >= 0),
        content         BYTEA NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX petty_cash_attachments_transaction_idx
        ON petty_cash_attachments (transaction_id);
    `,
  },
  {
    version: 12,
    name: 'petty cash remarks',
    sql: `
      ALTER TABLE petty_cash_transactions
        ADD COLUMN remarks TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 13,
    name: 'petty cash vouchers',
    sql: `
      -- A voucher is one document: the cash received, then its bills in
      -- titled sections. The sections and their lines are kept together
      -- as JSON, since they are only ever read and saved as a whole.
      CREATE TABLE petty_cash_vouchers (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ref_no           TEXT NOT NULL,
        voucher_date     DATE NOT NULL,
        project          TEXT NOT NULL DEFAULT '',
        departments      JSONB NOT NULL DEFAULT '[]',
        received_note    TEXT NOT NULL DEFAULT '',
        received_amount  NUMERIC(14, 2) NOT NULL DEFAULT 0
                         CHECK (received_amount >= 0),
        sections         JSONB NOT NULL DEFAULT '[]',
        created_by       TEXT NOT NULL DEFAULT '',
        verified_by      TEXT NOT NULL DEFAULT '',
        approved_by      TEXT NOT NULL DEFAULT '',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX petty_cash_vouchers_date_idx
        ON petty_cash_vouchers (voucher_date);
    `,
  },
  {
    version: 14,
    name: 'vouchers belong to an employee, with a list of amounts received',
    sql: `
      -- A voucher is now for one employee, and records each amount they
      -- received (date, from whom, amount) instead of a single total.
      -- Vouchers made before keep no employee until they are edited. Like
      -- petty cash, an employee with vouchers cannot be deleted.
      ALTER TABLE petty_cash_vouchers
        ADD COLUMN employee_id UUID REFERENCES employees (id) ON DELETE RESTRICT,
        ADD COLUMN receipts JSONB NOT NULL DEFAULT '[]';
      UPDATE petty_cash_vouchers
        SET receipts = jsonb_build_array(jsonb_build_object(
          'date', voucher_date::text,
          'receivedFrom', CASE WHEN received_note <> '' THEN received_note
                               ELSE 'Cash received' END,
          'amount', received_amount))
        WHERE received_amount > 0;
      ALTER TABLE petty_cash_vouchers
        DROP COLUMN project,
        DROP COLUMN departments,
        DROP COLUMN received_note,
        DROP COLUMN received_amount;
      CREATE INDEX petty_cash_vouchers_employee_idx
        ON petty_cash_vouchers (employee_id);
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
