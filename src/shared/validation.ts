import { EMPLOYEE_ROLES, isEmployeeRole } from './employeeRoles';
import { AppError } from './errors';
import { ATTENDANCE_STATUSES, DEFAULT_WORK_HOURS_PER_DAY } from './payroll';
import {
  AttachmentUpload,
  AttendanceDayInput,
  AttendanceStatus,
  BudgetTransactionInput,
  DatabaseConnectionSettings,
  EmployeeInput,
  ExpenseInput,
  LegacyImportPayload,
  PayrollSettings,
  PayslipInput,
  SalaryAdvanceInput,
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

/** A number in [min, max], rounded to two decimals (hours, rates, days). */
export function quantity(
  value: unknown,
  label: string,
  {
    min = 0,
    max,
    integer = false,
  }: { min?: number; max: number; integer?: boolean },
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${label} must be a number.`);
  }
  if (integer && !Number.isInteger(value))
    fail(`${label} must be a whole number.`);
  const rounded = Math.round(value * 100) / 100;
  if (rounded < min || rounded > max) {
    fail(`${label} must be between ${min} and ${max}.`);
  }
  return rounded;
}

/** A calendar month, 'YYYY-MM'. */
export function calendarMonth(value: unknown, label = 'Month'): string {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    fail(`${label} must be a month in YYYY-MM format.`);
  }
  return value;
}

function nonEmptyList(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail(`${label} are malformed.`);
  if (value.length === 0)
    fail(`Nothing to save: ${label.toLowerCase()} are empty.`);
  if (value.length > max)
    fail(`Save at most ${max} ${label.toLowerCase()} at a time.`);
  return value;
}

export function listName(value: unknown, label: string): string {
  return text(value, label, { max: 40, required: true });
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

export function validateEmployeeInput(value: unknown): EmployeeInput {
  const input = asRecord(value, 'Employee');
  if (!isEmployeeRole(input.role)) {
    fail(`Role must be one of: ${EMPLOYEE_ROLES.join(', ')}.`);
  }
  return {
    role: input.role,
    name: text(input.name, 'Name', { max: 100, required: true }),
    nickname: text(input.nickname, 'Nickname', { max: 60 }),
    iqamaNo: text(input.iqamaNo, 'Iqama no.', { max: 30, required: true }),
    designation: text(input.designation, 'Designation', { max: 60 }),
    projectName: text(input.projectName, 'Project name', { max: 120 }),
    phoneNo: text(input.phoneNo, 'Phone no.', { max: 30 }),
    insuranceNo: text(input.insuranceNo, 'Insurance no.', { max: 60 }),
    salary:
      input.salary === null || input.salary === undefined
        ? null
        : money(input.salary, 'Salary', { allowZero: true }),
    iqamaExpiry: input.iqamaExpiry
      ? isoDate(input.iqamaExpiry, 'Iqama expiry date')
      : '',
    campName: text(input.campName, 'Camp name', { max: 120 }),
    // Older callers (and backups) may not send these yet.
    workHoursPerDay:
      input.workHoursPerDay === undefined || input.workHoursPerDay === null
        ? DEFAULT_WORK_HOURS_PER_DAY
        : quantity(input.workHoursPerDay, 'Basic hours a day', {
            min: 1,
            max: 24,
          }),
    hourlyRate:
      input.hourlyRate === null || input.hourlyRate === undefined
        ? null
        : money(input.hourlyRate, 'Rate per hour', { allowZero: true }),
  };
}

const isAttendanceStatus = (value: unknown): value is AttendanceStatus =>
  ATTENDANCE_STATUSES.includes(value as AttendanceStatus);

export function validateAttendanceDay(
  date: unknown,
  rows: unknown,
): { date: string; rows: AttendanceDayInput[] } {
  const day = isoDate(date, 'Attendance date');
  const seen = new Set<string>();
  return {
    date: day,
    rows: nonEmptyList(rows, 'Attendance rows', 2000).map((item) => {
      const row = asRecord(item, 'Attendance row');
      const employeeId = recordId(row.employeeId);
      if (seen.has(employeeId))
        fail('An employee is listed twice for one day.');
      seen.add(employeeId);
      if (row.status !== null && !isAttendanceStatus(row.status)) {
        fail(
          `Attendance status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`,
        );
      }
      const status = row.status as AttendanceStatus | null;
      const hours = quantity(row.hours ?? 0, 'Hours worked', { max: 24 });
      return {
        employeeId,
        status,
        // Only a present day has hours, so totals never count stray hours.
        hours: status === 'present' ? hours : 0,
        note: status ? text(row.note, 'Attendance note', { max: 200 }) : '',
      };
    }),
  };
}

export function validateSalaryAdvanceInput(value: unknown): SalaryAdvanceInput {
  const input = asRecord(value, 'Advance');
  return {
    employeeId: recordId(input.employeeId),
    date: isoDate(input.date, 'Advance date'),
    amount: money(input.amount, 'Advance amount', { allowZero: false }),
    note: text(input.note, 'Note', { max: 200 }),
  };
}

export function validateSalaryAdvanceInputs(
  value: unknown,
): SalaryAdvanceInput[] {
  return nonEmptyList(value, 'Advances', 2000).map(validateSalaryAdvanceInput);
}

export function validatePayslipInput(value: unknown): PayslipInput {
  const input = asRecord(value, 'Payslip');
  const days = (key: string, label: string) =>
    quantity(input[key], label, { max: 31, integer: true });
  const amount = (key: string, label: string) =>
    money(input[key], label, { allowZero: true });
  return {
    employeeId: recordId(input.employeeId),
    month: calendarMonth(input.month, 'Payslip month'),
    workingDays: days('workingDays', 'Working days'),
    presentDays: days('presentDays', 'Present days'),
    absentDays: days('absentDays', 'Absent days'),
    leaveDays: days('leaveDays', 'Leave days'),
    // Not sent by payslips saved before vacation was added.
    vacationDays:
      input.vacationDays === undefined
        ? 0
        : days('vacationDays', 'Vacation days'),
    holidayDays: days('holidayDays', 'Holiday days'),
    hoursWorked: quantity(input.hoursWorked, 'Hours worked', { max: 744 }),
    basicSalary: amount('basicSalary', 'Basic salary'),
    hourlyRate: amount('hourlyRate', 'Rate per hour'),
    basicPay: amount('basicPay', 'Basic pay'),
    overtimeHours: quantity(input.overtimeHours, 'Overtime hours', {
      max: 744,
    }),
    overtimeRate: amount('overtimeRate', 'Overtime rate'),
    allowance: amount('allowance', 'Allowance'),
    absenceDeduction: amount('absenceDeduction', 'Absence / leave deduction'),
    absenceFine: amount('absenceFine', 'Absence fine'),
    advanceDeduction: amount('advanceDeduction', 'Advance deduction'),
    otherDeduction: amount('otherDeduction', 'Other deduction'),
    note: text(input.note, 'Note', { max: 300 }),
  };
}

export function validatePayslipInputs(value: unknown): PayslipInput[] {
  const inputs = nonEmptyList(value, 'Payslips', 2000).map(
    validatePayslipInput,
  );
  const keys = new Set(
    inputs.map((input) => `${input.employeeId}|${input.month}`),
  );
  if (keys.size !== inputs.length)
    fail('An employee has two payslips for one month.');
  return inputs;
}

export function validatePaidDate(value: unknown): string | null {
  return value === null ? null : isoDate(value, 'Paid date');
}

export function recordIds(value: unknown): string[] {
  return [...new Set(nonEmptyList(value, 'Payslips', 2000).map(recordId))];
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be yes or no.`);
  return value;
}

export function validatePayrollSettings(value: unknown): PayrollSettings {
  const input = asRecord(value, 'Payroll settings');
  return {
    overtimeBaseRate: money(input.overtimeBaseRate, 'Overtime base rate', {
      allowZero: true,
    }),
    overtimeMultiplier: quantity(
      input.overtimeMultiplier,
      'Overtime multiplier',
      {
        max: 10,
      },
    ),
    absenceFine: money(input.absenceFine, 'Absence fine', { allowZero: true }),
    absenceFineFreeDays: quantity(
      input.absenceFineFreeDays,
      'Absent days without a fine',
      { max: 31, integer: true },
    ),
    leavePaid: flag(input.leavePaid, 'Leave paid'),
    vacationPaid: flag(input.vacationPaid, 'Vacation paid'),
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
