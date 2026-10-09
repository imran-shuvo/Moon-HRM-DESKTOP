import { Budget, Expense, formatCurrency, getExpenseTotal } from '../model';

export default function CategorySpendCard({
  budgets,
  expenses,
}: {
  budgets: Budget[];
  expenses: Expense[];
}) {
  const categoryTotals = budgets.map((budget) => ({
    ...budget,
    spent: expenses
      .filter((expense) => expense.category === budget.category)
      .reduce((total, expense) => total + getExpenseTotal(expense), 0),
  }));
  const total = categoryTotals.reduce((sum, budget) => sum + budget.spent, 0);
  let offset = 0;
  const gradient = categoryTotals
    .map((category) => {
      const start = offset;
      offset += total ? (category.spent / total) * 100 : 0;
      return `${category.color} ${start}% ${offset}%`;
    })
    .join(', ');

  return (
    <article className="panel budget-panel">
      <div className="panel-heading">
        <div>
          <h2>Spend by category</h2>
          <p>Month-to-date breakdown</p>
        </div>
      </div>
      <div className="donut-area">
        <div
          className="donut-chart"
          style={{ background: `conic-gradient(${gradient})` }}
        >
          <div className="donut-hole">
            <strong>{formatCurrency(total)}</strong>
            <span>Total spent</span>
          </div>
        </div>
      </div>
      <div className="legend-list">
        {categoryTotals.map((category) => (
          <div className="legend-row" key={category.category}>
            <span className="legend-name">
              <i style={{ background: category.color }} />
              {category.category}
            </span>
            <strong>{formatCurrency(category.spent)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}
