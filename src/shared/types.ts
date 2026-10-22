import type { EmployeeRole } from './employeeRoles';

/**
 * Types shared by the main process (database, backups) and the renderer (UI).
 * Anything that crosses the IPC boundary must be defined here.
 */

export type ExpenseAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
};

export type Expense = {
  id: string;
  date: string;
  payee: string;
  description: string;
  category: string;
  department: string;
  paymentMethod: string;
  amount: number;
  particulars?: string;
  projectName?: string;
  invoiceNo?: string;
  siteName?: string;
  vatNo?: string;
  amountExcludingVat?: number;
  vat?: number;
  amountIncludingVat?: number;
  type?: string;
  attachments?: ExpenseAttachment[];
  createdAt?: number;
  /** Fixed position in entry order (1 = first ever entered). Set by the UI. */
  serialNo?: number;
};

export type BudgetTransaction = {
  id: string;
  date: string;
  amount: number;
  paidBy?: string;
  paymentMethod?: 'Cash' | 'Card';
  note: string;
  createdAt?: number;
  /** Fixed position in entry order (1 = first ever entered). Set by the UI. */
  serialNo?: number;
};

/** Fields the user edits for an expense. Totals are derived by the database. */
export type ExpenseInput = {
  date: string;
  payee: string;
  particulars: string;
  category: string;
  department: string;
  paymentMethod: string;
  projectName: string;
  invoiceNo: string;
  siteName: string;
  vatNo: string;
  amountExcludingVat: number;
  vat: number;
};

export type Employee = {
  id: string;
  name: string;
  nickname: string;
  role: EmployeeRole;
  iqamaNo: string;
  designation: string;
  projectName: string;
  phoneNo: string;
  insuranceNo: string;
  /** Monthly salary in SAR, or null when not recorded. */
  salary: number | null;
  /** 'YYYY-MM-DD', or '' when not recorded. */
  iqamaExpiry: string;
  campName: string;
  /** Basic hours a day; hours worked beyond this are overtime. */
  workHoursPerDay: number;
  /** SAR per hour for outsource workers, or null when not recorded. */
  hourlyRate: number | null;
  /** Last working day 'YYYY-MM-DD' if terminated, otherwise ''. Pay stops after it. */
  terminationDate: string;
};

/** Fields the user edits for an employee. */
export type EmployeeInput = Omit<Employee, 'id'>;

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'leave'
  | 'vacation'
  | 'holiday';

/** One employee's attendance on one day. Staff have no attendance. */
export type AttendanceEntry = {
  employeeId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  status: AttendanceStatus;
  /** Hours worked that day (0 unless present). */
  hours: number;
  note: string;
};

/** A row of the daily attendance sheet; a null status clears the day. */
export type AttendanceDayInput = {
  employeeId: string;
  status: AttendanceStatus | null;
  hours: number;
  note: string;
};

export type SalaryAdvance = {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  note: string;
  createdAt?: number;
};

export type SalaryAdvanceInput = Omit<SalaryAdvance, 'id' | 'createdAt'>;

/** 'given': cash handed to the worker. 'received': an amount they settled with you. */
export type PettyCashKind = 'given' | 'received';

/** One movement of petty cash; a worker's balance is given minus received. */
export type PettyCashTransaction = {
  id: string;
  employeeId: string;
  date: string;
  kind: PettyCashKind;
  amount: number;
  /** A short description, e.g. what the cash was for. */
  note: string;
  /** Longer free-text remarks. */
  remarks: string;
  /** Reference documents such as receipts or a signed slip. */
  attachments: ExpenseAttachment[];
  createdAt: number;
};

export type PettyCashInput = Pick<
  PettyCashTransaction,
  'employeeId' | 'date' | 'kind' | 'amount' | 'note' | 'remarks'
>;

/** One bill or payment on a petty cash voucher. */
export type VoucherLine = {
  /** The bill's date, 'YYYY-MM-DD', or '' when it has none. */
  date: string;
  particulars: string;
  supplier: string;
  vatNo: string;
  invoiceNo: string;
  /** Optional VAT breakdown of `amount`. */
  amountExclVat: number | null;
  vatAmount: number | null;
  /** What was paid, including VAT. */
  amount: number;
};

