/**
 * @jest-environment node
 */
import {
  DEFAULT_PAYROLL_SETTINGS,
  calculatePayslip,
  datesInMonth,
  grossPay,
  isFriday,
  netPay,
  outstandingAdvance,
  roundMoney,
  summarizeAttendance,
  workingDaysInMonth,
} from '../shared/payroll';
import {
  AttendanceEntry,
  AttendanceStatus,
  Employee,
  Payslip,
} from '../shared/types';
import {
  validateAttendanceDay,
  validatePayslipInput,
} from '../shared/validation';

// October 2026: 31 days, Fridays on the 2nd, 9th, 16th, 23rd and 30th.
const MONTH = '2026-10';

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Karim',
    nickname: '',
    role: 'company_worker',
    iqamaNo: '2400000001',
    designation: '',
    projectName: '',
    phoneNo: '',
    insuranceNo: '',
    salary: 2600,
    iqamaExpiry: '',
    campName: '',
    workHoursPerDay: 8,
    hourlyRate: null,
    ...overrides,
  };
}

function day(
  date: string,
  status: AttendanceStatus,
  hours = 0,
  employeeId = employee().id,
): AttendanceEntry {
  return { employeeId, date, status, hours, note: '' };
}

/** Every working day of October present for `hours`, except the given days. */
function month(
  hours: number,
  except: Record<string, AttendanceEntry> = {},
): AttendanceEntry[] {
  return datesInMonth(MONTH)
    .filter((date) => !isFriday(date) || except[date])
    .map((date) => except[date] ?? day(date, 'present', hours));
}

describe('money rounding', () => {
  it('rounds halves away from zero, like PostgreSQL', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1000 / 26)).toBe(38.46);
    expect(roundMoney(-0)).toBe(0);
  });
});

describe('calendar', () => {
  it('treats Friday as the weekly holiday', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28);
    expect(datesInMonth('2028-02')).toHaveLength(29);
    expect(isFriday('2026-10-02')).toBe(true);
    expect(isFriday('2026-10-03')).toBe(false);
    expect(workingDaysInMonth(MONTH)).toBe(26);
    expect(workingDaysInMonth('2026-02')).toBe(24);
  });
});

describe('attendance summary', () => {
  it('counts overtime beyond basic hours, and all Friday hours', () => {
    const summary = summarizeAttendance(
      employee({ workHoursPerDay: 8 }),
      [
        day('2026-10-01', 'present', 10), // 2 h overtime
        day('2026-10-02', 'present', 6), // Friday: 6 h overtime
        day('2026-10-03', 'present', 8),
        day('2026-10-04', 'absent'),
        day('2026-10-05', 'leave'),
        day('2026-10-06', 'holiday'),
        day('2026-10-07', 'vacation'),
        day('2026-10-09', 'absent'), // Friday: not a working day
        // Someone else's attendance is ignored.
        day('2026-10-07', 'absent', 0, 'someone-else'),
      ],
      MONTH,
    );
    expect(summary).toEqual({
      workingDays: 26,
      presentDays: 2,
      absentDays: 1,
      leaveDays: 1,
      vacationDays: 1,
      holidayDays: 1,
      notRecordedDays: 20,
      fridaysWorked: 1,
      hoursWorked: 24,
      overtimeHours: 8,
    });
  });

  it('uses each employee’s own basic hours', () => {
    const tenHours = employee({ workHoursPerDay: 10 });
    expect(
      summarizeAttendance(tenHours, [day('2026-10-01', 'present', 11)], MONTH)
        .overtimeHours,
    ).toBe(1);
  });
});

