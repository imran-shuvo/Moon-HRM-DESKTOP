import {
  Expense,
  formatReportAmount,
  formatReportDate,
  getExpenseTotal,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintableExpenseReportData = {
  expenses: Expense[];
  /** e.g. "Period: 01-Jan-2026 to 31-Jan-2026 · Paid to: Acme Ltd" */
  filterSummary: string;
  fileName: string;
  generatedAt: Date;
};

export function ExpenseTransactionsTable({
  expenses,
  total,
  emptyText,
}: {
  expenses: Expense[];
  total: number;
  emptyText: string;
}) {
  return (
    <table className="moon-report-table moon-report-expenses">
      <thead>
        <tr>
          <th className="sl">SL NO</th>
          <th>DATE</th>
          <th>PAID TO</th>
          <th>PARTICULARS</th>
          <th className="amount">AMOUNT (SAR)</th>
        </tr>
      </thead>
      <tbody>
        {expenses.map((expense) => (
          <tr key={expense.id}>
            <td className="sl">{expense.serialNo}</td>
            <td>{formatReportDate(expense.date)}</td>
            <td>{expense.payee}</td>
            <td>{expense.particulars || expense.description}</td>
            <td className="amount">
              {formatReportAmount(getExpenseTotal(expense))}
            </td>
          </tr>
        ))}
        {expenses.length === 0 && (
          <tr>
            <td className="empty" colSpan={5}>
              {emptyText}
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td />
          <td />
          <td />
          <th>TOTAL EXPENSES</th>
          <td className="amount">{formatReportAmount(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function ExpensePrintableReport({
  data,
}: {
  data: PrintableExpenseReportData;
}) {
  const total = data.expenses.reduce(
    (sum, expense) => sum + getExpenseTotal(expense),
    0,
  );

  return (
    <article className="standalone-print-report moon-report">
      <ReportBrandHeader title="EXPENSE REPORT" />
      {data.filterSummary && (
        <p className="moon-report-filters">{data.filterSummary}</p>
      )}
      <section className="moon-report-section">
        <h2>1. Expense Transactions</h2>
        <ExpenseTransactionsTable
          expenses={data.expenses}
          total={total}
          emptyText="No expenses match these filters."
        />
      </section>
    </article>
  );
}
