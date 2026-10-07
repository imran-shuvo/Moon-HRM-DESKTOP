import BudgetLedgerTable from './BudgetLedgerTable';
import { BudgetLedgerEntry } from '../model';

export default function TransactionPanel({
  entries,
  month,
  payee,
  department,
  search,
  departments,
  payees,
  onMonthChange,
  onPayeeChange,
  onDepartmentChange,
  onSearchChange,
  onEditPayment,
  onDeletePayment,
  onEditExpense,
  onDeleteExpense,
}: {
  entries: BudgetLedgerEntry[];
  month: string;
  payee: string;
  department: string;
  search: string;
  departments: string[];
  payees: string[];
  onMonthChange: (value: string) => void;
  onPayeeChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onEditPayment: (entry: BudgetLedgerEntry) => void;
  onDeletePayment: (entry: BudgetLedgerEntry) => void;
  onEditExpense: (entry: BudgetLedgerEntry) => void;
  onDeleteExpense: (entry: BudgetLedgerEntry) => void;
}) {
  return (
    <section className="panel full-panel">
      <div className="panel-heading transaction-heading">
        <div>
          <h2>All transactions</h2>
          <p>{entries.length} transactions match these filters</p>
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
          <label className="filter-control" htmlFor="transaction-department">
            Department
            <select
              aria-label="Filter by department"
              id="transaction-department"
              value={department}
              onChange={(event) =>
                onDepartmentChange(event.currentTarget.value)
              }
            >
              <option value="">All departments</option>
              {departments.map((name) => (
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
              placeholder="Search transactions"
            />
          </label>
        </div>
      </div>
      <BudgetLedgerTable
        entries={entries}
        onEditPayment={onEditPayment}
        onDeletePayment={onDeletePayment}
        onEditExpense={onEditExpense}
        onDeleteExpense={onDeleteExpense}
      />
      {entries.length === 0 && (
        <p className="empty-state">No transactions match these filters.</p>
      )}
    </section>
  );
}
