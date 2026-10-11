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
};

/** Fields the user edits for an employee. */
export type EmployeeInput = Omit<Employee, 'id'>;

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

export type FinanceSnapshot = {
  expenses: Expense[];
  budgetTransactions: BudgetTransaction[];
  categories: string[];
  departments: string[];
  /** Also the options for an expense's "Paid to" and a budget's payee. */
  employees: Employee[];
  /** Past months ('YYYY-MM') reopened for corrections; others are closed. */
  reopenedMonths: string[];
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
    savePdf: (fileName: string) => Promise<string | undefined>;
  };
};

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
