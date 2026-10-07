import { useMemo, useState } from 'react';
import ExpenseTable from './ExpenseTable';
import {
  BudgetTransaction,
  createBudgetLedger,
  Expense,
  formatCurrency,
  todayKey,
} from '../model';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getRange(period: Period, anchor: string) {
  const date = new Date(`${anchor || todayKey()}T12:00:00`);
  const start = new Date(date);
  const end = new Date(date);

  if (period === 'weekly') {
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    end.setDate(start.getDate() + 6);
  } else if (period === 'monthly') {
    start.setDate(1);
    end.setMonth(date.getMonth() + 1, 0);
  } else if (period === 'yearly') {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }

  return { start: toDateKey(start), end: toDateKey(end) };
}

function formatRange(start: string, end: string, period: Period) {
  if (period === 'daily') {
    return new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  if (period === 'monthly') {
    return new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  if (period === 'yearly') return start.slice(0, 4);
  return `${new Date(`${start}T12:00:00`).toLocaleDateString(undefined, options)} – ${new Date(`${end}T12:00:00`).toLocaleDateString(undefined, options)}`;
}

export default function ReportPanel({
  expenses,
  payments,
  onEdit,
  onDelete,
  onExport,
}: {
  expenses: Expense[];
  payments: BudgetTransaction[];
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onExport: (
    expenses: Expense[],
    title: string,
    remainingById: Record<string, number>,
  ) => void;
}) {
  const [period, setPeriod] = useState<Period>('monthly');
  const [anchor, setAnchor] = useState(todayKey());
  const [search, setSearch] = useState('');
  const { start, end } = getRange(period, anchor);
  const reportExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.date >= start && expense.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [expenses, start, end],
  );
  const remainingById = useMemo(() => {
    const balances: Record<string, number> = {};
    createBudgetLedger(expenses, payments).forEach((entry) => {
      if (entry.expense) balances[entry.expense.id] = entry.balance;
    });
    return balances;
  }, [expenses, payments]);
  const query = search.trim().toLowerCase();
  const visibleExpenses = reportExpenses.filter((expense) =>
    `${expense.payee} ${expense.description} ${expense.category} ${expense.department}`
      .toLowerCase()
      .includes(query),
  );
  const total = reportExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );
  const label = formatRange(start, end, period);

  return (
    <>
      <section className="report-summary panel">
        <div className="report-date">
          <span className="stat-icon violet">▦</span>
          <div>
            <p className="stat-label">{period} report</p>
            <strong>{label}</strong>
          </div>
        </div>
        <div className="report-total">
          <span>Total outflow</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
        <div className="report-total">
          <span>Transactions</span>
          <strong>{reportExpenses.length}</strong>
        </div>
      </section>
      <section className="panel full-panel">
        <div className="panel-heading report-controls">
          <div>
            <h2>{period[0].toUpperCase() + period.slice(1)} transaction log</h2>
            <p>Balance shows received payments minus all expenses to date.</p>
          </div>
          <div className="transaction-filters">
            <label className="filter-control" htmlFor="report-period">
              Period
              <select
                aria-label="Report period"
                id="report-period"
                value={period}
                onChange={(event) =>
                  setPeriod(event.currentTarget.value as Period)
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="filter-control" htmlFor="report-date">
              Date
              <input
                aria-label="Report date"
                id="report-date"
                type="date"
                value={anchor}
                onChange={(event) => setAnchor(event.currentTarget.value)}
              />
            </label>
            <label className="search-box" htmlFor="report-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search report"
                id="report-search"
                placeholder="Search report"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </label>
            <button
              className="button button-secondary"
              onClick={() =>
                onExport(
                  reportExpenses,
                  `${period}-expense-report`,
                  remainingById,
                )
              }
              type="button"
            >
              ↓ Export report
            </button>
          </div>
        </div>
        <ExpenseTable
          expenses={visibleExpenses}
          onEdit={onEdit}
          onDelete={onDelete}
          remainingById={remainingById}
        />
        {visibleExpenses.length === 0 && (
          <p className="empty-state">No expenses were found for this period.</p>
        )}
      </section>
    </>
  );
}
