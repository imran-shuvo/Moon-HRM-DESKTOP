import { useMemo, useState } from 'react';
import {
  BudgetTransaction,
  bySerialNo,
  describeReportFilters,
  fileTimestamp,
  formatCurrency,
  inDateRange,
  matchesAny,
  selfLabels,
} from '../model';
import BudgetPaymentsTable from './BudgetPaymentsTable';
import BudgetPrintableReport, {
  PrintableBudgetReportData,
} from './BudgetPrintableReport';
import ExportPreviewDialog from './ExportPreviewDialog';
import FilterBar, {
  DateRangeFilter,
  dateChip,
  multiChips,
  searchChip,
  useSessionState,
} from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';

type Filters = {
  search: string;
  from: string;
  to: string;
  payers: string[];
  methods: string[];
};

const NO_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  payers: [],
  methods: [],
};

const METHODS = ['Cash', 'Card'];
const METHOD_LABELS: Record<string, string> = { Cash: 'Cash', Card: 'Card' };

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
  const [filters, setFilters] = useSessionState('budgets', NO_FILTERS);
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const { from: fromDate, to: toDate } = filters;
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
  const needle = filters.search.trim().toLowerCase();
  const filteredPayments = payments.filter(
    (payment) =>
      inDateRange(payment.date, fromDate, toDate) &&
      matchesAny(filters.payers, payment.paidBy || 'Company') &&
      matchesAny(filters.methods, payment.paymentMethod ?? '') &&
      (!needle ||
        [
          payment.paidBy,
          payment.note,
          payment.date,
          String(payment.amount),
        ].some((value) => value?.toLowerCase().includes(needle))),
  );
  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...dateChip(filters, (range) => set(range)),
    ...multiChips('Payee', filters.payers, selfLabels(payers), (v) =>
      set({ payers: v }),
    ),
    ...multiChips('Method', filters.methods, METHOD_LABELS, (v) =>
      set({ methods: v }),
    ),
  ];
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
        ['Payee', filters.payers.join(', ') || 'All'],
        ['Method', filters.methods.join(', ')],
        ['Search', filters.search.trim() && `"${filters.search.trim()}"`],
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
          <div className="heading-actions">
            <button
              className="button button-secondary"
              disabled={invalidRange}
              onClick={() => setPreviewData(createBudgetReportData())}
              type="button"
            >
              Preview PDF
            </button>
            <button
              className="button button-secondary"
              disabled={invalidRange}
              onClick={() => onExportPdf(createBudgetReportData())}
              type="button"
            >
              ↓ Export budgets as PDF
            </button>
          </div>
        </div>
        <FilterBar
          searchId="budget-search"
          searchLabel="Search budgets"
          searchPlaceholder="Search payee, note or amount…"
          search={filters.search}
          onSearchChange={(search) => set({ search })}
          chips={chips}
          shown={filteredPayments.length}
          total={payments.length}
          noun="budgets"
          onClearAll={() => setFilters(NO_FILTERS)}
        >
          <DateRangeFilter
            id="budget-dates"
            label="Date"
            fromLabel="Filter budgets from date"
            toLabel="Filter budgets to date"
            value={filters}
            onChange={(range) => set(range)}
          />
          <MultiSelectFilter
            id="budget-payer-filter"
            label="Payee"
            allLabel="All payees"
            options={payers}
            labels={selfLabels(payers)}
            counts={countBy(payments, (payment) => payment.paidBy || 'Company')}
            selected={filters.payers}
            onChange={(v) => set({ payers: v })}
          />
          <MultiSelectFilter
            id="budget-method-filter"
            label="Method"
            allLabel="Cash or card"
            options={METHODS}
            labels={METHOD_LABELS}
            counts={countBy(payments, (payment) => payment.paymentMethod ?? '')}
            selected={filters.methods}
            onChange={(v) => set({ methods: v })}
          />
        </FilterBar>
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
          <div className="empty-state empty-action">
            <p>
              {payments.length === 0
                ? 'No budgets yet.'
                : 'No budget payments match these filters.'}
            </p>
            {chips.length > 0 && (
              <button
                className="button button-secondary"
                onClick={() => setFilters(NO_FILTERS)}
                type="button"
              >
                Show all budgets
              </button>
            )}
          </div>
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
