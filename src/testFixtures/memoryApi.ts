import { AppError } from '../shared/errors';
import {
  AttachmentUpload,
  AttendanceEntry,
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
  Payslip,
} from '../shared/types';
import {
  calendarMonth,
  pastMonth,
  recordId,
  recordIds,
  validateAttendanceDay,
  validateDocumentInput,
  validatePaidDate,
  validatePayrollSettings,
  validatePayslipInputs,
  validateSalaryAdvanceInput,
  validateSalaryAdvanceInputs,
  validateBudgetTransactionInput,
  validateEmployeeInput,
  validateExpenseInput,
  validateUploads,
} from '../shared/validation';
import { assertMonthsOpen, monthKey } from '../shared/months';
import {
  DEFAULT_PAYROLL_SETTINGS,
  assertNoPayrollHistory,
  netPay,
  overtimePay,
  takesAttendance,
} from '../shared/payroll';
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
export default function createMemoryApi(
  seed: Partial<FinanceSnapshot> & { attendance?: AttendanceEntry[] } = {},
) {
  let attendance: AttendanceEntry[] = [...(seed.attendance ?? [])];
  const state: FinanceSnapshot = {
    expenses: [...(seed.expenses ?? [])],
    budgetTransactions: [...(seed.budgetTransactions ?? [])],
    categories: [...(seed.categories ?? DEFAULT_CATEGORIES)],
    departments: [...(seed.departments ?? DEFAULT_DEPARTMENTS)],
    employees: [...(seed.employees ?? [])],
    reopenedMonths: [...(seed.reopenedMonths ?? [])],
    salaryAdvances: [...(seed.salaryAdvances ?? [])],
    payslips: [...(seed.payslips ?? [])],
    payrollSettings: { ...(seed.payrollSettings ?? DEFAULT_PAYROLL_SETTINGS) },
    documents: [...(seed.documents ?? [])],
  };
  const documentFiles = new Map<string, AttachmentUpload>();
  const findEmployee = (id: string) => {
    const employee = state.employees.find((item) => item.id === id);
    if (!employee) {
      throw new AppError(
        'NOT_FOUND',
        'An employee no longer exists. Refresh and try again.',
      );
    }
    return employee;
  };
  const paidError = (payslip: Payslip) =>
    new AppError(
      'CONFLICT',
      `${payslip.employeeName}'s payslip for ${payslip.month} is already paid. Mark it unpaid first to change it.`,
    );
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
        const employee = findEmployee(id);
        assertNoPayrollHistory(employee.name, {
          attendance: attendance.some((entry) => entry.employeeId === id),
          advances: state.salaryAdvances.some((item) => item.employeeId === id),
          payslips: state.payslips.some((item) => item.employeeId === id),
        });
        state.employees = state.employees.filter((item) => item.id !== id);
      },
    },
    attendance: {
      list: async (rawMonth) => {
        const month = calendarMonth(rawMonth);
        return clone(
          attendance
            .filter((entry) => entry.date.startsWith(month))
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
      },
      saveDay: async (rawDate, rawRows) => {
        const { date, rows } = validateAttendanceDay(rawDate, rawRows);
        rows.forEach((row) => {
          const employee = findEmployee(row.employeeId);
          if (!takesAttendance(employee.role)) {
            throw new AppError(
              'VALIDATION',
              `${employee.name} is staff, and staff have no attendance.`,
            );
          }
          if (
            row.status &&
            employee.terminationDate &&
            date > employee.terminationDate
          ) {
            throw new AppError(
              'VALIDATION',
              `${employee.name}'s last working day was ${employee.terminationDate}, so no attendance can be recorded after it.`,
            );
          }
        });
        rows.forEach((row) => {
          attendance = attendance.filter(
            (entry) =>
              !(entry.employeeId === row.employeeId && entry.date === date),
          );
          if (row.status) {
            attendance.push({
              employeeId: row.employeeId,
              date,
              status: row.status,
              hours: row.hours,
              note: row.note,
            });
          }
        });
        return clone(attendance.filter((entry) => entry.date === date));
      },
    },
    salaryAdvances: {
      create: async (rawInputs) => {
        const inputs = validateSalaryAdvanceInputs(rawInputs);
        inputs.forEach((input) => findEmployee(input.employeeId));
        const saved = inputs.map((input) => ({
          id: newId(),
          ...input,
          createdAt: Date.now(),
        }));
        state.salaryAdvances = [...saved, ...state.salaryAdvances];
        return clone(saved);
      },
      update: async (rawId, rawInput) => {
        const id = recordId(rawId);
        const input = validateSalaryAdvanceInput(rawInput);
        findEmployee(input.employeeId);
        const previous = state.salaryAdvances.find((item) => item.id === id);
        if (!previous) {
          throw new AppError('NOT_FOUND', 'That advance no longer exists.');
        }
        const advance = { ...previous, ...input };
        state.salaryAdvances = state.salaryAdvances.map((item) =>
          item.id === id ? advance : item,
        );
        return clone(advance);
      },
      remove: async (rawId) => {
        const id = recordId(rawId);
        if (!state.salaryAdvances.some((item) => item.id === id)) {
          throw new AppError('NOT_FOUND', 'That advance no longer exists.');
        }
        state.salaryAdvances = state.salaryAdvances.filter(
          (item) => item.id !== id,
        );
      },
    },
    payslips: {
      create: async (rawInputs) => {
        const inputs = validatePayslipInputs(rawInputs);
        const existing = state.payslips.find((item) =>
          inputs.some(
            (input) =>
              input.employeeId === item.employeeId &&
              input.month === item.month,
          ),
        );
        if (existing) {
          throw new AppError(
            'CONFLICT',
            `${existing.employeeName} already has a payslip for ${existing.month}, so nothing was created. Refresh to see it.`,
          );
        }
        return api.payslips.save(inputs);
      },
      save: async (rawInputs) => {
        const inputs = validatePayslipInputs(rawInputs);
        // Check everything first, so a refused save changes nothing.
        inputs.forEach((input) => {
          findEmployee(input.employeeId);
          const existing = state.payslips.find(
            (item) =>
              item.employeeId === input.employeeId &&
              item.month === input.month,
          );
          if (existing?.status === 'paid') throw paidError(existing);
        });
        const saved = inputs.map((input) => {
          const employee = findEmployee(input.employeeId);
          const existing = state.payslips.find(
            (item) =>
              item.employeeId === input.employeeId &&
              item.month === input.month,
          );
          const payslip: Payslip = {
            ...input,
            id: existing?.id ?? newId(),
            employeeName: employee.name,
            iqamaNo: employee.iqamaNo,
            role: employee.role,
            designation: employee.designation,
            projectName: employee.projectName,
            campName: employee.campName,
            overtimePay: overtimePay(input),
            netPay: netPay(input),
            status: 'unpaid',
            paidDate: '',
          };
          state.payslips = existing
            ? state.payslips.map((item) =>
                item.id === payslip.id ? payslip : item,
              )
            : [payslip, ...state.payslips];
          return payslip;
        });
        return clone(saved);
      },
      setPaid: async (rawIds, rawPaidDate) => {
        const ids = recordIds(rawIds);
        const paidDate = validatePaidDate(rawPaidDate);
        if (ids.some((id) => !state.payslips.some((item) => item.id === id))) {
          throw new AppError(
            'NOT_FOUND',
            'A payslip no longer exists. Refresh and try again.',
          );
        }
        state.payslips = state.payslips.map((item) => {
          if (!ids.includes(item.id)) return item;
          return paidDate
            ? { ...item, status: 'paid', paidDate: item.paidDate || paidDate }
            : { ...item, status: 'unpaid', paidDate: '' };
        });
        return clone(state.payslips.filter((item) => ids.includes(item.id)));
      },
      remove: async (rawId) => {
        const id = recordId(rawId);
        const payslip = state.payslips.find((item) => item.id === id);
        if (!payslip) {
          throw new AppError('NOT_FOUND', 'That payslip no longer exists.');
        }
        if (payslip.status === 'paid') throw paidError(payslip);
        state.payslips = state.payslips.filter((item) => item.id !== id);
      },
    },
    documents: {
      upload: async (rawInput, rawFiles) => {
        const input = validateDocumentInput(rawInput);
        const uploads = validateUploads(rawFiles);
        if (uploads.length === 0) {
          throw new AppError(
            'VALIDATION',
            'Choose at least one file to upload.',
          );
        }
        if (input.employeeId) findEmployee(input.employeeId);
        const saved = uploads.map((file) => {
          const id = newId();
          documentFiles.set(id, file);
          return {
            id,
            ...input,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.data.byteLength,
            uploadedAt: Date.now(),
          };
        });
        state.documents = [...saved, ...state.documents];
        return clone(saved);
      },
      update: async (rawId, rawInput) => {
        const id = recordId(rawId);
        const input = validateDocumentInput(rawInput);
        const previous = state.documents.find((item) => item.id === id);
        if (!previous) {
          throw new AppError('NOT_FOUND', 'That document no longer exists.');
        }
        const document = { ...previous, ...input };
        state.documents = state.documents.map((item) =>
          item.id === id ? document : item,
        );
        return clone(document);
      },
      remove: async (rawId) => {
        const id = recordId(rawId);
        if (!state.documents.some((item) => item.id === id)) {
          throw new AppError('NOT_FOUND', 'That document no longer exists.');
        }
        documentFiles.delete(id);
        state.documents = state.documents.filter((item) => item.id !== id);
      },
      open: async () => undefined,
      saveAs: async (rawId) => `/documents/${recordId(rawId)}`,
    },
    payroll: {
      updateSettings: async (rawSettings) => {
        state.payrollSettings = validatePayrollSettings(rawSettings);
        return { ...state.payrollSettings };
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

  return {
    api,
    snapshot: () => clone(state),
    attendance: () => clone(attendance),
  };
}