/** A titled group of lines, e.g. a project or "Materials & other expenses". */
export type VoucherSection = { title: string; lines: VoucherLine[] };

/** Cash the employee received for the voucher, e.g. 3,000 from Imran. */
export type VoucherReceipt = {
  date: string;
  receivedFrom: string;
  amount: number;
};

/**
 * A petty cash voucher: the cash an employee received, then every bill
 * they paid from it, in sections. What is left is received minus spent.
 */
export type PettyCashVoucher = {
  id: string;
  /** The voucher no., e.g. 'MOON/PCV/2026-001' */
  refNo: string;
  date: string;
  /** The employee who received the cash; null on vouchers made before. */
  employeeId: string | null;
  receipts: VoucherReceipt[];
  sections: VoucherSection[];
  createdBy: string;
  verifiedBy: string;
  approvedBy: string;
  createdAt: number;
};

export type PettyCashVoucherInput = Omit<
  PettyCashVoucher,
  'id' | 'createdAt' | 'employeeId'
> & { employeeId: string };

export type PayslipStatus = 'unpaid' | 'paid';

/**
 * Every amount on a payslip is editable. The defaults come from attendance,
 * advances and the payroll settings (see shared/payroll.ts).
 */
export type PayslipInput = {
  employeeId: string;
  /** 'YYYY-MM' */
  month: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  vacationDays: number;
  holidayDays: number;
  hoursWorked: number;
  /** Monthly basic salary (company, camp and staff). */
  basicSalary: number;
  /** SAR per hour (outsource workers). */
  hourlyRate: number;
  /** Earned from the basic salary or hourly rate, before deductions. */
  basicPay: number;
  /** Regular-day overtime: hours beyond the basic hours on a working day. */
  overtimeHours: number;
  overtimeRate: number;
  /** Friday overtime: every hour worked on a Friday. */
  weekendOvertimeHours: number;
  weekendOvertimeRate: number;
  allowance: number;
  /** Unpaid vacation: a day's salary for each vacation day, if unpaid. */
  absenceDeduction: number;
  /** Unpaid leave: a day's salary for each absent or leave day beyond the paid ones. */
  absenceFine: number;
  advanceDeduction: number;
  otherDeduction: number;
  note: string;
};

export type Payslip = PayslipInput & {
  id: string;
  /** Employee details as they were when the payslip was last saved. */
  employeeName: string;
  iqamaNo: string;
  role: EmployeeRole;
  designation: string;
  projectName: string;
  campName: string;
  overtimePay: number;
  netPay: number;
  status: PayslipStatus;
  /** 'YYYY-MM-DD' when paid, otherwise ''. */
  paidDate: string;
};

export type PayrollSettings = {
  /** Regular-day overtime pays the per-hour salary × this (1.25). */
  overtimeMultiplier: number;
  /** Friday overtime pays the per-hour salary × this (1.5). */
  weekendOvertimeMultiplier: number;
  /** A day's salary is the basic salary ÷ this (30). */
  salaryDays: number;
  /** Absent and leave days in a month that are still paid (1). */
  paidDaysOff: number;
  /** Paid leave is not counted as a day off at all. */
  leavePaid: boolean;
  vacationPaid: boolean;
};

export type BudgetTransactionInput = {
  date: string;
  amount: number;
  paidBy: string;
  paymentMethod: 'Cash' | 'Card';
  note: string;
};

export type AttachmentUpload = {
  name: string;
  type: string;
  data: Uint8Array;
};

export type AttachmentContent = {
  name: string;
  type: string;
  data: Uint8Array;
};

/** A stored file such as a signature sheet, filed by date and project. */
export type DocumentRecord = {
  id: string;
  title: string;
  category: string;
  projectName: string;
  campName: string;
  /** The day the document is for, 'YYYY-MM-DD'. */
  documentDate: string;
  /** The employee it concerns, or ''. */
  employeeId: string;
  note: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: number;
};

