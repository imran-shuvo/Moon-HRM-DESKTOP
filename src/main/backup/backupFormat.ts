import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { isEmployeeRole } from '../../shared/employeeRoles';
import { ATTENDANCE_STATUSES } from '../../shared/payroll';
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
 *           payees?, budgetPayers?, employees?, attendance?,
 *           salaryAdvances?, payslips?, payrollSettings? }
 * }
 *
 * `payees` and `budgetPayers` are only in backups made before employees
 * replaced those lists; they are checked but not restored. `employees` was
 * added later; backups without it restore with no employees. Attendance,
 * advances, payslips and payroll settings were added after that; backups
 * without them restore with none (and the default payroll settings).
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

export type BackupEmployee = {
  id: string;
  name: string;
  iqamaNo: string;
  designation: string;
  projectName: string;
  phoneNo: string;
  insuranceNo: string;
  iqamaExpiry: string | null;
  campName: string;
  createdAt: string;
  updatedAt: string;
  // Added later; absent in older backups.
  nickname?: string;
  salary?: number | null;
  role?: string;
  workHoursPerDay?: number;
  hourlyRate?: number | null;
  terminationDate?: string | null;
};

export type BackupDocumentFile = {
  id: string;
  title: string;
  category: string;
  projectName: string;
  campName: string;
  documentDate: string;
  employeeId: string | null;
  note: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64: string;
  createdAt: string;
  updatedAt: string;
};

