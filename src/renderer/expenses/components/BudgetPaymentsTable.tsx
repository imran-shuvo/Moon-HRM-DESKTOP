import { BudgetTransaction, bySerialNo, formatCurrency } from '../model';

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function BudgetPaymentsTable({
  payments,
  isDateClosed,
  onEdit,
  onDelete,
}: {
  payments: BudgetTransaction[];
  isDateClosed: (date: string) => boolean;
  onEdit: (payment: BudgetTransaction) => void;
  onDelete: (payment: BudgetTransaction) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="expense-table budget-ledger-table">
        <thead>
          <tr>
            <th>SERIAL NO.</th>
            <th>DATE RECEIVED</th>
            <th>PAID BY</th>
            <th>PAYMENT METHOD</th>
            <th>NOTE</th>
            <th className="amount-cell">AMOUNT</th>
            <th className="actions-cell">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {[...payments].sort(bySerialNo).map((payment) => (
            <tr key={payment.id}>
              <td>{payment.serialNo}</td>
              <td className="date-cell">{formatDate(payment.date)}</td>
              <td className="ledger-description">
                {payment.paidBy || 'Company'}
              </td>
              <td>
                <span className="ledger-type ledger-in">
                  {payment.paymentMethod || 'Not specified'}
                </span>
              </td>
              <td className="department-cell">{payment.note || '—'}</td>
              <td className="amount-cell ledger-in-amount">
                {formatCurrency(payment.amount)}
              </td>
              <td className="actions-cell">
                {isDateClosed(payment.date) ? (
                  <span
                    className="month-badge closed"
                    title="This month is closed. Reopen it in Settings to make changes."
                  >
                    🔒 Closed
                  </span>
                ) : (
                  <>
                    <button
                      aria-label={`Edit budget from ${payment.paidBy || 'Company'} on ${payment.date}`}
                      className="table-action"
                      onClick={() => onEdit(payment)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      aria-label={`Delete budget from ${payment.paidBy || 'Company'} on ${payment.date}`}
                      className="table-action delete-action"
                      onClick={() => onDelete(payment)}
                      type="button"
                    >
                      Delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