describe('payslip calculation', () => {
  it('pays a company worker by the day with overtime, deductions and fines', () => {
    const attendance = month(8, {
      '2026-10-01': day('2026-10-01', 'present', 12), // 4 h overtime
      '2026-10-03': day('2026-10-03', 'present', 12), // 4 h overtime
      '2026-10-04': day('2026-10-04', 'absent'),
      '2026-10-05': day('2026-10-05', 'absent'),
      '2026-10-06': day('2026-10-06', 'leave'),
    });
    const payslip = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(payslip).toEqual(
      expect.objectContaining({
        workingDays: 26,
        presentDays: 23,
        absentDays: 2,
        leaveDays: 1,
        basicSalary: 2600,
        basicPay: 2600,
        overtimeHours: 8,
        overtimeRate: 30, // 20 × 1.5
        // 3 unpaid days × (2600 / 26)
        absenceDeduction: 300,
        // Absent days beyond the first are fined 20 SAR each.
        absenceFine: 20,
        advanceDeduction: 0,
      }),
    );
    expect(grossPay(payslip)).toBe(2840);
    expect(netPay(payslip)).toBe(2520);
  });

  it('deducts advances only up to the pay, carrying the rest forward', () => {
    const attendance = month(8);
    const settings = DEFAULT_PAYROLL_SETTINGS;
    const some = calculatePayslip(employee(), MONTH, attendance, settings, 500);
    expect(some.advanceDeduction).toBe(500);
    expect(netPay(some)).toBe(2100);

    const tooMuch = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      settings,
      9000,
    );
    expect(tooMuch.advanceDeduction).toBe(2600);
    expect(netPay(tooMuch)).toBe(0);
  });

  it('never deducts more than the salary for a month away', () => {
    const worker = employee({ salary: 1000 });
    const attendance = datesInMonth(MONTH)
      .filter((date) => !isFriday(date))
      .map((date) => day(date, 'leave'));
    const payslip = calculatePayslip(
      worker,
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(payslip.absenceDeduction).toBe(1000);
    expect(netPay(payslip)).toBe(0);
  });

  it('pays vacation and deducts leave by default; both can be switched', () => {
    const attendance = month(8, {
      '2026-10-03': day('2026-10-03', 'leave'),
      '2026-10-04': day('2026-10-04', 'vacation'),
      '2026-10-05': day('2026-10-05', 'vacation'),
    });
    const byDefault = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(byDefault.vacationDays).toBe(2);
    expect(byDefault.leaveDays).toBe(1);
    expect(byDefault.absenceDeduction).toBe(100); // the leave day only
    expect(byDefault.absenceFine).toBe(0); // leave and vacation are not fined

    const switched = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      {
        ...DEFAULT_PAYROLL_SETTINGS,
        leavePaid: true,
        vacationPaid: false,
      },
      0,
    );
    expect(switched.absenceDeduction).toBe(200); // the two vacation days
  });

  it('uses the payroll settings', () => {
    const attendance = month(8, {
      '2026-10-01': day('2026-10-01', 'present', 9),
      '2026-10-03': day('2026-10-03', 'absent'),
      '2026-10-04': day('2026-10-04', 'absent'),
      '2026-10-05': day('2026-10-05', 'absent'),
    });
    const payslip = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      {
        overtimeBaseRate: 25,
        overtimeMultiplier: 2,
        absenceFine: 50,
        absenceFineFreeDays: 0,
        leavePaid: false,
        vacationPaid: true,
      },
      0,
    );
    expect(payslip.overtimeRate).toBe(50);
    expect(payslip.absenceFine).toBe(150);
  });

  it('pays an outsource worker days × hours × rate, without overtime or fines', () => {
    const worker = employee({
      role: 'outsource_worker',
      salary: null,
      hourlyRate: 12.5,
    });
    const attendance = [
      day('2026-10-01', 'present', 10),
      day('2026-10-03', 'present', 10),
      day('2026-10-04', 'present', 9.5),
      day('2026-10-05', 'absent'),
      day('2026-10-06', 'absent'),
    ];
    const payslip = calculatePayslip(
      worker,
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(payslip).toEqual(
      expect.objectContaining({
        hoursWorked: 29.5,
        hourlyRate: 12.5,
        basicSalary: 0,
        basicPay: 368.75,
        overtimeHours: 0,
        absenceDeduction: 0,
        absenceFine: 0,
      }),
    );
    expect(netPay(payslip)).toBe(368.75);
  });

  it('pays staff their basic salary without attendance', () => {
    const payslip = calculatePayslip(
      employee({ role: 'staff', salary: 5000 }),
      MONTH,
      [],
      DEFAULT_PAYROLL_SETTINGS,
      1000,
    );
    expect(payslip.basicPay).toBe(5000);
    expect(payslip.absenceDeduction).toBe(0);
    expect(payslip.advanceDeduction).toBe(1000);
    expect(netPay(payslip)).toBe(4000);
  });
});

describe('outstanding advances', () => {
  const { id } = employee();
  const advance = (date: string, amount: number) => ({
    id: date,
    employeeId: id,
    date,
    amount,
    note: '',
  });
  const deducted = (monthKey: string, advanceDeduction: number) =>
    ({ employeeId: id, month: monthKey, advanceDeduction }) as Pick<
      Payslip,
      'employeeId' | 'month' | 'advanceDeduction'
    >;

  it('is every advance up to the month, less earlier deductions', () => {
    const advances = [
      advance('2026-09-10', 300),
      advance('2026-10-05', 200),
      advance('2026-11-01', 999), // given later: not due yet
    ];
    const payslips = [
      deducted('2026-09', 250),
      deducted('2026-10', 250), // this month's own payslip is not counted
    ];
    expect(outstandingAdvance(id, '2026-10', advances, payslips)).toBe(250);
    expect(outstandingAdvance(id, '2026-09', advances, payslips)).toBe(300);
    expect(
      outstandingAdvance('someone-else', '2026-10', advances, payslips),
    ).toBe(0);
  });
});

describe('payroll validation', () => {
  it('keeps hours only on present days and refuses duplicates', () => {
    const { rows } = validateAttendanceDay('2026-10-01', [
      { employeeId: 'a', status: 'absent', hours: 8, note: ' sick ' },
      { employeeId: 'b', status: null, hours: 8, note: 'x' },
      { employeeId: 'c', status: 'present', hours: 9.5, note: '' },
    ]);
    expect(rows).toEqual([
      { employeeId: 'a', status: 'absent', hours: 0, note: 'sick' },
      { employeeId: 'b', status: null, hours: 0, note: '' },
      { employeeId: 'c', status: 'present', hours: 9.5, note: '' },
    ]);
    expect(() =>
      validateAttendanceDay('2026-10-01', [
        { employeeId: 'a', status: 'present', hours: 8, note: '' },
        { employeeId: 'a', status: 'absent', hours: 0, note: '' },
      ]),
    ).toThrow(/listed twice/);
    expect(() =>
      validateAttendanceDay('2026-10-01', [
        { employeeId: 'a', status: 'present', hours: 25, note: '' },
      ]),
    ).toThrow(/between 0 and 24/);
    expect(() =>
      validateAttendanceDay('2026-10-01', [
        { employeeId: 'a', status: 'late', hours: 8, note: '' },
      ]),
    ).toThrow(/status/);
  });

  it('refuses negative amounts and fractional days on a payslip', () => {
    const valid = calculatePayslip(
      employee(),
      MONTH,
      month(8),
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(validatePayslipInput(valid)).toEqual(valid);
    expect(() =>
      validatePayslipInput({ ...valid, otherDeduction: -1 }),
    ).toThrow(/zero or more/);
    expect(() => validatePayslipInput({ ...valid, absentDays: 1.5 })).toThrow(
      /whole number/,
    );
    expect(() => validatePayslipInput({ ...valid, month: '2026-13' })).toThrow(
      /YYYY-MM/,
    );
  });
});
