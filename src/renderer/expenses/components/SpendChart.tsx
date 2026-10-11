import {
  Expense,
  formatAmount,
  formatCurrency,
  formatReportDate,
  getExpenseTotal,
  getMonthDateRange,
  toDateKey,
  todayKey,
} from '../model';

const compactCurrency = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Daily spending over the 7 days up to today, or up to the last day of
 * `month` when a past month is shown.
 */
export default function SpendChart({
  expenses,
  month,
}: {
  /** All expenses: the 7 days may start in the month before. */
  expenses: Expense[];
  month: string;
}) {
  const today = todayKey();
  const monthEnd = getMonthDateRange(`${month}-01`).end;
  const lastDay = monthEnd < today ? monthEnd : today;
  const last = new Date(`${lastDay}T12:00:00`);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(last);
    date.setDate(last.getDate() - (6 - index));
    const key = toDateKey(date);
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      amount: expenses
        .filter((expense) => expense.date === key)
        .reduce((sum, expense) => sum + getExpenseTotal(expense), 0),
    };
  });
  const peak = Math.max(...days.map((day) => day.amount));
  const max = peak || 1;
  const weekTotal = days.reduce((sum, day) => sum + day.amount, 0);
  const isRecent = lastDay === today;

  return (
    <article className="panel spend-panel">
      <div className="panel-heading">
        <div>
          <h2>Spending activity</h2>
          <p>
            {isRecent
              ? 'Daily outflow over the last 7 days'
              : `Daily outflow over the 7 days to ${formatReportDate(lastDay)}`}
          </p>
        </div>
        <div className="chart-legend">
          <i /> Expenses
        </div>
      </div>
      <div className="chart-summary">
        <strong>{formatCurrency(weekTotal)}</strong>
        <span>{isRecent ? 'Last 7 days' : '7 days'}</span>
      </div>
      <div className="chart-area">
        <div className="chart-y-axis">
          {[1, 2 / 3, 1 / 3, 0].map((fraction) => (
            <span key={fraction}>
              SAR {compactCurrency.format(peak * fraction)}
            </span>
          ))}
        </div>
        <div className="chart-plot">
          <div className="chart-grid-lines">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="bar-list">
            {days.map((day) => (
              <div
                className="bar-column"
                key={day.key}
                title={`${day.label}: ${formatAmount(day.amount)}`}
              >
                <span
                  className={`chart-bar${day.key === today ? ' today' : ''}`}
                  style={{
                    height: `${Math.max((day.amount / max) * 100, 3)}%`,
                  }}
                />
                <span className="bar-label">{day.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
