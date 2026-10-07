import { Budget, Expense, formatCurrency } from '../model';
import ExpenseTable from './ExpenseTable';
import SpendChart from './SpendChart';
import CategorySpendCard from './CategorySpendCard';

export default function OverviewPanel({
  monthExpenses,
  todayExpenses,
  budgets,
  spent,
  remaining,
  budgetStatus,
  todayTotal,
  recentExpenses,
  onShowTransactions,
}: {
  monthExpenses: Expense[];
  todayExpenses: Expense[];
  budgets: Budget[];
  spent: number;
  remaining: number;
  budgetStatus: string;
  todayTotal: number;
  recentExpenses: Expense[];
  onShowTransactions: () => void;
}) {
  return (
    <>
      <section className="stat-grid" aria-label="Monthly expense summary">
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon violet">↗</span>
            <span className="stat-note positive">This month</span>
          </div>
          <p className="stat-label">Total spent</p>
          <strong>{formatCurrency(spent)}</strong>
          <p className="stat-foot">
            Across {monthExpenses.length} recorded transactions
          </p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon green">◉</span>
            <span className="stat-note">Monthly limit</span>
          </div>
          <p className="stat-label">
            {remaining >= 0 ? 'Budget remaining' : 'Over budget'}
          </p>
          <strong className={remaining < 0 ? 'stat-overrun' : undefined}>
            {formatCurrency(Math.abs(remaining))}
          </strong>
          <p className="stat-foot">{budgetStatus}</p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon orange">▤</span>
            <span className="stat-note">Today</span>
          </div>
          <p className="stat-label">Spent today</p>
          <strong>{formatCurrency(todayTotal)}</strong>
          <p className="stat-foot">{todayExpenses.length} transactions today</p>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span className="stat-icon blue">⌁</span>
            <span className="stat-note">All departments</span>
          </div>
          <p className="stat-label">Avg. transaction</p>
          <strong>
            {formatCurrency(
              monthExpenses.length ? spent / monthExpenses.length : 0,
            )}
          </strong>
          <p className="stat-foot">Month-to-date average</p>
        </article>
      </section>
      <section className="overview-grid">
        <SpendChart expenses={monthExpenses} />
        <CategorySpendCard budgets={budgets} expenses={monthExpenses} />
      </section>
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
        <ExpenseTable
          expenses={recentExpenses}
          onEdit={undefined}
          onDelete={undefined}
          remainingById={undefined}
        />
      </section>
    </>
  );
}
