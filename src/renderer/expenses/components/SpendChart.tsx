import { Expense, formatCurrency, todayKey } from '../model';

export default function SpendChart({ expenses }: { expenses: Expense[] }) {
  const today = new Date(`${todayKey()}T12:00:00`);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      key,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      amount: expenses
        .filter((expense) => expense.date === key)
        .reduce((sum, expense) => sum + expense.amount, 0),
    };
  });
  const max = Math.max(...days.map((day) => day.amount), 1);
  const weekTotal = days.reduce((sum, day) => sum + day.amount, 0);

  return (
    <article className="panel spend-panel">
      <div className="panel-heading">
        <div>
          <h2>Spending activity</h2>
          <p>Daily outflow over the last 7 days</p>
        </div>
        <div className="chart-legend">
          <i /> Expenses
        </div>
      </div>
      <div className="chart-summary">
        <strong>{formatCurrency(weekTotal)}</strong>
        <span>Last 7 days</span>
      </div>
      <div className="chart-area">
        <div className="chart-y-axis">
          <span>$5k</span>
          <span>$3.5k</span>
          <span>$2k</span>
          <span>$0</span>
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
                title={`${day.label}: ${formatCurrency(day.amount)}`}
              >
                <span
                  className={`chart-bar${day.key === todayKey() ? ' today' : ''}`}
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
