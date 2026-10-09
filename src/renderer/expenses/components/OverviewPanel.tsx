import { Budget, Expense, formatCurrency } from '../model';
import ExpenseTable from './ExpenseTable';
import SpendChart from './SpendChart';
import CategorySpendCard from './CategorySpendCard';
import MonthlyExpensesTable from './MonthlyExpensesTable';

export default function OverviewPanel({
  monthExpenses,
  monthlyExpenseSummaries,
  budgets,
  totalExpenses,
  expenseCount,
  totalBudget,
  remaining,
  budgetStatus,
  recentExpenses,
  onShowTransactions,
}: {
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
  onShowTransactions: () => void;
}) {
  return (
    <>
      <section
        className="stat-grid overview-total-grid"
        aria-label="Company budget summary"
      >
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon green">◉</span>
            <span className="stat-note">Available this month</span>
          </div>
          <p className="stat-label">Total budget</p>
          <strong>{formatCurrency(totalBudget)}</strong>
          <p className="stat-foot">
            Previous remaining plus this month&apos;s receipts
          </p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon violet">↗</span>
            <span className="stat-note positive">This month</span>
          </div>
          <p className="stat-label">Total expenses</p>
          <strong>{formatCurrency(totalExpenses)}</strong>
          <p className="stat-foot">
            Across {expenseCount} recorded transactions this month
          </p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon orange">◉</span>
            <span className="stat-note">After this month&apos;s expenses</span>
          </div>
          <p className="stat-label">Remaining budget</p>
          <strong className={remaining < 0 ? 'stat-overrun' : undefined}>
            {formatCurrency(remaining)}
          </strong>
          <p className="stat-foot">{budgetStatus}</p>
        </article>
      </section>
      <section className="overview-grid">
        <SpendChart expenses={monthExpenses} />
        <CategorySpendCard budgets={budgets} expenses={monthExpenses} />
      </section>
      <MonthlyExpensesTable months={monthlyExpenseSummaries} />
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
