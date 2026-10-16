import { AppError } from '../../shared/errors';
import {
  AttachmentContent,
  AttachmentUpload,
  AttendanceDayInput,
  AttendanceEntry,
  BudgetTransaction,
  BudgetTransactionInput,
  DocumentInput,
  DocumentRecord,
  Employee,
  EmployeeInput,
  Expense,
  ExpenseAttachment,
  ExpenseInput,
  FinanceSnapshot,
  LegacyImportPayload,
  LegacyImportResult,
  PayrollSettings,
  Payslip,
  PayslipInput,
  PettyCashInput,
  PettyCashTransaction,
  SalaryAdvance,
  SalaryAdvanceInput,
} from '../../shared/types';
import { EmployeeRole } from '../../shared/employeeRoles';
import { assertNoPayrollHistory, takesAttendance } from '../../shared/payroll';
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

type EmployeeRow = {
  id: string;
  name: string;
  nickname: string;
  role: EmployeeRole;
  iqama_no: string;
  designation: string;
  project_name: string;
  phone_no: string;
  insurance_no: string;
  salary: number | null;
  iqama_expiry: string | null;
  camp_name: string;
  work_hours_per_day: number;
  hourly_rate: number | null;
  termination_date: string | null;
};

type AttendanceRow = {
  employee_id: string;
  work_date: string;
  status: AttendanceEntry['status'];
  hours: number;
  note: string;
};

type AdvanceRow = {
  id: string;
  employee_id: string;
  advance_date: string;
  amount: number;
  note: string;
  created_at: Date;
};

type PettyCashRow = {
  id: string;
  employee_id: string;
  transaction_date: string;
  kind: PettyCashTransaction['kind'];
  amount: number;
  note: string;
  remarks: string;
  created_at: Date;
};

type PettyCashAttachmentRow = {
  id: string;
  transaction_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

type PayslipRow = {
  id: string;
  employee_id: string;
  month: string;
  employee_name: string;
  iqama_no: string;
  role: EmployeeRole;
  designation: string;
  project_name: string;
  camp_name: string;
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  vacation_days: number;
  holiday_days: number;
  hours_worked: number;
  basic_salary: number;
  hourly_rate: number;
  basic_pay: number;
  overtime_hours: number;
  overtime_rate: number;
  weekend_overtime_hours: number;
  weekend_overtime_rate: number;
  allowance: number;
  absence_deduction: number;
  absence_fine: number;
  advance_deduction: number;
  other_deduction: number;
  overtime_pay: number;
  net_pay: number;
  status: Payslip['status'];
  paid_date: string | null;
  note: string;
};

type PayrollSettingsRow = {
  overtime_multiplier: number;
  weekend_overtime_multiplier: number;
  salary_days: number;
  paid_days_off: number;
  leave_paid: boolean;
  vacation_paid: boolean;
};

export type ListTable = 'categories' | 'departments';

const EXPENSE_COLUMNS = `
  id, expense_date, payee, particulars, category, department, payment_method,
  project_name, invoice_no, site_name, vat_no, amount_excluding_vat, vat,
  amount_including_vat, created_at`;

const ATTACHMENT_COLUMNS = 'id, expense_id, file_name, mime_type, size_bytes';

const RECEIPT_COLUMNS =
  'id, received_date, amount, paid_by, payment_method, note, created_at';

const EMPLOYEE_COLUMNS = `
  id, name, nickname, role, iqama_no, designation, project_name, phone_no,
  insurance_no, salary, iqama_expiry, camp_name, work_hours_per_day,
  hourly_rate, termination_date`;

const ATTENDANCE_COLUMNS = 'employee_id, work_date, status, hours, note';

const DOCUMENT_COLUMNS = `
  id, title, category, project_name, camp_name, document_date, employee_id,
  note, file_name, mime_type, size_bytes, created_at`;

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  project_name: string;
  camp_name: string;
  document_date: string;
  employee_id: string | null;
  note: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date;
};

function toDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    projectName: row.project_name,
    campName: row.camp_name,
    documentDate: row.document_date,
    employeeId: row.employee_id ?? '',
    note: row.note,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.created_at.getTime(),
  };
}

const ADVANCE_COLUMNS =
  'id, employee_id, advance_date, amount, note, created_at';

const PETTY_CASH_COLUMNS =
  'id, employee_id, transaction_date, kind, amount, note, remarks, created_at';

const PETTY_CASH_ATTACHMENT_COLUMNS =
  'id, transaction_id, file_name, mime_type, size_bytes';

