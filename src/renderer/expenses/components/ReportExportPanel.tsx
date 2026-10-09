import { ReactNode, useMemo, useState } from 'react';
import {
  BudgetTransaction,
  Expense,
  formatCurrency,
  getExpenseTotal,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';
import ExportPreviewDialog from './ExportPreviewDialog';

export type PrintableReportData = {
  payments: BudgetTransaction[];
  expenses: Expense[];
  /** Budget left over from before the report period. */
  openingBalance: number;
  totalReceived: number;
  totalExpenses: number;
  remainingBudget: number;
  fromDate: string;
  toDate: string;
  fileName: string;
  generatedAt: Date;
};

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function createReportFileName(fromDate: string, toDate: string, date: Date) {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
  return `finance-report_${fromDate}_to_${toDate}_${timestamp}`;
}

export function createPrintableReportData(
  expenses: Expense[],
  payments: BudgetTransaction[],
  fromDate: string,
  toDate: string,
  fileName?: string,
): PrintableReportData {
  const generatedAt = new Date();
  const inRange = (date: string) => date >= fromDate && date <= toDate;
  const byDate = <T extends { date: string }>(a: T, b: T) =>
    a.date.localeCompare(b.date);
  const sumExpenses = (items: Expense[]) =>
    items.reduce((sum, expense) => sum + getExpenseTotal(expense), 0);
  const sumPayments = (items: BudgetTransaction[]) =>
    items.reduce((sum, payment) => sum + payment.amount, 0);

  const reportExpenses = expenses.filter((e) => inRange(e.date)).sort(byDate);
  const reportPayments = payments.filter((p) => inRange(p.date)).sort(byDate);
  const openingBalance =
    sumPayments(payments.filter((p) => p.date < fromDate)) -
    sumExpenses(expenses.filter((e) => e.date < fromDate));
  const totalReceived = sumPayments(reportPayments);
  const totalExpenses = sumExpenses(reportExpenses);

  return {
    payments: reportPayments,
    expenses: reportExpenses,
    openingBalance,
    totalReceived,
    totalExpenses,
    remainingBudget: openingBalance + totalReceived - totalExpenses,
    fromDate,
    toDate,
    fileName: fileName ?? createReportFileName(fromDate, toDate, generatedAt),
    generatedAt,
  };
}

function ReportPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="print-report-page">
      <h2 className="print-page-title">{title}</h2>
      {children}
    </section>
  );
}

