import { Expense } from '../model';
import ExpenseListTable from './ExpenseListTable';

export default function TransactionPanel({
  expenses,
  month,
  payee,
  search,
  payees,
  onMonthChange,
  onPayeeChange,
  onSearchChange,
  onSelect,
}: {
  expenses: Expense[];
  month: string;
  payee: string;
  search: string;
  payees: string[];
  onMonthChange: (value: string) => void;
  onPayeeChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSelect: (expense: Expense) => void;
}) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading transaction-heading">
        <div>
          <h2>All expenses</h2>
          <p>{expenses.length} expense transactions match these filters</p>
        </div>
        <div className="transaction-filters">
          <label className="filter-control" htmlFor="transaction-month">
            Month
            <input
              aria-label="Filter by month"
              id="transaction-month"
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.currentTarget.value)}
            />
          </label>
          {month && (
            <button
              aria-label="Clear month filter"
              className="button button-secondary clear-filter"
              onClick={() => onMonthChange('')}
              type="button"
            >
              Clear month
            </button>
          )}
          <label className="filter-control" htmlFor="transaction-payee">
            Payee
            <select
              aria-label="Filter by payee"
              id="transaction-payee"
              value={payee}
              onChange={(event) => onPayeeChange(event.currentTarget.value)}
            >
              <option value="">All payees</option>
              {payees.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="search-box" htmlFor="transaction-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search transactions"
              id="transaction-search"
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Search expenses"
            />
          </label>
        </div>
      </div>
      <ExpenseListTable expenses={expenses} onSelect={onSelect} />
      {expenses.length === 0 && (
        <p className="empty-state">No expenses match these filters.</p>
      )}
    </section>
  );
}
