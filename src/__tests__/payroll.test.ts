/**
 * @jest-environment node
 */
import {
  DEFAULT_PAYROLL_SETTINGS,
  DEFAULT_WORK_HOURS_PER_DAY,
  calculatePayslip,
  datesInMonth,
  grossPay,
  hourlySalary,
  isEmployedInMonth,
  isFriday,
  netPay,
  outstandingAdvance,
  overtimePay,
  overtimeRates,
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
    terminationDate: '',
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
      employedWorkingDays: 26,
      presentDays: 2,
      absentDays: 1,
      leaveDays: 1,
      vacationDays: 1,
      holidayDays: 1,
      notRecordedDays: 20,
      fridaysWorked: 1,
      hoursWorked: 24,
      overtimeHours: 8,
      weekendOvertimeHours: 6,
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
  it('follows the company policy for a company worker', () => {
    // Basic 2,600 with 8 basic hours: per-hour salary 2600 ÷ 30 ÷ 8 = 10.8333.
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
        presentDays: 23,
        absentDays: 2,
        leaveDays: 1,
        basicPay: 2600,
        overtimeHours: 8,
        overtimeRate: 13.5417, // 10.8333 × 1.25
        weekendOvertimeHours: 0,
        weekendOvertimeRate: 16.25, // 10.8333 × 1.5
        // 3 days off: 1 paid, 2 unpaid × 2600 ÷ 30
        absenceFine: 173.33,
        absenceDeduction: 0,
        advanceDeduction: 0,
      }),
    );
    expect(grossPay(payslip)).toBe(2708.33); // 2600 + 8 × 13.5417
    expect(netPay(payslip)).toBe(2535); // 2708.33 − 173.33
  });

  it('pays one day off a month and deducts a day’s salary for each after it', () => {
    const absent = (count: number) => {
      const days = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'];
      const except = Object.fromEntries(
        days.slice(0, count).map((date) => [date, day(date, 'absent')]),
      );
      return calculatePayslip(
        employee(),
        MONTH,
        month(8, except),
        DEFAULT_PAYROLL_SETTINGS,
        0,
      );
    };
    expect(absent(1).absenceFine).toBe(0);
    expect(absent(2).absenceFine).toBe(86.67); // 2600 ÷ 30
    expect(absent(4).absenceFine).toBe(260); // 3 × 2600 ÷ 30
    expect(netPay(absent(4))).toBe(2340);
  });

  it('works out overtime from the per-hour salary: × 1.25 on working days, × 1.5 on Fridays', () => {
    expect(DEFAULT_WORK_HOURS_PER_DAY).toBe(10);
    const worker = employee({ workHoursPerDay: 10 });
    // 2600 ÷ 30 ÷ 10 = 8.6667 an hour.
    expect(hourlySalary(worker, DEFAULT_PAYROLL_SETTINGS)).toBeCloseTo(
      8.6667,
      4,
    );
    expect(overtimeRates(worker, DEFAULT_PAYROLL_SETTINGS)).toEqual({
      perHour: 8.6667,
      regular: 10.8333,
      weekend: 13,
    });
    const payslip = calculatePayslip(
      worker,
      MONTH,
      [
        day('2026-10-01', 'present', 12), // 2 h beyond 10
        day('2026-10-02', 'present', 6), // Friday: all 6 h
      ],
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(payslip).toEqual(
      expect.objectContaining({
        overtimeHours: 2,
        overtimeRate: 10.8333,
        weekendOvertimeHours: 6,
        weekendOvertimeRate: 13,
      }),
    );
    expect(overtimePay(payslip)).toBe(99.67); // 21.67 + 78.00
  });

  it('pays a terminated employee up to the last working day only', () => {
    // 1–15 October 2026 has 13 working days (Fridays 2 and 9 excluded).
    const leaver = employee({ terminationDate: '2026-10-15' });
    const attendance = month(10, {
      '2026-10-20': day('2026-10-20', 'absent'),
      '2026-10-21': day('2026-10-21', 'absent'),
    });
    const payslip = calculatePayslip(
      leaver,
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(payslip.workingDays).toBe(13);
    expect(payslip.presentDays).toBe(13);
    expect(payslip.absentDays).toBe(0); // days after leaving do not count
    expect(payslip.basicPay).toBe(1300); // 2600 × 13 / 26
    expect(payslip.note).toMatch(/last working day 2026-10-15/);

    const staff = calculatePayslip(
      employee({ role: 'staff', salary: 5200, terminationDate: '2026-10-15' }),
      MONTH,
      [],
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(staff.basicPay).toBe(2600);

    const hourly = calculatePayslip(
      employee({
        role: 'outsource_worker',
        hourlyRate: 10,
        terminationDate: '2026-10-15',
      }),
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(hourly.hoursWorked).toBe(130); // 13 days × 10 h, none after
    expect(isEmployedInMonth(leaver, '2026-10')).toBe(true);
    expect(isEmployedInMonth(leaver, '2026-11')).toBe(false);
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

  it('treats a month of leave like a month of unpaid leave after the paid day', () => {
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
    expect(payslip.absenceFine).toBe(833.33); // 25 × 1000 ÷ 30
    expect(netPay(payslip)).toBe(166.67);
  });

  it('never lets deductions take net pay below zero', () => {
    const payslip = calculatePayslip(
      employee({ salary: 300 }),
      MONTH,
      datesInMonth(MONTH)
        .filter((date) => !isFriday(date))
        .map((date) => day(date, 'absent')),
      DEFAULT_PAYROLL_SETTINGS,
      1000,
    );
    expect(payslip.absenceFine).toBe(250); // 25 × 300 ÷ 30
    expect(payslip.advanceDeduction).toBe(50); // only what is left
    expect(netPay(payslip)).toBe(0);
  });

  it('counts leave like absence, pays vacation, and both can be switched', () => {
    const attendance = month(8, {
      '2026-10-03': day('2026-10-03', 'leave'),
      '2026-10-04': day('2026-10-04', 'leave'),
      '2026-10-05': day('2026-10-05', 'absent'),
      '2026-10-06': day('2026-10-06', 'vacation'),
      '2026-10-07': day('2026-10-07', 'vacation'),
    });
    const byDefault = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      DEFAULT_PAYROLL_SETTINGS,
      0,
    );
    expect(byDefault.vacationDays).toBe(2);
    expect(byDefault.absenceDeduction).toBe(0); // vacation is paid
    expect(byDefault.absenceFine).toBe(173.33); // 3 days off: 2 × 2600 ÷ 30

    const switched = calculatePayslip(
      employee(),
      MONTH,
      attendance,
      { ...DEFAULT_PAYROLL_SETTINGS, leavePaid: true, vacationPaid: false },
      0,
    );
    expect(switched.absenceFine).toBe(0); // only 1 absent day, which is paid
    expect(switched.absenceDeduction).toBe(173.33); // 2 vacation days
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
        overtimeMultiplier: 2,
        weekendOvertimeMultiplier: 3,
        salaryDays: 26,
        paidDaysOff: 0,
        leavePaid: false,
        vacationPaid: true,
      },
      0,
    );
    // 2600 ÷ 26 ÷ 8 = 12.5 an hour.
    expect(payslip.overtimeRate).toBe(25);
    expect(payslip.weekendOvertimeRate).toBe(37.5);
    expect(payslip.absenceFine).toBe(300); // 3 × 2600 ÷ 26
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
