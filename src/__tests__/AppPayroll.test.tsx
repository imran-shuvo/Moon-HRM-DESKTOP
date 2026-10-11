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
import { AttendanceEntry, Employee, SalaryAdvance } from '../shared/types';
import { datesInMonth, isFriday } from '../shared/payroll';

const KARIM = '11111111-1111-4111-8111-111111111111';
const BILAL = '22222222-2222-4222-8222-222222222222';
const SARA = '33333333-3333-4333-8333-333333333333';

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
    workHoursPerDay: 8,
    hourlyRate: null,
    ...overrides,
  };
}

const EMPLOYEES = [
  employee({}),
  employee({
    id: BILAL,
    name: 'Bilal',
    iqamaNo: '2400000002',
    role: 'outsource_worker',
    salary: null,
    hourlyRate: 12.5,
    projectName: 'Tower',
    campName: 'Camp B',
  }),
  employee({
    id: SARA,
    name: 'Sara',
    iqamaNo: '2400000003',
    role: 'staff',
    salary: 5000,
    projectName: 'Office',
    campName: '',
  }),
];

/** Karim: every October working day at 8 h, absent on the 5th and 6th, 10 h on the 1st. */
function karimOctober(): AttendanceEntry[] {
  return datesInMonth('2026-10')
    .filter((date) => !isFriday(date) && date <= '2026-10-28')
    .map((date) => {
      if (date === '2026-10-05' || date === '2026-10-06') {
        return {
          employeeId: KARIM,
          date,
          status: 'absent',
          hours: 0,
          note: '',
        };
      }
      return {
        employeeId: KARIM,
        date,
        status: 'present',
        hours: date === '2026-10-01' ? 10 : 8,
        note: '',
      };
    });
}

async function renderApp(
  seed: {
    attendance?: AttendanceEntry[];
    salaryAdvances?: SalaryAdvance[];
  } = {},
) {
  const memory = createMemoryApi({
    expenses: [],
    employees: EMPLOYEES,
    attendance: seed.attendance,
    salaryAdvances: seed.salaryAdvances,
  });
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

function openTab(name: string) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));
}

function setStatus(person: string, status: string) {
  fireEvent.click(
    within(
      screen.getByRole('radiogroup', { name: `Status for ${person}` }),
    ).getByRole('radio', { name: status }),
  );
}

