import { AppError } from '../shared/errors';
import {
  AttachmentUpload,
  BackupFileInfo,
  BackupSettings,
  BudgetTransaction,
  BudgetTransactionInput,
  Employee,
  EmployeeInput,
  Expense,
  ExpenseInput,
  FinanceApi,
  FinanceSnapshot,
} from '../shared/types';
import {
  pastMonth,
  validateBudgetTransactionInput,
  validateEmployeeInput,
  validateExpenseInput,
  validateUploads,
} from '../shared/validation';
import { assertMonthsOpen, monthKey } from '../shared/months';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_DEPARTMENTS,
} from '../renderer/expenses/model';

// Data is plain JSON, so this is a full deep copy (jsdom lacks structuredClone).
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

let nextId = 1;
function newId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  nextId += 1;
  return `memory-${nextId}`;
}

function toExpense(
  id: string,
  input: ExpenseInput,
  previous?: Expense,
): Expense {
  const total = Math.round((input.amountExcludingVat + input.vat) * 100) / 100;
  return {
    id,
    date: input.date,
    payee: input.payee,
    description: input.particulars,
    particulars: input.particulars,
    category: input.category,
    type: input.category,
    department: input.department,
    paymentMethod: input.paymentMethod,
    projectName: input.projectName,
    invoiceNo: input.invoiceNo,
    siteName: input.siteName,
    vatNo: input.vatNo,
    amountExcludingVat: input.amountExcludingVat,
    vat: input.vat,
    amountIncludingVat: total,
    amount: total,
    attachments: previous?.attachments ?? [],
    createdAt: previous?.createdAt ?? Date.now(),
  };
}

function toPayment(
  id: string,
  input: BudgetTransactionInput,
  previous?: BudgetTransaction,
): BudgetTransaction {
  return { id, ...input, createdAt: previous?.createdAt ?? Date.now() };
}

/**
 * An in-memory implementation of the database API with the same validation
 * and rules as the PostgreSQL one, for tests.
 */
