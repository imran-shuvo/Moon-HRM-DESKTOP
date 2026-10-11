import {
  Expense,
  bySerialNo,
  formatAmount,
  formatCurrency,
  getExpenseTotal,
} from '../model';

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ExpenseListTable({
  expenses,
  onSelect,
}: {
  expenses: Expense[];
  onSelect: (expense: Expense) => void;
}) {
  const total = expenses.reduce(
    (sum, expense) => sum + getExpenseTotal(expense),
    0,
  );

  return (
    <div className="table-scroll">
      <table className="expense-table compact-expense-table">
        <thead>
          <tr>
            <th>SERIAL NO.</th>
            <th>DATE</th>
            <th>PAYEE / PAID TO</th>
            <th>INVOICE NO.</th>
            <th>PARTICULARS / DETAILS</th>
            <th className="amount-cell">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {[...expenses].sort(bySerialNo).map((expense) => (
            <tr key={expense.id}>
              <td>{expense.serialNo}</td>
              <td className="date-cell">{formatDate(expense.date)}</td>
              <td>
                <button
                  aria-label={`View details for ${expense.payee}`}
                  className="transaction-row-button"
                  onClick={() => onSelect(expense)}
                  type="button"
                >
                  {expense.payee}
                </button>
              </td>
              <td>{expense.invoiceNo || '—'}</td>
              <td className="particulars-cell">
                {expense.particulars || expense.description || '—'}
              </td>
              <td className="amount-cell">
                {formatAmount(getExpenseTotal(expense))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={5}>Total expenses ({expenses.length} transactions)</th>
            <th className="amount-cell">{formatCurrency(total)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
