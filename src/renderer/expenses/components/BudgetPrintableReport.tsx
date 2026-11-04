import {
  BudgetTransaction,
  formatReportAmount,
  formatReportDate,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintableBudgetReportData = {
  payments: BudgetTransaction[];
  /** e.g. "Period: All dates · Payee: Acme Ltd" */
  filterSummary?: string;
  /** For one month's budget: what it started with, received, spent and left. */
  monthSummary?: {
    monthName: string;
    previousMonthName: string;
    broughtForward: number;
    received: number;
    spent: number;
    remaining: number;
    closed: boolean;
  };
  fileName: string;
  generatedAt: Date;
};

export function BudgetTransactionsTable({
  payments,
  total,
}: {
  payments: BudgetTransaction[];
  total: number;
}) {
  return (
    <table className="moon-report-table moon-report-budget">
      <thead>
        <tr>
          <th className="sl">SL NO</th>
          <th>DATE</th>
          <th>PAID BY</th>
          <th className="amount">AMOUNT (SAR)</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((payment) => (
          <tr key={payment.id}>
            <td className="sl">{payment.serialNo}</td>
            <td>{formatReportDate(payment.date)}</td>
            <td>{payment.paidBy || 'Company'}</td>
            <td className="amount">{formatReportAmount(payment.amount)}</td>
          </tr>
        ))}
        {payments.length === 0 && (
          <tr>
            <td className="empty" colSpan={4}>
              No budget transactions in this period.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td />
          <td />
          <th>TOTAL BUDGET</th>
          <td className="amount">{formatReportAmount(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function BudgetPrintableReport({
  data,
}: {
  data: PrintableBudgetReportData;
}) {
  const total = data.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <article className="standalone-print-report moon-report">
      <ReportBrandHeader title="BUDGET REPORT" />
      {data.filterSummary && (
        <p className="moon-report-filters">{data.filterSummary}</p>
      )}
      <section className="moon-report-section">
        <h2>1. Budget Transactions</h2>
        <BudgetTransactionsTable payments={data.payments} total={total} />
      </section>
      {data.monthSummary && (
        <section className="moon-report-section">
          <h2>2. {data.monthSummary.monthName} budget</h2>
          <table className="moon-report-table moon-report-summary">
            <tbody>
              <tr>
                <td>Remaining from {data.monthSummary.previousMonthName}</td>
                <td className="amount">
                  {formatReportAmount(data.monthSummary.broughtForward)}
                </td>
              </tr>
              <tr>
                <td>Budget received</td>
                <td className="amount">
                  {formatReportAmount(data.monthSummary.received)}
                </td>
              </tr>
              <tr>
                <td>Expenses</td>
                <td className="amount">
                  {formatReportAmount(data.monthSummary.spent)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr
                className={
                  data.monthSummary.remaining < 0 ? 'negative' : undefined
                }
              >
                <th>
                  {data.monthSummary.closed
                    ? 'Remaining (carried forward)'
                    : 'Remaining budget'}
                </th>
                <td className="amount">
                  {formatReportAmount(data.monthSummary.remaining)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </article>
  );
}
