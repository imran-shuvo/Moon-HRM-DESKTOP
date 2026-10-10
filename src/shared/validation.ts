import { AppError } from './errors';
import {
  AttachmentUpload,
  BudgetTransactionInput,
  DatabaseConnectionSettings,
  ExpenseInput,
  LegacyImportPayload,
} from './types';

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_SAVE = 10;
export const MAX_AMOUNT = 999_999_999_999.99;

function fail(message: string): never {
  throw new AppError('VALIDATION', message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label} is missing or malformed.`);
  }
  return value as Record<string, unknown>;
}

export function text(
  value: unknown,
  label: string,
  { max, required = false }: { max: number; required?: boolean },
): string {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    fail(`${label} must be text.`);
  }
  const trimmed = (value ?? '').trim();
  if (required && !trimmed) fail(`${label} is required.`);
  if (trimmed.length > max) fail(`${label} must be ${max} characters or less.`);
  return trimmed;
}

export function isoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${label} must be a date in YYYY-MM-DD format.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    fail(`${label} is not a real calendar date.`);
  }
  return value;
}

/** Validates a money value and rounds it to whole cents (halala). */
export function money(
  value: unknown,
  label: string,
  { allowZero }: { allowZero: boolean },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a number.`);
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded < 0 || (!allowZero && rounded === 0)) {
    fail(
      `${label} must be ${allowZero ? 'zero or more' : 'greater than zero'}.`,
    );
  }
  if (rounded > MAX_AMOUNT) fail(`${label} is too large.`);
  return rounded;
}

export function listName(value: unknown, label: string): string {
  return text(value, label, { max: 40, required: true });
}

/** Payee names may be longer than category/department names. */
export function payeeName(value: unknown, label: string): string {
  return text(value, label, { max: 100, required: true });
}

/** A past calendar month, 'YYYY-MM'. */
export function pastMonth(value: unknown, currentMonth: string): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    fail('Choose a month.');
  }
  if (value >= currentMonth) fail('Only past months can be reopened.');
  return value;
}

export function recordId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 64) {
    fail('The record id is invalid.');
  }
  return value;
}

export function validateExpenseInput(value: unknown): ExpenseInput {
  const input = asRecord(value, 'Expense');
  return {
    date: isoDate(input.date, 'Invoice date'),
    payee: text(input.payee, 'Paid to', { max: 100, required: true }),
    particulars: text(input.particulars, 'Particulars', {
      max: 500,
      required: true,
    }),
    category: listName(input.category, 'Type'),
    department: text(input.department, 'Department', { max: 40 }),
    paymentMethod: text(input.paymentMethod, 'Payment method', { max: 40 }),
    projectName: text(input.projectName, 'Project name', { max: 120 }),
    invoiceNo: text(input.invoiceNo, 'Invoice no.', { max: 100 }),
    siteName: text(input.siteName, 'Site name', { max: 120 }),
    vatNo: text(input.vatNo, 'VAT no.', { max: 60 }),
    amountExcludingVat: money(
      input.amountExcludingVat,
      'Amount excluding VAT',
      { allowZero: false },
    ),
    vat: money(input.vat, 'VAT', { allowZero: true }),
  };
}

export function validateBudgetTransactionInput(
  value: unknown,
): BudgetTransactionInput {
  const input = asRecord(value, 'Budget payment');
  if (input.paymentMethod !== 'Cash' && input.paymentMethod !== 'Card') {
    fail('Choose Cash or Card as the payment method.');
  }
  return {
    date: isoDate(input.date, 'Date received'),
    amount: money(input.amount, 'Amount received', { allowZero: false }),
    paidBy: text(input.paidBy, 'Received from', { max: 100, required: true }),
    paymentMethod: input.paymentMethod,
    note: text(input.note, 'Note', { max: 160 }),
  };
}

