import { useMemo, useState } from 'react';
import {
  BudgetTransaction,
  Expense,
  bySerialNo,
  formatCurrency,
  formatReportAmount,
  getExpenseTotal,
} from '../model';
import { BudgetTransactionsTable } from './BudgetPrintableReport';
import { ExpenseTransactionsTable } from './ExpensePrintableReport';
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
  const sumExpenses = (items: Expense[]) =>
    items.reduce((sum, expense) => sum + getExpenseTotal(expense), 0);
  const sumPayments = (items: BudgetTransaction[]) =>
    items.reduce((sum, payment) => sum + payment.amount, 0);

  const reportExpenses = expenses
    .filter((e) => inRange(e.date))
    .sort(bySerialNo);
  const reportPayments = payments
    .filter((p) => inRange(p.date))
    .sort(bySerialNo);
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

export function PrintableReport({ data }: { data: PrintableReportData }) {
  return (
    <article className="standalone-print-report moon-report">
      <ReportBrandHeader title="BUDGET & EXPENSE REPORT" />
      <section className="moon-report-section">
        <h2>1. Budget Transactions</h2>
        <BudgetTransactionsTable
          payments={data.payments}
          total={data.totalReceived}
        />
      </section>

      <section className="moon-report-section">
        <h2>2. Expense Transactions</h2>
        <ExpenseTransactionsTable
          expenses={data.expenses}
          total={data.totalExpenses}
          emptyText="No expenses in this period."
        />
      </section>

      <section className="moon-report-section">
        <h2>3. Total Remaining</h2>
        <table
          aria-label="Report totals"
          className="moon-report-table moon-report-summary"
        >
          <thead>
            <tr>
              <th>SUMMARY</th>
              <th className="amount">AMOUNT (SAR)</th>
            </tr>
          </thead>
          <tbody>
            {data.openingBalance !== 0 && (
              <tr>
                <td>Balance brought forward</td>
                <td className="amount">
                  {formatReportAmount(data.openingBalance)}
                </td>
              </tr>
            )}
            <tr>
              <td>Total Budget</td>
              <td className="amount">
                {formatReportAmount(data.totalReceived)}
              </td>
            </tr>
            <tr>
              <td>Less: Total Expenses</td>
              <td className="amount">
                {formatReportAmount(data.totalExpenses)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className={data.remainingBudget < 0 ? 'negative' : undefined}>
              <th>TOTAL REMAINING</th>
              <td className="amount">
                {formatReportAmount(data.remainingBudget)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
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
