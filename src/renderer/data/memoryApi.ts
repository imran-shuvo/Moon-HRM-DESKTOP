import { AppError } from '../../shared/errors';
import {
  AttachmentUpload,
  BackupFileInfo,
  BackupSettings,
  BudgetTransaction,
  BudgetTransactionInput,
  Expense,
  ExpenseInput,
  FinanceApi,
  FinanceSnapshot,
  ListApi,
} from '../../shared/types';
import {
  listName,
  payeeName,
  validateBudgetTransactionInput,
  validateExpenseInput,
  validateUploads,
} from '../../shared/validation';
import { DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS } from '../expenses/model';

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

/** Distinct non-empty names, first spelling wins, ignoring case. */
function distinctNames(names: (string | undefined)[]) {
  const seen = new Map<string, string>();
  names.forEach((name) => {
    if (name && !seen.has(name.toLowerCase()))
      seen.set(name.toLowerCase(), name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
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
 * and rules as the PostgreSQL one. Used by tests and as a reference.
 */
export default function createMemoryApi(seed: Partial<FinanceSnapshot> = {}) {
  const state: FinanceSnapshot = {
    expenses: [...(seed.expenses ?? [])],
    budgetTransactions: [...(seed.budgetTransactions ?? [])],
    categories: [...(seed.categories ?? DEFAULT_CATEGORIES)],
    departments: [...(seed.departments ?? DEFAULT_DEPARTMENTS)],
    payees:
      seed.payees ??
      distinctNames((seed.expenses ?? []).map((expense) => expense.payee)),
    budgetPayers:
      seed.budgetPayers ??
      distinctNames(
        (seed.budgetTransactions ?? []).map((payment) => payment.paidBy),
      ),
  };
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

  function checkCategory(input: ExpenseInput) {
    if (!state.categories.includes(input.category)) {
      throw new AppError('VALIDATION', 'Choose an existing type.');
    }
  }

  type ListKey = 'categories' | 'departments' | 'payees' | 'budgetPayers';

  /** Same rules as the database: payee lists have no foreign keys. */
  const LISTS: Record<
    ListKey,
    {
      label: string;
      validate: (value: unknown, label: string) => string;
      isUsed: (name: string) => boolean;
      rename: (previous: string, next: string) => void;
    }
  > = {
    categories: {
      label: 'Category',
      validate: listName,
      isUsed: (name) => state.expenses.some((e) => e.category === name),
      rename: (previous, next) => {
        state.expenses = state.expenses.map((e) =>
          e.category === previous ? { ...e, category: next, type: next } : e,
        );
      },
    },
    departments: {
      label: 'Department',
      validate: listName,
      isUsed: (name) => state.expenses.some((e) => e.department === name),
      rename: (previous, next) => {
        state.expenses = state.expenses.map((e) =>
          e.department === previous ? { ...e, department: next } : e,
        );
      },
    },
    payees: {
      label: 'Paid to',
      validate: payeeName,
      isUsed: (name) => state.expenses.some((e) => e.payee === name),
      rename: (previous, next) => {
        state.expenses = state.expenses.map((e) =>
          e.payee === previous ? { ...e, payee: next } : e,
        );
      },
    },
    budgetPayers: {
      label: 'Payee',
      validate: payeeName,
      isUsed: (name) => state.budgetTransactions.some((p) => p.paidBy === name),
      rename: (previous, next) => {
        state.budgetTransactions = state.budgetTransactions.map((p) =>
          p.paidBy === previous ? { ...p, paidBy: next } : p,
        );
      },
    },
  };

  /** Returns the stored spelling of `name`, adding it if it is new. */
  function ensureListItem(key: 'payees' | 'budgetPayers', name: string) {
    const existing = state[key].find(
      (item) => item.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    state[key] = [...state[key], name];
    return name;
  }

  function listApi(key: ListKey): ListApi {
    const { label, validate, isUsed, rename } = LISTS[key];
    const exists = (name: string) =>
      state[key].some((item) => item.toLowerCase() === name.toLowerCase());
    return {
      add: async (value: string) => {
        const name = validate(value, label);
        if (exists(name))
          throw new AppError('CONFLICT', 'That name already exists.');
        state[key] = [...state[key], name];
      },
      rename: async (previous: string, next: string) => {
        const name = validate(next, label);
        if (name.toLowerCase() !== previous.toLowerCase() && exists(name)) {
          throw new AppError('CONFLICT', 'That name already exists.');
        }
        state[key] = state[key].map((item) =>
          item === previous ? name : item,
        );
        rename(previous, name);
      },
      remove: async (name: string) => {
        if (isUsed(name)) {
          throw new AppError(
            'IN_USE',
            'This item is still used by existing transactions. Edit those transactions first.',
          );
        }
        const isPayeeList = key === 'payees' || key === 'budgetPayers';
        if (!isPayeeList && state[key].length <= 1) {
          throw new AppError(
            'VALIDATION',
            'Keep at least one option available.',
          );
        }
        state[key] = state[key].filter((item) => item !== name);
      },
    };
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
        checkCategory(input);
        input.payee = ensureListItem('payees', input.payee);
        const expense = toExpense(newId(), input);
        expense.attachments = storeFiles(validateUploads(rawFiles));
        state.expenses = [expense, ...state.expenses];
        return clone(expense);
      },
      update: async (id, rawInput, rawFiles) => {
        const input = validateExpenseInput(rawInput);
        checkCategory(input);
        input.payee = ensureListItem('payees', input.payee);
        const previous = findExpense(id);
        const expense = toExpense(id, input, previous);
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
        input.paidBy = ensureListItem('budgetPayers', input.paidBy);
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
        input.paidBy = ensureListItem('budgetPayers', input.paidBy);
        const payment = toPayment(id, input, previous);
        state.budgetTransactions = state.budgetTransactions.map((item) =>
          item.id === id ? payment : item,
        );
        return { ...payment };
      },
      remove: async (id) => {
        state.budgetTransactions = state.budgetTransactions.filter(
          (item) => item.id !== id,
        );
      },
    },
    categories: listApi('categories'),
    departments: listApi('departments'),
    payees: listApi('payees'),
    budgetPayers: listApi('budgetPayers'),
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