export function validateUploads(value: unknown): AttachmentUpload[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('Attachments are malformed.');
  if (value.length > MAX_ATTACHMENTS_PER_SAVE) {
    fail(`Attach at most ${MAX_ATTACHMENTS_PER_SAVE} files at a time.`);
  }
  return value.map((item) => {
    const upload = asRecord(item, 'Attachment');
    if (!(upload.data instanceof Uint8Array))
      fail('Attachment data is invalid.');
    if (upload.data.byteLength > MAX_ATTACHMENT_BYTES) {
      fail(
        `"${String(upload.name)}" is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
      );
    }
    return {
      name: text(upload.name, 'File name', { max: 255, required: true }),
      type:
        text(upload.type, 'File type', { max: 255 }) ||
        'application/octet-stream',
      data: upload.data,
    };
  });
}

export function validateConnectionSettings(
  value: unknown,
): DatabaseConnectionSettings {
  const input = asRecord(value, 'Connection settings');
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('Port must be a number between 1 and 65535.');
  }
  if (typeof input.password !== 'string') fail('Password must be text.');
  return {
    host: text(input.host, 'Host', { max: 255, required: true }),
    port,
    database: text(input.database, 'Database name', {
      max: 63,
      required: true,
    }),
    user: text(input.user, 'User name', { max: 63, required: true }),
    password: input.password,
    ssl: input.ssl === true,
  };
}

/**
 * Lenient checks for data written by the pre-database version of the app:
 * older records may lack newer fields, but must have a date, payee and amount.
 */
export function validateLegacyPayload(value: unknown): LegacyImportPayload {
  const input = asRecord(value, 'Device data');
  const list = (item: unknown, label: string) => {
    if (!Array.isArray(item)) fail(`${label} are malformed.`);
    return item as unknown[];
  };
  const names = (item: unknown, label: string) =>
    list(item, label).map((name) => listName(name, label));
  const optionalText = (item: unknown, label: string, max: number) =>
    text(typeof item === 'string' ? item : '', label, { max });

  const expenses = list(input.expenses, 'Expenses').map((item) => {
    const expense = asRecord(item, 'Expense');
    const total = money(
      expense.amountIncludingVat ?? expense.amount,
      'Amount',
      { allowZero: true },
    );
    const vat = money(expense.vat ?? 0, 'VAT', { allowZero: true });
    return {
      id: typeof expense.id === 'string' ? expense.id : '',
      date: isoDate(expense.date, 'Expense date'),
      payee: text(expense.payee, 'Paid to', { max: 100, required: true }),
      description: optionalText(expense.description, 'Description', 500),
      particulars: optionalText(
        expense.particulars ?? expense.description,
        'Particulars',
        500,
      ),
      category: optionalText(expense.category ?? expense.type, 'Type', 40),
      department: optionalText(expense.department, 'Department', 40),
      paymentMethod: optionalText(expense.paymentMethod, 'Payment method', 40),
      projectName: optionalText(expense.projectName, 'Project name', 120),
      invoiceNo: optionalText(expense.invoiceNo, 'Invoice no.', 100),
      siteName: optionalText(expense.siteName, 'Site name', 120),
      vatNo: optionalText(expense.vatNo, 'VAT no.', 60),
      amount: total,
      amountIncludingVat: total,
      amountExcludingVat:
        expense.amountExcludingVat === undefined
          ? Math.max(0, Math.round((total - vat) * 100) / 100)
          : money(expense.amountExcludingVat, 'Amount excluding VAT', {
              allowZero: true,
            }),
      vat,
      createdAt:
        typeof expense.createdAt === 'number' &&
        Number.isFinite(expense.createdAt)
          ? expense.createdAt
          : undefined,
      attachmentFiles: validateUploads(expense.attachmentFiles),
    };
  });

  const budgetTransactions = list(
    input.budgetTransactions,
    'Budget payments',
  ).map((item) => {
    const payment = asRecord(item, 'Budget payment');
    return {
      id: typeof payment.id === 'string' ? payment.id : '',
      date: isoDate(payment.date, 'Date received'),
      amount: money(payment.amount, 'Amount received', { allowZero: false }),
      paidBy: optionalText(payment.paidBy, 'Received from', 100),
      paymentMethod:
        payment.paymentMethod === 'Cash' || payment.paymentMethod === 'Card'
          ? (payment.paymentMethod as 'Cash' | 'Card')
          : undefined,
      note: optionalText(payment.note, 'Note', 160),
      createdAt:
        typeof payment.createdAt === 'number' &&
        Number.isFinite(payment.createdAt)
          ? payment.createdAt
          : undefined,
    };
  });

  return {
    expenses,
    budgetTransactions,
    categories: names(input.categories, 'Categories'),
    departments: names(input.departments, 'Departments'),
  };
}
