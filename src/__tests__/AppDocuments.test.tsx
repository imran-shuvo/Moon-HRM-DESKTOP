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
import { AttendanceEntry, Employee } from '../shared/types';

const KARIM = '11111111-1111-4111-8111-111111111111';
const NASIR = '22222222-2222-4222-8222-222222222222';
const OLD = '33333333-3333-4333-8333-333333333333';

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

async function renderApp(
  employees: Employee[] = [employee({})],
  attendance: AttendanceEntry[] = [],
) {
  const memory = createMemoryApi({ expenses: [], employees, attendance });
  render(<App api={memory.api} />);
  await screen.findByRole('navigation', { name: 'Main navigation' });
  return memory;
}

function openSection(name: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).getByRole('button', { name: new RegExp(`^.?\\s*${name}`) }),
  );
}

describe('Documents', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Wednesday 28 October 2026.
    jest.useFakeTimers({
      now: new Date(2026, 9, 28, 12),
      doNotFake: [
        'nextTick',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uploads many files at once and files them by project and day', async () => {
    const memory = await renderApp();
    const upload = jest.spyOn(memory.api.documents, 'upload');
    openSection('Documents');
    fireEvent.click(
      screen.getByRole('button', { name: 'Upload the first documents' }),
    );
    let dialog = screen.getByRole('dialog');
    const files = Array.from({ length: 12 }, (_, index) =>
      file(`sheet-${index + 1}.pdf`),
    );
    fireEvent.change(within(dialog).getByLabelText('Choose files'), {
      target: { files },
    });
    expect(
      within(
        within(dialog).getByRole('list', { name: 'Files to upload' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(12);
    fireEvent.change(within(dialog).getByLabelText('Project'), {
      target: { value: 'Mall' },
    });
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: '2026-10-27' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Upload 12 files' }),
    );
    expect(
      await screen.findByText('12 documents uploaded.'),
    ).toBeInTheDocument();
    // Sent 10 at a time.
    expect(upload.mock.calls.map(([, batch]) => batch.length)).toEqual([10, 2]);
    expect(memory.snapshot().documents).toHaveLength(12);
    expect(memory.snapshot().documents[0]).toEqual(
      expect.objectContaining({
        category: 'Signature sheet',
        projectName: 'Mall',
        documentDate: '2026-10-27',
      }),
    );

    // A folder per project, and files grouped by day.
    const folders = within(
      screen.getByRole('navigation', { name: 'Project folders' }),
    );
    expect(folders.getByRole('button', { name: /Mall/ })).toHaveTextContent(
      '12',
    );
    expect(screen.getByText('Tue, 27-Oct-2026')).toBeInTheDocument();

    // Edit one document's details.
    fireEvent.click(screen.getByRole('button', { name: 'Edit sheet-1.pdf' }));
    dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Category'), {
      target: { value: 'Timesheet' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await screen.findByText('Document details saved.'),
    ).toBeInTheDocument();

    // Filter by category.
    const category = screen
      .getAllByText('Category', { selector: '.filter-control > span' })[0]
      .closest('.filter-control') as HTMLElement;
    fireEvent.click(
      within(category).getByRole('checkbox', { name: 'Timesheet' }),
    );
    expect(
      screen.getByText(/Showing/, { selector: '.result-count' }).textContent,
    ).toBe('Showing 1 of 12 documents');

    // Delete after confirming.
    fireEvent.click(screen.getByRole('button', { name: 'Delete sheet-1.pdf' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete document',
      }),
    );
    await waitFor(() => expect(memory.snapshot().documents).toHaveLength(11));
  });

  it('keeps files that failed to upload so they can be tried again', async () => {
    const memory = await renderApp();
    const original = memory.api.documents.upload;
    jest
      .spyOn(memory.api.documents, 'upload')
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('The connection was lost.'));
    openSection('Documents');
    fireEvent.click(screen.getByRole('button', { name: '⇪ Upload documents' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Choose files'), {
      target: {
        files: Array.from({ length: 13 }, (_, index) => file(`f${index}.pdf`)),
      },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Upload 13 files' }),
    );
    expect(
      await within(dialog).findByText(
        /10 files uploaded\. The connection was lost\./,
      ),
    ).toBeInTheDocument();
    expect(memory.snapshot().documents).toHaveLength(10);
    expect(
      within(
        within(dialog).getByRole('list', { name: 'Files to upload' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  it('uploads a signature sheet from the daily attendance register', async () => {
    const memory = await renderApp();
    openSection('Attendance');
    expect(await screen.findByText('None uploaded yet')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '⇪ Upload signature sheet' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-28');
    expect(within(dialog).getByLabelText('Category')).toHaveValue(
      'Signature sheet',
    );
    fireEvent.change(within(dialog).getByLabelText('Choose files'), {
      target: { files: [file('mall-signatures.jpg', 'image/jpeg')] },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Upload 1 file' }),
    );
    expect(
      await screen.findByRole('button', { name: /mall-signatures\.jpg/ }),
    ).toBeInTheDocument();
    expect(memory.snapshot().documents[0].documentDate).toBe('2026-10-28');
  });
});

describe('Termination', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.useFakeTimers({
      now: new Date(2026, 9, 28, 12),
      doNotFake: [
        'nextTick',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stops attendance and pay after the last working day', async () => {
    const memory = await renderApp([
      employee({ terminationDate: '2026-10-15' }),
      employee({ id: NASIR, name: 'Nasir', iqamaNo: '2400000002' }),
      employee({
        id: OLD,
        name: 'Old Hand',
        iqamaNo: '2400000003',
        terminationDate: '2026-09-10',
      }),
    ]);

    openSection('Employees');
    const row = screen
      .getByRole('button', { name: 'View employee Karim' })
      .closest('tr') as HTMLElement;
    expect(within(row).getByText('Terminated')).toBeInTheDocument();

    // Not listed in the register after the last working day.
    openSection('Attendance');
    await screen.findByRole('radiogroup', { name: 'Status for Nasir' });
    expect(
      screen.queryByRole('radiogroup', { name: 'Status for Karim' }),
    ).not.toBeInTheDocument();
    await expect(
      memory.api.attendance.saveDay('2026-10-20', [
        { employeeId: KARIM, status: 'present', hours: 10, note: '' },
      ]),
    ).rejects.toThrow(/last working day was 2026-10-15/);

    // Paid up to the last day; someone who left in September gets nothing.
    openSection('Payroll');
    expect(
      screen.getByText(/have no payslip for October 2026 yet/).parentElement,
    ).toHaveTextContent('2 employees');
    fireEvent.click(screen.getByRole('button', { name: 'Create payslips' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Create 2 payslips' }),
    );
    await screen.findByText(/2 payslips created/);
    const karim = memory
      .snapshot()
      .payslips.find((p) => p.employeeId === KARIM);
    // 13 of 26 working days in October 2026.
    expect(karim).toEqual(
      expect.objectContaining({ workingDays: 13, basicPay: 1300 }),
    );
    expect(memory.snapshot().payslips.some((p) => p.employeeId === OLD)).toBe(
      false,
    );
  });
});
