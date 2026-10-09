import { BudgetTransaction, formatCurrency } from '../model';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintableBudgetReportData = {
  payments: BudgetTransaction[];
  fileName: string;
  generatedAt: Date;
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function BudgetPrintableReport({
  data,
}: {
  data: PrintableBudgetReportData;
}) {
  const total = data.payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <article className="standalone-print-report">
      <ReportBrandHeader
        title="Budget transactions"
        generatedAt={data.generatedAt}
      />
      <section
        className="print-report-summary budget-print-summary"
        aria-label="Budget totals"
      >
        <div>
          <span>Total budget received</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
        <div>
          <span>Transactions</span>
          <strong>{data.payments.length}</strong>
        </div>
      </section>
      <div className="table-scroll">
        <table className="expense-table print-expense-table budget-print-table">
          <thead>
            <tr>
              <th>SERIAL NO.</th>
              <th>DATE RECEIVED</th>
              <th>PAID BY</th>
              <th>PAYMENT METHOD</th>
              <th>NOTE</th>
              <th className="amount-cell">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((payment, index) => (
              <tr key={payment.id}>
                <td>{index + 1}</td>
                <td>{formatDate(payment.date)}</td>
                <td>{payment.paidBy || 'Company'}</td>
                <td>{payment.paymentMethod || 'Not specified'}</td>
                <td>{payment.note || '—'}</td>
                <td className="amount-cell">
                  {formatCurrency(payment.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={5}>
                Total budget received ({data.payments.length} transactions)
              </th>
              <th className="amount-cell">{formatCurrency(total)}</th>
            </tr>
          </tfoot>
        </table>
        {data.payments.length === 0 && (
          <p className="empty-state">No budget transactions to export.</p>
        )}
      </div>
    </article>
  );
}
