import { Expense, formatCurrency } from '../model';

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string) {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function ExpenseTable({
  expenses,
  onEdit,
  onDelete,
  remainingById,
}: {
  expenses: Expense[];
  onEdit: ((expense: Expense) => void) | undefined;
  onDelete: ((expense: Expense) => void) | undefined;
  remainingById: Record<string, number> | undefined;
}) {
  const canManage = Boolean(onEdit && onDelete);

  return (
    <div className="table-scroll">
      <table className="expense-table">
        <thead>
          <tr>
            <th>PAYEE</th>
            <th>DATE</th>
            <th>CATEGORY</th>
            <th>DEPARTMENT</th>
            <th>PAYMENT</th>
            <th className="amount-cell">AMOUNT</th>
            {remainingById && <th className="amount-cell">REMAINING</th>}
            {canManage && <th className="actions-cell">ACTIONS</th>}
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td>
                <div className="payee-cell">
                  <span className="payee-avatar">
                    {initials(expense.payee)}
                  </span>
                  <span className="payee-copy">
                    <strong>{expense.payee}</strong>
                    <span>{expense.description}</span>
                  </span>
                </div>
              </td>
              <td className="date-cell">{formatDate(expense.date)}</td>
              <td>
                <span
                  className={`category-badge category-${expense.category.toLowerCase()}`}
                >
                  {expense.category}
                </span>
              </td>
              <td className="department-cell">{expense.department}</td>
              <td className="payment-cell">{expense.paymentMethod}</td>
              <td className="amount-cell">{formatCurrency(expense.amount)}</td>
              {remainingById && (
                <td className="amount-cell remaining-cell">
                  {formatCurrency(remainingById[expense.id] ?? 0)}
                </td>
              )}
              {canManage && (
                <td className="actions-cell">
                  <button
                    aria-label={`Edit ${expense.payee} - ${expense.description}`}
                    className="table-action"
                    onClick={() => onEdit?.(expense)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${expense.payee} - ${expense.description}`}
                    className="table-action delete-action"
                    onClick={() => onDelete?.(expense)}
                    type="button"
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
