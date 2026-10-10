import { AppError } from '../../shared/errors';
import {
  AttachmentContent,
  AttachmentUpload,
  BudgetTransaction,
  BudgetTransactionInput,
  Expense,
  ExpenseAttachment,
  ExpenseInput,
  FinanceSnapshot,
  LegacyImportPayload,
  LegacyImportResult,
} from '../../shared/types';
import { assertMonthsOpen } from '../../shared/months';
import { Database, Queryable } from './database';

type ExpenseRow = {
  id: string;
  expense_date: string;
  payee: string;
  particulars: string;
  category: string;
  department: string | null;
  payment_method: string;
  project_name: string;
  invoice_no: string;
  site_name: string;
  vat_no: string;
  amount_excluding_vat: number;
  vat: number;
  amount_including_vat: number;
  created_at: Date;
};

type AttachmentRow = {
  id: string;
  expense_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

type ReceiptRow = {
  id: string;
  received_date: string;
  amount: number;
  paid_by: string;
  payment_method: 'Cash' | 'Card' | null;
  note: string;
  created_at: Date;
};

export type ListTable =
  | 'categories'
  | 'departments'
  | 'payees'
  | 'budget_payers';

/**
 * Payee lists are not foreign keys, so the app keeps the transactions that
 * use a name in step with the list (categories/departments use ON UPDATE CASCADE).
 */
const PAYEE_LIST_USAGE = {
  payees: { table: 'expenses', column: 'payee' },
  budget_payers: { table: 'budget_receipts', column: 'paid_by' },
} as const;

function payeeListUsage(table: ListTable) {
  return table === 'payees' || table === 'budget_payers'
    ? PAYEE_LIST_USAGE[table]
    : undefined;
}

const EXPENSE_COLUMNS = `
  id, expense_date, payee, particulars, category, department, payment_method,
  project_name, invoice_no, site_name, vat_no, amount_excluding_vat, vat,
  amount_including_vat, created_at`;

const ATTACHMENT_COLUMNS = 'id, expense_id, file_name, mime_type, size_bytes';

const RECEIPT_COLUMNS =
  'id, received_date, amount, paid_by, payment_method, note, created_at';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toAttachment(row: AttachmentRow): ExpenseAttachment {
  return {
    id: row.id,
    name: row.file_name,
    type: row.mime_type,
    size: row.size_bytes,
  };
}

function toExpense(row: ExpenseRow, attachments: ExpenseAttachment[]): Expense {
  return {
    id: row.id,
    date: row.expense_date,
    payee: row.payee,
    description: row.particulars,
    particulars: row.particulars,
    category: row.category,
    type: row.category,
    department: row.department ?? '',
    paymentMethod: row.payment_method,
    projectName: row.project_name,
    invoiceNo: row.invoice_no,
    siteName: row.site_name,
    vatNo: row.vat_no,
    amountExcludingVat: row.amount_excluding_vat,
    vat: row.vat,
    amountIncludingVat: row.amount_including_vat,
    amount: row.amount_including_vat,
    attachments,
    createdAt: row.created_at.getTime(),
  };
}

function toBudgetTransaction(row: ReceiptRow): BudgetTransaction {
  return {
    id: row.id,
    date: row.received_date,
    amount: row.amount,
    paidBy: row.paid_by,
    paymentMethod: row.payment_method ?? undefined,
    note: row.note,
    createdAt: row.created_at.getTime(),
  };
}

/** Rejects ids that are not UUIDs before Postgres raises a cast error. */
function assertUuid(id: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('NOT_FOUND', 'That record no longer exists.');
  }
}

async function insertAttachments(
  client: Queryable,
  expenseId: string,
  files: AttachmentUpload[],
): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO expense_attachments
         (expense_id, file_name, mime_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        expenseId,
        file.name,
        file.type,
        file.data.byteLength,
        Buffer.from(
          file.data.buffer,
          file.data.byteOffset,
          file.data.byteLength,
        ),
      ],
    );
  }
}

