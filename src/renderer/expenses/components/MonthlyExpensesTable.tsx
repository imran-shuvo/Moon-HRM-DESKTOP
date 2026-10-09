import { formatCurrency } from '../model';

type MonthlyExpenseSummary = {
  month: string;
  total: number;
  count: number;
};

function formatMonth(value: string) {
  return new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export default function MonthlyExpensesTable({
  months,
}: {
  months: MonthlyExpenseSummary[];
}) {
  return (
    <section
      aria-label="Monthly expenses by month"
      className="panel full-panel monthly-expenses-panel"
    >
      <div className="panel-heading">
        <div>
          <h2>Monthly expenses</h2>
          <p>Expense totals grouped by month</p>
        </div>
      </div>
      {months.length > 0 ? (
        <div className="table-scroll">
          <table className="expense-table monthly-expenses-table">
            <thead>
              <tr>
                <th>MONTH</th>
                <th>TRANSACTIONS</th>
                <th className="amount-cell">TOTAL EXPENSES</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({ month, count, total }) => (
                <tr key={month}>
                  <td>{formatMonth(month)}</td>
                  <td>{count}</td>
                  <td className="amount-cell">{formatCurrency(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">No expenses have been recorded yet.</p>
      )}
    </section>
  );
}
