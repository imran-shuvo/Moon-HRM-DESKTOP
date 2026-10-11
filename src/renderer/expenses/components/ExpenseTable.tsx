import { Expense, formatAmount, getExpenseTotal } from '../model';

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

export default function ExpenseTable({ expenses }: { expenses: Expense[] }) {
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
                    <span>{expense.particulars || expense.description}</span>
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
              <td className="amount-cell">
                {formatAmount(getExpenseTotal(expense))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