async function loadExpense(client: Queryable, id: string): Promise<Expense> {
  const { rows } = await client.query<ExpenseRow>(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1`,
    [id],
  );
  if (!rows[0])
    throw new AppError('NOT_FOUND', 'That expense no longer exists.');
  const attachments = await client.query<AttachmentRow>(
    `SELECT ${ATTACHMENT_COLUMNS} FROM expense_attachments
     WHERE expense_id = $1 ORDER BY created_at, file_name`,
    [id],
  );
  return toExpense(rows[0], attachments.rows.map(toAttachment));
}

function expenseParams(input: ExpenseInput) {
  return [
    input.date,
    input.payee,
    input.particulars,
    input.category,
    input.department || null,
    input.paymentMethod,
    input.projectName,
    input.invoiceNo,
    input.siteName,
    input.vatNo,
    input.amountExcludingVat,
    input.vat,
  ];
}

async function listNames(client: Queryable, table: ListTable) {
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM ${table} ORDER BY sort_order, created_at, name`,
  );
  return rows.map((row) => row.name);
}

/** Adds every payee name used by a transaction that is missing from its list. */
export async function syncPayeeLists(client: Queryable): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  for (const [table, usage] of Object.entries(PAYEE_LIST_USAGE)) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO ${table} (name, sort_order)
       SELECT name, (SELECT coalesce(max(sort_order), 0) FROM ${table})
                    + row_number() OVER (ORDER BY lower(name))
       FROM (SELECT DISTINCT ON (lower(${usage.column})) ${usage.column} AS name
             FROM ${usage.table}
             WHERE btrim(${usage.column}) <> ''
               AND lower(${usage.column}) NOT IN (SELECT lower(name) FROM ${table})
             GROUP BY ${usage.column}
             -- Keep the most used spelling, then the earliest, then capitalised.
             ORDER BY lower(${usage.column}), count(*) DESC, min(created_at),
                      ${usage.column} COLLATE "C") AS names`,
    );
    // One spelling per name, so renames and in-use checks match exactly.
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE ${usage.table} t SET ${usage.column} = l.name
       FROM ${table} l
       WHERE lower(t.${usage.column}) = lower(l.name)
         AND t.${usage.column} <> l.name`,
    );
  }
}

/** Returns the stored spelling of `name`, creating it if it does not exist. */
async function ensureListItem(
  client: Queryable,
  table: ListTable,
  name: string,
): Promise<string> {
  const existing = await client.query<{ name: string }>(
    `SELECT name FROM ${table} WHERE lower(name) = lower($1)`,
    [name],
  );
  if (existing.rows[0]) return existing.rows[0].name;
  await client.query(
    `INSERT INTO ${table} (name, sort_order)
     SELECT $1, coalesce(max(sort_order), 0) + 1 FROM ${table}`,
    [name],
  );
  return name;
}

async function listReopenedMonths(client: Queryable): Promise<string[]> {
  const { rows } = await client.query<{ month: string }>(
    'SELECT month FROM reopened_months ORDER BY month',
  );
  return rows.map((row) => row.month);
}

/** Refuses changes to records dated in a closed month. */
async function assertDatesOpen(client: Queryable, dates: string[]) {
  assertMonthsOpen(dates, await listReopenedMonths(client));
}

/**
 * Locks a record and returns its date, so a change can be checked against
 * both the old and the new month.
 */