export default function createMemoryApi(seed: Partial<FinanceSnapshot> = {}) {
  const state: FinanceSnapshot = {
    expenses: [...(seed.expenses ?? [])],
    budgetTransactions: [...(seed.budgetTransactions ?? [])],
    categories: [...(seed.categories ?? DEFAULT_CATEGORIES)],
    departments: [...(seed.departments ?? DEFAULT_DEPARTMENTS)],
    employees: [...(seed.employees ?? [])],
    reopenedMonths: [...(seed.reopenedMonths ?? [])],
  };
  const assertOpen = (...dates: string[]) =>
    assertMonthsOpen(dates, state.reopenedMonths);
  const files = new Map<string, AttachmentUpload>();
  const backups: BackupFileInfo[] = [];
  let backupSettings: BackupSettings = {
    directory: '/backups',
    automaticEnabled: true,
    intervalHours: 24,
    keep: 14,
  };

  function storeFiles(uploads: AttachmentUpload[]) {
    return uploads.map((upload) => {
      const id = newId();
      files.set(id, upload);
      return {
        id,
        name: upload.name,
        type: upload.type,
        size: upload.data.byteLength,
      };
    });
  }

  function findExpense(id: string) {
    const expense = state.expenses.find((item) => item.id === id);
    if (!expense)
      throw new AppError('NOT_FOUND', 'That expense no longer exists.');
    return expense;
  }

  /** Same as the database: a new type or department is added to its list. */
  function withListNames(input: ExpenseInput): ExpenseInput {
    const ensure = (key: 'categories' | 'departments', name: string) => {
      const existing = state[key].find(
        (item) => item.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing;
      state[key] = [...state[key], name];
      return name;
    };
    return {
      ...input,
      category: ensure('categories', input.category),
      department: input.department
        ? ensure('departments', input.department)
        : '',
    };
  }

  /** Same rules as the database: Iqama numbers are unique. */
  function saveEmployee(id: string, rawInput: EmployeeInput): Employee {
    const input = validateEmployeeInput(rawInput);
    const owner = state.employees.find(
      (item) =>
        item.id !== id &&
        item.iqamaNo.toLowerCase() === input.iqamaNo.toLowerCase(),
    );
    if (owner) {
      throw new AppError(
        'CONFLICT',
        `Iqama no. ${input.iqamaNo} already belongs to ${owner.name}.`,
      );
    }
    const previous = state.employees.find((item) => item.id === id);
    const employee = { id, ...input };
    state.employees = previous
      ? state.employees.map((item) => (item.id === id ? employee : item))
      : [...state.employees, employee];
    if (
      previous &&
      previous.name !== employee.name &&
      !state.employees.some((item) => item.name === previous.name)
    ) {
      state.expenses = state.expenses.map((e) =>
        e.payee === previous.name ? { ...e, payee: employee.name } : e,
      );
      state.budgetTransactions = state.budgetTransactions.map((p) =>
        p.paidBy === previous.name ? { ...p, paidBy: employee.name } : p,
      );
    }
    return { ...employee };
  }

  const api: FinanceApi = {
    database: {
      status: async () => ({
        connected: true,
        source: 'settings',
        settings: {
          host: 'memory',
          port: 5432,
          database: 'moon_finance',
          user: 'test',
          ssl: false,
        },
        serverVersion: 'in-memory',
      }),
      test: async () => 'in-memory',
      connect: async () => api.database.status(),
    },
    data: {
      load: async () => clone(state),
      importLegacy: async () => {
        throw new AppError('CONFLICT', 'Not supported in memory.');
      },
    },
    expenses: {
      create: async (rawInput, rawFiles) => {
        const input = validateExpenseInput(rawInput);
        assertOpen(input.date);
        const expense = toExpense(newId(), withListNames(input));
        expense.attachments = storeFiles(validateUploads(rawFiles));
        state.expenses = [expense, ...state.expenses];
        return clone(expense);
      },
      update: async (id, rawInput, rawFiles) => {
        const input = validateExpenseInput(rawInput);
        const previous = findExpense(id);
        assertOpen(previous.date, input.date);
        const expense = toExpense(id, withListNames(input), previous);
        expense.attachments = [
          ...(previous.attachments ?? []),
          ...storeFiles(validateUploads(rawFiles)),
        ];
        state.expenses = state.expenses.map((item) =>
          item.id === id ? expense : item,
        );
        return clone(expense);
      },
      remove: async (id) => {
        const expense = findExpense(id);
        assertOpen(expense.date);
        expense.attachments?.forEach((attachment) =>
          files.delete(attachment.id),
        );
        state.expenses = state.expenses.filter((item) => item.id !== id);
      },
      attachment: async (id) => files.get(id),
      openAttachment: async () => undefined,
    },
    budgets: {
      create: async (rawInput) => {
        const input = validateBudgetTransactionInput(rawInput);
        assertOpen(input.date);
        const payment = toPayment(newId(), input);
        state.budgetTransactions = [payment, ...state.budgetTransactions];
        return { ...payment };
      },
      update: async (id, rawInput) => {
        const previous = state.budgetTransactions.find(
          (item) => item.id === id,
        );
        if (!previous) {
          throw new AppError(
            'NOT_FOUND',
            'That budget payment no longer exists.',
          );
        }
        const input = validateBudgetTransactionInput(rawInput);
        assertOpen(previous.date, input.date);
        const payment = toPayment(id, input, previous);
        state.budgetTransactions = state.budgetTransactions.map((item) =>
          item.id === id ? payment : item,
        );
        return { ...payment };
      },
      remove: async (id) => {
        const payment = state.budgetTransactions.find((item) => item.id === id);
        if (payment) assertOpen(payment.date);
        state.budgetTransactions = state.budgetTransactions.filter(
          (item) => item.id !== id,
        );
      },
    },
    employees: {
      create: async (input) => saveEmployee(newId(), input),
      update: async (id, input) => {
        if (!state.employees.some((item) => item.id === id)) {
          throw new AppError('NOT_FOUND', 'That employee no longer exists.');
        }
        return saveEmployee(id, input);
      },
      remove: async (id) => {
        state.employees = state.employees.filter((item) => item.id !== id);
      },
    },
    months: {
      reopen: async (rawMonth) => {
        const month = pastMonth(rawMonth, monthKey());
        if (!state.reopenedMonths.includes(month)) {
          state.reopenedMonths = [...state.reopenedMonths, month].sort();
        }
      },
      close: async (rawMonth) => {
        const month = pastMonth(rawMonth, monthKey());
        state.reopenedMonths = state.reopenedMonths.filter(
          (item) => item !== month,
        );
      },
    },
    backup: {
      settings: async () => ({ ...backupSettings }),
      updateSettings: async (settings) => {
        backupSettings = { ...backupSettings, ...settings };
        return { ...backupSettings };
      },
      chooseDirectory: async () => undefined,
      openDirectory: async () => undefined,
      list: async () => [...backups],
      create: async () => {
        const createdAt = new Date().toISOString();
        const backup: BackupFileInfo = {
          fileName: `moon-finance_manual_${createdAt}.mfbackup`,
          path: `/backups/${backups.length}`,
          kind: 'manual',
          createdAt,
          sizeBytes: JSON.stringify(state).length,
        };
        backups.unshift(backup);
        return backup;
      },
      saveAs: async () => undefined,
      inspect: async () => {
        throw new AppError('BACKUP_INVALID', 'Not supported in memory.');
      },
      chooseFile: async () => undefined,
      restore: async () => {
        throw new AppError('BACKUP_INVALID', 'Not supported in memory.');
      },
    },
    reports: {
      savePdf: async (fileName) => `/reports/${fileName}.pdf`,
    },
  };

  return { api, snapshot: () => clone(state) };
}
