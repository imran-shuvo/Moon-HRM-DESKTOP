import { useMemo, useState } from 'react';
import {
  BudgetTransaction,
  bySerialNo,
  describeReportFilters,
  fileTimestamp,
  formatCurrency,
  inDateRange,
} from '../model';
import BudgetPaymentsTable from './BudgetPaymentsTable';
import BudgetPrintableReport, {
  PrintableBudgetReportData,
} from './BudgetPrintableReport';
import ExportPreviewDialog from './ExportPreviewDialog';

export default function BudgetManagementPanel({
  payments,
  payers: savedPayers,
  isDateClosed,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  onExportPdf,
}: {
  payments: BudgetTransaction[];
  /** Employee names. */
  payers: string[];
  isDateClosed: (date: string) => boolean;
  onAddPayment: () => void;
  onEditPayment: (payment: BudgetTransaction) => void;
  onDeletePayment: (payment: BudgetTransaction) => void;
  onExportPdf: (data: PrintableBudgetReportData) => void;
}) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [previewData, setPreviewData] = useState<PrintableBudgetReportData>();
  const payers = useMemo(
    () =>
      [
        ...new Set([
          ...savedPayers,
          ...payments.map((payment) => payment.paidBy || 'Company'),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [savedPayers, payments],
  );
  const filteredPayments = useMemo(
    () =>
      payments.filter(
        (payment) =>
          inDateRange(payment.date, fromDate, toDate) &&
          (!paidBy || (payment.paidBy || 'Company') === paidBy) &&
          (!paymentMethod || payment.paymentMethod === paymentMethod),
      ),
    [payments, fromDate, toDate, paidBy, paymentMethod],
  );
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const received = filteredPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );

  /** The PDF contains exactly the budgets listed under these filters. */
  function createBudgetReportData(): PrintableBudgetReportData {
    const generatedAt = new Date();
    return {
      payments: [...filteredPayments].sort(bySerialNo),
      filterSummary: describeReportFilters(fromDate, toDate, [
        ['Payee', paidBy || 'All'],
        ['Method', paymentMethod],
      ]),
      fileName: `budget-transactions_${fileTimestamp(generatedAt)}`,
      generatedAt,
    };
  }

  return (
    <>
      <section className="budget-summary panel budget-ledger-summary">
        <div>
          <p className="stat-label">Total budgets received</p>
          <strong>{formatCurrency(received)}</strong>
          <p className="stat-foot">
            {filteredPayments.length} budget
            {filteredPayments.length === 1 ? '' : 's'} in this list
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={onAddPayment}
          type="button"
        >
          <span aria-hidden="true">＋</span> Add budget
        </button>
      </section>
      <section className="panel full-panel budget-ledger-panel">
        <div className="panel-heading transaction-heading">
          <div>
            <h2>All budgets received</h2>
            <p>Date, payer, payment method, and amount for each budget.</p>
          </div>
          <div className="transaction-filters">
            <label className="filter-control" htmlFor="budget-from-filter">
              From
              <input
                aria-label="Filter budgets from date"
                id="budget-from-filter"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.currentTarget.value)}
              />
            </label>
            <label className="filter-control" htmlFor="budget-to-filter">
              To
              <input
                aria-label="Filter budgets to date"
                id="budget-to-filter"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.currentTarget.value)}
              />
            </label>
            {(fromDate || toDate) && (
              <button
                aria-label="Clear budget date filter"
                className="button button-secondary clear-filter"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                type="button"
              >
                Clear dates
              </button>
            )}
            <label className="filter-control" htmlFor="budget-payer-filter">
              Payee
              <select
                aria-label="Filter budgets by payer"
                id="budget-payer-filter"
                value={paidBy}
                onChange={(event) => setPaidBy(event.currentTarget.value)}
              >
                <option value="">All payees</option>
                {payers.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="filter-control" htmlFor="budget-method-filter">
              Method
              <select
                aria-label="Filter budgets by payment method"
                id="budget-method-filter"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.currentTarget.value)
                }
              >
                <option value="">Cash or card</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </label>
            <button
              className="button button-secondary"
              disabled={invalidRange}
              onClick={() => onExportPdf(createBudgetReportData())}
              type="button"
            >
              ↓ Export budgets as PDF
            </button>
            <button
              className="button button-secondary"
              disabled={invalidRange}
              onClick={() => setPreviewData(createBudgetReportData())}
              type="button"
            >
              Preview PDF
            </button>
          </div>
        </div>
        {invalidRange && (
          <p className="form-error transaction-filter-error" role="alert">
            The From date must be on or before the To date.
          </p>
        )}
        <BudgetPaymentsTable
          payments={filteredPayments}
          isDateClosed={isDateClosed}
          onEdit={onEditPayment}
          onDelete={onDeletePayment}
        />
        {filteredPayments.length === 0 && (
          <p className="empty-state">No budget payments match these filters.</p>
        )}
      </section>
      {previewData && (
        <ExportPreviewDialog
          title="Preview budget PDF"
          exportLabel="Print / Save PDF"
          onClose={() => setPreviewData(undefined)}
          onExport={() => {
            onExportPdf(previewData);
            setPreviewData(undefined);
          }}
        >
          <BudgetPrintableReport data={previewData} />
        </ExportPreviewDialog>
      )}
    </>
  );
}