describe('Attendance and payroll', () => {
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

  it('marks a day with one click per employee, for workers but not staff', async () => {
    const memory = await renderApp();
    openSection('Attendance');

    expect(
      await screen.findByRole('radiogroup', { name: 'Status for Karim' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Status for Sara' }),
    ).not.toBeInTheDocument();

    setStatus('Karim', 'Present');
    // Present starts at the basic hours; hours beyond them are overtime.
    expect(screen.getByLabelText('Hours worked by Karim')).toHaveValue(8);
    fireEvent.click(
      screen.getByRole('button', { name: 'More hours for Karim' }),
    );
    fireEvent.change(screen.getByLabelText('Hours worked by Karim'), {
      target: { value: '11' },
    });
    expect(screen.getByText('+3 h OT')).toBeInTheDocument();
    setStatus('Bilal', 'Vacation');
    fireEvent.change(screen.getByLabelText('Note for Bilal'), {
      target: { value: 'Annual vacation' },
    });
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }));
    expect(await screen.findByText(/saved \(2 changes\)/)).toBeInTheDocument();
    expect(memory.attendance()).toEqual(
      expect.arrayContaining([
        {
          employeeId: KARIM,
          date: '2026-10-28',
          status: 'present',
          hours: 11,
          note: '',
        },
        {
          employeeId: BILAL,
          date: '2026-10-28',
          status: 'vacation',
          hours: 0,
          note: 'Annual vacation',
        },
      ]),
    );
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it('fills a whole group at once and clears a day by clicking its status again', async () => {
    const memory = await renderApp();
    openSection('Attendance');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Mark not recorded in Mall as Present',
      }),
    );
    const karim = within(
      screen.getByRole('radiogroup', { name: 'Status for Karim' }),
    );
    expect(karim.getByRole('radio', { name: 'Present' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Bilal is in another project, so is unchanged.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Status for Bilal' }))
        .getAllByRole('radio')
        .every((radio) => radio.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
    setStatus('Karim', 'Present');
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
    expect(memory.attendance()).toEqual([]);
  });

  it('shows only the employees still to mark', async () => {
    await renderApp();
    openSection('Attendance');
    await screen.findByRole('radiogroup', { name: 'Status for Karim' });
    setStatus('Karim', 'Present');
    const control = screen
      .getAllByText('Status', { selector: '.filter-control > span' })[0]
      .closest('.filter-control') as HTMLElement;
    fireEvent.click(
      within(control).getByRole('checkbox', { name: 'Not recorded' }),
    );
    expect(
      screen.queryByRole('radiogroup', { name: 'Status for Karim' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', { name: 'Status for Bilal' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Showing/, { selector: '.result-count' }).textContent,
    ).toBe('Showing 1 of 2 workers');
    // Karim's unsaved change is kept while hidden.
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
  });

  it('asks before unsaved attendance is discarded', async () => {
    const memory = await renderApp();
    openSection('Attendance');
    await screen.findByRole('radiogroup', { name: 'Status for Karim' });
    setStatus('Karim', 'Leave');

    openSection('Payroll');
    const dialog = screen.getByRole('alertdialog');
    expect(
      within(dialog).getByText('Leave without saving attendance?'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByText('Discard unsaved attendance?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-28');
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Status for Karim' }),
      ).getByRole('radio', { name: 'Leave' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(memory.attendance()).toEqual([]);
  });

  it('shows a colour-coded monthly sheet and an employee calendar', async () => {
    await renderApp({ attendance: karimOctober() });
    openSection('Attendance');
    openTab('Monthly sheet');

    const row = (
      await screen.findByRole('button', { name: 'Attendance report for Karim' })
    ).closest('tr') as HTMLElement;
    // 24 working days to the 28th: 22 present, 2 absent, no leave, vacation
    // or holiday, 21 × 8 + 10 = 178 hours, 2 overtime hours.
    const cells = within(row).getAllByRole('cell');
    expect(cells.slice(-7).map((cell) => cell.textContent)).toEqual([
      '22',
      '2',
      '0',
      '0',
      '0',
      '178',
      '2',
    ]);
    const overtimeDay = within(row).getByText('P+2');
    expect(overtimeDay).toHaveClass('status-present');
    expect(within(row).getAllByText('A')[0]).toHaveClass('status-absent');
    expect(screen.getByLabelText('Legend')).toHaveTextContent('Vacation');

    fireEvent.click(
      screen.getByRole('button', { name: 'Attendance report for Karim' }),
    );
    expect(
      screen.getByRole('button', { name: '05-Oct-2026: Absent' }),
    ).toHaveClass('status-absent');
    expect(
      screen.getByRole('button', { name: '02-Oct-2026: Friday' }),
    ).toHaveClass('status-friday');
    // A day opens the daily register.
    fireEvent.click(
      screen.getByRole('button', { name: '05-Oct-2026: Absent' }),
    );
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-05');
  });

  it('creates payslips for one project, then everyone else, never touching existing ones', async () => {
    const memory = await renderApp({
      attendance: karimOctober(),
      salaryAdvances: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          employeeId: KARIM,
          date: '2026-10-10',
          amount: 300,
          note: '',
        },
      ],
    });
    openSection('Payroll');
    expect(
      screen.getByText(/have no payslip for October 2026 yet/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create payslips' }));
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('For'), {
      target: { value: 'project' },
    });
    // Nothing is created until a project is chosen.
    expect(
      within(dialog).getByRole('button', { name: 'Create 0 payslips' }),
    ).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Project'), {
      target: { value: 'Mall' },
    });
    await within(dialog).findByText('1 new payslip', { exact: false });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create 1 payslip' }),
    );
    expect(
      await screen.findByText(/1 payslip created for Mall \(October 2026\)/),
    ).toBeInTheDocument();

    const karim = memory
      .snapshot()
      .payslips.find((p) => p.employeeId === KARIM);
    // 2600 basic + 2 h × 30 overtime − 2 days × 100 − 1 × 20 fine − 300 advance
    expect(karim).toEqual(
      expect.objectContaining({
        basicPay: 2600,
        overtimeHours: 2,
        overtimeRate: 30,
        overtimePay: 60,
        absenceDeduction: 200,
        absenceFine: 20,
        advanceDeduction: 300,
        netPay: 2140,
        status: 'unpaid',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create payslips' }));
    dialog = screen.getByRole('dialog');
    await within(dialog).findByText(
      /1 employee already has a payslip; it will not be changed/,
    );
    // Days with nothing recorded are listed to check.
    expect(
      within(dialog).getByText('Bilal: 26 days without attendance'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create 2 payslips' }),
    );
    expect(
      await screen.findByText(/2 payslips created for everyone/),
    ).toBeInTheDocument();
    expect(memory.snapshot().payslips).toHaveLength(3);
    expect(
      memory.snapshot().payslips.find((p) => p.employeeId === KARIM),
    ).toEqual(karim);

    // Even if another user created one meanwhile, creating never replaces it.
    await expect(
      memory.api.payslips.create([{ ...karim!, basicPay: 1 }]),
    ).rejects.toThrow(/already has a payslip/);
  });

  it('reads, edits, pays and locks a payslip', async () => {
    const memory = await renderApp({ attendance: karimOctober() });
    openSection('Payroll');
    fireEvent.click(screen.getByRole('button', { name: 'Create payslips' }));
    const create = screen.getByRole('dialog');
    fireEvent.click(
      await within(create).findByRole('button', { name: 'Create 3 payslips' }),
    );
    await screen.findByText(/3 payslips created/);

    // Rows show plain amounts; the total carries SAR.
    const karimRow = screen
      .getByRole('button', { name: 'Open payslip for Karim' })
      .closest('tr') as HTMLElement;
    expect(karimRow).toHaveTextContent('2,440.00');
    expect(karimRow.textContent).not.toMatch(/SAR/);

    fireEvent.click(
      screen.getByRole('button', { name: 'Open payslip for Karim' }),
    );
    const dialog = screen.getByRole('dialog');
    // Opens as a readable payslip.
    expect(within(dialog).getByText('Basic salary')).toBeInTheDocument();
    expect(within(dialog).getByText('22 present')).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText('Allowance / leave pay'),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole('button', { name: '✎ Edit amounts' }),
    );
    fireEvent.change(within(dialog).getByLabelText('Allowance / leave pay'), {
      target: { value: '150' },
    });
    expect(
      within(dialog).queryByRole('button', { name: '✓ Mark as paid' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payslip' }),
    );
    expect(
      await within(dialog).findByText('Payslip saved.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Allowance / leave pay'),
    ).toBeInTheDocument();
    expect(
      memory.snapshot().payslips.find((p) => p.employeeId === KARIM)?.netPay,
    ).toBe(2590); // 2600 + 60 overtime − 200 − 20 fine + 150 allowance

    fireEvent.click(
      within(dialog).getByRole('button', { name: '✓ Mark as paid' }),
    );
    expect(
      await within(dialog).findByText('Marked as paid.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: '✎ Edit amounts' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Delete payslip' }),
    ).not.toBeInTheDocument();
    await expect(
      memory.api.payslips.save([
        {
          ...memory.snapshot().payslips.find((p) => p.employeeId === KARIM)!,
          allowance: 0,
        },
      ]),
    ).rejects.toThrow(/already paid/);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close dialog' }),
    );

    // Filter: paid only, then by project.
    const tick = (filter: string, option: string) => {
      const control = screen
        .getAllByText(filter, { selector: '.filter-control > span' })[0]
        .closest('.filter-control') as HTMLElement;
      fireEvent.click(within(control).getByRole('checkbox', { name: option }));
    };
    tick('Status', 'Paid');
    expect(
      screen.getByRole('button', { name: 'Open payslip for Karim' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open payslip for Bilal' }),
    ).not.toBeInTheDocument();
    tick('Status', 'Paid');
    tick('Project', 'Tower');
    expect(
      screen.getByRole('button', { name: 'Open payslip for Bilal' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open payslip for Karim' }),
    ).not.toBeInTheDocument();

    // Printing shows a preview first.
    fireEvent.click(
      screen.getByRole('button', { name: '🖨 Print payroll sheet' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Print preview' }),
    ).toBeInTheDocument();
  });

  it('never deletes an employee who has payroll history', async () => {
    const memory = await renderApp({ attendance: karimOctober() });
    openSection('Employees');
    fireEvent.click(
      screen.getByRole('button', { name: 'View employee Karim' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete employee' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete employee',
      }),
    );
    expect(
      await screen.findByText(
        /Karim has attendance on record, so they cannot be deleted/,
      ),
    ).toBeInTheDocument();
    expect(memory.snapshot().employees).toHaveLength(3);
    expect(memory.attendance()).toHaveLength(karimOctober().length);
  });

  it('gives an advance to everyone in a camp', async () => {
    const memory = await renderApp();
    openSection('Payroll');
    fireEvent.click(screen.getByRole('tab', { name: 'Advances' }));
    fireEvent.click(screen.getByRole('button', { name: '＋ Give advance' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('For'), {
      target: { value: 'camp' },
    });
    fireEvent.change(within(dialog).getByLabelText('Camp'), {
      target: { value: 'Camp A' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Amount/), {
      target: { value: '250' },
    });
    expect(
      within(dialog)
        .getByRole('status')
        .textContent?.replace(/\u00a0/g, ' '),
    ).toBe('1 employee × 250.00 = SAR 250.00');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Give 1 advance' }),
    );
    await waitFor(() =>
      expect(memory.snapshot().salaryAdvances).toHaveLength(1),
    );
    expect(memory.snapshot().salaryAdvances[0]).toEqual(
      expect.objectContaining({
        employeeId: KARIM,
        amount: 250,
        date: '2026-10-28',
      }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Still owed' }));
    const row = screen.getByText('Karim').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('250.00');
  });

  it('makes vacation unpaid when the setting is switched off', async () => {
    const memory = await renderApp();
    openSection('Payroll');
    fireEvent.click(
      screen.getByRole('button', { name: '⚙ Payroll settings' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Payroll settings' });
    const toggle = within(dialog).getByRole('switch', {
      name: /Vacation days are paid/,
    });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payroll settings' }),
    );
    expect(
      await screen.findByText(/Payroll settings saved/),
    ).toBeInTheDocument();
    expect(memory.snapshot().payrollSettings).toEqual(
      expect.objectContaining({ leavePaid: false, vacationPaid: false }),
    );
  });
});
