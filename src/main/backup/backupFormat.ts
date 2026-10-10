import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { AppError } from '../../shared/errors';
import { BackupCounts, BackupKind } from '../../shared/types';

/**
 * Backup file format: gzip-compressed JSON.
 *
 * {
 *   format: 'moon-finance-backup', formatVersion: 1,
 *   schemaVersion, appVersion, kind, createdAt, counts,
 *   checksum: sha256(JSON.stringify(data)),
 *   data: { categories, departments, expenses, attachments, budgetReceipts,
 *           payees?, budgetPayers? }
 * }
 *
 * `payees` and `budgetPayers` were added later; backups without them are
 * still valid and the lists are rebuilt from the transactions on restore.
 *
 * It is independent of pg_dump/PostgreSQL versions and contains receipts,
 * so one file is enough to rebuild the company's data on any new server.
 */

export const BACKUP_FORMAT = 'moon-finance-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = '.mfbackup';

export type BackupListItem = {
  name: string;
  sortOrder: number;
  createdAt: string;
};

export type BackupExpense = {
  id: string;
  expenseDate: string;
  payee: string;
  particulars: string;
  category: string;
  department: string | null;
  paymentMethod: string;
  projectName: string;
  invoiceNo: string;
  siteName: string;
  vatNo: string;
  amountExcludingVat: number;
  vat: number;
  createdAt: string;
  updatedAt: string;
};

export type BackupAttachment = {
  id: string;
  expenseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64: string;
  createdAt: string;
};

export type BackupReceipt = {
  id: string;
  receivedDate: string;
  amount: number;
  paidBy: string;
  paymentMethod: 'Cash' | 'Card' | null;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type BackupData = {
  categories: BackupListItem[];
  departments: BackupListItem[];
  expenses: BackupExpense[];
  attachments: BackupAttachment[];
  budgetReceipts: BackupReceipt[];
  // Last, so older backups (without them) keep the same checksum.
  payees?: BackupListItem[];
  budgetPayers?: BackupListItem[];
};

export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  kind: BackupKind;
  createdAt: string;
  counts: BackupCounts;
  checksum: string;
  data: BackupData;
};

const BACKUP_KINDS: BackupKind[] = ['automatic', 'manual', 'pre-restore'];

function checksum(data: BackupData) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

export function countRecords(data: BackupData): BackupCounts {
  return {
    expenses: data.expenses.length,
    attachments: data.attachments.length,
    budgetTransactions: data.budgetReceipts.length,
    categories: data.categories.length,
    departments: data.departments.length,
  };
}

export function buildBackupDocument(
  data: BackupData,
  meta: {
    schemaVersion: number;
    appVersion: string;
    kind: BackupKind;
    createdAt: Date;
  },
): BackupDocument {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: meta.schemaVersion,
    appVersion: meta.appVersion,
    kind: meta.kind,
    createdAt: meta.createdAt.toISOString(),
    counts: countRecords(data),
    checksum: checksum(data),
    data,
  };
}

export function serializeBackup(document: BackupDocument): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(document), 'utf8'));
}

