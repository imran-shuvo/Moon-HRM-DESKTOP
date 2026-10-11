import type { BudgetTransaction, Employee, Expense } from '../../shared/types';

export type Section =
  | 'Overview'
  | 'Transactions'
  | 'Budgets'
  | 'Employees'
  | 'Reports'
  | 'Settings'
  | 'Backup';

export {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
} from '../../shared/employeeRoles';
export type { EmployeeRole } from '../../shared/employeeRoles';
export type {
  BudgetTransaction,
  Employee,
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
export const PAYMENT_METHODS = [
  'Company card',
  'Bank transfer',
  'Cash',
  'Petty cash',
];

/** 'YYYY-MM-DD' for a date in local time. */
export function toDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

/** An Iqama expiring within this many days (or already expired) is flagged. */
export const IQAMA_WARNING_DAYS = 30;

/** Whole days from today to a 'YYYY-MM-DD' date; negative once it has passed. */
export function daysUntil(date: string, today = todayKey()) {
  const toUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000);
}

export type IqamaStatus = 'expired' | 'expiring' | 'valid' | 'missing';

export const IQAMA_STATUS_LABELS: Record<IqamaStatus, string> = {
  expired: 'Expired',
  expiring: `Expiring within ${IQAMA_WARNING_DAYS} days`,
  valid: 'Valid',
  missing: 'Not recorded',
};

export function iqamaStatus(
  employee: Employee,
  today = todayKey(),
): IqamaStatus {
  if (!employee.iqamaExpiry) return 'missing';
  const days = daysUntil(employee.iqamaExpiry, today);
  if (days < 0) return 'expired';
  return days < IQAMA_WARNING_DAYS ? 'expiring' : 'valid';
}

/** Expired, or expiring within the warning period: shown in red. */
export function isIqamaExpiring(employee: Employee, today = todayKey()) {
  const status = iqamaStatus(employee, today);
  return status === 'expired' || status === 'expiring';
}

/** Distinct employee names, sorted, for "Paid to" and payee pickers. */
export function employeeNames(employees: Employee[]) {
  return [...new Set(employees.map((employee) => employee.name))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Numbers records by the order they were entered, so an entry keeps its
 * serial no. when newer (or back-dated) entries are added.
 */
export function withSerialNumbers<T extends { id: string; createdAt?: number }>(
  records: T[],
): T[] {
  const serials = new Map(
    [...records]
      .sort(
        (a, b) =>
          (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id),
      )
      .map((record, index) => [record.id, index + 1]),
  );
  return records.map((record) => ({
    ...record,
    serialNo: serials.get(record.id),
  }));
}

/** Sort comparator: lowest serial no. first. */
export function bySerialNo(a: { serialNo?: number }, b: { serialNo?: number }) {
  return (a.serialNo ?? 0) - (b.serialNo ?? 0);
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
  const broughtForward = previousBudget - previousExpenses;
  const totalBudget = broughtForward + receivedInPeriod;

  return {
    /** Remaining budget carried in from before `start`. */
    broughtForward,
    receivedInPeriod,
    expensesInPeriod,
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

const REPORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Printed report dates, e.g. '2026-10-07' → '07-Oct-2026'. */
export function formatReportDate(date: string | Date) {
  const [year, month, day] =
    typeof date === 'string'
      ? date.slice(0, 10).split('-').map(Number)
      : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  return `${String(day).padStart(2, '0')}-${REPORT_MONTHS[month - 1]}-${year}`;
}

/** File-name timestamp, e.g. 2026-10-10_14-30-05. */
export function fileTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/** Whether any of the expense's text fields contains `query` (case-insensitive). */
export function matchesSearch(expense: Expense, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    expense.date,
    expense.payee,
    expense.invoiceNo,
    expense.particulars,
    expense.description,
    expense.projectName,
    expense.siteName,
    expense.vatNo,
    expense.category,
    expense.department,
  ].some((value) => value?.toLowerCase().includes(needle));
}

/** Keeps records dated within an optional inclusive YYYY-MM-DD range. */
export function inDateRange(date: string, fromDate: string, toDate: string) {
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
}

/** Printed description of a report's filters, e.g. "Period: … · Paid to: …". */
export function describeReportFilters(
  fromDate: string,
  toDate: string,
  extra: [label: string, value: string][],
) {
  let period = 'All dates';
  if (fromDate && toDate)
    period = `${formatReportDate(fromDate)} to ${formatReportDate(toDate)}`;
  else if (fromDate) period = `From ${formatReportDate(fromDate)}`;
  else if (toDate) period = `Up to ${formatReportDate(toDate)}`;
  return [
    `Period: ${period}`,
    ...extra
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`),
  ].join(' · ');
}

/** Printed report amounts without a currency symbol, e.g. 188000 → '188,000.00'. */
export function formatReportAmount(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