export type BackupAttendance = {
  employeeId: string;
  workDate: string;
  status: string;
  hours: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type BackupSalaryAdvance = {
  id: string;
  employeeId: string;
  advanceDate: string;
  amount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

/** Stored amounts only; overtime and net pay are recalculated by the database. */
export type BackupPayslip = {
  id: string;
  employeeId: string;
  month: string;
  employeeName: string;
  iqamaNo: string;
  role: string;
  designation: string;
  projectName: string;
  campName: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  /** Absent in backups made before vacation was added. */
  vacationDays?: number;
  /** Absent in backups made before Friday overtime was separate. */
  weekendOvertimeHours?: number;
  weekendOvertimeRate?: number;
  holidayDays: number;
  hoursWorked: number;
  basicSalary: number;
  hourlyRate: number;
  basicPay: number;
  overtimeHours: number;
  overtimeRate: number;
  allowance: number;
  absenceDeduction: number;
  absenceFine: number;
  advanceDeduction: number;
  otherDeduction: number;
  status: 'unpaid' | 'paid';
  paidDate: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Backups made before the company payroll policy have a flat overtime rate
 * (overtimeBaseRate) and absence fine (absenceFine, absenceFineFreeDays);
 * newer ones have the policy fields.
 */
export type BackupPayrollSettings = {
  overtimeMultiplier: number;
  weekendOvertimeMultiplier?: number;
  salaryDays?: number;
  paidDaysOff?: number;
  overtimeBaseRate?: number;
  absenceFine?: number;
  absenceFineFreeDays?: number;
  // Absent in backups made before vacation was added.
  leavePaid?: boolean;
  vacationPaid?: boolean;
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
  employees?: BackupEmployee[];
  attendance?: BackupAttendance[];
  salaryAdvances?: BackupSalaryAdvance[];
  payslips?: BackupPayslip[];
  payrollSettings?: BackupPayrollSettings;
  documents?: BackupDocumentFile[];
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
    employees: data.employees?.length ?? 0,
    attendance: data.attendance?.length ?? 0,
    salaryAdvances: data.salaryAdvances?.length ?? 0,
    payslips: data.payslips?.length ?? 0,
    documents: data.documents?.length ?? 0,
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
    employees:
      raw.employees === undefined
        ? undefined
        : checkRecords(
            raw.employees,
            'Employees',
            (r) =>
              isString(r.id) &&
              isString(r.name) &&
              r.name.trim().length > 0 &&
              isString(r.iqamaNo) &&
              r.iqamaNo.trim().length > 0 &&
              [
                r.designation,
                r.projectName,
                r.phoneNo,
                r.insuranceNo,
                r.campName,
              ].every(isString) &&
              (r.iqamaExpiry === null || isDate(r.iqamaExpiry)) &&
              (r.nickname === undefined || isString(r.nickname)) &&
              (r.role === undefined || isEmployeeRole(r.role)) &&
              (r.salary === undefined ||
                r.salary === null ||
                isNumber(r.salary)) &&
              (r.workHoursPerDay === undefined ||
                isNumber(r.workHoursPerDay)) &&
              (r.hourlyRate === undefined ||
                r.hourlyRate === null ||
                isNumber(r.hourlyRate)) &&
              (r.terminationDate === undefined ||
                r.terminationDate === null ||
                isDate(r.terminationDate)) &&
              isTimestamp(r.createdAt) &&
              isTimestamp(r.updatedAt),
          ),
  };

  data.attendance =
    raw.attendance === undefined
      ? undefined
      : checkRecords(
          raw.attendance,
          'Attendance',
          (r) =>
            isString(r.employeeId) &&
            isDate(r.workDate) &&
            ATTENDANCE_STATUSES.includes(r.status as never) &&
            isNumber(r.hours) &&
            isString(r.note) &&
            isTimestamp(r.createdAt) &&
            isTimestamp(r.updatedAt),
        );
  data.salaryAdvances =
    raw.salaryAdvances === undefined
      ? undefined
      : checkRecords(
          raw.salaryAdvances,
          'Advances',
          (r) =>
            isString(r.id) &&
            isString(r.employeeId) &&
            isDate(r.advanceDate) &&
            isNumber(r.amount) &&
            isString(r.note) &&
            isTimestamp(r.createdAt) &&
            isTimestamp(r.updatedAt),
        );
  data.payslips =
    raw.payslips === undefined
      ? undefined
      : checkRecords(
          raw.payslips,
          'Payslips',
          (r) =>
            isString(r.id) &&
            isString(r.employeeId) &&
            isString(r.month) &&
            /^\d{4}-\d{2}$/.test(r.month) &&
            [
              r.employeeName,
              r.iqamaNo,
              r.role,
              r.designation,
              r.projectName,
              r.campName,
              r.note,
            ].every(isString) &&
            [
              r.workingDays,
              r.presentDays,
              r.absentDays,
              r.leaveDays,
              r.holidayDays,
              r.hoursWorked,
              r.basicSalary,
              r.hourlyRate,
              r.basicPay,
              r.overtimeHours,
              r.overtimeRate,
              r.allowance,
              r.absenceDeduction,
              r.absenceFine,
              r.advanceDeduction,
              r.otherDeduction,
            ].every(isNumber) &&
            (r.vacationDays === undefined || isNumber(r.vacationDays)) &&
            [r.weekendOvertimeHours, r.weekendOvertimeRate].every(
              (field) => field === undefined || isNumber(field),
            ) &&
            ((r.status === 'paid' && isDate(r.paidDate)) ||
              (r.status === 'unpaid' && r.paidDate === null)) &&
            isTimestamp(r.createdAt) &&
            isTimestamp(r.updatedAt),
        );
  if (raw.payrollSettings !== undefined) {
    const settings = raw.payrollSettings as Record<string, unknown> | null;
    const policy = [
      settings?.weekendOvertimeMultiplier,
      settings?.salaryDays,
      settings?.paidDaysOff,
    ];
    const flat = [
      settings?.overtimeBaseRate,
      settings?.absenceFine,
      settings?.absenceFineFreeDays,
    ];
    if (
      !settings ||
      !isNumber(settings.overtimeMultiplier) ||
      !(policy.every(isNumber) || flat.every(isNumber)) ||
      ![settings.leavePaid, settings.vacationPaid].every(
        (flag) => flag === undefined || typeof flag === 'boolean',
      )
    ) {
      invalid('the payroll settings are malformed.');
    }
    data.payrollSettings = settings as BackupPayrollSettings;
  }

  data.documents =
    raw.documents === undefined
      ? undefined
      : checkRecords(
          raw.documents,
          'Documents',
          (r) =>
            isString(r.id) &&
            [
              r.title,
              r.category,
              r.projectName,
              r.campName,
              r.note,
              r.fileName,
              r.mimeType,
              r.contentBase64,
            ].every(isString) &&
            isDate(r.documentDate) &&
            (r.employeeId === null || isString(r.employeeId)) &&
            isNumber(r.sizeBytes) &&
            isTimestamp(r.createdAt) &&
            isTimestamp(r.updatedAt),
        );

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
  const employeeIds = new Set(data.employees?.map((employee) => employee.id));
  const payroll: [string, { employeeId: string }[] | undefined][] = [
    ['an attendance record', data.attendance],
    ['an advance', data.salaryAdvances],
    ['a payslip', data.payslips],
  ];
  data.documents?.forEach((document) => {
    if (document.employeeId !== null && !employeeIds.has(document.employeeId)) {
      invalid('a document belongs to a missing employee.');
    }
  });
  payroll.forEach(([label, records]) =>
    records?.forEach((record) => {
      if (!employeeIds.has(record.employeeId)) {
        invalid(`${label} belongs to a missing employee.`);
      }
    }),
  );
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