function invalid(message: string): never {
  throw new AppError(
    'BACKUP_INVALID',
    `This backup cannot be restored: ${message}`,
  );
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isDate = (value: unknown) =>
  isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTimestamp = (value: unknown) =>
  isString(value) && !Number.isNaN(Date.parse(value));

function checkRecords<T>(
  value: unknown,
  label: string,
  isValid: (record: Record<string, unknown>) => boolean,
): T[] {
  if (!Array.isArray(value)) invalid(`${label} are missing.`);
  value.forEach((record, index) => {
    if (typeof record !== 'object' || record === null || !isValid(record)) {
      invalid(`${label} record #${index + 1} is malformed.`);
    }
  });
  return value as T[];
}

function validateData(value: unknown): BackupData {
  if (typeof value !== 'object' || value === null) invalid('it has no data.');
  const raw = value as Record<string, unknown>;
  const isListItem = (r: Record<string, unknown>) =>
    isString(r.name) &&
    r.name.trim().length > 0 &&
    isNumber(r.sortOrder) &&
    isTimestamp(r.createdAt);
  const data: BackupData = {
    categories: checkRecords(raw.categories, 'Categories', isListItem),
    departments: checkRecords(raw.departments, 'Departments', isListItem),
    expenses: checkRecords(
      raw.expenses,
      'Expenses',
      (r) =>
        isString(r.id) &&
        isDate(r.expenseDate) &&
        isString(r.payee) &&
        isString(r.particulars) &&
        isString(r.category) &&
        (r.department === null || isString(r.department)) &&
        [
          r.paymentMethod,
          r.projectName,
          r.invoiceNo,
          r.siteName,
          r.vatNo,
        ].every(isString) &&
        isNumber(r.amountExcludingVat) &&
        isNumber(r.vat) &&
        isTimestamp(r.createdAt) &&
        isTimestamp(r.updatedAt),
    ),
    attachments: checkRecords(
      raw.attachments,
      'Attachments',
      (r) =>
        isString(r.id) &&
        isString(r.expenseId) &&
        isString(r.fileName) &&
        isString(r.mimeType) &&
        isNumber(r.sizeBytes) &&
        isString(r.contentBase64) &&
        isTimestamp(r.createdAt),
    ),
    budgetReceipts: checkRecords(
      raw.budgetReceipts,
      'Budget payments',
      (r) =>
        isString(r.id) &&
        isDate(r.receivedDate) &&
        isNumber(r.amount) &&
        isString(r.paidBy) &&
        (r.paymentMethod === null ||
          r.paymentMethod === 'Cash' ||
          r.paymentMethod === 'Card') &&
        isString(r.note) &&
        isTimestamp(r.createdAt) &&
        isTimestamp(r.updatedAt),
    ),
    // Left undefined when absent so the checksum of older backups matches.
    payees:
      raw.payees === undefined
        ? undefined
        : checkRecords(raw.payees, 'Payees', isListItem),
    budgetPayers:
      raw.budgetPayers === undefined
        ? undefined
        : checkRecords(raw.budgetPayers, 'Budget payees', isListItem),
  };

  // Referential integrity, so a restore never fails half way on a foreign key.
  const categories = new Set(data.categories.map((item) => item.name));
  const departments = new Set(data.departments.map((item) => item.name));
  const expenseIds = new Set(data.expenses.map((expense) => expense.id));
  data.expenses.forEach((expense) => {
    if (!categories.has(expense.category)) {
      invalid(`expense ${expense.id} uses unknown type "${expense.category}".`);
    }
    if (expense.department !== null && !departments.has(expense.department)) {
      invalid(
        `expense ${expense.id} uses unknown department "${expense.department}".`,
      );
    }
  });
  data.attachments.forEach((attachment) => {
    if (!expenseIds.has(attachment.expenseId)) {
      invalid(`attachment ${attachment.id} belongs to a missing expense.`);
    }
  });
  return data;
}

export function parseBackup(file: Buffer): BackupDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(file).toString('utf8'));
  } catch {
    invalid('the file is not a backup made by this app, or it is damaged.');
  }
  const document = parsed as Partial<BackupDocument>;
  if (document?.format !== BACKUP_FORMAT) {
    invalid('the file is not a backup made by this app.');
  }
  if (
    !isNumber(document.formatVersion) ||
    document.formatVersion > BACKUP_FORMAT_VERSION
  ) {
    invalid('it was made by a newer version of the app. Update the app first.');
  }
  if (!isNumber(document.schemaVersion) || !isTimestamp(document.createdAt)) {
    invalid('its header is damaged.');
  }
  if (!BACKUP_KINDS.includes(document.kind as BackupKind)) {
    invalid('its header is damaged.');
  }
  const data = validateData(document.data);
  if (document.checksum !== checksum(data)) {
    invalid('the checksum does not match, so the file is corrupted.');
  }
  return {
    ...(document as BackupDocument),
    counts: countRecords(data),
    data,
  };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** e.g. moon-finance_automatic_2026-10-09_143005.mfbackup */
export function backupFileName(kind: BackupKind, date: Date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `moon-finance_${kind}_${day}_${time}${BACKUP_EXTENSION}`;
}

export function parseBackupFileName(
  fileName: string,
): { kind: BackupKind; createdAt: Date } | undefined {
  const match =
    /^moon-finance_(automatic|manual|pre-restore)_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(?:-\d+)?\.mfbackup$/.exec(
      fileName,
    );
  if (!match) return undefined;
  const [, kind, year, month, day, hours, minutes, seconds] = match;
  return {
    kind: kind as BackupKind,
    createdAt: new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    ),
  };
}
