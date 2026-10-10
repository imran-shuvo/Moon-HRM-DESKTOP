import { useMemo, useState } from 'react';
import ExpenseListTable from './ExpenseListTable';
import { BudgetTransaction, Expense, formatCurrency, todayKey } from '../model';
import {
  PrintableReport,
  PrintableReportData,
  createPrintableReportData,
} from './ReportExportPanel';
import ExportPreviewDialog from './ExportPreviewDialog';
import moonLogo from '../../../../assets/moon-logo.png';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getRange(period: Period, anchor: string) {
  const date = new Date(`${anchor || todayKey()}T12:00:00`);
  const start = new Date(date);
  const end = new Date(date);

  if (period === 'weekly') {
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    end.setDate(start.getDate() + 6);
  } else if (period === 'monthly') {
    start.setDate(1);
    end.setMonth(date.getMonth() + 1, 0);
  } else if (period === 'yearly') {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  }

  return { start: toDateKey(start), end: toDateKey(end) };
}

function formatRange(start: string, end: string, period: Period) {
  if (period === 'daily') {
    return new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  if (period === 'monthly') {
    return new Date(`${start}T12:00:00`).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }
  if (period === 'yearly') return start.slice(0, 4);
  return `${new Date(`${start}T12:00:00`).toLocaleDateString(undefined, options)} – ${new Date(`${end}T12:00:00`).toLocaleDateString(undefined, options)}`;
}

export default function ReportPanel({
  expenses,
  payments,
  onSelect,
  onExportPdf,
}: {
  expenses: Expense[];
  payments: BudgetTransaction[];
  onSelect: (expense: Expense) => void;
  onExportPdf: (data: PrintableReportData) => void;
}) {
  const [period, setPeriod] = useState<Period>('monthly');
  const [anchor, setAnchor] = useState(todayKey());
  const [search, setSearch] = useState('');
  const [previewData, setPreviewData] = useState<PrintableReportData>();
  const { start, end } = getRange(period, anchor);
  const report = useMemo(
    () => createPrintableReportData(expenses, payments, start, end),
    [expenses, payments, start, end],
  );
  const reportExpenses = report.expenses;
  const query = search.trim().toLowerCase();
  const visibleExpenses = reportExpenses.filter((expense) =>
    `${expense.payee} ${expense.invoiceNo} ${expense.particulars} ${expense.description} ${expense.projectName} ${expense.siteName} ${expense.vatNo} ${expense.type}`
      .toLowerCase()
      .includes(query),
  );
  const total = report.totalExpenses;
  const label = formatRange(start, end, period);
  const generatedAt = new Date();

  function createReportData() {
    return createPrintableReportData(
      expenses,
      payments,
      start,
      end,
      `${period}-finance-report_${start}_to_${end}`,
    );
  }

  return (
    <>
      <div className="report-document">
        <header className="report-brand-header">
          <div className="report-brand">
            <img
              alt="Moon Trading Contracting and Cleaning logo"
              className="report-logo"
              src={moonLogo}
            />
            <div>
              <p className="report-company-name">
                Moon Trading Contracting &amp; Cleaning
              </p>
              <p className="report-company-description">
                Finance &amp; expense report
              </p>
            </div>
          </div>
          <div className="report-generated">
            <span>Generated</span>
            <strong>
              {generatedAt.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </strong>
            <strong>
              {generatedAt.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </strong>
          </div>
        </header>
        <section className="report-summary panel">
          <div className="report-date">
            <span className="stat-icon violet">▦</span>
            <div>
              <p className="stat-label">{period} report</p>
              <strong>{label}</strong>
            </div>
          </div>
          <div className="report-total">
            <span>Total amount received</span>
            <strong>{formatCurrency(report.totalReceived)}</strong>
          </div>
          <div className="report-total">
            <span>Total expenses</span>
            <strong>{formatCurrency(total)}</strong>
          </div>
          <div className="report-total">
            <span>Total remaining</span>
            <strong>{formatCurrency(report.remainingBudget)}</strong>
          </div>
        </section>
        <section className="panel full-panel report-table-panel">
          <div className="panel-heading report-controls">
            <div>
              <h2>
                {period[0].toUpperCase() + period.slice(1)} transaction log
              </h2>
              <p>
                {reportExpenses.length} expenses · total {formatCurrency(total)}
              </p>
            </div>
            <div className="transaction-filters">
              <label className="filter-control" htmlFor="report-period">
                Period
                <select
                  aria-label="Report period"
                  id="report-period"
                  value={period}
                  onChange={(event) =>
                    setPeriod(event.currentTarget.value as Period)
                  }
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label className="filter-control" htmlFor="report-date">
                Date
                <input
                  aria-label="Report date"
                  id="report-date"
                  type="date"
                  value={anchor}
                  onChange={(event) => setAnchor(event.currentTarget.value)}
                />
              </label>
              <label className="search-box" htmlFor="report-search">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Search report"
                  id="report-search"
                  placeholder="Search report"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                />
              </label>
              <button
                className="button button-secondary"
                onClick={() => onExportPdf(createReportData())}
                type="button"
              >
                ↓ Export PDF
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
          <ExpenseListTable expenses={visibleExpenses} onSelect={onSelect} />
          {visibleExpenses.length === 0 && (
            <p className="empty-state">
              No expenses were found for this period.
            </p>
          )}
        </section>
      </div>
      {previewData && (
        <ExportPreviewDialog
          title="Preview finance report"
          exportLabel="Save PDF"
          error={undefined}
          onClose={() => setPreviewData(undefined)}
          onExport={() => {
            onExportPdf(previewData);
            setPreviewData(undefined);
          }}
        >
          <PrintableReport data={previewData} />
        </ExportPreviewDialog>
      )}
    </>
  );
}
