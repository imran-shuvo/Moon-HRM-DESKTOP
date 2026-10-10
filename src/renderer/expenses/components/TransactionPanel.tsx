import { useState } from 'react';
import {
  Expense,
  bySerialNo,
  describeReportFilters,
  fileTimestamp,
} from '../model';
import ExpenseListTable from './ExpenseListTable';
import ExpensePrintableReport, {
  PrintableExpenseReportData,
} from './ExpensePrintableReport';
import ExportPreviewDialog from './ExportPreviewDialog';

export default function TransactionPanel({
  expenses,
  fromDate,
  toDate,
  payee,
  search,
  payees,
  onFromDateChange,
  onToDateChange,
  onPayeeChange,
  onSearchChange,
  onSelect,
  onExportPdf,
}: {
  expenses: Expense[];
  fromDate: string;
  toDate: string;
  payee: string;
  search: string;
  payees: string[];
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onPayeeChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSelect: (expense: Expense) => void;
  onExportPdf: (data: PrintableExpenseReportData) => void;
}) {
  const [previewData, setPreviewData] = useState<PrintableExpenseReportData>();

  /** The PDF contains exactly the expenses listed under these filters. */
  function createReportData(): PrintableExpenseReportData {
    const generatedAt = new Date();
    return {
      expenses: [...expenses].sort(bySerialNo),
      filterSummary: describeReportFilters(fromDate, toDate, [
        ['Paid to', payee || 'All'],
        ['Search', search.trim() && `"${search.trim()}"`],
      ]),
      fileName: `expense-transactions_${fileTimestamp(generatedAt)}`,
      generatedAt,
    };
  }

  return (
    <section className="panel full-panel">
      <div className="panel-heading transaction-heading">
        <div>
          <h2>All expenses</h2>
          <p>{expenses.length} expense transactions match these filters</p>
        </div>
        <div className="transaction-filters">
          <label className="filter-control" htmlFor="transaction-from">
            From
            <input
              aria-label="Filter expenses from date"
              id="transaction-from"
              type="date"
              value={fromDate}
              onChange={(event) => onFromDateChange(event.currentTarget.value)}
            />
          </label>
          <label className="filter-control" htmlFor="transaction-to">
            To
            <input
              aria-label="Filter expenses to date"
              id="transaction-to"
              type="date"
              value={toDate}
              onChange={(event) => onToDateChange(event.currentTarget.value)}
            />
          </label>
          {(fromDate || toDate) && (
            <button
              aria-label="Clear date filter"
              className="button button-secondary clear-filter"
              onClick={() => {
                onFromDateChange('');
                onToDateChange('');
              }}
              type="button"
            >
              Clear dates
            </button>
          )}
          <label className="filter-control" htmlFor="transaction-payee">
            Paid to
            <select
              aria-label="Filter by payee"
              id="transaction-payee"
              value={payee}
              onChange={(event) => onPayeeChange(event.currentTarget.value)}
            >
              <option value="">All payees</option>
              {payees.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="search-box" htmlFor="transaction-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search transactions"
              id="transaction-search"
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Search expenses"
            />
          </label>
          <button
            className="button button-secondary"
            onClick={() => onExportPdf(createReportData())}
            type="button"
          >
            ↓ Export expenses as PDF
          </button>
          <button
            className="button button-secondary"
            onClick={() => setPreviewData(createReportData())}
            type="button"
          >
            Preview PDF
          </button>
        </div>
      </div>
      {fromDate && toDate && fromDate > toDate && (
        <p className="form-error transaction-filter-error" role="alert">
          The From date must be on or before the To date.
        </p>
      )}
      <ExpenseListTable expenses={expenses} onSelect={onSelect} />
      {expenses.length === 0 && (
        <p className="empty-state">No expenses match these filters.</p>
      )}
      {previewData && (
        <ExportPreviewDialog
          title="Preview expense PDF"
          exportLabel="Save PDF"
          error={undefined}
          onClose={() => setPreviewData(undefined)}
          onExport={() => {
            onExportPdf(previewData);
            setPreviewData(undefined);
          }}
        >
          <ExpensePrintableReport data={previewData} />
        </ExportPreviewDialog>
      )}
    </section>
  );
}
