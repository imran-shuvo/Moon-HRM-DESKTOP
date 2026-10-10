import { formatMonthName, isMonthClosed } from '../../../shared/months';
import { formatCurrency } from '../model';

type MonthlyExpenseSummary = {
  month: string;
  total: number;
  count: number;
};

export default function MonthlyExpensesTable({
  months,
  reopenedMonths,
  selectedMonth,
  onViewMonth,
}: {
  months: MonthlyExpenseSummary[];
  reopenedMonths: string[];
  selectedMonth: string;
  onViewMonth: (month: string) => void;
}) {
  return (
    <section
      aria-label="Monthly expenses by month"
      className="panel full-panel monthly-expenses-panel"
    >
      <div className="panel-heading">
        <div>
          <h2>Monthly expenses</h2>
          <p>
            Expense totals grouped by month. Past months close automatically;
            choose one to see its figures.
          </p>
        </div>
      </div>
      {months.length > 0 ? (
        <div className="table-scroll">
          <table className="expense-table monthly-expenses-table">
            <thead>
              <tr>
                <th>MONTH</th>
                <th>STATUS</th>
                <th>TRANSACTIONS</th>
                <th className="amount-cell">TOTAL EXPENSES</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({ month, count, total }) => (
                <tr
                  className={
                    month === selectedMonth ? 'selected-row' : undefined
                  }
                  key={month}
                >
                  <td>
                    <button
                      aria-label={`View ${formatMonthName(month)}`}
                      className="transaction-row-button"
                      onClick={() => onViewMonth(month)}
                      type="button"
                    >
                      {formatMonthName(month)}
                    </button>
                  </td>
                  <td>
                    {isMonthClosed(month, reopenedMonths) ? (
                      <span className="month-badge closed">🔒 Closed</span>
                    ) : (
                      <span className="month-badge open">Open</span>
                    )}
                  </td>
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