export function PrintableReport({ data }: { data: PrintableReportData }) {
  return (
    <article className="standalone-print-report">
      {/* Company header appears once, at the top of the first page. */}
      <ReportBrandHeader
        title="Finance report"
        generatedAt={data.generatedAt}
      />
      <div className="print-range">
        <span>Report period</span>
        <strong>
          {formatDate(data.fromDate)} – {formatDate(data.toDate)}
        </strong>
      </div>
      <ReportPage title="Budget received">
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
                  Total amount received ({data.payments.length} transactions)
                </th>
                <th className="amount-cell">
                  {formatCurrency(data.totalReceived)}
                </th>
              </tr>
            </tfoot>
          </table>
          {data.payments.length === 0 && (
            <p className="empty-state">
              No budget received in this date range.
            </p>
          )}
        </div>
      </ReportPage>

      <ReportPage title="Expenses">
        <div className="table-scroll">
          <table className="expense-table print-expense-table">
            <thead>
              <tr>
                <th>SERIAL NO.</th>
                <th>DATE</th>
                <th>PARTICULARS</th>
                <th>INVOICE NO.</th>
                <th className="amount-cell">EX VAT</th>
                <th className="amount-cell">VAT</th>
                <th className="amount-cell">INCLUDING VAT</th>
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((expense, index) => (
                <tr key={expense.id}>
                  <td>{index + 1}</td>
                  <td>{formatDate(expense.date)}</td>
                  <td>{expense.particulars || expense.description}</td>
                  <td>{expense.invoiceNo || '—'}</td>
                  <td className="amount-cell">
                    {formatCurrency(
                      expense.amountExcludingVat ?? expense.amount,
                    )}
                  </td>
                  <td className="amount-cell">
                    {formatCurrency(expense.vat ?? 0)}
                  </td>
                  <td className="amount-cell">
                    {formatCurrency(getExpenseTotal(expense))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={6}>
                  Total expenses ({data.expenses.length} transactions)
                </th>
                <th className="amount-cell">
                  {formatCurrency(data.totalExpenses)}
                </th>
              </tr>
            </tfoot>
          </table>
          {data.expenses.length === 0 && (
            <p className="empty-state">No expenses in this date range.</p>
          )}
        </div>
      </ReportPage>

      <ReportPage title="Summary">
        <div className="print-summary-cards">
          <div className="print-summary-card received">
            <span>Total amount received</span>
            <strong>{formatCurrency(data.totalReceived)}</strong>
            <small>{data.payments.length} budget payments</small>
          </div>
          <div className="print-summary-card spent">
            <span>Total expenses</span>
            <strong>{formatCurrency(data.totalExpenses)}</strong>
            <small>{data.expenses.length} expenses</small>
          </div>
          <div
            className={`print-summary-card remaining${data.remainingBudget < 0 ? ' negative' : ''}`}
          >
            <span>Total remaining</span>
            <strong>{formatCurrency(data.remainingBudget)}</strong>
            <small>
              {formatDate(data.fromDate)} – {formatDate(data.toDate)}
            </small>
          </div>
        </div>
        <h3 className="print-section-subtitle">Calculation</h3>
        <table className="print-report-totals" aria-label="Report totals">
          <tbody>
            {data.openingBalance !== 0 && (
              <tr>
                <th>Balance brought forward</th>
                <td>{formatCurrency(data.openingBalance)}</td>
              </tr>
            )}
            <tr>
              <th>Total amount received</th>
              <td>{formatCurrency(data.totalReceived)}</td>
            </tr>
            <tr>
              <th>Total expenses</th>
              <td>− {formatCurrency(data.totalExpenses)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className={data.remainingBudget < 0 ? 'negative' : undefined}>
              <th>Total remaining</th>
              <td>{formatCurrency(data.remainingBudget)}</td>
            </tr>
          </tfoot>
        </table>
      </ReportPage>
    </article>
  );
}

export default function ReportExportPanel({
  expenses,
  payments,
  onExportPdf,
}: {
  expenses: Expense[];
  payments: BudgetTransaction[];
  onExportPdf: (data: PrintableReportData) => void;
}) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [fromDate, setFromDate] = useState(`${today.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState(todayKey);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PrintableReportData>();
  const summary = useMemo(
    () => createPrintableReportData(expenses, payments, fromDate, toDate),
    [expenses, payments, fromDate, toDate],
  );

  function createReportData() {
    if (!fromDate || !toDate) {
      setError('Choose both a start date and an end date.');
      return undefined;
    }
    if (fromDate > toDate) {
      setError('The start date must be on or before the end date.');
      return undefined;
    }
    setError('');
    return createPrintableReportData(expenses, payments, fromDate, toDate);
  }

  return (
    <>
      <section className="panel report-export-panel">
        <div className="panel-heading">
          <div>
            <h2>Export finance report</h2>
            <p>
              Choose a date range to save a PDF with budgets, expenses and the
              remaining balance.
            </p>
          </div>
        </div>
        <div className="report-export-controls">
          <label className="filter-control" htmlFor="export-start-date">
            From
            <input
              id="export-start-date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.currentTarget.value)}
            />
          </label>
          <label className="filter-control" htmlFor="export-end-date">
            To
            <input
              id="export-end-date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.currentTarget.value)}
            />
          </label>
          <button
            className="button button-primary"
            onClick={() => {
              const data = createReportData();
              if (data) onExportPdf(data);
            }}
            type="button"
          >
            Export PDF
          </button>
          <button
            className="button button-secondary"
            onClick={() => setPreview(createReportData())}
            type="button"
          >
            Preview PDF
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="report-export-preview">
          <span>
            {summary.payments.length} budget payments ·{' '}
            {summary.expenses.length} expenses in range
          </span>
          <div>
            <span>Total amount received</span>
            <strong>{formatCurrency(summary.totalReceived)}</strong>
          </div>
          <div>
            <span>Total expenses</span>
            <strong>{formatCurrency(summary.totalExpenses)}</strong>
          </div>
          <div>
            <span>Total remaining</span>
            <strong>{formatCurrency(summary.remainingBudget)}</strong>
          </div>
        </div>
      </section>
      {preview && (
        <ExportPreviewDialog
          title="Preview finance report"
          exportLabel="Save PDF"
          error={error}
          onClose={() => setPreview(undefined)}
          onExport={() => {
            onExportPdf(preview);
            setPreview(undefined);
          }}
        >
          <PrintableReport data={preview} />
        </ExportPreviewDialog>
      )}
    </>
  );
}
