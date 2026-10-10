import {
  BudgetTransaction,
  bySerialNo,
  formatReportAmount,
  formatReportDate,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintableBudgetReportData = {
  payments: BudgetTransaction[];
  /** e.g. "Period: All dates · Payee: Acme Ltd" */
  filterSummary?: string;
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
        {[...payments].sort(bySerialNo).map((payment) => (
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
    </article>
  );
}
