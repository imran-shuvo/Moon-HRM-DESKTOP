import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import App from '../renderer/App';
import createMemoryApi from '../testFixtures/memoryApi';
import { formatReportDate } from '../renderer/expenses/model';
import { monthKey, previousMonthKey } from '../shared/months';
import { Employee, PettyCashTransaction } from '../shared/types';

const KARIM = '11111111-1111-4111-8111-111111111111';
const NASIR = '22222222-2222-4222-8222-222222222222';

// Entries are dated in the current month, which is open; earlier months
// are closed.
const MONTH = monthKey();
const LAST_MONTH = previousMonthKey(MONTH);
const day = (date: number, month = MONTH) =>
  `${month}-${String(date).padStart(2, '0')}`;

function employee(overrides: Partial<Employee>): Employee {
  return {
    id: KARIM,
    name: 'Karim',
    nickname: '',
    role: 'company_worker',
    iqamaNo: '2400000001',
    designation: '',
    projectName: 'Mall',
    phoneNo: '',
    insuranceNo: '',
    salary: 2600,
    iqamaExpiry: '',
    campName: 'Camp A',
    workHoursPerDay: 10,
    hourlyRate: null,
    terminationDate: '',
    ...overrides,
  };
}

/** A file whose contents the app can read in the test browser. */
function file(name: string, type = 'application/pdf') {
  const bytes = Uint8Array.from(name, (char) => char.charCodeAt(0));
  const result = new File([bytes], name, { type });
  Object.defineProperty(result, 'arrayBuffer', {
    value: async () => bytes.buffer,
  });
  return result;
}

function entry(overrides: Partial<PettyCashTransaction>): PettyCashTransaction {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    employeeId: KARIM,
    date: day(3, LAST_MONTH),
    kind: 'given',
    amount: 1000,
    note: '',
    remarks: '',
    attachments: [],
    createdAt: 1,
    ...overrides,
  };
}

async function renderApp(pettyCash: PettyCashTransaction[] = []) {
  const memory = createMemoryApi({
    expenses: [],
    employees: [
      employee({}),
      employee({ id: NASIR, name: 'Nasir', iqamaNo: '2400000002' }),
    ],
    pettyCash,
  });
  render(<App api={memory.api} />);
  await screen.findByRole('navigation', { name: 'Main navigation' });
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).getByRole('button', { name: /Petty Cash/ }),
  );
  return memory;
}

async function addEntry(
  button: string,
  worker: string,
  amount: string,
  date: string,
  files: File[] = [],
) {
  fireEvent.click(screen.getByRole('button', { name: button }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Worker'), {
    target: { value: worker },
  });
  fireEvent.change(within(dialog).getByLabelText('Amount (SAR)'), {
    target: { value: amount },
  });
  fireEvent.change(within(dialog).getByLabelText('Date'), {
    target: { value: date },
  });
  if (files.length) {
    fireEvent.change(
      within(dialog).getByLabelText(
        button === '↑ Give cash'
          ? 'Choose reference documents'
          : 'Choose vouchers',
      ),
      { target: { files } },
    );
  }
  return dialog;
}