async function lockedRecordDate(
  client: Queryable,
  table: 'expenses' | 'budget_receipts',
  id: string,
): Promise<string> {
  const column = table === 'expenses' ? 'expense_date' : 'received_date';
  const { rows } = await client.query<{ date: string }>(
    `SELECT ${column} AS date FROM ${table} WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!rows[0]) {
    throw new AppError(
      'NOT_FOUND',
      table === 'expenses'
        ? 'That expense no longer exists.'
        : 'That budget payment no longer exists.',
    );
  }
  return rows[0].date;
}

export async function reopenMonth(db: Database, month: string): Promise<void> {
  await db.query(
    'INSERT INTO reopened_months (month) VALUES ($1) ON CONFLICT DO NOTHING',
    [month],
  );
}

export async function closeMonth(db: Database, month: string): Promise<void> {
  await db.query('DELETE FROM reopened_months WHERE month = $1', [month]);
}

export async function loadSnapshot(db: Database): Promise<FinanceSnapshot> {
  // One consistent snapshot even if another user is writing concurrently.
  return db.transaction(
    async (client) => {
      // A client runs one query at a time, so these are sequential.
      const expenses = await client.query<ExpenseRow>(
        `SELECT ${EXPENSE_COLUMNS} FROM expenses
         ORDER BY expense_date DESC, created_at DESC`,
      );
      const attachments = await client.query<AttachmentRow>(
        `SELECT ${ATTACHMENT_COLUMNS} FROM expense_attachments
         ORDER BY created_at, file_name`,
      );
      const receipts = await client.query<ReceiptRow>(
        `SELECT ${RECEIPT_COLUMNS} FROM budget_receipts
         ORDER BY received_date DESC, created_at DESC`,
      );
      const categories = await listNames(client, 'categories');
      const departments = await listNames(client, 'departments');
      const payees = await listNames(client, 'payees');
      const budgetPayers = await listNames(client, 'budget_payers');
      const reopenedMonths = await listReopenedMonths(client);
      const attachmentsByExpense = new Map<string, ExpenseAttachment[]>();
      attachments.rows.forEach((row) => {
        const list = attachmentsByExpense.get(row.expense_id) ?? [];
        list.push(toAttachment(row));
        attachmentsByExpense.set(row.expense_id, list);
      });
      return {
        expenses: expenses.rows.map((row) =>
          toExpense(row, attachmentsByExpense.get(row.id) ?? []),
        ),
        budgetTransactions: receipts.rows.map(toBudgetTransaction),
        categories,
        departments,
        payees,
        budgetPayers,
        reopenedMonths,
      };
    },
    { isolation: 'REPEATABLE READ' },
  );
}

export function createExpense(
  db: Database,
  input: ExpenseInput,
  files: AttachmentUpload[],
): Promise<Expense> {
  return db.transaction(async (client) => {
    await assertDatesOpen(client, [input.date]);
    const payee = await ensureListItem(client, 'payees', input.payee);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO expenses
         (expense_date, payee, particulars, category, department,
          payment_method, project_name, invoice_no, site_name, vat_no,
          amount_excluding_vat, vat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      expenseParams({ ...input, payee }),
    );
    await insertAttachments(client, rows[0].id, files);
    return loadExpense(client, rows[0].id);
  });
}

export async function updateExpense(
  db: Database,
  id: string,
  input: ExpenseInput,
  files: AttachmentUpload[],
): Promise<Expense> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const previousDate = await lockedRecordDate(client, 'expenses', id);
    await assertDatesOpen(client, [previousDate, input.date]);
    const payee = await ensureListItem(client, 'payees', input.payee);
    await client.query(
      `UPDATE expenses SET
         expense_date = $2, payee = $3, particulars = $4, category = $5,
         department = $6, payment_method = $7, project_name = $8,
         invoice_no = $9, site_name = $10, vat_no = $11,
         amount_excluding_vat = $12, vat = $13, updated_at = now()
       WHERE id = $1`,
      [id, ...expenseParams({ ...input, payee })],
    );
    await insertAttachments(client, id, files);
    return loadExpense(client, id);
  });
}

export function deleteExpense(db: Database, id: string): Promise<void> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const date = await lockedRecordDate(client, 'expenses', id);
    await assertDatesOpen(client, [date]);
    // Attachments are removed by ON DELETE CASCADE in the same statement.
    await client.query('DELETE FROM expenses WHERE id = $1', [id]);
  });
}

export async function getAttachment(
  db: Database,
  id: string,
): Promise<AttachmentContent | undefined> {
  if (!UUID_PATTERN.test(id)) return undefined;
  const { rows } = await db.query<{
    file_name: string;
    mime_type: string;
    content: Buffer;
  }>(
    'SELECT file_name, mime_type, content FROM expense_attachments WHERE id = $1',
    [id],
  );
  if (!rows[0]) return undefined;
  return {
    name: rows[0].file_name,
    type: rows[0].mime_type,
    data: new Uint8Array(rows[0].content),
  };
}

export function createBudgetTransaction(
  db: Database,
  input: BudgetTransactionInput,
): Promise<BudgetTransaction> {
  return db.transaction(async (client) => {
    await assertDatesOpen(client, [input.date]);
    const paidBy = await ensureListItem(client, 'budget_payers', input.paidBy);
    const { rows } = await client.query<ReceiptRow>(
      `INSERT INTO budget_receipts
         (received_date, amount, paid_by, payment_method, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${RECEIPT_COLUMNS}`,
      [input.date, input.amount, paidBy, input.paymentMethod, input.note],
    );
    return toBudgetTransaction(rows[0]);
  });
}

export async function updateBudgetTransaction(
  db: Database,
  id: string,
  input: BudgetTransactionInput,
): Promise<BudgetTransaction> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const previousDate = await lockedRecordDate(client, 'budget_receipts', id);
    await assertDatesOpen(client, [previousDate, input.date]);
    const paidBy = await ensureListItem(client, 'budget_payers', input.paidBy);
    const { rows } = await client.query<ReceiptRow>(
      `UPDATE budget_receipts SET
         received_date = $2, amount = $3, paid_by = $4, payment_method = $5,
         note = $6, updated_at = now()
       WHERE id = $1
       RETURNING ${RECEIPT_COLUMNS}`,
      [id, input.date, input.amount, paidBy, input.paymentMethod, input.note],
    );
    return toBudgetTransaction(rows[0]);
  });
}

export function deleteBudgetTransaction(
  db: Database,
  id: string,
): Promise<void> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const date = await lockedRecordDate(client, 'budget_receipts', id);
    await assertDatesOpen(client, [date]);
    await client.query('DELETE FROM budget_receipts WHERE id = $1', [id]);
  });
}

export async function addListItem(
  db: Database,
  table: ListTable,
  name: string,
): Promise<void> {
  await db.query(
    `INSERT INTO ${table} (name, sort_order)
     SELECT $1, coalesce(max(sort_order), 0) + 1 FROM ${table}`,
    [name],
  );
}

/**
 * Category/department renames cascade through ON UPDATE CASCADE; payee
 * renames update the transactions that use the name in the same transaction.
 */
export function renameListItem(
  db: Database,
  table: ListTable,
  previous: string,
  next: string,
): Promise<void> {
  return db.transaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE ${table} SET name = $2 WHERE name = $1`,
      [previous, next],
    );
    if (!rowCount)
      throw new AppError('NOT_FOUND', `"${previous}" no longer exists.`);
    const usage = payeeListUsage(table);
    if (usage) {
      await client.query(
        `UPDATE ${usage.table} SET ${usage.column} = $2, updated_at = now()
         WHERE ${usage.column} = $1`,
        [previous, next],
      );
    }
  });
}

