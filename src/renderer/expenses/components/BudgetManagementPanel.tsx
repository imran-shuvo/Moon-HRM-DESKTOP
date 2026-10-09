import { useMemo, useState } from 'react';
import { BudgetTransaction, formatCurrency } from '../model';
import BudgetPaymentsTable from './BudgetPaymentsTable';
import BudgetPrintableReport, {
  PrintableBudgetReportData,
} from './BudgetPrintableReport';
import ExportPreviewDialog from './ExportPreviewDialog';

export default function BudgetManagementPanel({
  payments,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  onExportPdf,
}: {
  payments: BudgetTransaction[];
  onAddPayment: () => void;
  onEditPayment: (payment: BudgetTransaction) => void;
  onDeletePayment: (payment: BudgetTransaction) => void;
  onExportPdf: (data: PrintableBudgetReportData) => void;
}) {
  const [month, setMonth] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [previewData, setPreviewData] = useState<PrintableBudgetReportData>();
  const payers = useMemo(
    () =>
      [
        ...new Set(payments.map((payment) => payment.paidBy || 'Company')),
      ].sort(),
    [payments],
  );
  const filteredPayments = useMemo(
    () =>
      [...payments]
        .filter((payment) => !month || payment.date.slice(0, 7) === month)
        .filter(
          (payment) => !paidBy || (payment.paidBy || 'Company') === paidBy,
        )
        .filter(
          (payment) =>
            !paymentMethod || (payment.paymentMethod || '') === paymentMethod,
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [payments, month, paidBy, paymentMethod],
  );
  const received = filteredPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );

  function createBudgetReportData() {
    const generatedAt = new Date();
    const dateStamp = [
      generatedAt.getFullYear(),
      String(generatedAt.getMonth() + 1).padStart(2, '0'),
      String(generatedAt.getDate()).padStart(2, '0'),
    ].join('-');
    const timeStamp = [
      String(generatedAt.getHours()).padStart(2, '0'),
      String(generatedAt.getMinutes()).padStart(2, '0'),
      String(generatedAt.getSeconds()).padStart(2, '0'),
    ].join('-');
    return {
      payments: [...payments].sort((a, b) => a.date.localeCompare(b.date)),
      fileName: `budget-transactions_${dateStamp}_${timeStamp}`,
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
            <label className="filter-control" htmlFor="budget-month-filter">
              Month
              <input
                aria-label="Filter budgets by month"
                id="budget-month-filter"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.currentTarget.value)}
              />
            </label>
            <label className="filter-control" htmlFor="budget-payer-filter">
              Paid by
              <select
                aria-label="Filter budgets by payer"
                id="budget-payer-filter"
                value={paidBy}
                onChange={(event) => setPaidBy(event.currentTarget.value)}
              >
                <option value="">All payers</option>
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
              onClick={() => onExportPdf(createBudgetReportData())}
              type="button"
            >
              ↓ Export budgets as PDF
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                const data = createBudgetReportData();
                setPreviewData(data);
              }}
              type="button"
            >
              Preview PDF
            </button>
          </div>
        </div>
        <BudgetPaymentsTable
          payments={filteredPayments}
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
          error={undefined}
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
