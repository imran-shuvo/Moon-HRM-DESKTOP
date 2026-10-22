import {
  formatMonthName,
  isMonthClosed,
  monthKey,
  previousMonthKey,
} from '../../../shared/months';
import {
  Budget,
  Expense,
  formatAmount,
  formatCurrency,
  plural,
} from '../model';
import ExpenseTable from './ExpenseTable';
import SpendChart from './SpendChart';
import CategorySpendCard from './CategorySpendCard';
import MonthlyExpensesTable from './MonthlyExpensesTable';

export default function OverviewPanel({
  month,
  reopenedMonths,
  broughtForward,
  received,
  expenses,
  monthExpenses,
  monthlyExpenseSummaries,
  budgets,
  totalExpenses,
  expenseCount,
  totalBudget,
  remaining,
  budgetStatus,
  recentExpenses,
  pettyCash,
  onShowTransactions,
  onShowPettyCash,
  onViewMonth,
}: {
  /** The month shown, 'YYYY-MM'. */
  month: string;
  reopenedMonths: string[];
  /** Remaining budget carried in from the previous month. */
  broughtForward: number;
  /** Budget received during the month. */
  received: number;
  /** All expenses, for the spending chart. */
  expenses: Expense[];
  monthExpenses: Expense[];
  monthlyExpenseSummaries: {
    month: string;
    total: number;
    count: number;
  }[];
  budgets: Budget[];
  totalExpenses: number;
  expenseCount: number;
  totalBudget: number;
  remaining: number;
  budgetStatus: string;
  recentExpenses: Expense[];
  /** Petty cash in workers' hands at the end of the month (now, for this month). */
  pettyCash: {
    inHand: number;
    holding: number;
    given: number;
    settled: number;
  };
  onShowTransactions: () => void;
  /** Opens Petty Cash → Cash in hand. */
  onShowPettyCash: () => void;
  onViewMonth: (month: string) => void;
}) {
  const isCurrent = month === monthKey();
  const closed = isMonthClosed(month, reopenedMonths);
  const monthName = formatMonthName(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonthName = formatMonthName(
    monthKey(new Date(year, monthNumber, 1)),
  );

  return (
    <>
      {closed && (
        <div className="app-message info month-status" role="status">
          <span>
            <strong>🔒 {monthName} is closed.</strong> Its transactions are
            read-only. The remaining budget of {formatCurrency(remaining)} was
            carried into {nextMonthName}.
          </span>
          <button
            className="button button-secondary"
            onClick={() => onViewMonth(monthKey())}
            type="button"
          >
            Back to this month
          </button>
        </div>
      )}
      {!closed && !isCurrent && (
        <div className="app-message info month-status" role="status">
          <span>
            <strong>{monthName} is reopened for corrections.</strong> Close it
            again in Settings → Month closing when you are done.
          </span>
        </div>
      )}
      <section
        className="stat-grid overview-total-grid"
        aria-label="Company budget summary"
      >
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon green">◉</span>
            <span className="stat-note">Available in {monthName}</span>
          </div>
          <p className="stat-label">Total budget</p>
          <strong>{formatCurrency(totalBudget)}</strong>
          <p className="stat-foot">
            {formatAmount(broughtForward)} brought forward from{' '}
            {formatMonthName(previousMonthKey(month))} +{' '}
            {formatAmount(received)} received
          </p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon violet">↗</span>
            <span className="stat-note positive">{monthName}</span>
          </div>
          <p className="stat-label">Total expenses</p>
          <strong>{formatCurrency(totalExpenses)}</strong>
          <p className="stat-foot">
            Across {expenseCount} recorded transactions
          </p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon orange">◉</span>
            <span className="stat-note">
              {closed
                ? `Carried into ${nextMonthName}`
                : "After this month's expenses"}
            </span>
          </div>
          <p className="stat-label">Remaining budget</p>
          <strong className={remaining < 0 ? 'stat-overrun' : undefined}>
            {formatCurrency(remaining)}
          </strong>
          <p className="stat-foot">{budgetStatus}</p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon blue">◈</span>
            <span className="stat-note">
              {isCurrent ? 'Now' : `End of ${monthName}`}
            </span>
          </div>
          <p className="stat-label">Petty cash in hand</p>
          <strong className={pettyCash.inHand < 0 ? 'stat-overrun' : undefined}>
            {formatCurrency(pettyCash.inHand)}
          </strong>
          <p className="stat-foot">
            {plural(pettyCash.holding, 'worker')} holding cash ·{' '}
            {formatAmount(pettyCash.given)} given,{' '}
            {formatAmount(pettyCash.settled)} settled in {monthName}
          </p>
          <button
            className="text-button stat-link"
            onClick={onShowPettyCash}
            type="button"
          >
            View cash in hand <span aria-hidden="true">→</span>
          </button>
        </article>
      </section>
      <section className="overview-grid">
        <SpendChart expenses={expenses} month={month} />
        <CategorySpendCard budgets={budgets} expenses={monthExpenses} />
      </section>
      <MonthlyExpensesTable
        months={monthlyExpenseSummaries}
        reopenedMonths={reopenedMonths}
        selectedMonth={month}
        onViewMonth={onViewMonth}
      />
      <section className="panel transaction-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent transactions</h2>
            <p>Your latest company expenses</p>
          </div>
          <button
            className="text-button"
            onClick={onShowTransactions}
            type="button"
          >
            View all <span aria-hidden="true">→</span>
          </button>
        </div>
        <ExpenseTable expenses={recentExpenses} />
      </section>
    </>
  );
}