describe('Petty cash', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  /** Petty cash's pages are listed under it in the sidebar. */
  const tab = (name: string) =>
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Main navigation' }),
      ).getByRole('button', { name }),
    );
  const bodyRows = () => screen.getAllByRole('row').slice(1, -1);

  it('lists cash given, settlements with vouchers, and cash in hand', async () => {
    const memory = await renderApp();
    expect(screen.getByText(/No petty cash yet/)).toBeInTheDocument();

    let dialog = await addEntry('↑ Give cash', KARIM, '1000', day(1));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give cash' }));
    expect(
      await screen.findByText('SAR 1,000.00 given to Karim.'),
    ).toBeInTheDocument();

    // Petty cash given lists only the cash handed out.
    expect(
      screen.getByRole('button', { name: 'Petty cash given' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.queryByRole('button', { name: '↓ Record settlement' }),
    ).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent(formatReportDate(day(1)));
    expect(bodyRows()[0]).toHaveTextContent('1,000.00');

    // Settlements has its own form; it shows the balance before and
    // after, and keeps the vouchers.
    tab('Settlements');
    expect(
      screen.queryByRole('button', { name: '↑ Give cash' }),
    ).not.toBeInTheDocument();
    dialog = await addEntry('↓ Record settlement', KARIM, '400', day(5), [
      file('receipt-1.pdf'),
      file('receipt-2.jpg', 'image/jpeg'),
    ]);
    expect(
      within(dialog).getByRole('heading', { name: 'Record a settlement' }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Karim holds SAR 1,000.00 → after this SAR 600.00',
    );
    fireEvent.change(within(dialog).getByLabelText('Description (optional)'), {
      target: { value: 'Unused site cash' },
    });
    fireEvent.change(within(dialog).getByLabelText('Remarks (optional)'), {
      target: { value: 'Handed over at the Mall office' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save settlement' }),
    );
    expect(
      await screen.findByText('SAR 400.00 settled by Karim.'),
    ).toBeInTheDocument();

    const entries = memory.snapshot().pettyCash;
    expect(entries).toHaveLength(2);
    const payment = entries.find((item) => item.kind === 'received');
    expect(payment).toEqual(
      expect.objectContaining({
        note: 'Unused site cash',
        remarks: 'Handed over at the Mall office',
      }),
    );
    expect(payment?.attachments.map((item) => item.name)).toEqual([
      'receipt-1.pdf',
      'receipt-2.jpg',
    ]);

    // Settlements lists only the settlement.
    const rows = bodyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(formatReportDate(day(5)));
    expect(rows[0]).toHaveTextContent('400.00');
    expect(rows[0]).toHaveTextContent('600.00');
    expect(rows[0]).toHaveTextContent('Handed over at the Mall office');

    const open = jest.spyOn(memory.api.pettyCash, 'openAttachment');
    fireEvent.click(
      within(rows[0]).getByRole('button', { name: 'Open receipt-1.pdf' }),
    );
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(payment?.attachments[0].id),
    );

    // The settlements report lists the vouchers.
    fireEvent.click(screen.getByRole('button', { name: '🖨 Preview' }));
    let preview = screen.getByRole('dialog', {
      name: 'Petty cash report preview',
    });
    expect(preview).toHaveTextContent('PETTY CASH SETTLEMENTS');
    expect(preview).toHaveTextContent('receipt-1.pdf, receipt-2.jpg');
    expect(preview).toHaveTextContent(
      'Remarks: Handed over at the Mall office',
    );
    expect(preview).not.toHaveTextContent(formatReportDate(day(1)));
    fireEvent.click(within(preview).getByRole('button', { name: 'Close' }));

    // Cash in hand: given 1,000, settled 400, 600 still held.
    tab('Cash in hand');
    const karimRow = screen
      .getByRole('button', { name: 'Statement for Karim' })
      .closest('tr') as HTMLElement;
    expect(karimRow).toHaveTextContent('1,000.00');
    expect(karimRow).toHaveTextContent('400.00');
    expect(karimRow).toHaveTextContent('600.00');

    // A worker's statement lists their month, oldest first.
    fireEvent.click(
      screen.getByRole('button', { name: 'Statement for Karim' }),
    );
    preview = screen.getByRole('dialog', { name: 'Petty cash report preview' });
    expect(preview).toHaveTextContent('PETTY CASH STATEMENT');
    expect(preview).toHaveTextContent('Karim');
    const printed = within(
      preview.querySelector('.moon-report-petty-entries') as HTMLElement,
    ).getAllByRole('row');
    expect(printed[1]).toHaveTextContent('Carried from');
    expect(printed[2]).toHaveTextContent(formatReportDate(day(1)));
    expect(printed[3]).toHaveTextContent(formatReportDate(day(5)));
    expect(printed[3]).toHaveTextContent('receipt-1.pdf, receipt-2.jpg');
    expect(printed[4]).toHaveTextContent('IN HAND 600.00');
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(
      within(preview).getByRole('button', { name: 'Save as PDF' }),
    );
    await waitFor(() =>
      expect(savePdf).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^petty-cash-in-hand_${MONTH}_karim_`),
        ),
        { landscape: true },
      ),
    );
    expect(await screen.findByText(/PDF saved:/)).toBeInTheDocument();

    // Saving straight to PDF skips the preview: every worker in hand.
    fireEvent.click(screen.getByRole('button', { name: '⤓ Save as PDF' }));
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(2));
    expect(savePdf).toHaveBeenLastCalledWith(
      expect.stringMatching(new RegExp(`^petty-cash-in-hand_${MONTH}_\\d`)),
      { landscape: true },
    );

    // Editing a settlement can remove one file and add another.
    tab('Settlements');
    [rows[0]] = bodyRows();
    fireEvent.click(
      within(rows[0]).getByRole('button', { name: /^Edit petty cash/ }),
    );
    dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remove receipt-2.jpg' }),
    );
    fireEvent.change(within(dialog).getByLabelText('Choose vouchers'), {
      target: { files: [file('slip.pdf')] },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await screen.findByText('Petty cash entry updated.'),
    ).toBeInTheDocument();
    expect(
      memory
        .snapshot()
        .pettyCash.find((item) => item.id === payment?.id)
        ?.attachments.map((item) => item.name),
    ).toEqual(['receipt-1.pdf', 'slip.pdf']);
  });

  it('carries what each worker holds into the next month', async () => {
    const memory = await renderApp([
      entry({}),
      entry({
        id: '44444444-4444-4444-8444-444444444444',
        kind: 'received',
        amount: 700,
        date: day(20, LAST_MONTH),
        createdAt: 2,
      }),
      entry({
        id: '55555555-5555-4555-8555-555555555555',
        amount: 200,
        date: day(2),
        createdAt: 3,
      }),
      // Settled in full last month: nothing is carried for Nasir.
      entry({
        id: '66666666-6666-4666-8666-666666666666',
        employeeId: NASIR,
        amount: 50,
        createdAt: 4,
      }),
      entry({
        id: '77777777-7777-4777-8777-777777777777',
        employeeId: NASIR,
        kind: 'received',
        amount: 50,
        createdAt: 5,
      }),
    ]);

    // This month: 300 carried in, 200 given, 500 in hand.
    tab('Cash in hand');
    expect(bodyRows()).toHaveLength(1);
    const karimRow = bodyRows()[0];
    const cells = within(karimRow).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent('300.00');
    expect(cells[2]).toHaveTextContent('200.00');
    expect(cells[3]).toHaveTextContent('0.00');
    expect(cells[4]).toHaveTextContent('500.00');
    expect(screen.getByLabelText(/^Petty cash totals/)).toHaveTextContent(
      'In hand now',
    );

    // The in hand report shows carried, given and settled.
    fireEvent.change(screen.getByLabelText('Search petty cash'), {
      target: { value: 'Karim' },
    });
    fireEvent.click(screen.getByRole('button', { name: '🖨 Preview' }));
    let preview = screen.getByRole('dialog', {
      name: 'Petty cash report preview',
    });
    expect(preview).toHaveTextContent('PETTY CASH IN HAND');
    expect(
      preview.querySelector('.moon-report-petty-balances'),
    ).toHaveTextContent('300.00');
    expect(
      preview.querySelector('.moon-report-petty-balances'),
    ).not.toHaveTextContent('PROJECT');
    fireEvent.click(within(preview).getByRole('button', { name: 'Close' }));

    // "In hand only" prints each worker's name and amount, nothing else.
    expect(screen.getByRole('radio', { name: 'Full report' })).toHaveClass(
      'active',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'In hand only' }));
    expect(screen.getByRole('radio', { name: 'In hand only' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '🖨 Preview' }));
    preview = screen.getByRole('dialog', { name: 'Petty cash report preview' });
    const onlyTable = preview.querySelector(
      '.moon-report-petty-in-hand',
    ) as HTMLElement;
    const onlyRows = within(onlyTable).getAllByRole('row');
    expect(within(onlyRows[0]).getAllByRole('columnheader')).toHaveLength(3);
    expect(onlyRows[1]).toHaveTextContent('Karim');
    expect(onlyRows[1]).toHaveTextContent('500.00');
    expect(preview).not.toHaveTextContent('CARRIED FROM');
    expect(preview).not.toHaveTextContent('2400000001');
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(
      within(preview).getByRole('button', { name: 'Save as PDF' }),
    );
    await waitFor(() =>
      expect(savePdf).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^petty-cash-in-hand-only_${MONTH}_`)),
        { landscape: true },
      ),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Full report' }));

    // Last month is closed: 1,000 given, 700 settled, 300 carried forward.
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText(/is closed, so its entries/)).toBeInTheDocument();
    const lastMonth = within(bodyRows()[0]).getAllByRole('cell');
    expect(lastMonth[1]).toHaveTextContent('0.00');
    expect(lastMonth[2]).toHaveTextContent('1,000.00');
    expect(lastMonth[3]).toHaveTextContent('700.00');
    expect(lastMonth[4]).toHaveTextContent('300.00');
    fireEvent.click(
      screen.getByRole('button', { name: 'Statement for Karim' }),
    );
    preview = screen.getByRole('dialog', { name: 'Petty cash report preview' });
    expect(preview).toHaveTextContent('IN HAND (CARRIED FORWARD)');
    fireEvent.click(within(preview).getByRole('button', { name: 'Close' }));

    // Its entries can't be changed.
    tab('Petty cash given');
    expect(bodyRows()).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /^Edit petty cash/ }),
    ).not.toBeInTheDocument();
    await expect(
      memory.api.pettyCash.remove('33333333-3333-4333-8333-333333333333'),
    ).rejects.toThrow(/is closed/);
  });

  it('warns when more is settled than the worker holds', async () => {
    await renderApp();
    tab('Settlements');
    const dialog = await addEntry('↓ Record settlement', NASIR, '50', day(5));
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'more than they hold',
    );
  });

  it('keeps a worker with petty cash from being deleted', async () => {
    const memory = await renderApp();
    const dialog = await addEntry('↑ Give cash', NASIR, '200', day(1));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give cash' }));
    await screen.findByText('SAR 200.00 given to Nasir.');
    await expect(memory.api.employees.remove(NASIR)).rejects.toThrow(
      /petty cash on record/,
    );
  });
});
