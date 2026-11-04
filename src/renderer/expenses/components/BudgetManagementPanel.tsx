import { useMemo, useState } from 'react';
import {
  formatMonthName,
  monthKey,
  previousMonthKey,
} from '../../../shared/months';
import {
  BudgetTransaction,
  Expense,
  bySerialNo,
  calculateBudgetForPeriod,
  describeReportFilters,
  fileTimestamp,
  formatCurrency,
  getMonthDateRange,
  inDateRange,
  matchesAny,
  plural,
  selfLabels,
  withSerialNumbers,
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
import { MonthNavigator } from './peopleUi';

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

/**
 * The budget month by month: what was left from last month, the budgets
 * received and expenses in the month, and what remains. When a month
 * closes its remaining budget is carried into the next; earlier months are
 * kept and reached with the month picker.
 */
export default function BudgetManagementPanel({
  payments: allPayments,
  expenses,
  payers: savedPayers,
  isDateClosed,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  onExportPdf,
}: {
  payments: BudgetTransaction[];
  /** Every expense, for what each month spent. */
  expenses: Expense[];
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
  const [month, setMonthState] = useState(monthKey());
  /** A date range belongs to one month, so it is cleared with the month. */
  const setMonth = (next: string) => {
    setMonthState(next);
    set({ from: '', to: '' });
  };
  const current = month === monthKey();
  const monthName = formatMonthName(month);
  const previousMonthName = formatMonthName(previousMonthKey(month));
  const nextMonthName = formatMonthName(
    monthKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)),
  );
  const monthRange = getMonthDateRange(`${month}-01`);
  const closed = isDateClosed(monthRange.start);
  const budget = useMemo(
    () =>
      calculateBudgetForPeriod(
        expenses,
        allPayments,
        monthRange.start,
        monthRange.end,
      ),
    [expenses, allPayments, monthRange.start, monthRange.end],
  );
  // The month's budgets, numbered from 1 in the order they were entered.
  const payments = useMemo(
    () =>
      withSerialNumbers(
        allPayments.filter((payment) => payment.date.startsWith(month)),
      ),
    [allPayments, month],
  );
  const payers = useMemo(
    () =>
      [
        ...new Set([
          ...savedPayers,
          ...allPayments.map((payment) => payment.paidBy || 'Company'),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [savedPayers, allPayments],
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

  /** The PDF contains exactly the budgets listed under these filters. */
  function createBudgetReportData(): PrintableBudgetReportData {
    const generatedAt = new Date();
    return {
      payments: [...filteredPayments].sort(bySerialNo),
      filterSummary: describeReportFilters(
        fromDate || monthRange.start,
        toDate || monthRange.end,
        [
          ['Payee', filters.payers.join(', ') || 'All'],
          ['Method', filters.methods.join(', ')],
          ['Search', filters.search.trim() && `"${filters.search.trim()}"`],
        ],
      ),
      monthSummary: {
        monthName,
        previousMonthName,
        broughtForward: budget.broughtForward,
        received: budget.receivedInPeriod,
        spent: budget.expensesInPeriod,
        remaining: budget.remainingBudget,
        closed,
      },
      fileName: `budget-transactions_${month}_${fileTimestamp(generatedAt)}`,
      generatedAt,
    };
  }

  return (
    <>
      <section className="panel budget-month-panel">
        <div className="payroll-header">
          <MonthNavigator id="budget-month" value={month} onChange={setMonth} />
          <button
            className="button button-primary push-right"
            onClick={onAddPayment}
            type="button"
          >
            <span aria-hidden="true">＋</span> Add budget
          </button>
        </div>
        <div
          aria-label={`Budget for ${monthName}`}
          className="payroll-totals petty-cash-totals"
        >
          <div>
            <span>Remaining from {previousMonthName}</span>
            <strong>{formatCurrency(budget.broughtForward)}</strong>
            <small>Carried in when {monthName} began</small>
          </div>
          <div className="total-paid">
            <span>Received in {monthName}</span>
            <strong>{formatCurrency(budget.receivedInPeriod)}</strong>
            <small>{plural(payments.length, 'budget')} received</small>
          </div>
          <div>
            <span>Expenses in {monthName}</span>
            <strong>{formatCurrency(budget.expensesInPeriod)}</strong>
            <small>Of {formatCurrency(budget.totalBudget)} available</small>
          </div>
          <div className="total-unpaid">
            <span>
              {current ? 'Remaining now' : `Remaining end of ${monthName}`}
            </span>
            <strong>{formatCurrency(budget.remainingBudget)}</strong>
            <small>
              {closed
                ? `Carried into ${nextMonthName}`
                : 'Carries into next month'}
            </small>
          </div>
        </div>
        {closed && (
          <p className="closed-note budget-closed">
            {monthName} is closed, so its budget is read-only. Its remaining{' '}
            {formatCurrency(budget.remainingBudget)} was carried into{' '}
            {nextMonthName}. Reopen it in Settings → Month closing to correct
            it.
          </p>
        )}
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
                ? `No budgets received in ${monthName} yet.`
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
