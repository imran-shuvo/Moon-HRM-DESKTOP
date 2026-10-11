import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import App from '../renderer/App';
import { getRange } from '../renderer/expenses/components/ReportPanel';
import createMemoryApi from '../testFixtures/memoryApi';
import {
  BudgetTransaction,
  Employee,
  Expense,
  calculateBudgetForPeriod,
  formatAmount,
  formatCurrency,
  getMonthDateRange,
  getMonthlyExpenseSummaries,
  formatReportAmount,
  formatReportDate,
  getExpenseTotal,
} from '../renderer/expenses/model';
import createSampleExpenses, {
  normalizeExpense,
} from '../testFixtures/sampleExpenses';

function matchesCurrency(amount: number) {
  const expected = formatCurrency(amount).replace(/\u00a0/g, ' ');
  return (content: string) => content.replace(/\u00a0/g, ' ') === expected;
}

/** Names the tests pick as "Paid to" or budget payee; seeded as employees. */
const PICKED_NAMES = [
  'Test Building Supply',
  'Updated Supply Co.',
  'January Vendor',
  'Moon Contracting',
  'Company',
  'Acme Ltd',
  'Northwind',
  'Late Vendor',
  'Northstar Rentals',
  'Offline Vendor',
];

function testEmployee(name: string, index: number): Employee {
  return {
    id: `employee-${index + 1}`,
    name,
    nickname: '',
    role: 'company_worker',
    iqamaNo: String(2400000000 + index),
    designation: '',
    projectName: '',
    phoneNo: '',
    insuranceNo: '',
    salary: null,
    iqamaExpiry: '',
    campName: '',
    workHoursPerDay: 8,
    hourlyRate: null,
  };
}

/** Renders the app against an in-memory database seeded with sample data. */
async function renderApp(
  seed: {
    expenses?: Expense[];
    budgetTransactions?: BudgetTransaction[];
    reopenedMonths?: string[];
    employees?: Employee[];
  } = {},
) {
  const expenses = (seed.expenses ?? createSampleExpenses()).map(
    normalizeExpense,
  );
  const names = [
    ...new Set([...expenses.map((expense) => expense.payee), ...PICKED_NAMES]),
  ];
  const memory = createMemoryApi({
    expenses,
    budgetTransactions: seed.budgetTransactions ?? [],
    reopenedMonths: seed.reopenedMonths ?? [],
    employees: seed.employees ?? names.map(testEmployee),
  });
  render(<App api={memory.api} />);
  await screen.findByRole('navigation', { name: 'Main navigation' });
  return memory;
}

/** Ticks (or unticks) an option in a page's filter dropdown. */
function tickFilter(filterLabel: string, option: string) {
  const control = screen
    .getAllByText(filterLabel, { selector: '.filter-control > span' })[0]
    .closest('.filter-control') as HTMLElement;
  fireEvent.click(within(control).getByRole('checkbox', { name: option }));
}

/** Picks an employee name in a dropdown. */
function chooseName(fieldLabel: string, value: string) {
  const dialog = within(screen.getByRole('dialog'));
  const select = dialog.getByLabelText(fieldLabel) as HTMLSelectElement;
  if (![...select.options].some((option) => option.value === value)) {
    throw new Error(`"${value}" is not offered; seed it as an employee.`);
  }
  fireEvent.change(select, { target: { value } });
}

/**
 * Months before the current one are closed, so tests run on a fixed day late
 * in the month: sample data (dated up to 20 days back) stays in an open month.
 */