const PAYSLIP_COLUMNS = `
  id, employee_id, month, employee_name, iqama_no, role, designation,
  project_name, camp_name, working_days, present_days, absent_days,
  leave_days, holiday_days, hours_worked, basic_salary, hourly_rate,
  basic_pay, overtime_hours, overtime_rate, allowance, absence_deduction,
  absence_fine, advance_deduction, other_deduction, overtime_pay, net_pay,
  status, paid_date, note, vacation_days, weekend_overtime_hours,
  weekend_overtime_rate`;

const PAYROLL_SETTINGS_COLUMNS = `overtime_multiplier,
   weekend_overtime_multiplier, salary_days, paid_days_off, leave_paid,
   vacation_paid`;

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

function toPettyCashAttachment(row: PettyCashAttachmentRow): ExpenseAttachment {
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

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    role: row.role,
    iqamaNo: row.iqama_no,
    designation: row.designation,
    projectName: row.project_name,
    phoneNo: row.phone_no,
    insuranceNo: row.insurance_no,
    salary: row.salary,
    iqamaExpiry: row.iqama_expiry ?? '',
    campName: row.camp_name,
    workHoursPerDay: row.work_hours_per_day,
    hourlyRate: row.hourly_rate,
    terminationDate: row.termination_date ?? '',
  };
}

function toAttendance(row: AttendanceRow): AttendanceEntry {
  return {
    employeeId: row.employee_id,
    date: row.work_date,
    status: row.status,
    hours: row.hours,
    note: row.note,
  };
}

function toAdvance(row: AdvanceRow): SalaryAdvance {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.advance_date,
    amount: row.amount,
    note: row.note,
    createdAt: row.created_at.getTime(),
  };
}

function toPettyCash(
  row: PettyCashRow,
  attachments: ExpenseAttachment[],
): PettyCashTransaction {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.transaction_date,
    kind: row.kind,
    amount: row.amount,
    note: row.note,
    remarks: row.remarks,
    attachments,
    createdAt: row.created_at.getTime(),
  };
}

function toPayslip(row: PayslipRow): Payslip {
  return {
    id: row.id,
    employeeId: row.employee_id,
    month: row.month,
    employeeName: row.employee_name,
    iqamaNo: row.iqama_no,
    role: row.role,
    designation: row.designation,
    projectName: row.project_name,
    campName: row.camp_name,
    workingDays: row.working_days,
    presentDays: row.present_days,
    absentDays: row.absent_days,
    leaveDays: row.leave_days,
    vacationDays: row.vacation_days,
    holidayDays: row.holiday_days,
    hoursWorked: row.hours_worked,
    basicSalary: row.basic_salary,
    hourlyRate: row.hourly_rate,
    basicPay: row.basic_pay,
    overtimeHours: row.overtime_hours,
    overtimeRate: row.overtime_rate,
    weekendOvertimeHours: row.weekend_overtime_hours,
    weekendOvertimeRate: row.weekend_overtime_rate,
    allowance: row.allowance,
    absenceDeduction: row.absence_deduction,
    absenceFine: row.absence_fine,
    advanceDeduction: row.advance_deduction,
    otherDeduction: row.other_deduction,
    overtimePay: row.overtime_pay,
    netPay: row.net_pay,
    status: row.status,
    paidDate: row.paid_date ?? '',
    note: row.note,
  };
}