/** Details the user enters for documents; the same for every file uploaded together. */
export type DocumentInput = Pick<
  DocumentRecord,
  | 'title'
  | 'category'
  | 'projectName'
  | 'campName'
  | 'documentDate'
  | 'employeeId'
  | 'note'
>;

export type FinanceSnapshot = {
  expenses: Expense[];
  budgetTransactions: BudgetTransaction[];
  categories: string[];
  departments: string[];
  /** Also the options for an expense's "Paid to" and a budget's payee. */
  employees: Employee[];
  /** Past months ('YYYY-MM') reopened for corrections; others are closed. */
  reopenedMonths: string[];
  /** Attendance is loaded a month at a time instead (attendance.list). */
  salaryAdvances: SalaryAdvance[];
  payslips: Payslip[];
  payrollSettings: PayrollSettings;
  /** Uploaded documents, without their file contents. */
  documents: DocumentRecord[];
  pettyCash: PettyCashTransaction[];
  pettyCashVouchers: PettyCashVoucher[];
};

/** Data saved in localStorage/IndexedDB by the pre-database version of the app. */
export type LegacyImportPayload = {
  expenses: (Expense & { attachmentFiles?: AttachmentUpload[] })[];
  budgetTransactions: BudgetTransaction[];
  categories: string[];
  departments: string[];
};

export type LegacyImportResult = {
  expenses: number;
  budgetTransactions: number;
  attachments: number;
};

export type DatabaseConnectionSettings = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

export type DatabaseStatus = {
  connected: boolean;
  /** Where the connection settings come from. `env` = DATABASE_URL. */
  source: 'env' | 'settings' | 'none';
  settings?: Omit<DatabaseConnectionSettings, 'password'>;
  serverVersion?: string;
  error?: string;
};

export type BackupKind = 'automatic' | 'manual' | 'pre-restore';

export type BackupCounts = {
  expenses: number;
  attachments: number;
  budgetTransactions: number;
  categories: number;
  departments: number;
  employees: number;
  attendance: number;
  salaryAdvances: number;
  payslips: number;
  documents: number;
  pettyCash: number;
  pettyCashAttachments: number;
  pettyCashVouchers: number;
};

export type BackupFileInfo = {
  fileName: string;
  path: string;
  kind: BackupKind;
  createdAt: string;
  sizeBytes: number;
};

export type BackupDetails = BackupFileInfo & {
  counts: BackupCounts;
  appVersion: string;
  schemaVersion: number;
};

export type BackupSettings = {
  directory: string;
  automaticEnabled: boolean;
  intervalHours: number;
  keep: number;
  lastAutomaticBackupAt?: string;
};

export type RestoreResult = {
  restored: BackupCounts;
  safetyBackup: BackupFileInfo;
};

