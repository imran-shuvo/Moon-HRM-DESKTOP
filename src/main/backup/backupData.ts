import { BackupCounts } from '../../shared/types';
import { Database } from '../db/database';
import { BackupData, countRecords } from './backupFormat';

/** Reads every table in one consistent snapshot. */
export function readBackupData(db: Database): Promise<BackupData> {
  return db.transaction(
    async (client) => {
      const iso = (value: Date) => value.toISOString();
      // A client runs one query at a time, so these are sequential.
      type ListRow = { name: string; sort_order: number; created_at: Date };
      const categories = await client.query<ListRow>(
        'SELECT name, sort_order, created_at FROM categories ORDER BY sort_order, name',
      );
      const departments = await client.query<ListRow>(
        'SELECT name, sort_order, created_at FROM departments ORDER BY sort_order, name',
      );
      const expenses = await client.query(
        `SELECT id, expense_date, payee, particulars, category, department,
                payment_method, project_name, invoice_no, site_name, vat_no,
                amount_excluding_vat, vat, created_at, updated_at
         FROM expenses ORDER BY expense_date, created_at`,
      );
      const attachments = await client.query(
        `SELECT id, expense_id, file_name, mime_type, size_bytes, content,
                created_at
         FROM expense_attachments ORDER BY created_at, id`,
      );
      const receipts = await client.query(
        `SELECT id, received_date, amount, paid_by, payment_method, note,
                created_at, updated_at
         FROM budget_receipts ORDER BY received_date, created_at`,
      );
      const listItem = (row: ListRow) => ({
        name: row.name,
        sortOrder: row.sort_order,
        createdAt: iso(row.created_at),
      });
      return {
        categories: categories.rows.map(listItem),
        departments: departments.rows.map(listItem),
        expenses: expenses.rows.map((row) => ({
          id: row.id,
          expenseDate: row.expense_date,
          payee: row.payee,
          particulars: row.particulars,
          category: row.category,
          department: row.department,
          paymentMethod: row.payment_method,
          projectName: row.project_name,
          invoiceNo: row.invoice_no,
          siteName: row.site_name,
          vatNo: row.vat_no,
          amountExcludingVat: row.amount_excluding_vat,
          vat: row.vat,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
        attachments: attachments.rows.map((row) => ({
          id: row.id,
          expenseId: row.expense_id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          contentBase64: (row.content as Buffer).toString('base64'),
          createdAt: iso(row.created_at),
        })),
        budgetReceipts: receipts.rows.map((row) => ({
          id: row.id,
          receivedDate: row.received_date,
          amount: row.amount,
          paidBy: row.paid_by,
          paymentMethod: row.payment_method,
          note: row.note,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
      };
    },
    { isolation: 'REPEATABLE READ' },
  );
}

/**
 * Replaces all data with the backup's contents in a single transaction:
 * either everything is restored, or nothing changes.
 */
export function restoreBackupData(
  db: Database,
  data: BackupData,
): Promise<BackupCounts> {
  return db.transaction(async (client) => {
    await client.query(
      'TRUNCATE expense_attachments, expenses, budget_receipts, categories, departments',
    );
    const json = (rows: unknown[]) => JSON.stringify(rows);
    await client.query(
      `INSERT INTO categories (name, sort_order, created_at)
       SELECT name, "sortOrder", "createdAt"
       FROM jsonb_to_recordset($1::jsonb)
         AS x(name text, "sortOrder" int, "createdAt" timestamptz)`,
      [json(data.categories)],
    );
    await client.query(
      `INSERT INTO departments (name, sort_order, created_at)
       SELECT name, "sortOrder", "createdAt"
       FROM jsonb_to_recordset($1::jsonb)
         AS x(name text, "sortOrder" int, "createdAt" timestamptz)`,
      [json(data.departments)],
    );
    await client.query(
      `INSERT INTO expenses
         (id, expense_date, payee, particulars, category, department,
          payment_method, project_name, invoice_no, site_name, vat_no,
          amount_excluding_vat, vat, created_at, updated_at)
       SELECT id, "expenseDate", payee, particulars, category, department,
              "paymentMethod", "projectName", "invoiceNo", "siteName", "vatNo",
              "amountExcludingVat", vat, "createdAt", "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "expenseDate" date, payee text, particulars text,
         category text, department text, "paymentMethod" text,
         "projectName" text, "invoiceNo" text, "siteName" text, "vatNo" text,
         "amountExcludingVat" numeric, vat numeric,
         "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.expenses)],
    );
    // Insert receipts one at a time to keep each statement's size bounded.
    // eslint-disable-next-line no-restricted-syntax
    for (const attachment of data.attachments) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO expense_attachments
           (id, expense_id, file_name, mime_type, size_bytes, content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          attachment.id,
          attachment.expenseId,
          attachment.fileName,
          attachment.mimeType,
          attachment.sizeBytes,
          Buffer.from(attachment.contentBase64, 'base64'),
          attachment.createdAt,
        ],
      );
    }
    await client.query(
      `INSERT INTO budget_receipts
         (id, received_date, amount, paid_by, payment_method, note,
          created_at, updated_at)
       SELECT id, "receivedDate", amount, "paidBy", "paymentMethod", note,
              "createdAt", "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "receivedDate" date, amount numeric, "paidBy" text,
         "paymentMethod" text, note text,
         "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.budgetReceipts)],
    );
    return countRecords(data);
  });
}
