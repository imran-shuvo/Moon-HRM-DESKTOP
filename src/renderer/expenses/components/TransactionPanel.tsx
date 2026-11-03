import { useMemo, useState } from 'react';
import { formatMonthName, monthKey } from '../../../shared/months';
import { roundMoney } from '../../../shared/payroll';
import {
  Expense,
  bySerialNo,
  describeReportFilters,
  distinctValues,
  fileTimestamp,
  formatCurrency,
  getExpenseTotal,
  getMonthDateRange,
  inDateRange,
  matchesAny,
  matchesSearch,
  plural,
  selfLabels,
  withSerialNumbers,
} from '../model';
import ExpenseListTable from './ExpenseListTable';
import ExpensePrintableReport, {
  PrintableExpenseReportData,
} from './ExpensePrintableReport';
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
  payees: string[];
  categories: string[];
  departments: string[];
  methods: string[];
};

const NO_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  payees: [],
  categories: [],
  departments: [],
  methods: [],
};

/**
 * Expenses month by month: each month starts its own list, numbered from 1,
 * and earlier months stay available with the month picker.
 */
export default function TransactionPanel({
  expenses: allExpenses,
  isDateClosed,
  payees,
  onSelect,
  onExportPdf,
}: {
  /** Every expense; this panel shows one month of them. */
  expenses: Expense[];
  /** Whether a YYYY-MM-DD date is in a closed month. */
  isDateClosed: (date: string) => boolean;
  /** Employee names and names already on expenses. */
  payees: string[];
  onSelect: (expense: Expense) => void;
  onExportPdf: (data: PrintableExpenseReportData) => void;
}) {
  const [filters, setFilters] = useSessionState('transactions', NO_FILTERS);
  const [previewData, setPreviewData] = useState<PrintableExpenseReportData>();
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const [month, setMonthState] = useState(monthKey());
  /** A date range belongs to one month, so it is cleared with the month. */
  const setMonth = (next: string) => {
    setMonthState(next);
    set({ from: '', to: '' });
  };
  const monthName = formatMonthName(month);
  const monthRange = getMonthDateRange(`${month}-01`);
  const closed = isDateClosed(monthRange.start);
  // The month's expenses, numbered from 1 in the order they were entered.
  const expenses = useMemo(
    () =>
      withSerialNumbers(
        allExpenses.filter((expense) => expense.date.startsWith(month)),
      ),
    [allExpenses, month],
  );
  const invalidRange = Boolean(
    filters.from && filters.to && filters.from > filters.to,
  );
  const options = {
    categories: distinctValues(expenses.map((expense) => expense.category)),
    departments: distinctValues(expenses.map((expense) => expense.department)),
    methods: distinctValues(expenses.map((expense) => expense.paymentMethod)),
  };
  const shown = expenses.filter(
    (expense) =>
      inDateRange(expense.date, filters.from, filters.to) &&
      matchesAny(filters.payees, expense.payee) &&
      matchesAny(filters.categories, expense.category) &&
      matchesAny(filters.departments, expense.department) &&
      matchesAny(filters.methods, expense.paymentMethod) &&
      matchesSearch(expense, filters.search),
  );
  const monthTotal = roundMoney(
    expenses.reduce((total, expense) => total + getExpenseTotal(expense), 0),
  );
  const shownTotal = roundMoney(
    shown.reduce((total, expense) => total + getExpenseTotal(expense), 0),
  );
  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...dateChip(filters, (range) => set(range)),
    ...multiChips('Paid to', filters.payees, selfLabels(payees), (v) =>
      set({ payees: v }),
    ),
    ...multiChips(
      'Type',
      filters.categories,
      selfLabels(options.categories),
      (v) => set({ categories: v }),
    ),
    ...multiChips(
      'Department',
      filters.departments,
      selfLabels(options.departments),
      (v) => set({ departments: v }),
    ),
    ...multiChips('Method', filters.methods, selfLabels(options.methods), (v) =>
      set({ methods: v }),
    ),
  ];

  /** The PDF contains exactly the expenses listed under these filters. */
  function createReportData(): PrintableExpenseReportData {
    const generatedAt = new Date();
    return {
      expenses: [...shown].sort(bySerialNo),
      filterSummary: describeReportFilters(
        filters.from || monthRange.start,
        filters.to || monthRange.end,
        [
          ['Paid to', filters.payees.join(', ') || 'All'],
          ['Type', filters.categories.join(', ')],
          ['Department', filters.departments.join(', ')],
          ['Payment method', filters.methods.join(', ')],
          ['Search', filters.search.trim() && `"${filters.search.trim()}"`],
        ],
      ),
      fileName: `expense-transactions_${month}_${fileTimestamp(generatedAt)}`,
      generatedAt,
    };
  }

  return (
    <section className="panel full-panel">
      <div className="panel-heading transaction-heading">
        <div>
          <h2>Expenses in {monthName}</h2>
          <p>
            {plural(expenses.length, 'expense')} · {formatCurrency(monthTotal)}
            {shown.length !== expenses.length &&
              ` · ${shown.length} shown: ${formatCurrency(shownTotal)}`}
          </p>
        </div>
        <div className="heading-actions">
          <MonthNavigator
            id="transaction-month"
            value={month}
            onChange={setMonth}
          />
          <button
            className="button button-secondary"
            disabled={invalidRange}
            onClick={() => setPreviewData(createReportData())}
            type="button"
          >
            Preview PDF
          </button>
          <button
            className="button button-secondary"
            disabled={invalidRange}
            onClick={() => onExportPdf(createReportData())}
            type="button"
          >
            ↓ Export expenses as PDF
          </button>
        </div>
      </div>
      <FilterBar
        searchId="transaction-search"
        searchLabel="Search transactions"
        searchPlaceholder="Search payee, invoice, particulars, project…"
        search={filters.search}
        onSearchChange={(search) => set({ search })}
        chips={chips}
        shown={shown.length}
        total={expenses.length}
        noun="expenses"
        onClearAll={() => setFilters(NO_FILTERS)}
      >
        <DateRangeFilter
          id="transaction-dates"
          label="Date"
          fromLabel="Filter expenses from date"
          toLabel="Filter expenses to date"
          value={filters}
          onChange={(range) => set(range)}
        />
        <MultiSelectFilter
          id="transaction-payee"
          label="Paid to"
          allLabel="All payees"
          options={payees}
          labels={selfLabels(payees)}
          counts={countBy(expenses, (expense) => expense.payee)}
          selected={filters.payees}
          onChange={(v) => set({ payees: v })}
        />
        <MultiSelectFilter
          id="transaction-category"
          label="Type"
          allLabel="All types"
          options={options.categories}
          labels={selfLabels(options.categories)}
          counts={countBy(expenses, (expense) => expense.category)}
          selected={filters.categories}
          onChange={(v) => set({ categories: v })}
        />
        <MultiSelectFilter
          id="transaction-department"
          label="Department"
          allLabel="All departments"
          options={options.departments}
          labels={selfLabels(options.departments)}
          counts={countBy(expenses, (expense) => expense.department)}
          selected={filters.departments}
          onChange={(v) => set({ departments: v })}
        />
        <MultiSelectFilter
          id="transaction-method"
          label="Payment method"
          allLabel="All methods"
          options={options.methods}
          labels={selfLabels(options.methods)}
          counts={countBy(expenses, (expense) => expense.paymentMethod)}
          selected={filters.methods}
          onChange={(v) => set({ methods: v })}
        />
      </FilterBar>
      {closed && (
        <p className="closed-note transaction-closed">
          {monthName} is closed, so its expenses are read-only. Reopen it in
          Settings → Month closing to correct it.
        </p>
      )}
      {invalidRange && (
        <p className="form-error transaction-filter-error" role="alert">
          The From date must be on or before the To date.
        </p>
      )}
      <ExpenseListTable expenses={shown} onSelect={onSelect} />
      {shown.length === 0 && (
        <div className="empty-state empty-action">
          <p>
            {expenses.length === 0
              ? `No expenses in ${monthName} yet.`
              : 'No expenses match these filters.'}
          </p>
          {chips.length > 0 && (
            <button
              className="button button-secondary"
              onClick={() => setFilters(NO_FILTERS)}
              type="button"
            >
              Show all expenses
            </button>
          )}
        </div>
      )}
      {previewData && (
        <ExportPreviewDialog
          title="Preview expense PDF"
          exportLabel="Save PDF"
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