function freezeToday() {
  jest.useFakeTimers({
    now: new Date(2026, 9, 28, 12),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}

async function waitForDialogToClose() {
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    freezeToday();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render', async () => {
    await renderApp();
    expect(
      screen.getByRole('heading', {
        name: /^Good (morning|afternoon|evening)$/,
      }),
    ).toBeInTheDocument();
  });

  it('shows total expenses, total budget received, and remaining budget', async () => {
    const expenses = createSampleExpenses();
    const previousMonth = new Date();
    previousMonth.setDate(0);
    expenses[0].date = `${previousMonth.getFullYear()}-${String(
      previousMonth.getMonth() + 1,
    ).padStart(2, '0')}-${String(previousMonth.getDate()).padStart(2, '0')}`;
    const budgetTransactions = [
      {
        id: 'overview-budget',
        date: expenses[0].date,
        amount: 100000,
        paidBy: 'Company',
        paymentMethod: 'Card' as const,
        note: 'Opening budget',
      },
    ];
    await renderApp({ expenses, budgetTransactions });
    const { start, end } = getMonthDateRange();
    const periodExpenses = expenses
      .filter((expense) => expense.date >= start && expense.date <= end)
      .reduce((sum, expense) => sum + getExpenseTotal(expense), 0);
    const { totalBudget: availableBudget, remainingBudget } =
      calculateBudgetForPeriod(expenses, budgetTransactions, start, end);
    const summaryRegion = screen.getByLabelText('Company budget summary');
    const summary = within(summaryRegion);
    const summaryLabels = Array.from(summaryRegion.children).map(
      (card) => card.querySelector('.stat-label')?.textContent,
    );

    expect(summaryLabels).toEqual([
      'Total budget',
      'Total expenses',
      'Remaining budget',
    ]);
    expect(summary.getByText('Total expenses')).toBeInTheDocument();
    expect(
      summary.getByText(matchesCurrency(periodExpenses)),
    ).toBeInTheDocument();
    expect(summary.getByText('Total budget')).toBeInTheDocument();
    expect(
      summary.getByText(matchesCurrency(availableBudget)),
    ).toBeInTheDocument();
    expect(summary.getByText('Remaining budget')).toBeInTheDocument();
    expect(
      summary.getByText(matchesCurrency(remainingBudget)),
    ).toBeInTheDocument();
    expect(
      summary.getByText("After this month's expenses"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Monthly expenses' }),
    ).toBeInTheDocument();
    const monthTable = within(
      screen.getByLabelText('Monthly expenses by month'),
    );
    // Rows show plain amounts; only totals carry the currency.
    expect(
      monthTable.getByText(
        formatAmount(
          getMonthlyExpenseSummaries(expenses).find(
            ({ month }) => month === getMonthDateRange().start.slice(0, 7),
          )?.total ?? 0,
        ),
      ),
    ).toBeInTheDocument();
  });

  it('carries previous remaining budget into the selected month', () => {
    const expenses: Expense[] = [
      {
        id: 'previous-expense',
        date: '2025-02-10',
        payee: 'Previous month supplier',
        description: 'Previous month materials',
        category: 'Materials',
        department: 'Operations',
        paymentMethod: 'Cash',
        amount: 400,
      },
      {
        id: 'current-expense',
        date: '2025-03-11',
        payee: 'Current month supplier',
        description: 'Current month materials',
        category: 'Materials',
        department: 'Operations',
        paymentMethod: 'Cash',
        amount: 250,
      },
    ];
    const payments = [
      {
        id: 'previous-budget',
        date: '2025-02-01',
        amount: 1000,
        note: 'Previous month budget',
      },
      {
        id: 'current-budget',
        date: '2025-03-10',
        amount: 300,
        note: 'Current month budget',
      },
    ];

    expect(
      calculateBudgetForPeriod(expenses, payments, '2025-03-01', '2025-03-31'),
    ).toEqual({
      broughtForward: 600,
      receivedInPeriod: 300,
      expensesInPeriod: 250,
      totalBudget: 900,
      remainingBudget: 650,
    });
    expect(getMonthlyExpenseSummaries(expenses)).toEqual([
      { month: '2025-03', total: 250, count: 1 },
      { month: '2025-02', total: 400, count: 1 },
    ]);
  });

  it('records an invoice expense with VAT and saves it to the database', async () => {
    const memory = await renderApp();

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    chooseName('Paid to', 'Test Building Supply');
    fireEvent.change(screen.getByLabelText('Particulars / details'), {
      target: { value: 'Replacement materials' },
    });
    fireEvent.change(screen.getByLabelText('Invoice no.'), {
      target: { value: 'INV-204' },
    });
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'West Wing' },
    });
    fireEvent.change(screen.getByLabelText('Site name'), {
      target: { value: 'Building A' },
    });
    fireEvent.change(screen.getByLabelText('VAT no.'), {
      target: { value: 'VAT-998' },
    });
    fireEvent.change(screen.getByLabelText('Amount excluding VAT'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText('VAT', { selector: 'input' }), {
      target: { value: '25.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'View details for Test Building Supply',
        }),
      ).toBeInTheDocument(),
    );
    expect(memory.snapshot().expenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payee: 'Test Building Supply',
          invoiceNo: 'INV-204',
          projectName: 'West Wing',
          siteName: 'Building A',
          vatNo: 'VAT-998',
          particulars: 'Replacement materials',
          amountExcludingVat: 100,
          vat: 25.5,
          amountIncludingVat: 125.5,
        }),
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'View details for Test Building Supply',
      }),
    );
    expect(screen.getAllByText('INV-204').length).toBeGreaterThan(0);
    expect(screen.getByText('West Wing')).toBeInTheDocument();
    expect(screen.getByText('Building A')).toBeInTheDocument();
    expect(screen.getByText('VAT-998')).toBeInTheDocument();
    expect(screen.getAllByText(/SAR.*125\.50/).length).toBeGreaterThan(0);
  });

  it('filters transactions by payee', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.change(screen.getByLabelText('Search transactions'), {
      target: { value: 'Pacific Building Supply' },
    });

    expect(
      screen.getAllByText('Pacific Building Supply').length,
    ).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('table')).queryByText('Evergreen Fuel Co.'),
    ).not.toBeInTheDocument();
  });

  it('edits a transaction from the transaction list', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /view details for Pacific Building Supply/i,
      })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    chooseName('Paid to', 'Updated Supply Co.');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /view details for Updated Supply Co\./i,
        }),
      ).toBeInTheDocument(),
    );
  });

  it('adds a new type and department from the expense form, not Settings', async () => {
    const memory = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(
      screen.queryByRole('heading', { name: /categories|departments/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    const dialog = within(screen.getByRole('dialog'));
    chooseName('Paid to', 'Test Building Supply');
    fireEvent.change(dialog.getByLabelText('Type'), {
      target: { value: '__new__' },
    });
    fireEvent.change(dialog.getByLabelText('New type'), {
      target: { value: 'Insurance' },
    });
    fireEvent.change(dialog.getByLabelText('Department'), {
      target: { value: '__new__' },
    });
    fireEvent.change(dialog.getByLabelText('New department'), {
      target: { value: 'Safety' },
    });
    fireEvent.change(dialog.getByLabelText('Particulars / details'), {
      target: { value: 'Vehicle insurance' },
    });
    fireEvent.change(dialog.getByLabelText('Amount excluding VAT'), {
      target: { value: '300' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Save expense' }));
    await waitForDialogToClose();

    expect(memory.snapshot().categories).toContain('Insurance');
    expect(memory.snapshot().departments).toContain('Safety');
    expect(memory.snapshot().expenses).toContainEqual(
      expect.objectContaining({ category: 'Insurance', department: 'Safety' }),
    );

    // Both are offered next time, and typing an existing name reuses it.
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    const next = within(screen.getByRole('dialog'));
    expect(next.getByRole('option', { name: 'Insurance' })).toBeInTheDocument();
    expect(next.getByRole('option', { name: 'Safety' })).toBeInTheDocument();
    chooseName('Paid to', 'Test Building Supply');
    fireEvent.change(next.getByLabelText('Type'), {
      target: { value: '__new__' },
    });
    fireEvent.change(next.getByLabelText('New type'), {
      target: { value: 'insurance' },
    });
    fireEvent.change(next.getByLabelText('Particulars / details'), {
      target: { value: 'Renewal' },
    });
    fireEvent.change(next.getByLabelText('Amount excluding VAT'), {
      target: { value: '50' },
    });
    fireEvent.click(next.getByRole('button', { name: 'Save expense' }));
    await waitForDialogToClose();
    expect(
      memory
        .snapshot()
        .categories.filter((name) => name.toLowerCase() === 'insurance'),
    ).toEqual(['Insurance']);
  });

  it('filters expenses by payee and date range', async () => {
    const memory = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    tickFilter('Paid to', 'Pacific Building Supply');

    const table = within(screen.getByRole('table'));
    expect(
      table.getAllByText('Pacific Building Supply').length,
    ).toBeGreaterThan(0);
    expect(table.queryByText('Evergreen Fuel Co.')).not.toBeInTheDocument();

    const { date } = memory.snapshot().expenses[0];
    fireEvent.change(screen.getByLabelText('Filter expenses from date'), {
      target: { value: date },
    });
    fireEvent.change(screen.getByLabelText('Filter expenses to date'), {
      target: { value: date },
    });
    expect(
      table.getAllByText('Pacific Building Supply').length,
    ).toBeGreaterThan(0);
  });

  it('filters with date presets, removable chips and a result count', async () => {
    const memory = await renderApp();
    const total = memory.snapshot().expenses.length;
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    expect(
      screen.getByText(/^All/, { selector: '.result-count' }).textContent,
    ).toBe(`All ${total} expenses`);

    // Today is frozen at 2026-10-28; sample expenses go up to 20 days back.
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    const today = memory
      .snapshot()
      .expenses.filter((expense) => expense.date === '2026-10-28').length;
    expect(
      screen.getByText(/Showing/, { selector: '.result-count' }).textContent,
    ).toBe(`Showing ${today} of ${total} expenses`);
    expect(screen.getByLabelText('Filter expenses from date')).toHaveValue(
      '2026-10-28',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove filter Date: Today' }),
    );
    expect(
      screen.getByText(/^All/, { selector: '.result-count' }).textContent,
    ).toBe(`All ${total} expenses`);

    // Long lists can be searched inside the dropdown.
    fireEvent.change(screen.getByLabelText('Search paid to'), {
      target: { value: 'pacific' },
    });
    const payee = screen
      .getAllByText('Paid to', { selector: '.filter-control > span' })[0]
      .closest('.filter-control') as HTMLElement;
    expect(
      within(payee)
        .getAllByRole('checkbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual(['Pacific Building Supply']);
    fireEvent.click(
      within(payee).getByRole('button', { name: 'Select matches' }),
    );
    expect(
      screen.getByRole('button', {
        name: 'Remove filter Paid to: Pacific Building Supply',
      }),
    ).toBeInTheDocument();

    // Filters are remembered when moving between pages.
    fireEvent.click(screen.getByRole('button', { name: /overview/i }));
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    expect(
      screen.getByRole('button', {
        name: 'Remove filter Paid to: Pacific Building Supply',
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(
      screen.getByText(/^All/, { selector: '.result-count' }).textContent,
    ).toBe(`All ${total} expenses`);
  });

  it('filters out expenses outside the date range', async () => {
    // January 2020 is closed; reopen it to record an expense there.
    const memory = await renderApp({ reopenedMonths: ['2020-01'] });
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    chooseName('Paid to', 'January Vendor');
    fireEvent.change(screen.getByLabelText('Particulars / details'), {
      target: { value: 'January purchase' },
    });
    fireEvent.change(screen.getByLabelText('Amount excluding VAT'), {
      target: { value: '125' },
    });
    fireEvent.change(screen.getByLabelText('Invoice date'), {
      target: { value: '2020-01-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() =>
      expect(memory.snapshot().expenses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ payee: 'January Vendor', amount: 125 }),
        ]),
      ),
    );
    fireEvent.change(screen.getByLabelText('Filter expenses from date'), {
      target: { value: '2020-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Filter expenses to date'), {
      target: { value: '2020-01-31' },
    });

    const table = within(screen.getByRole('table'));
    expect(table.getByText('January Vendor')).toBeInTheDocument();
    expect(
      table.queryByText(/Lumber & site materials/),
    ).not.toBeInTheDocument();
  });

  it('shows report totals without a per-transaction balance column', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /reports/i }));
    fireEvent.change(screen.getByLabelText('Report period'), {
      target: { value: 'yearly' },
    });

    expect(screen.getByText('Yearly transaction log')).toBeInTheDocument();
    expect(screen.getByText('Total remaining')).toBeInTheDocument();
    expect(screen.getByText('Total amount received')).toBeInTheDocument();
    expect(screen.getByText('Total expenses')).toBeInTheDocument();
    expect(
      screen.getByText('Moon Trading Contracting & Cleaning'),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText('Moon Trading Contracting and Cleaning logo'),
    ).toBeInTheDocument();
    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(
      screen.getByText(/Total expenses \(15 transactions\)/),
    ).toBeInTheDocument();
    const reportRows = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1, -1);
    // Rows are listed by serial no. (entry order), lowest first.
    expect(
      reportRows.map((row) => within(row).getAllByRole('cell')[0].textContent),
    ).toEqual(reportRows.map((_, index) => String(index + 1)));
    expect(
      screen.getByRole('button', { name: '↓ Export PDF' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));
    expect(
      screen.getByRole('dialog', { name: 'Preview finance report' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save PDF' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(
      screen.queryByRole('columnheader', { name: /REMAINING/ }),
    ).not.toBeInTheDocument();
  });

  it('confirms before deleting a transaction', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    const matchingPayees = screen.getAllByText(
      'Pacific Building Supply',
    ).length;
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /view details for Pacific Building Supply/i,
      })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const confirmation = screen.getByRole('alertdialog');
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'Delete expense' }),
    );
    await waitFor(() =>
      expect(screen.getAllByText('Pacific Building Supply').length).toBe(
        matchingPayees - 1,
      ),
    );
  });

  it('records company payments and calculates the remaining balance', async () => {
    const memory = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
    fireEvent.change(screen.getByLabelText('Payment amount'), {
      target: { value: '50000' },
    });
    chooseName('Received from', 'Moon Contracting');
    fireEvent.change(screen.getByLabelText('Budget payment method'), {
      target: { value: 'Card' },
    });
    fireEvent.change(screen.getByLabelText(/Note/), {
      target: { value: 'First installment' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    await waitForDialogToClose();

    const budgetTable = within(screen.getByRole('table'));
    expect(budgetTable.getByText('50,000.00')).toBeInTheDocument();
    expect(
      budgetTable.getByRole('columnheader', { name: 'SERIAL NO.' }),
    ).toBeInTheDocument();
    expect(budgetTable.getByText('1')).toBeInTheDocument();
    expect(
      screen.queryByText('Current budget balance'),
    ).not.toBeInTheDocument();
    expect(budgetTable.getByText('First installment')).toBeInTheDocument();
    expect(memory.snapshot().budgetTransactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 50000,
          paidBy: 'Moon Contracting',
          paymentMethod: 'Card',
          note: 'First installment',
        }),
      ]),
    );
  });

  it('keeps budget receipts out of the expense transaction list', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
    fireEvent.change(screen.getByLabelText('Payment amount'), {
      target: { value: '10000' },
    });
    chooseName('Received from', 'Company');
    fireEvent.change(screen.getByLabelText('Budget payment method'), {
      target: { value: 'Cash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
    await waitForDialogToClose();

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    const table = within(screen.getByRole('table'));
    expect(
      table.getByRole('columnheader', { name: 'SERIAL NO.' }),
    ).toBeInTheDocument();
    expect(
      table.getByRole('columnheader', { name: 'INVOICE NO.' }),
    ).toBeInTheDocument();
    expect(
      table.queryByRole('columnheader', { name: /BALANCE|REMAINING/ }),
    ).not.toBeInTheDocument();
    expect(table.queryByText('Company')).not.toBeInTheDocument();
    expect(table.queryByText('Company payment')).not.toBeInTheDocument();
    expect(
      table.getAllByText('Pacific Building Supply').length,
    ).toBeGreaterThan(0);
  });

  it('filters budget payments by payee, date range, and payment method', async () => {
    await renderApp({ reopenedMonths: ['2026-01', '2026-02'] });
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));

    async function addPayment(payer: string, date: string, method: string) {
      fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
      fireEvent.change(screen.getByLabelText('Payment amount'), {
        target: { value: '2500' },
      });
      chooseName('Received from', payer);
      fireEvent.change(screen.getByLabelText('Date received'), {
        target: { value: date },
      });
      fireEvent.change(screen.getByLabelText('Budget payment method'), {
        target: { value: method },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save payment' }));
      await waitForDialogToClose();
    }

    await addPayment('Acme Ltd', '2026-01-03', 'Cash');
    await addPayment('Northwind', '2026-02-03', 'Card');
    tickFilter('Payee', 'Acme Ltd');
    fireEvent.change(screen.getByLabelText('Filter budgets from date'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Filter budgets to date'), {
      target: { value: '2026-01-31' },
    });
    tickFilter('Method', 'Cash');

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Acme Ltd')).toBeInTheDocument();
    expect(table.queryByText('Northwind')).not.toBeInTheDocument();
  });

  it('offers a budget export action', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    expect(
      screen.getByRole('button', { name: /export budgets as pdf/i }),
    ).toBeInTheDocument();
  });

  it('prints the filtered budget transactions with a timestamped PDF title', async () => {
    const budgetTransactions = [
      {
        id: 'budget-first',
        date: '2026-01-12',
        amount: 1200,
        paidBy: 'Acme Ltd',
        paymentMethod: 'Cash' as const,
        note: 'January deposit',
      },
      {
        id: 'budget-second',
        date: '2026-02-03',
        amount: 800,
        paidBy: 'Northwind',
        paymentMethod: 'Card' as const,
        note: 'February deposit',
      },
    ];
    const memory = await renderApp({ expenses: [], budgetTransactions });
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    tickFilter('Payee', 'Acme Ltd');
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));

    expect(
      screen.getByRole('dialog', { name: 'Preview budget PDF' }),
    ).toBeInTheDocument();
    expect(screen.getByText('BUDGET REPORT')).toBeInTheDocument();
    expect(
      screen.getByText('CR No: 1009039045 | Member ID: 955215'),
    ).toBeInTheDocument();
    expect(screen.getByText('1. Budget Transactions')).toBeInTheDocument();
    // Only the filtered budgets are printed, with the filters described.
    expect(
      screen.getByText('Period: All dates · Payee: Acme Ltd'),
    ).toBeInTheDocument();
    expect(screen.getByText('12-Jan-2026')).toBeInTheDocument();
    expect(screen.getAllByText('1,200.00').length).toBeGreaterThan(0);
    const budgetPrintTable = within(screen.getAllByRole('table')[1]);
    const budgetRows = budgetPrintTable.getAllByRole('row');
    expect(budgetRows).toHaveLength(3); // header, Acme Ltd, total
    expect(within(budgetRows[1]).getAllByRole('cell')[0]).toHaveTextContent(
      '1',
    );
    expect(within(budgetRows[1]).getByText('Acme Ltd')).toBeInTheDocument();
    expect(budgetPrintTable.queryByText('Northwind')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf.mock.calls[0][0]).toMatch(
      /^budget-transactions_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/,
    );
    expect(await screen.findByText(/PDF saved:/)).toBeInTheDocument();
  });

  it('filters report exports inclusively by the selected date range', async () => {
    const expenses = createSampleExpenses();
    const budgetTransactions = [
      {
        id: 'report-budget',
        date: expenses[0].date,
        amount: 5000,
        paidBy: 'Company',
        paymentMethod: 'Card' as const,
        note: 'Monthly budget',
      },
    ];
    await renderApp({ expenses, budgetTransactions });
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const sampleDate = expenses[0].date;

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: sampleDate },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: sampleDate },
    });
    const expected = calculateBudgetForPeriod(
      expenses,
      budgetTransactions,
      sampleDate,
      sampleDate,
    ).remainingBudget;

    expect(
      screen.getByText('1 budget payments · 2 expenses in range'),
    ).toBeInTheDocument();
    const exportPreview = screen
      .getByText('Total remaining')
      .closest('.report-export-preview');
    expect(exportPreview).not.toBeNull();
    expect(
      within(exportPreview as HTMLElement).getByText(matchesCurrency(expected)),
    ).toBeInTheDocument();
  });

  it('builds a PDF with budget, expense and summary pages', async () => {
    const expenses = createSampleExpenses();
    const sampleDate = expenses[0].date;
    const budgetTransactions = [
      {
        id: 'earlier-budget',
        date: '2000-01-01',
        amount: 1000,
        paidBy: 'Company',
        paymentMethod: 'Cash' as const,
        note: 'Opening float',
      },
      {
        id: 'report-budget',
        date: sampleDate,
        amount: 5000,
        paidBy: 'Company',
        paymentMethod: 'Card' as const,
        note: 'Monthly budget',
      },
    ];
    await renderApp({ expenses, budgetTransactions });
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: sampleDate },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: sampleDate },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));

    const dialog = within(
      screen.getByRole('dialog', { name: 'Preview finance report' }),
    );
    const sections = document.querySelectorAll(
      '.export-preview-content .moon-report-section',
    );
    expect(sections).toHaveLength(3);
    within(sections[0] as HTMLElement).getByText('1. Budget Transactions');
    expect(within(sections[0] as HTMLElement).getAllByRole('row')).toHaveLength(
      3,
    );
    expect(
      within(sections[0] as HTMLElement).getAllByText(formatReportAmount(5000)),
    ).toHaveLength(2);
    within(sections[1] as HTMLElement).getByText('2. Expense Transactions');
    within(sections[1] as HTMLElement).getAllByText(
      formatReportDate(sampleDate),
    );
    expect(within(sections[1] as HTMLElement).getAllByRole('row')).toHaveLength(
      4,
    );

    const totals = within(dialog.getByRole('table', { name: 'Report totals' }));
    const amountFor = (label: string) =>
      totals.getByText(label).closest('tr')?.querySelector('.amount')
        ?.textContent;
    const { remainingBudget } = calculateBudgetForPeriod(
      expenses,
      budgetTransactions,
      sampleDate,
      sampleDate,
    );
    const priorExpenses = expenses
      .filter((expense) => expense.date < sampleDate)
      .reduce((sum, expense) => sum + getExpenseTotal(expense), 0);
    expect(amountFor('Balance brought forward')).toBe(
      formatReportAmount(1000 - priorExpenses),
    );
    expect(amountFor('Total Budget')).toBe(formatReportAmount(5000));
    expect(amountFor('Less: Total Expenses')).toBe(formatReportAmount(3525));
    expect(amountFor('TOTAL REMAINING')).toBe(
      formatReportAmount(remainingBudget),
    );
  });

  it('saves the report as a PDF and rejects reversed date ranges', async () => {
    const memory = await renderApp();
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const sampleDate = memory.snapshot().expenses[0].date;
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-12-31' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The start date must be on or before the end date.',
    );

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: sampleDate },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: sampleDate },
    });
    expect(screen.queryByLabelText('File format')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));
    expect(
      screen.getByRole('dialog', { name: 'Preview finance report' }),
    ).toBeInTheDocument();
    // The company header is printed once, on the first page only.
    const report = screen
      .getByRole('dialog', { name: 'Preview finance report' })
      .querySelector('.standalone-print-report') as HTMLElement;
    expect(
      within(report).getAllByText('MOON TRADING CONTRACTING & CLEANING'),
    ).toHaveLength(1);
    expect(report.firstElementChild).toHaveClass('moon-report-header');
    expect(
      within(report).getByRole('img', {
        name: 'Moon Trading Contracting and Cleaning logo',
      }),
    ).toBeInTheDocument();
    within(report).getByText('BUDGET & EXPENSE REPORT');
    fireEvent.click(screen.getByRole('button', { name: 'Save PDF' }));
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf.mock.calls[0][0]).toMatch(
      /^finance-report_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/,
    );
  });

  it('offers employees as "Paid to" and budget payee, not Settings lists', async () => {
    const memory = await renderApp({ employees: [] });
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(
      screen.queryByRole('heading', { name: /paid to|payees/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /employees/i }));
    fireEvent.click(screen.getByRole('button', { name: /add employee/i }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), {
      target: { value: 'Rahim Uddin' },
    });
    fireEvent.change(dialog.getByLabelText('Iqama no.'), {
      target: { value: '2412345678' },
    });
    fireEvent.change(dialog.getByLabelText('Camp name'), {
      target: { value: 'Camp A' },
    });
    fireEvent.change(dialog.getByLabelText('Role'), {
      target: { value: 'staff' },
    });
    fireEvent.change(dialog.getByLabelText('Nickname'), {
      target: { value: 'Rahim' },
    });
    fireEvent.change(dialog.getByLabelText('Basic salary (SAR / month)'), {
      target: { value: '2500.50' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Save employee' }));
    await waitForDialogToClose();
    expect(memory.snapshot().employees).toEqual([
      expect.objectContaining({
        name: 'Rahim Uddin',
        iqamaNo: '2412345678',
        campName: 'Camp A',
        nickname: 'Rahim',
        salary: 2500.5,
        role: 'staff',
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    expect(
      within(screen.getByRole('dialog')).getByRole('option', {
        name: 'Rahim Uddin',
      }),
    ).toBeInTheDocument();
    // "Paid to" only offers employees; a new name cannot be typed.
    expect(
      within(
        within(screen.getByRole('dialog')).getByLabelText('Paid to'),
      ).queryByRole('option', { name: /new/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    fireEvent.click(screen.getByRole('button', { name: /add budget/i }));
    expect(
      within(screen.getByRole('dialog')).getByRole('option', {
        name: 'Rahim Uddin',
      }),
    ).toBeInTheDocument();
  });

  it('refuses a second employee with the same Iqama no.', async () => {
    await renderApp({ employees: [testEmployee('Karim', 0)] });
    fireEvent.click(screen.getByRole('button', { name: /employees/i }));
    fireEvent.click(screen.getByRole('button', { name: /add employee/i }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), {
      target: { value: 'Someone Else' },
    });
    fireEvent.change(dialog.getByLabelText('Role'), {
      target: { value: 'outsource_worker' },
    });
    fireEvent.change(dialog.getByLabelText('Iqama no.'), {
      target: { value: '2400000000' },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Save employee' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Iqama no. 2400000000 already belongs to Karim.',
    );
  });

  it('lists employees, marks Iqamas expiring within 30 days, and filters', async () => {
    const employee = (index: number, fields: Partial<Employee>): Employee => ({
      ...testEmployee(`Employee ${index}`, index),
      ...fields,
    });
    // Today is frozen at 2026-10-28.
    await renderApp({
      employees: [
        employee(1, {
          name: 'Expired Worker',
          designation: 'Cleaner',
          projectName: 'Mall',
          campName: 'Camp A',
          phoneNo: '0500000001',
          iqamaExpiry: '2026-10-01',
        }),
        employee(2, {
          name: 'Soon Worker',
          designation: 'Driver',
          projectName: 'Hospital',
          campName: 'Camp B',
          iqamaExpiry: '2026-11-26',
        }),
        employee(3, {
          name: 'Safe Worker',
          designation: 'Cleaner',
          projectName: 'Hospital',
          campName: 'Camp B',
          iqamaExpiry: '2026-11-27',
        }),
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /employees/i }));
    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'NAME',
      'IQAMA NO.',
      'ROLE',
      'DESIGNATION',
      'PROJECT NAME',
      'IQAMA EXPIRY',
    ]);
    expect(within(table).getAllByText('Company worker')).toHaveLength(3);
    expect(within(table).getByText('2400000001')).toBeInTheDocument();
    // Other details are not shown in the list.
    expect(within(table).queryByText('0500000001')).not.toBeInTheDocument();

    const row = (name: string) =>
      within(table).getByText(name).closest('tr') as HTMLElement;
    expect(row('Expired Worker')).toHaveClass('iqama-expiring');
    expect(row('Expired Worker')).toHaveTextContent('Expired 27 days ago');
    expect(row('Soon Worker')).toHaveClass('iqama-expiring');
    expect(row('Safe Worker')).not.toHaveClass('iqama-expiring');

    tickFilter('Designation', 'Cleaner');
    tickFilter('Camp', 'Camp B');
    expect(within(table).getByText('Safe Worker')).toBeInTheDocument();
    expect(within(table).queryByText('Expired Worker')).not.toBeInTheDocument();
    expect(within(table).queryByText('Soon Worker')).not.toBeInTheDocument();

    tickFilter('Project', 'Mall');
    expect(
      screen.getByText('No employees match these filters.'),
    ).toBeInTheDocument();
  });

  it('filters employees by several roles at once', async () => {
    const memory = await renderApp({
      employees: [
        { ...testEmployee('Company Worker', 0), role: 'company_worker' },
        { ...testEmployee('Outsource Worker', 1), role: 'outsource_worker' },
        { ...testEmployee('Staff Member', 2), role: 'staff' },
        {
          ...testEmployee('Camp Worker', 3),
          role: 'outsource_camp_worker',
        },
      ],
    });
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(screen.getByRole('button', { name: /employees/i }));
    const table = within(screen.getByRole('table'));
    const listed = () =>
      table
        .queryAllByRole('button', { name: /^View employee/ })
        .map((button) => button.textContent);
    expect(listed()).toHaveLength(4);

    const roles = within(screen.getByRole('group', { name: 'Role' }));
    fireEvent.click(roles.getByLabelText('Staff'));
    expect(listed()).toEqual(['Staff Member']);
    expect(
      screen.getByText('Staff', { selector: '.multi-select-summary' }),
    ).toBeVisible();

    fireEvent.click(roles.getByLabelText('Outsource camp worker'));
    expect(listed()).toEqual(['Staff Member', 'Camp Worker']);
    // One or two choices are named; more show a count.
    expect(
      screen.getByText('Staff, Outsource camp worker', {
        selector: '.multi-select-summary',
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));
    expect(
      screen.getByText('Role: Staff, Outsource camp worker'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));

    fireEvent.click(roles.getByLabelText('Staff'));
    expect(listed()).toEqual(['Camp Worker']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(listed()).toHaveLength(4);
    expect(roles.getByLabelText('Outsource camp worker')).not.toBeChecked();
    expect(savePdf).not.toHaveBeenCalled();
  });

  it('filters employees by Iqama status and exports them as a PDF', async () => {
    const employee = (name: string, index: number, iqamaExpiry: string) => ({
      ...testEmployee(name, index),
      designation: 'Cleaner',
      iqamaExpiry,
    });
    // Today is frozen at 2026-10-28.
    const memory = await renderApp({
      employees: [
        employee('Expired Worker', 0, '2026-10-01'),
        employee('Soon Worker', 1, '2026-11-20'),
        employee('Valid Worker', 2, '2027-05-01'),
        employee('Unknown Worker', 3, ''),
      ],
    });
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(screen.getByRole('button', { name: /employees/i }));
    const table = within(screen.getByRole('table'));
    const status = (label: string) => tickFilter('Iqama status', label);
    const listed = () =>
      table
        .queryAllByRole('button', { name: /^View employee/ })
        .map((button) => button.textContent);

    status('Expired');
    expect(listed()).toEqual(['Expired Worker']);
    status('Expired');
    status('Expiring within 30 days');
    expect(listed()).toEqual(['Soon Worker']);
    // Several statuses at once.
    status('Not recorded');
    expect(listed()).toEqual(['Soon Worker', 'Unknown Worker']);
    status('Expiring within 30 days');
    status('Not recorded');
    status('Valid');
    expect(listed()).toEqual(['Valid Worker']);
    // Each active filter is shown, with the number of matches.
    expect(
      screen.getByRole('button', { name: 'Remove filter Iqama: Valid' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Showing/, { selector: '.result-count' }).textContent,
    ).toBe('Showing 1 of 4 employees');

    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));
    const preview = within(
      screen.getByRole('dialog', { name: 'Preview employee PDF' }),
    );
    expect(preview.getByText('EMPLOYEE REPORT')).toBeInTheDocument();
    expect(preview.getByText('Iqama: Valid')).toBeInTheDocument();
    const printTable = within(preview.getByRole('table'));
    expect(printTable.getByText('Valid Worker')).toBeInTheDocument();
    expect(printTable.queryByText('Expired Worker')).not.toBeInTheDocument();
    fireEvent.click(preview.getByRole('button', { name: 'Close preview' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove filter Iqama: Valid' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /export employees as pdf/i }),
    );
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf.mock.calls[0][0]).toMatch(
      /^employees_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/,
    );
  });

  it('renames an employee on their transactions and deletes after confirming', async () => {
    const memory = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /employees/i }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'View employee Pacific Building Supply',
      }),
    );
    fireEvent.change(
      within(screen.getByRole('dialog')).getByLabelText('Name'),
      { target: { value: 'Pacific Supply Group' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitForDialogToClose();
    const payees = memory.snapshot().expenses.map((expense) => expense.payee);
    expect(payees).toContain('Pacific Supply Group');
    expect(payees).not.toContain('Pacific Building Supply');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'View employee Pacific Supply Group',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete employee' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete employee',
      }),
    );
    await waitFor(() =>
      expect(
        memory.snapshot().employees.map((employee) => employee.name),
      ).not.toContain('Pacific Supply Group'),
    );
    // Saved transactions keep the name.
    expect(
      memory.snapshot().expenses.map((expense) => expense.payee),
    ).toContain('Pacific Supply Group');
  });

  it('previews and exports the filtered expenses as a PDF', async () => {
    const memory = await renderApp();
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    tickFilter('Paid to', 'Pacific Building Supply');
    const listed = within(screen.getByRole('table')).getAllByRole('row').length;
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));

    const preview = within(
      screen.getByRole('dialog', { name: 'Preview expense PDF' }),
    );
    expect(preview.getByText('EXPENSE REPORT')).toBeInTheDocument();
    expect(
      preview.getByText('Period: All dates · Paid to: Pacific Building Supply'),
    ).toBeInTheDocument();
    const printTable = within(preview.getByRole('table'));
    // Same rows as the list (header + rows + total in both tables).
    expect(printTable.getAllByRole('row')).toHaveLength(listed);
    expect(
      printTable.queryByText('Evergreen Fuel Co.'),
    ).not.toBeInTheDocument();

    fireEvent.click(preview.getByRole('button', { name: 'Save PDF' }));
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf.mock.calls[0][0]).toMatch(
      /^expense-transactions_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/,
    );
  });

  it('shows a past month as closed and carries its remaining budget forward', async () => {
    await renderApp({
      expenses: [
        {
          id: 'september-expense',
          date: '2026-09-15',
          payee: 'September Vendor',
          description: 'Materials',
          category: 'Materials',
          department: 'Operations',
          paymentMethod: 'Cash',
          amount: 400,
        },
      ],
      budgetTransactions: [
        {
          id: 'september-budget',
          date: '2026-09-01',
          amount: 1000,
          paidBy: 'Owner',
          paymentMethod: 'Cash',
          note: '',
        },
      ],
    });
    // October: September's 600 remaining is brought forward.
    expect(
      screen.getByText(/600\.00 brought forward from September 2026/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByLabelText('Overview month')).toHaveValue('2026-09');
    expect(screen.getByRole('status')).toHaveTextContent(
      'September 2026 is closed.',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /600\.00 was carried into October 2026/,
    );
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to this month' }));
    expect(screen.getByLabelText('Overview month')).toHaveValue('2026-10');
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('makes closed-month transactions read-only until the month is reopened', async () => {
    const memory = await renderApp({
      expenses: [
        {
          id: 'september-expense',
          date: '2026-09-15',
          payee: 'September Vendor',
          description: 'Materials',
          category: 'Materials',
          department: 'Operations',
          paymentMethod: 'Cash',
          amount: 400,
        },
      ],
      budgetTransactions: [
        {
          id: 'september-budget',
          date: '2026-09-01',
          amount: 1000,
          paidBy: 'Owner',
          paymentMethod: 'Cash',
          note: '',
        },
      ],
    });

    // The database refuses changes, not just the screen.
    await expect(
      memory.api.expenses.remove('september-expense'),
    ).rejects.toThrow(/September 2026 is closed/);
    await expect(memory.api.budgets.remove('september-budget')).rejects.toThrow(
      /September 2026 is closed/,
    );

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'View details for September Vendor' }),
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'September 2026 is closed',
    );
    expect(
      screen.queryByRole('button', { name: 'Edit transaction' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /budgets/i }));
    expect(
      within(screen.getByRole('table')).getByText('🔒 Closed'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.change(screen.getByLabelText('Month to reopen'), {
      target: { value: '2026-09' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen month' }));
    expect(
      await screen.findByRole('button', { name: 'Close September 2026 again' }),
    ).toBeInTheDocument();
    expect(memory.snapshot().reopenedMonths).toEqual(['2026-09']);

    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'View details for September Vendor' }),
    );
    expect(
      screen.getByRole('button', { name: 'Edit transaction' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Close September 2026 again' }),
    );
    expect(
      await screen.findByText('All past months are closed.'),
    ).toBeInTheDocument();
    expect(memory.snapshot().reopenedMonths).toEqual([]);
  });

  it('refuses to save a new expense dated in a closed month', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    chooseName('Paid to', 'Late Vendor');
    fireEvent.change(screen.getByLabelText('Particulars / details'), {
      target: { value: 'Late invoice' },
    });
    fireEvent.change(screen.getByLabelText('Amount excluding VAT'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Invoice date'), {
      target: { value: '2026-09-30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'September 2026 is closed',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('App with the database', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    freezeToday();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the department when an expense is edited', async () => {
    const memory = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(
      screen.getAllByRole('button', {
        name: /view details for Northstar Equipment/i,
      })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(screen.getByLabelText('Department')).toHaveValue('Field Services');
    chooseName('Paid to', 'Northstar Rentals');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitForDialogToClose();

    expect(
      memory.snapshot().expenses.find((expense) => expense.id === 'sample-3'),
    ).toEqual(
      expect.objectContaining({
        payee: 'Northstar Rentals',
        department: 'Field Services',
      }),
    );
  });

  it('keeps the expense dialog open and explains a failed save', async () => {
    const memory = await renderApp();
    jest
      .spyOn(memory.api.expenses, 'create')
      .mockRejectedValue(new Error('Could not reach the database server.'));
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    chooseName('Paid to', 'Offline Vendor');
    fireEvent.change(screen.getByLabelText('Particulars / details'), {
      target: { value: 'Supplies' },
    });
    fireEvent.change(screen.getByLabelText('Amount excluding VAT'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the database server.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeEnabled();
  });

  it('asks for the database connection, then loads the data', async () => {
    const memory = createMemoryApi({
      expenses: createSampleExpenses().map(normalizeExpense),
    });
    const connectedStatus = await memory.api.database.status();
    jest
      .spyOn(memory.api.database, 'status')
      .mockResolvedValue({ connected: false, source: 'none' });
    const connect = jest
      .spyOn(memory.api.database, 'connect')
      .mockResolvedValue(connectedStatus);
    render(<App api={memory.api} />);

    expect(
      await screen.findByRole('heading', {
        name: 'Connect to the company database',
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('User name'), {
      target: { value: 'finance' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & connect' }));

    await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 5432,
        database: 'moon_finance',
        user: 'finance',
        password: 'secret',
        ssl: false,
      }),
    );
  });

  it('shows a retry screen when the data cannot be loaded', async () => {
    const memory = createMemoryApi();
    const load = jest
      .spyOn(memory.api.data, 'load')
      .mockRejectedValueOnce(
        new Error('The connection to the database was lost.'),
      );
    render(<App api={memory.api} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The connection to the database was lost.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('offers to import data saved on this device by the previous version', async () => {
    const legacyExpense = createSampleExpenses()[0];
    localStorage.setItem(
      'moon-expenses-v1',
      JSON.stringify({ expenses: [legacyExpense], budgetTransactions: [] }),
    );
    const memory = createMemoryApi();
    const importLegacy = jest
      .spyOn(memory.api.data, 'importLegacy')
      .mockResolvedValue({
        expenses: 1,
        budgetTransactions: 0,
        attachments: 0,
      });
    render(<App api={memory.api} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Import device data' }),
    );

    expect(
      await screen.findByText(/Imported 1 expense, 0 budget payments/),
    ).toBeInTheDocument();
    expect(importLegacy).toHaveBeenCalledWith(
      expect.objectContaining({
        expenses: [
          expect.objectContaining({
            payee: legacyExpense.payee,
            attachmentFiles: [],
          }),
        ],
      }),
    );
    expect(localStorage.getItem('moon-expenses-v1')).toBeNull();
    expect(localStorage.getItem('moon-expenses-v1-imported')).not.toBeNull();
  });

  it('exports the report page as a PDF of the printable report', async () => {
    const memory = await renderApp();
    let reportMounted = false;
    const savePdf = jest
      .spyOn(memory.api.reports, 'savePdf')
      .mockImplementation(async (fileName) => {
        reportMounted = !!document.querySelector('.standalone-print-report');
        return `/reports/${fileName}.pdf`;
      });
    fireEvent.click(screen.getByRole('button', { name: /reports/i }));
    fireEvent.click(screen.getByRole('button', { name: '↓ Export PDF' }));

    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf.mock.calls[0][0]).toMatch(
      /^monthly-finance-report_\d{4}-\d{2}-01_to_\d{4}-\d{2}-\d{2}$/,
    );
    expect(reportMounted).toBe(true);
    await waitFor(() =>
      expect(
        document.querySelector('.standalone-print-report'),
      ).not.toBeInTheDocument(),
    );
  });

  it('creates a backup and lists it', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /backup/i }));
    expect(
      await screen.findByText('No backups in this folder yet.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

    expect(await screen.findByText(/Backup saved:/)).toBeInTheDocument();
    const table = within(screen.getByRole('table', { name: 'Saved backups' }));
    expect(table.getByText('Manual')).toBeInTheDocument();
    expect(table.getByRole('button', { name: 'Restore…' })).toBeInTheDocument();
  });
});

describe('QA regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    freezeToday();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps a weekly report inside one Monday–Sunday week across months', () => {
    expect(getRange('weekly', '2026-10-01')).toEqual({
      start: '2026-09-28',
      end: '2026-10-04',
    });
    expect(getRange('weekly', '2026-10-15')).toEqual({
      start: '2026-10-12',
      end: '2026-10-18',
    });
    expect(getRange('weekly', '2026-12-31')).toEqual({
      start: '2026-12-28',
      end: '2027-01-03',
    });
  });

  it('charts the last week of a past month when that month is viewed', async () => {
    const expenses = createSampleExpenses();
    expenses.push({
      ...expenses[0],
      id: 'september-expense',
      date: '2026-09-30',
      amount: 1234,
    });
    await renderApp({ expenses });
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    const chart = screen
      .getByRole('heading', { name: 'Spending activity' })
      .closest('article') as HTMLElement;
    expect(
      within(chart).getByText('Daily outflow over the 7 days to 30-Sep-2026'),
    ).toBeInTheDocument();
    expect(
      within(chart).getByText(matchesCurrency(1234), { selector: 'strong' }),
    ).toBeInTheDocument();
  });

  it('keeps a payment method that is not in the list when editing', async () => {
    const expenses = createSampleExpenses();
    expenses[0] = { ...expenses[0], paymentMethod: 'Cheque' };
    const memory = await renderApp({ expenses });
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.click(
      screen.getAllByRole('button', {
        name: `View details for ${expenses[0].payee}`,
      })[0],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(screen.getByLabelText('Payment method')).toHaveValue('Cheque');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitForDialogToClose();

    expect(
      memory.snapshot().expenses.find((item) => item.id === expenses[0].id)
        ?.paymentMethod,
    ).toBe('Cheque');
  });

  it('does not export expenses for a reversed date range', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.change(screen.getByLabelText('Filter expenses from date'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.change(screen.getByLabelText('Filter expenses to date'), {
      target: { value: '2026-10-10' },
    });

    expect(
      screen.getByRole('button', { name: '↓ Export expenses as PDF' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview PDF' })).toBeDisabled();
  });

  it('finds expenses by department', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    fireEvent.change(screen.getByLabelText('Search transactions'), {
      target: { value: 'field services' },
    });

    expect(
      screen.getAllByRole('button', {
        name: /view details for Northstar Equipment/i,
      }).length,
    ).toBeGreaterThan(0);
  });

  it('reloads again when a refresh is requested during another refresh', async () => {
    const memory = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /transactions/i }));
    const { load } = memory.api.data;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = jest
      .spyOn(memory.api.data, 'load')
      .mockImplementationOnce(async () => {
        const snapshot = await load();
        await held;
        return snapshot;
      });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await memory.api.expenses.create(
      {
        date: '2026-10-27',
        payee: 'Queued Refresh Co',
        particulars: 'Saved by another computer',
        category: 'Other',
        department: '',
        paymentMethod: 'Cash',
        projectName: '',
        invoiceNo: '',
        siteName: '',
        vatNo: '',
        amountExcludingVat: 10,
        vat: 0,
      },
      [],
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    release();

    expect(
      await screen.findByRole('button', {
        name: 'View details for Queued Refresh Co',
      }),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
