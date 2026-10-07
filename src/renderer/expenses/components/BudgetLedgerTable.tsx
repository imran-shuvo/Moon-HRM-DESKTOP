import { BudgetLedgerEntry, formatCurrency } from '../model';

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function BudgetLedgerTable({
  entries,
  onEditPayment,
  onDeletePayment,
  onEditExpense,
  onDeleteExpense,
}: {
  entries: BudgetLedgerEntry[];
  onEditPayment: (entry: BudgetLedgerEntry) => void;
  onDeletePayment: (entry: BudgetLedgerEntry) => void;
  onEditExpense: (entry: BudgetLedgerEntry) => void;
  onDeleteExpense: (entry: BudgetLedgerEntry) => void;
}) {
  function renderActions(entry: BudgetLedgerEntry) {
    if (entry.payment) {
      return (
        <>
          <button
            aria-label={`Edit payment ${entry.description} ${entry.date}`}
            className="table-action"
            onClick={() => onEditPayment(entry)}
            type="button"
          >
            Edit
          </button>
          <button
            aria-label={`Delete payment ${entry.description} ${entry.date}`}
            className="table-action delete-action"
            onClick={() => onDeletePayment(entry)}
            type="button"
          >
            Delete
          </button>
        </>
      );
    }
    if (entry.expense) {
      return (
        <>
          <button
            aria-label={`Edit expense ${entry.expense.payee} ${entry.expense.date}`}
            className="table-action"
            onClick={() => onEditExpense(entry)}
            type="button"
          >
            Edit
          </button>
          <button
            aria-label={`Delete expense ${entry.expense.payee} ${entry.expense.date}`}
            className="table-action delete-action"
            onClick={() => onDeleteExpense(entry)}
            type="button"
          >
            Delete
          </button>
        </>
      );
    }
    return '—';
  }

  return (
    <div className="table-scroll">
      <table className="expense-table budget-ledger-table">
        <thead>
          <tr>
            <th>DATE</th>
            <th>PAID BY / PAYEE</th>
            <th>TYPE</th>
            <th>DETAILS</th>
            <th>METHOD</th>
            <th className="amount-cell">IN</th>
            <th className="amount-cell">OUT</th>
            <th className="amount-cell">BALANCE</th>
            <th className="actions-cell">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="date-cell">{formatDate(entry.date)}</td>
              <td className="ledger-description">
                {entry.payment?.paidBy || entry.expense?.payee || 'Company'}
              </td>
              <td>
                <span
                  className={`ledger-type ${entry.kind === 'payment' ? 'ledger-in' : 'ledger-out'}`}
                >
                  {entry.kind === 'payment' ? 'Company payment' : 'Expense'}
                </span>
              </td>
              <td className="department-cell">
                {entry.payment?.note || entry.expense?.description || '—'}
                {entry.expense?.department
                  ? ` · ${entry.expense.department}`
                  : ''}
              </td>
              <td className="payment-cell">
                {entry.payment?.paymentMethod ||
                  entry.expense?.paymentMethod ||
                  '—'}
              </td>
              <td className="amount-cell ledger-in-amount">
                {entry.kind === 'payment' ? formatCurrency(entry.amount) : '—'}
              </td>
              <td className="amount-cell">
                {entry.kind === 'expense' ? formatCurrency(entry.amount) : '—'}
              </td>
              <td
                className={`amount-cell remaining-cell${entry.balance < 0 ? ' ledger-negative' : ''}`}
              >
                {formatCurrency(entry.balance)}
              </td>
              <td className="actions-cell">{renderActions(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
