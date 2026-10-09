import type { BudgetTransaction, Expense } from '../../shared/types';

export type Section =
  | 'Overview'
  | 'Transactions'
  | 'Budgets'
  | 'Reports'
  | 'Settings'
  | 'Backup';

export type {
  BudgetTransaction,
  Expense,
  ExpenseAttachment,
} from '../../shared/types';

export type Budget = {
  category: string;
  color: string;
};

export const DEFAULT_CATEGORIES = [
  'Materials',
  'Payroll',
  'Equipment',
  'Travel',
  'Other',
];
export const DEFAULT_DEPARTMENTS = [
  'Operations',
  'Field Services',
  'Administration',
  'Sales',
];
export const CATEGORIES = DEFAULT_CATEGORIES;
export const DEPARTMENTS = DEFAULT_DEPARTMENTS;
export const PAYMENT_METHODS = [
  'Company card',
  'Bank transfer',
  'Cash',
  'Petty cash',
];

export function todayKey() {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

export function monthToDate(expenses: Expense[]) {
  const month = todayKey().slice(0, 7);
  return expenses.filter((expense) => expense.date.startsWith(month));
}

export function getExpenseTotal(expense: Expense) {
  return expense.amountIncludingVat ?? expense.amount;
}

export function getMonthDateRange(date = todayKey()) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${date.slice(0, 7)}-01`,
    end: `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function calculateBudgetForPeriod(
  expenses: Expense[],
  payments: BudgetTransaction[],
  start: string,
  end: string,
) {
  const previousBudget = payments
    .filter((payment) => payment.date < start)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const previousExpenses = expenses
    .filter((expense) => expense.date < start)
    .reduce((sum, expense) => sum + getExpenseTotal(expense), 0);
  const receivedInPeriod = payments
    .filter((payment) => payment.date >= start && payment.date <= end)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const expensesInPeriod = expenses
    .filter((expense) => expense.date >= start && expense.date <= end)
    .reduce((sum, expense) => sum + getExpenseTotal(expense), 0);
  const totalBudget = previousBudget - previousExpenses + receivedInPeriod;

  return {
    totalBudget,
    remainingBudget: totalBudget - expensesInPeriod,
  };
}

export function getMonthlyExpenseSummaries(expenses: Expense[]) {
  const monthlyTotals = new Map<string, { total: number; count: number }>();
  expenses.forEach((expense) => {
    const month = expense.date.slice(0, 7);
    const summary = monthlyTotals.get(month) ?? { total: 0, count: 0 };
    summary.total += getExpenseTotal(expense);
    summary.count += 1;
    monthlyTotals.set(month, summary);
  });

  return [...monthlyTotals.entries()]
    .sort(([monthA], [monthB]) => monthB.localeCompare(monthA))
    .map(([month, summary]) => ({
      month,
      ...summary,
    }));
}

/** e.g. plural(1, 'expense') → '1 expense', plural(2, 'expense') → '2 expenses' */
export function plural(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function normalizeExpense(expense: Expense): Expense {
  const amount = getExpenseTotal(expense);
  return {
    ...expense,
    amount,
    particulars: expense.particulars ?? expense.description ?? '',
    amountExcludingVat: expense.amountExcludingVat ?? amount,
    vat: expense.vat ?? 0,
    amountIncludingVat: amount,
    type: expense.type ?? expense.category ?? 'Other',
    projectName: expense.projectName ?? '',
    invoiceNo: expense.invoiceNo ?? '',
    siteName: expense.siteName ?? '',
    vatNo: expense.vatNo ?? '',
    attachments: expense.attachments ?? [],
  };
}