/**
 * Deleting a category/department that expenses still use is refused by the
 * foreign key; a payee that transactions still use is refused here.
 */
export function deleteListItem(
  db: Database,
  table: ListTable,
  name: string,
): Promise<void> {
  return db.transaction(async (client) => {
    const usage = payeeListUsage(table);
    if (usage) {
      const { rows } = await client.query<{ used: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM ${usage.table}
                        WHERE ${usage.column} = $1) AS used`,
        [name],
      );
      if (rows[0].used) {
        throw new AppError(
          'IN_USE',
          `"${name}" is still used by existing transactions. Edit those transactions first.`,
        );
      }
    } else {
      const { rows } = await client.query<{ count: string }>(
        `SELECT count(*) AS count FROM ${table}`,
      );
      if (Number(rows[0].count) <= 1) {
        throw new AppError('VALIDATION', 'Keep at least one option available.');
      }
    }
    const { rowCount } = await client.query(
      `DELETE FROM ${table} WHERE name = $1`,
      [name],
    );
    if (!rowCount)
      throw new AppError('NOT_FOUND', `"${name}" no longer exists.`);
  });
}

export async function isDatabaseEmpty(client: Queryable): Promise<boolean> {
  const { rows } = await client.query<{ empty: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM expenses)
        AND NOT EXISTS (SELECT 1 FROM budget_receipts) AS empty`,
  );
  return rows[0].empty;
}

/**
 * One-time import of data the app used to keep in browser storage.
 * Only allowed into an empty database so it can never create duplicates.
 */
export function importLegacyData(
  db: Database,
  payload: LegacyImportPayload,
): Promise<LegacyImportResult> {
  return db.transaction(async (client) => {
    if (!(await isDatabaseEmpty(client))) {
      throw new AppError(
        'CONFLICT',
        'The database already has transactions, so device data was not imported again.',
      );
    }
    let attachmentCount = 0;
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const name of payload.categories) {
      await ensureListItem(client, 'categories', name);
    }
    for (const name of payload.departments) {
      await ensureListItem(client, 'departments', name);
    }
    for (const expense of payload.expenses) {
      const category = await ensureListItem(
        client,
        'categories',
        expense.category || expense.type || 'Other',
      );
      const department = expense.department
        ? await ensureListItem(client, 'departments', expense.department)
        : null;
      const vat = expense.vat ?? 0;
      const total = expense.amountIncludingVat ?? expense.amount;
      const excludingVat = expense.amountExcludingVat ?? total - vat;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO expenses
           (id, expense_date, payee, particulars, category, department,
            payment_method, project_name, invoice_no, site_name, vat_no,
            amount_excluding_vat, vat, created_at)
         VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6,
                 $7, $8, $9, $10, $11, $12, $13,
                 coalesce(to_timestamp($14::double precision / 1000), now()))
         RETURNING id`,
        [
          UUID_PATTERN.test(expense.id) ? expense.id : null,
          expense.date,
          expense.payee,
          expense.particulars ?? expense.description ?? '',
          category,
          department,
          expense.paymentMethod ?? '',
          expense.projectName ?? '',
          expense.invoiceNo ?? '',
          expense.siteName ?? '',
          expense.vatNo ?? '',
          Math.max(0, Math.round(excludingVat * 100) / 100),
          Math.round(vat * 100) / 100,
          expense.createdAt ?? null,
        ],
      );
      const files = expense.attachmentFiles ?? [];
      await insertAttachments(client, rows[0].id, files);
      attachmentCount += files.length;
    }
    for (const payment of payload.budgetTransactions) {
      await client.query(
        `INSERT INTO budget_receipts
           (id, received_date, amount, paid_by, payment_method, note, created_at)
         VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6,
                 coalesce(to_timestamp($7::double precision / 1000), now()))`,
        [
          UUID_PATTERN.test(payment.id) ? payment.id : null,
          payment.date,
          Math.round(payment.amount * 100) / 100,
          payment.paidBy ?? '',
          payment.paymentMethod ?? null,
          payment.note ?? '',
          payment.createdAt ?? null,
        ],
      );
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
    await syncPayeeLists(client);
    return {
      expenses: payload.expenses.length,
      budgetTransactions: payload.budgetTransactions.length,
      attachments: attachmentCount,
    };
  });
}
