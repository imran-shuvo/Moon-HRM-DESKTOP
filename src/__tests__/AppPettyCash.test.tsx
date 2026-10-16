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
import { Employee } from '../shared/types';

const KARIM = '11111111-1111-4111-8111-111111111111';
const NASIR = '22222222-2222-4222-8222-222222222222';

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

async function renderApp() {
  const memory = createMemoryApi({
    expenses: [],
    employees: [
      employee({}),
      employee({ id: NASIR, name: 'Nasir', iqamaNo: '2400000002' }),
    ],
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
      within(dialog).getByLabelText('Choose reference documents'),
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

  it('tracks cash in hand, payments back with documents, and history', async () => {
    const memory = await renderApp();
    expect(screen.getByText(/No petty cash yet/)).toBeInTheDocument();

    let dialog = await addEntry('↑ Give cash', KARIM, '1000', '2026-10-01');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give cash' }));
    expect(
      await screen.findByText('SAR 1,000.00 given to Karim.'),
    ).toBeInTheDocument();

    // Paying back shows the balance before and after, and keeps the receipts.
    dialog = await addEntry(
      '↓ Record settled amount',
      KARIM,
      '400',
      '2026-10-05',
      [file('receipt-1.pdf'), file('receipt-2.jpg', 'image/jpeg')],
    );
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
      within(dialog).getByRole('button', { name: 'Save settled amount' }),
    );
    expect(
      await screen.findByText('SAR 400.00 settled by Karim.'),
    ).toBeInTheDocument();

    const entries = memory.snapshot().pettyCash;
    expect(entries).toHaveLength(2);
    const payment = entries.find((entry) => entry.kind === 'received');
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

    // In hand: given 1,000, settled 400, 600 still held.
    const karimRow = screen
      .getByRole('button', { name: 'History for Karim' })
      .closest('tr') as HTMLElement;
    expect(karimRow).toHaveTextContent('1,000.00');
    expect(karimRow).toHaveTextContent('400.00');
    expect(karimRow).toHaveTextContent('600.00');

    // History lists each entry with its date, balance after and files.
    fireEvent.click(screen.getByRole('button', { name: 'History for Karim' }));
    const rows = screen.getAllByRole('row').slice(1, -1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('05-Oct-2026');
    expect(rows[0]).toHaveTextContent('Settled amount');
    expect(rows[0]).toHaveTextContent('−400.00');
    expect(rows[0]).toHaveTextContent('600.00');
    expect(rows[0]).toHaveTextContent('Handed over at the Mall office');
    expect(rows[1]).toHaveTextContent('01-Oct-2026');
    expect(rows[1]).toHaveTextContent('+1,000.00');

    // Filtered to one worker, the PDF is their statement, oldest first.
    fireEvent.click(screen.getByRole('button', { name: '🖨 Preview' }));
    const preview = screen.getByRole('dialog', {
      name: 'Petty cash report preview',
    });
    expect(preview).toHaveTextContent('PETTY CASH STATEMENT');
    expect(preview).toHaveTextContent('Karim');
    const printed = within(
      preview.querySelector('.moon-report-petty-entries') as HTMLElement,
    ).getAllByRole('row');
    expect(printed[1]).toHaveTextContent('01-Oct-2026');
    expect(printed[2]).toHaveTextContent('05-Oct-2026');
    expect(printed[2]).toHaveTextContent(
      'Remarks: Handed over at the Mall office',
    );
    expect(printed[2]).toHaveTextContent('receipt-1.pdf, receipt-2.jpg');
    const savePdf = jest.spyOn(memory.api.reports, 'savePdf');
    fireEvent.click(
      within(preview).getByRole('button', { name: 'Save as PDF' }),
    );
    await waitFor(() =>
      expect(savePdf).toHaveBeenCalledWith(
        expect.stringMatching(/^petty-cash_karim_/),
        { landscape: true },
      ),
    );
    expect(await screen.findByText(/PDF saved:/)).toBeInTheDocument();

    // Saving straight to PDF skips the preview.
    fireEvent.click(screen.getByRole('button', { name: '⤓ Save as PDF' }));
    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(2));
    const open = jest.spyOn(memory.api.pettyCash, 'openAttachment');
    fireEvent.click(
      within(rows[0]).getByRole('button', { name: 'Open receipt-1.pdf' }),
    );
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(payment?.attachments[0].id),
    );

    // Editing can remove one file and add another.
    fireEvent.click(
      within(rows[0]).getByRole('button', { name: /^Edit petty cash/ }),
    );
    dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remove receipt-2.jpg' }),
    );
    fireEvent.change(
      within(dialog).getByLabelText('Choose reference documents'),
      { target: { files: [file('slip.pdf')] } },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await screen.findByText('Petty cash entry updated.'),
    ).toBeInTheDocument();
    expect(
      memory
        .snapshot()
        .pettyCash.find((entry) => entry.id === payment?.id)
        ?.attachments.map((item) => item.name),
    ).toEqual(['receipt-1.pdf', 'slip.pdf']);
  });

  it('warns when more is settled than the worker holds', async () => {
    await renderApp();
    const dialog = await addEntry(
      '↓ Record settled amount',
      NASIR,
      '50',
      '2026-10-05',
    );
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'more than they hold',
    );
  });

  it('keeps a worker with petty cash from being deleted', async () => {
    const memory = await renderApp();
    const dialog = await addEntry('↑ Give cash', NASIR, '200', '2026-10-01');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give cash' }));
    await screen.findByText('SAR 200.00 given to Nasir.');
    await expect(memory.api.employees.remove(NASIR)).rejects.toThrow(
      /petty cash on record/,
    );
  });
});