export type FinanceApi = {
  database: {
    status: () => Promise<DatabaseStatus>;
    test: (settings: DatabaseConnectionSettings) => Promise<string>;
    connect: (settings: DatabaseConnectionSettings) => Promise<DatabaseStatus>;
  };
  data: {
    load: () => Promise<FinanceSnapshot>;
    importLegacy: (payload: LegacyImportPayload) => Promise<LegacyImportResult>;
  };
  expenses: {
    create: (
      input: ExpenseInput,
      files: AttachmentUpload[],
    ) => Promise<Expense>;
    update: (
      id: string,
      input: ExpenseInput,
      files: AttachmentUpload[],
    ) => Promise<Expense>;
    remove: (id: string) => Promise<void>;
    attachment: (id: string) => Promise<AttachmentContent | undefined>;
    /** Opens the file in the operating system's default viewer. */
    openAttachment: (id: string) => Promise<void>;
  };
  budgets: {
    create: (input: BudgetTransactionInput) => Promise<BudgetTransaction>;
    update: (
      id: string,
      input: BudgetTransactionInput,
    ) => Promise<BudgetTransaction>;
    remove: (id: string) => Promise<void>;
  };
  employees: {
    create: (input: EmployeeInput) => Promise<Employee>;
    update: (id: string, input: EmployeeInput) => Promise<Employee>;
    remove: (id: string) => Promise<void>;
  };
  attendance: {
    /** Every attendance entry dated in the month ('YYYY-MM'). */
    list: (month: string) => Promise<AttendanceEntry[]>;
    /** Saves the given rows for one date; returns that date's entries. */
    saveDay: (
      date: string,
      rows: AttendanceDayInput[],
    ) => Promise<AttendanceEntry[]>;
  };
  salaryAdvances: {
    /** Several at once, e.g. the same advance for every employee. */
    create: (inputs: SalaryAdvanceInput[]) => Promise<SalaryAdvance[]>;
    update: (id: string, input: SalaryAdvanceInput) => Promise<SalaryAdvance>;
    remove: (id: string) => Promise<void>;
  };
  payslips: {
    /**
     * Creates new payslips. Refused (and nothing saved) if an employee
     * already has one for the month, so it never replaces anyone's edits.
     */
    create: (inputs: PayslipInput[]) => Promise<Payslip[]>;
    /** Creates or replaces each employee's payslip for the month; paid ones are refused. */
    save: (inputs: PayslipInput[]) => Promise<Payslip[]>;
    /** Marks payslips paid on `paidDate`, or unpaid when it is null. */
    setPaid: (ids: string[], paidDate: string | null) => Promise<Payslip[]>;
    remove: (id: string) => Promise<void>;
  };
  documents: {
    /** Stores each file as its own document with the same details. */
    upload: (
      input: DocumentInput,
      files: AttachmentUpload[],
    ) => Promise<DocumentRecord[]>;
    update: (id: string, input: DocumentInput) => Promise<DocumentRecord>;
    remove: (id: string) => Promise<void>;
    /** Opens the file in the operating system's default viewer. */
    open: (id: string) => Promise<void>;
    /** Saves a copy where the user chooses; undefined when cancelled. */
    saveAs: (id: string) => Promise<string | undefined>;
  };
  pettyCash: {
    create: (
      input: PettyCashInput,
      files: AttachmentUpload[],
    ) => Promise<PettyCashTransaction>;
    /** Adds `files` and removes the attachments in `removeAttachmentIds`. */
    update: (
      id: string,
      input: PettyCashInput,
      files: AttachmentUpload[],
      removeAttachmentIds: string[],
    ) => Promise<PettyCashTransaction>;
    remove: (id: string) => Promise<void>;
    /** Opens the file in the operating system's default viewer. */
    openAttachment: (id: string) => Promise<void>;
  };
  vouchers: {
    create: (input: PettyCashVoucherInput) => Promise<PettyCashVoucher>;
    update: (
      id: string,
      input: PettyCashVoucherInput,
    ) => Promise<PettyCashVoucher>;
    remove: (id: string) => Promise<void>;
  };
  payroll: {
    updateSettings: (settings: PayrollSettings) => Promise<PayrollSettings>;
  };
  months: {
    /** Makes a closed month editable again. */
    reopen: (month: string) => Promise<void>;
    /** Closes a reopened month again. */
    close: (month: string) => Promise<void>;
  };
  backup: {
    settings: () => Promise<BackupSettings>;
    updateSettings: (
      settings: Omit<BackupSettings, 'directory' | 'lastAutomaticBackupAt'>,
    ) => Promise<BackupSettings>;
    chooseDirectory: () => Promise<BackupSettings | undefined>;
    openDirectory: () => Promise<void>;
    list: () => Promise<BackupFileInfo[]>;
    create: () => Promise<BackupFileInfo>;
    saveAs: () => Promise<BackupFileInfo | undefined>;
    inspect: (path: string) => Promise<BackupDetails>;
    chooseFile: () => Promise<BackupDetails | undefined>;
    restore: (path: string) => Promise<RestoreResult>;
  };
  reports: {
    /** Saves the currently rendered printable report as a PDF; undefined when cancelled. */
    savePdf: (
      fileName: string,
      options?: { landscape?: boolean },
    ) => Promise<string | undefined>;
  };
};

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