function toPayrollSettings(row: PayrollSettingsRow): PayrollSettings {
  return {
    overtimeMultiplier: row.overtime_multiplier,
    weekendOvertimeMultiplier: row.weekend_overtime_multiplier,
    salaryDays: row.salary_days,
    paidDaysOff: row.paid_days_off,
    leavePaid: row.leave_paid,
    vacationPaid: row.vacation_paid,
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

/**
 * A type or department typed in the expense form is added to its list, and
 * the list's spelling is used, so "materials" matches "Materials".
 */
async function withListNames(
  client: Queryable,
  input: ExpenseInput,
): Promise<ExpenseInput> {
  return {
    ...input,
    category: await ensureListItem(client, 'categories', input.category),
    department: input.department
      ? await ensureListItem(client, 'departments', input.department)
      : '',
  };
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

async function readPayrollSettings(
  client: Queryable,
): Promise<PayrollSettings> {
  const { rows } = await client.query<PayrollSettingsRow>(
    `SELECT ${PAYROLL_SETTINGS_COLUMNS} FROM payroll_settings WHERE id = 1`,
  );
  if (!rows[0]) throw new AppError('INTERNAL', 'Payroll settings are missing.');
  return toPayrollSettings(rows[0]);
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
      const employees = await client.query<EmployeeRow>(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employees ORDER BY lower(name), iqama_no`,
      );
      const reopenedMonths = await listReopenedMonths(client);
      const advances = await client.query<AdvanceRow>(
        `SELECT ${ADVANCE_COLUMNS} FROM salary_advances
         ORDER BY advance_date DESC, created_at DESC`,
      );
      const payslips = await client.query<PayslipRow>(
        `SELECT ${PAYSLIP_COLUMNS} FROM payslips
         ORDER BY month DESC, lower(employee_name), iqama_no`,
      );
      const payrollSettings = await readPayrollSettings(client);
      const documents = await client.query<DocumentRow>(
        `SELECT ${DOCUMENT_COLUMNS} FROM documents
         ORDER BY document_date DESC, created_at DESC`,
      );
      const pettyCash = await client.query<PettyCashRow>(
        `SELECT ${PETTY_CASH_COLUMNS} FROM petty_cash_transactions
         ORDER BY transaction_date DESC, created_at DESC`,
      );
      const pettyCashAttachments = await client.query<PettyCashAttachmentRow>(
        `SELECT ${PETTY_CASH_ATTACHMENT_COLUMNS} FROM petty_cash_attachments
         ORDER BY created_at, file_name`,
      );
      const attachmentsByExpense = new Map<string, ExpenseAttachment[]>();
      attachments.rows.forEach((row) => {
        const list = attachmentsByExpense.get(row.expense_id) ?? [];
        list.push(toAttachment(row));
        attachmentsByExpense.set(row.expense_id, list);
      });
      const attachmentsByPettyCash = new Map<string, ExpenseAttachment[]>();
      pettyCashAttachments.rows.forEach((row) => {
        const list = attachmentsByPettyCash.get(row.transaction_id) ?? [];
        list.push(toPettyCashAttachment(row));
        attachmentsByPettyCash.set(row.transaction_id, list);
      });
      return {
        expenses: expenses.rows.map((row) =>
          toExpense(row, attachmentsByExpense.get(row.id) ?? []),
        ),
        budgetTransactions: receipts.rows.map(toBudgetTransaction),
        categories,
        departments,
        employees: employees.rows.map(toEmployee),
        reopenedMonths,
        salaryAdvances: advances.rows.map(toAdvance),
        payslips: payslips.rows.map(toPayslip),
        payrollSettings,
        documents: documents.rows.map(toDocument),
        pettyCash: pettyCash.rows.map((row) =>
          toPettyCash(row, attachmentsByPettyCash.get(row.id) ?? []),
        ),
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
    const named = await withListNames(client, input);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO expenses
         (expense_date, payee, particulars, category, department,
          payment_method, project_name, invoice_no, site_name, vat_no,
          amount_excluding_vat, vat)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      expenseParams(named),
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
    const named = await withListNames(client, input);
    await client.query(
      `UPDATE expenses SET
         expense_date = $2, payee = $3, particulars = $4, category = $5,
         department = $6, payment_method = $7, project_name = $8,
         invoice_no = $9, site_name = $10, vat_no = $11,
         amount_excluding_vat = $12, vat = $13, updated_at = now()
       WHERE id = $1`,
      [id, ...expenseParams(named)],
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
    const { rows } = await client.query<ReceiptRow>(
      `INSERT INTO budget_receipts
         (received_date, amount, paid_by, payment_method, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${RECEIPT_COLUMNS}`,
      [input.date, input.amount, input.paidBy, input.paymentMethod, input.note],
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
    const { rows } = await client.query<ReceiptRow>(
      `UPDATE budget_receipts SET
         received_date = $2, amount = $3, paid_by = $4, payment_method = $5,
         note = $6, updated_at = now()
       WHERE id = $1
       RETURNING ${RECEIPT_COLUMNS}`,
      [
        id,
        input.date,
        input.amount,
        input.paidBy,
        input.paymentMethod,
        input.note,
      ],
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

function employeeParams(input: EmployeeInput) {
  return [
    input.name,
    input.iqamaNo,
    input.designation,
    input.projectName,
    input.phoneNo,
    input.insuranceNo,
    input.iqamaExpiry || null,
    input.campName,
    input.nickname,
    input.salary,
    input.role,
    input.workHoursPerDay,
    input.hourlyRate,
    input.terminationDate || null,
  ];
}

/** Iqama numbers identify an employee, so two employees never share one. */
async function assertIqamaFree(
  client: Queryable,
  iqamaNo: string,
  exceptId?: string,
) {
  const { rows } = await client.query<{ name: string }>(
    `SELECT name FROM employees
     WHERE lower(iqama_no) = lower($1) AND ($2::uuid IS NULL OR id <> $2)`,
    [iqamaNo, exceptId ?? null],
  );
  if (rows[0]) {
    throw new AppError(
      'CONFLICT',
      `Iqama no. ${iqamaNo} already belongs to ${rows[0].name}.`,
    );
  }
}

export function createEmployee(
  db: Database,
  input: EmployeeInput,
): Promise<Employee> {
  return db.transaction(async (client) => {
    await assertIqamaFree(client, input.iqamaNo);
    const { rows } = await client.query<EmployeeRow>(
      `INSERT INTO employees
         (name, iqama_no, designation, project_name, phone_no, insurance_no,
          iqama_expiry, camp_name, nickname, salary, role,
          work_hours_per_day, hourly_rate, termination_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${EMPLOYEE_COLUMNS}`,
      employeeParams(input),
    );
    return toEmployee(rows[0]);
  });
}

/**
 * A renamed employee's transactions follow the new name, unless another
 * employee still has the old name (then the transactions are ambiguous).
 */
export function updateEmployee(
  db: Database,
  id: string,
  input: EmployeeInput,
): Promise<Employee> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const previous = await client.query<{ name: string }>(
      'SELECT name FROM employees WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!previous.rows[0]) {
      throw new AppError('NOT_FOUND', 'That employee no longer exists.');
    }
    await assertIqamaFree(client, input.iqamaNo, id);
    const { rows } = await client.query<EmployeeRow>(
      `UPDATE employees SET
         name = $2, iqama_no = $3, designation = $4, project_name = $5,
         phone_no = $6, insurance_no = $7, iqama_expiry = $8, camp_name = $9,
         nickname = $10, salary = $11, role = $12, work_hours_per_day = $13,
         hourly_rate = $14, termination_date = $15, updated_at = now()
       WHERE id = $1
       RETURNING ${EMPLOYEE_COLUMNS}`,
      [id, ...employeeParams(input)],
    );
    const oldName = previous.rows[0].name;
    if (oldName !== input.name) {
      const shared = await client.query<{ shared: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM employees WHERE name = $1) AS shared',
        [oldName],
      );
      if (!shared.rows[0].shared) {
        await client.query(
          `UPDATE expenses SET payee = $2, updated_at = now()
           WHERE payee = $1`,
          [oldName, input.name],
        );
        await client.query(
          `UPDATE budget_receipts SET paid_by = $2, updated_at = now()
           WHERE paid_by = $1`,
          [oldName, input.name],
        );
      }
    }
    return toEmployee(rows[0]);
  });
}

/**
 * Transactions keep the name of a deleted employee. An employee with
 * attendance, advances or payslips is never deleted, so payroll history is
 * not lost (the foreign keys also refuse it).
 */
export function deleteEmployee(db: Database, id: string): Promise<void> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const { rows } = await client.query<{
      name: string;
      attendance: boolean;
      advances: boolean;
      payslips: boolean;
      petty_cash: boolean;
    }>(
      `SELECT name,
         EXISTS (SELECT 1 FROM attendance WHERE employee_id = $1) AS attendance,
         EXISTS (SELECT 1 FROM salary_advances WHERE employee_id = $1) AS advances,
         EXISTS (SELECT 1 FROM payslips WHERE employee_id = $1) AS payslips,
         EXISTS (SELECT 1 FROM petty_cash_transactions WHERE employee_id = $1)
           AS petty_cash
       FROM employees WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', 'That employee no longer exists.');
    }
    assertNoPayrollHistory(rows[0].name, {
      ...rows[0],
      pettyCash: rows[0].petty_cash,
    });
    await client.query('DELETE FROM employees WHERE id = $1', [id]);
  });
}

export async function updatePayrollSettings(
  db: Database,
  settings: PayrollSettings,
): Promise<PayrollSettings> {
  const { rows } = await db.query<PayrollSettingsRow>(
    `INSERT INTO payroll_settings
       (id, overtime_multiplier, weekend_overtime_multiplier, salary_days,
        paid_days_off, leave_paid, vacation_paid)
     VALUES (1, $1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       overtime_multiplier = EXCLUDED.overtime_multiplier,
       weekend_overtime_multiplier = EXCLUDED.weekend_overtime_multiplier,
       salary_days = EXCLUDED.salary_days,
       paid_days_off = EXCLUDED.paid_days_off,
       leave_paid = EXCLUDED.leave_paid,
       vacation_paid = EXCLUDED.vacation_paid,
       updated_at = now()
     RETURNING ${PAYROLL_SETTINGS_COLUMNS}`,
    [
      settings.overtimeMultiplier,
      settings.weekendOvertimeMultiplier,
      settings.salaryDays,
      settings.paidDaysOff,
      settings.leavePaid,
      settings.vacationPaid,
    ],
  );
  return toPayrollSettings(rows[0]);
}

type EmployeeLookup = Pick<
  EmployeeRow,
  | 'id'
  | 'name'
  | 'iqama_no'
  | 'role'
  | 'designation'
  | 'project_name'
  | 'camp_name'
  | 'termination_date'
>;

/** Locks and returns the employees, or refuses if any no longer exists. */
async function lockEmployees(
  client: Queryable,
  ids: string[],
): Promise<Map<string, EmployeeLookup>> {
  ids.forEach(assertUuid);
  const unique = [...new Set(ids)];
  const { rows } = await client.query<EmployeeLookup>(
    `SELECT id, name, iqama_no, role, designation, project_name, camp_name,
            termination_date
     FROM employees WHERE id = ANY($1::uuid[]) FOR SHARE`,
    [unique],
  );
  if (rows.length !== unique.length) {
    throw new AppError(
      'NOT_FOUND',
      'An employee no longer exists. Refresh and try again.',
    );
  }
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listAttendance(
  db: Database,
  month: string,
): Promise<AttendanceEntry[]> {
  const { rows } = await db.query<AttendanceRow>(
    `SELECT ${ATTENDANCE_COLUMNS} FROM attendance
     WHERE work_date >= ($1 || '-01')::date
       AND work_date < ($1 || '-01')::date + interval '1 month'
     ORDER BY work_date, employee_id`,
    [month],
  );
  return rows.map(toAttendance);
}

/**
 * Saves only the rows given, so two people recording different employees
 * on the same day never overwrite each other. A null status clears a day.
 */
export function saveAttendanceDay(
  db: Database,
  date: string,
  rows: AttendanceDayInput[],
): Promise<AttendanceEntry[]> {
  return db.transaction(async (client) => {
    const employees = await lockEmployees(
      client,
      rows.map((row) => row.employeeId),
    );
    const staff = [...employees.values()].find(
      (employee) => !takesAttendance(employee.role),
    );
    if (staff) {
      throw new AppError(
        'VALIDATION',
        `${staff.name} is staff, and staff have no attendance.`,
      );
    }
    // A day can still be cleared after termination, but not recorded.
    const ended = rows
      .filter((row) => row.status !== null)
      .map((row) => employees.get(row.employeeId) as EmployeeLookup)
      .find(
        (employee) =>
          employee.termination_date && date > employee.termination_date,
      );
    if (ended) {
      throw new AppError(
        'VALIDATION',
        `${ended.name}'s last working day was ${ended.termination_date}, so no attendance can be recorded after it.`,
      );
    }
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const row of rows) {
      if (row.status === null) {
        await client.query(
          'DELETE FROM attendance WHERE employee_id = $1 AND work_date = $2',
          [row.employeeId, date],
        );
      } else {
        await client.query(
          `INSERT INTO attendance (employee_id, work_date, status, hours, note)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (employee_id, work_date) DO UPDATE SET
             status = EXCLUDED.status, hours = EXCLUDED.hours,
             note = EXCLUDED.note, updated_at = now()`,
          [row.employeeId, date, row.status, row.hours, row.note],
        );
      }
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
    const saved = await client.query<AttendanceRow>(
      `SELECT ${ATTENDANCE_COLUMNS} FROM attendance WHERE work_date = $1
       ORDER BY employee_id`,
      [date],
    );
    return saved.rows.map(toAttendance);
  });
}

export function createSalaryAdvances(
  db: Database,
  inputs: SalaryAdvanceInput[],
): Promise<SalaryAdvance[]> {
  return db.transaction(async (client) => {
    await lockEmployees(
      client,
      inputs.map((input) => input.employeeId),
    );
    const saved: SalaryAdvance[] = [];
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const input of inputs) {
      const { rows } = await client.query<AdvanceRow>(
        `INSERT INTO salary_advances (employee_id, advance_date, amount, note)
         VALUES ($1, $2, $3, $4)
         RETURNING ${ADVANCE_COLUMNS}`,
        [input.employeeId, input.date, input.amount, input.note],
      );
      saved.push(toAdvance(rows[0]));
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
    return saved;
  });
}

export function updateSalaryAdvance(
  db: Database,
  id: string,
  input: SalaryAdvanceInput,
): Promise<SalaryAdvance> {
  assertUuid(id);
  return db.transaction(async (client) => {
    await lockEmployees(client, [input.employeeId]);
    const { rows } = await client.query<AdvanceRow>(
      `UPDATE salary_advances SET
         employee_id = $2, advance_date = $3, amount = $4, note = $5,
         updated_at = now()
       WHERE id = $1
       RETURNING ${ADVANCE_COLUMNS}`,
      [id, input.employeeId, input.date, input.amount, input.note],
    );
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', 'That advance no longer exists.');
    }
    return toAdvance(rows[0]);
  });
}

export async function deleteSalaryAdvance(
  db: Database,
  id: string,
): Promise<void> {
  assertUuid(id);
  const { rowCount } = await db.query(
    'DELETE FROM salary_advances WHERE id = $1',
    [id],
  );
  if (!rowCount) {
    throw new AppError('NOT_FOUND', 'That advance no longer exists.');
  }
}

async function insertPettyCashAttachments(
  client: Queryable,
  transactionId: string,
  files: AttachmentUpload[],
): Promise<void> {
  // eslint-disable-next-line no-restricted-syntax
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO petty_cash_attachments
         (transaction_id, file_name, mime_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        transactionId,
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

async function loadPettyCash(
  client: Queryable,
  id: string,
): Promise<PettyCashTransaction> {
  const { rows } = await client.query<PettyCashRow>(
    `SELECT ${PETTY_CASH_COLUMNS} FROM petty_cash_transactions WHERE id = $1`,
    [id],
  );
  if (!rows[0]) {
    throw new AppError('NOT_FOUND', 'That petty cash entry no longer exists.');
  }
  const attachments = await client.query<PettyCashAttachmentRow>(
    `SELECT ${PETTY_CASH_ATTACHMENT_COLUMNS} FROM petty_cash_attachments
     WHERE transaction_id = $1 ORDER BY created_at, file_name`,
    [id],
  );
  return toPettyCash(rows[0], attachments.rows.map(toPettyCashAttachment));
}

export function createPettyCash(
  db: Database,
  input: PettyCashInput,
  files: AttachmentUpload[],
): Promise<PettyCashTransaction> {
  return db.transaction(async (client) => {
    await lockEmployees(client, [input.employeeId]);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO petty_cash_transactions
         (employee_id, transaction_date, kind, amount, note, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        input.employeeId,
        input.date,
        input.kind,
        input.amount,
        input.note,
        input.remarks,
      ],
    );
    await insertPettyCashAttachments(client, rows[0].id, files);
    return loadPettyCash(client, rows[0].id);
  });
}

export function updatePettyCash(
  db: Database,
  id: string,
  input: PettyCashInput,
  files: AttachmentUpload[],
  removeAttachmentIds: string[],
): Promise<PettyCashTransaction> {
  assertUuid(id);
  removeAttachmentIds.forEach(assertUuid);
  return db.transaction(async (client) => {
    await lockEmployees(client, [input.employeeId]);
    const { rowCount } = await client.query(
      `UPDATE petty_cash_transactions SET
         employee_id = $2, transaction_date = $3, kind = $4, amount = $5,
         note = $6, remarks = $7, updated_at = now()
       WHERE id = $1`,
      [
        id,
        input.employeeId,
        input.date,
        input.kind,
        input.amount,
        input.note,
        input.remarks,
      ],
    );
    if (!rowCount) {
      throw new AppError(
        'NOT_FOUND',
        'That petty cash entry no longer exists.',
      );
    }
    // Only this entry's files, so an id from another entry is ignored.
    await client.query(
      `DELETE FROM petty_cash_attachments
       WHERE transaction_id = $1 AND id = ANY($2::uuid[])`,
      [id, removeAttachmentIds],
    );
    await insertPettyCashAttachments(client, id, files);
    return loadPettyCash(client, id);
  });
}

export async function deletePettyCash(db: Database, id: string): Promise<void> {
  assertUuid(id);
  // Its files are removed by ON DELETE CASCADE in the same statement.
  const { rowCount } = await db.query(
    'DELETE FROM petty_cash_transactions WHERE id = $1',
    [id],
  );
  if (!rowCount) {
    throw new AppError('NOT_FOUND', 'That petty cash entry no longer exists.');
  }
}

export async function getPettyCashAttachment(
  db: Database,
  id: string,
): Promise<AttachmentContent | undefined> {
  if (!UUID_PATTERN.test(id)) return undefined;
  const { rows } = await db.query<{
    file_name: string;
    mime_type: string;
    content: Buffer;
  }>(
    'SELECT file_name, mime_type, content FROM petty_cash_attachments WHERE id = $1',
    [id],
  );
  if (!rows[0]) return undefined;
  return {
    name: rows[0].file_name,
    type: rows[0].mime_type,
    data: new Uint8Array(rows[0].content),
  };
}

function existingPayslipError(name: string, month: string) {
  return new AppError(
    'CONFLICT',
    `${name} already has a payslip for ${month}, so nothing was created. Refresh to see it.`,
  );
}

function paidPayslipError(name: string, month: string) {
  return new AppError(
    'CONFLICT',
    `${name}'s payslip for ${month} is already paid. Mark it unpaid first to change it.`,
  );
}

/**
 * Creates or replaces each employee's payslip for its month, in one
 * transaction. A paid payslip is never changed. With `createOnly`, an
 * existing payslip is refused instead of replaced.
 */
export function savePayslips(
  db: Database,
  inputs: PayslipInput[],
  { createOnly = false }: { createOnly?: boolean } = {},
): Promise<Payslip[]> {
  return db.transaction(async (client) => {
    const employees = await lockEmployees(
      client,
      inputs.map((input) => input.employeeId),
    );
    const saved: Payslip[] = [];
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const input of inputs) {
      const employee = employees.get(input.employeeId) as EmployeeLookup;
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM payslips
         WHERE employee_id = $1 AND month = $2 FOR UPDATE`,
        [input.employeeId, input.month],
      );
      if (existing.rows[0]?.status === 'paid') {
        throw paidPayslipError(employee.name, input.month);
      }
      if (existing.rows[0] && createOnly) {
        throw existingPayslipError(employee.name, input.month);
      }
      const { rows } = await client.query<PayslipRow>(
        `INSERT INTO payslips
           (employee_id, month, employee_name, iqama_no, role, designation,
            project_name, camp_name, working_days, present_days, absent_days,
            leave_days, holiday_days, hours_worked, basic_salary, hourly_rate,
            basic_pay, overtime_hours, overtime_rate, allowance,
            absence_deduction, absence_fine, advance_deduction,
            other_deduction, note, vacation_days, weekend_overtime_hours,
            weekend_overtime_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                 $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
                 $27, $28)
         ON CONFLICT (employee_id, month) DO UPDATE SET
           employee_name = EXCLUDED.employee_name,
           iqama_no = EXCLUDED.iqama_no, role = EXCLUDED.role,
           designation = EXCLUDED.designation,
           project_name = EXCLUDED.project_name,
           camp_name = EXCLUDED.camp_name,
           working_days = EXCLUDED.working_days,
           present_days = EXCLUDED.present_days,
           absent_days = EXCLUDED.absent_days,
           leave_days = EXCLUDED.leave_days,
           vacation_days = EXCLUDED.vacation_days,
           holiday_days = EXCLUDED.holiday_days,
           hours_worked = EXCLUDED.hours_worked,
           basic_salary = EXCLUDED.basic_salary,
           hourly_rate = EXCLUDED.hourly_rate,
           basic_pay = EXCLUDED.basic_pay,
           overtime_hours = EXCLUDED.overtime_hours,
           overtime_rate = EXCLUDED.overtime_rate,
           weekend_overtime_hours = EXCLUDED.weekend_overtime_hours,
           weekend_overtime_rate = EXCLUDED.weekend_overtime_rate,
           allowance = EXCLUDED.allowance,
           absence_deduction = EXCLUDED.absence_deduction,
           absence_fine = EXCLUDED.absence_fine,
           advance_deduction = EXCLUDED.advance_deduction,
           other_deduction = EXCLUDED.other_deduction,
           note = EXCLUDED.note, updated_at = now()
         RETURNING ${PAYSLIP_COLUMNS}`,
        [
          input.employeeId,
          input.month,
          employee.name,
          employee.iqama_no,
          employee.role,
          employee.designation,
          employee.project_name,
          employee.camp_name,
          input.workingDays,
          input.presentDays,
          input.absentDays,
          input.leaveDays,
          input.holidayDays,
          input.hoursWorked,
          input.basicSalary,
          input.hourlyRate,
          input.basicPay,
          input.overtimeHours,
          input.overtimeRate,
          input.allowance,
          input.absenceDeduction,
          input.absenceFine,
          input.advanceDeduction,
          input.otherDeduction,
          input.note,
          input.vacationDays,
          input.weekendOvertimeHours,
          input.weekendOvertimeRate,
        ],
      );
      saved.push(toPayslip(rows[0]));
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
    return saved;
  });
}

export function setPayslipsPaid(
  db: Database,
  ids: string[],
  paidDate: string | null,
): Promise<Payslip[]> {
  ids.forEach(assertUuid);
  return db.transaction(async (client) => {
    const { rows } = await client.query<PayslipRow>(
      `UPDATE payslips SET
         status = CASE WHEN $2::date IS NULL THEN 'unpaid' ELSE 'paid' END,
         -- An already paid payslip keeps the date it was paid.
         paid_date = CASE WHEN $2::date IS NULL THEN NULL
                          ELSE coalesce(paid_date, $2::date) END,
         updated_at = now()
       WHERE id = ANY($1::uuid[])
       RETURNING ${PAYSLIP_COLUMNS}`,
      [ids, paidDate],
    );
    if (rows.length !== ids.length) {
      throw new AppError(
        'NOT_FOUND',
        'A payslip no longer exists. Refresh and try again.',
      );
    }
    return rows.map(toPayslip);
  });
}

export function deletePayslip(db: Database, id: string): Promise<void> {
  assertUuid(id);
  return db.transaction(async (client) => {
    const { rows } = await client.query<{
      status: string;
      employee_name: string;
      month: string;
    }>(
      'SELECT status, employee_name, month FROM payslips WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', 'That payslip no longer exists.');
    }
    if (rows[0].status === 'paid') {
      throw paidPayslipError(rows[0].employee_name, rows[0].month);
    }
    await client.query('DELETE FROM payslips WHERE id = $1', [id]);
  });
}

function documentParams(input: DocumentInput) {
  return [
    input.title,
    input.category,
    input.projectName,
    input.campName,
    input.documentDate,
    input.employeeId || null,
    input.note,
  ];
}

/** Each file becomes its own document with the same details, in one transaction. */
export function uploadDocuments(
  db: Database,
  input: DocumentInput,
  files: AttachmentUpload[],
): Promise<DocumentRecord[]> {
  if (files.length === 0) {
    throw new AppError('VALIDATION', 'Choose at least one file to upload.');
  }
  return db.transaction(async (client) => {
    if (input.employeeId) await lockEmployees(client, [input.employeeId]);
    const saved: DocumentRecord[] = [];
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const file of files) {
      const { rows } = await client.query<DocumentRow>(
        `INSERT INTO documents
           (title, category, project_name, camp_name, document_date,
            employee_id, note, file_name, mime_type, size_bytes, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${DOCUMENT_COLUMNS}`,
        [
          ...documentParams(input),
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
      saved.push(toDocument(rows[0]));
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
    return saved;
  });
}

export function updateDocument(
  db: Database,
  id: string,
  input: DocumentInput,
): Promise<DocumentRecord> {
  assertUuid(id);
  return db.transaction(async (client) => {
    if (input.employeeId) await lockEmployees(client, [input.employeeId]);
    const { rows } = await client.query<DocumentRow>(
      `UPDATE documents SET
         title = $2, category = $3, project_name = $4, camp_name = $5,
         document_date = $6, employee_id = $7, note = $8, updated_at = now()
       WHERE id = $1
       RETURNING ${DOCUMENT_COLUMNS}`,
      [id, ...documentParams(input)],
    );
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', 'That document no longer exists.');
    }
    return toDocument(rows[0]);
  });
}

export async function deleteDocument(db: Database, id: string): Promise<void> {
  assertUuid(id);
  const { rowCount } = await db.query('DELETE FROM documents WHERE id = $1', [
    id,
  ]);
  if (!rowCount) {
    throw new AppError('NOT_FOUND', 'That document no longer exists.');
  }
}

export async function getDocumentFile(
  db: Database,
  id: string,
): Promise<AttachmentContent | undefined> {
  if (!UUID_PATTERN.test(id)) return undefined;
  const { rows } = await db.query<{
    file_name: string;
    mime_type: string;
    content: Buffer;
  }>('SELECT file_name, mime_type, content FROM documents WHERE id = $1', [id]);
  if (!rows[0]) return undefined;
  return {
    name: rows[0].file_name,
    type: rows[0].mime_type,
    data: new Uint8Array(rows[0].content),
  };
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
    return {
      expenses: payload.expenses.length,
      budgetTransactions: payload.budgetTransactions.length,
      attachments: attachmentCount,
    };
  });
}
