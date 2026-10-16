import { AppError } from './errors';
import type { EmployeeRole } from './employeeRoles';
import type {
  AttendanceEntry,
  AttendanceStatus,
  Employee,
  Payslip,
  PayslipInput,
  PayrollSettings,
  SalaryAdvance,
} from './types';

/**
 * Attendance and salary rules.
 *
 * - Staff have no attendance; they are paid their basic salary.
 * - Company and outsource camp workers are paid their monthly basic salary.
 *   Per-hour salary = basic ÷ 30 ÷ basic hours a day (10 by default).
 *   Overtime on a working day (hours beyond the basic hours) pays the
 *   per-hour salary × 1.25; every hour worked on a Friday pays × 1.5.
 *   Absent and leave days count together: one a month is paid, and each one
 *   after that is unpaid leave, deducted a day's salary (basic ÷ 30).
 *   Vacation is paid by default.
 * - Outsource workers are paid by the hour: hours worked × rate per hour.
 * - Friday is the weekly holiday: it is not a working day, and hours worked
 *   on a Friday are all overtime.
 * - A terminated employee is paid up to their last working day: the
 *   monthly salary is cut to the working days up to that day, and nothing
 *   after it counts.
 * - Unpaid advances are deducted from the next payslip, up to its pay.
 *
 * These are only the defaults; every amount on a payslip can be edited.
 */

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'present',
  'absent',
  'leave',
  'vacation',
  'holiday',
];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  leave: 'Leave',
  vacation: 'Vacation',
  holiday: 'Holiday',
};

/** One-letter codes for the monthly attendance sheet. */
export const ATTENDANCE_STATUS_CODES: Record<AttendanceStatus, string> = {
  present: 'P',
  absent: 'A',
  leave: 'L',
  vacation: 'V',
  holiday: 'H',
};

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  overtimeMultiplier: 1.25,
  weekendOvertimeMultiplier: 1.5,
  salaryDays: 30,
  paidDaysOff: 1,
  leavePaid: false,
  vacationPaid: true,
};

export const DEFAULT_WORK_HOURS_PER_DAY = 10;

export type PayBasis = 'monthly' | 'daily' | 'hourly';

/** How each role is paid. */
export function payBasis(role: EmployeeRole): PayBasis {
  if (role === 'staff') return 'monthly';
  if (role === 'outsource_worker') return 'hourly';
  return 'daily';
}

/** Staff have no attendance. */
export function takesAttendance(role: EmployeeRole) {
  return role !== 'staff';
}

/**
 * Rounds to whole halalas, halves away from zero like PostgreSQL's round().
 * The epsilon corrects binary floating point, e.g. 1.005 * 100 is
 * 100.49999999999999, which would otherwise round down.
 */
export function roundMoney(value: number) {
  const cents = Math.round(Math.abs(value) * 100 * (1 + Number.EPSILON));
  return (Math.sign(value) * cents) / 100 || 0;
}

/** Every 'YYYY-MM-DD' date in the month 'YYYY-MM'. */
export function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
}

export function isFriday(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 5;
}

/** Days in the month other than Fridays. */
export function workingDaysInMonth(month: string) {
  return datesInMonth(month).filter((date) => !isFriday(date)).length;
}

/** Whether the employee still worked here on `date` (not yet terminated). */
export function isEmployedOn(
  employee: Pick<Employee, 'terminationDate'>,
  date: string,
) {
  return !employee.terminationDate || date <= employee.terminationDate;
}

/** Employees terminated before the month starts get no payslip for it. */
export function isEmployedInMonth(
  employee: Pick<Employee, 'terminationDate'>,
  month: string,
) {
  return isEmployedOn(employee, `${month}-01`);
}

/** Hours that count as overtime for a day's attendance. */
export function overtimeHoursFor(
  entry: Pick<AttendanceEntry, 'date' | 'status' | 'hours'>,
  workHoursPerDay: number,
) {
  if (entry.status !== 'present') return 0;
  if (isFriday(entry.date)) return entry.hours;
  return Math.max(0, entry.hours - workHoursPerDay);
}

export type AttendanceSummary = {
  /** Working days in the whole month. */
  workingDays: number;
  /** Working days up to the last working day of a terminated employee. */
  employedWorkingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  vacationDays: number;
  holidayDays: number;
  /** Working days with nothing recorded. */
  notRecordedDays: number;
  /** Fridays on which the employee worked. */
  fridaysWorked: number;
  hoursWorked: number;
  /** All overtime hours, regular and Friday. */
  overtimeHours: number;
  /** The Friday part of overtimeHours. */
  weekendOvertimeHours: number;
};

/** Totals for one employee's attendance in a month. */
export function summarizeAttendance(
  employee: Pick<Employee, 'id' | 'workHoursPerDay' | 'terminationDate'>,
  entries: AttendanceEntry[],
  month: string,
): AttendanceSummary {
  const employedWorkingDays = datesInMonth(month).filter(
    (date) => !isFriday(date) && isEmployedOn(employee, date),
  ).length;
  const summary: AttendanceSummary = {
    workingDays: workingDaysInMonth(month),
    employedWorkingDays,
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    vacationDays: 0,
    holidayDays: 0,
    notRecordedDays: 0,
    fridaysWorked: 0,
    hoursWorked: 0,
    overtimeHours: 0,
    weekendOvertimeHours: 0,
  };
  entries
    .filter(
      (entry) =>
        entry.employeeId === employee.id &&
        entry.date.startsWith(month) &&
        // Nothing after the last working day counts.
        isEmployedOn(employee, entry.date),
    )
    .forEach((entry) => {
      const friday = isFriday(entry.date);
      if (entry.status === 'present') {
        summary.hoursWorked += entry.hours;
        summary.overtimeHours += overtimeHoursFor(
          entry,
          employee.workHoursPerDay,
        );
        if (friday) {
          summary.fridaysWorked += 1;
          summary.weekendOvertimeHours += entry.hours;
        } else summary.presentDays += 1;
      } else if (!friday) {
        summary[`${entry.status}Days`] += 1;
      }
    });
  summary.notRecordedDays = Math.max(
    0,
    employedWorkingDays -
      summary.presentDays -
      summary.absentDays -
      summary.leaveDays -
      summary.vacationDays -
      summary.holidayDays,
  );
  summary.hoursWorked = roundMoney(summary.hoursWorked);
  summary.overtimeHours = roundMoney(summary.overtimeHours);
  summary.weekendOvertimeHours = roundMoney(summary.weekendOvertimeHours);
  return summary;
}

/**
 * Advances not yet deducted before `month`: every advance given up to the
 * end of the month, less what earlier payslips deducted.
 */
export function outstandingAdvance(
  employeeId: string,
  month: string,
  advances: SalaryAdvance[],
  payslips: Pick<Payslip, 'employeeId' | 'month' | 'advanceDeduction'>[],
) {
  const given = advances
    .filter(
      (advance) =>
        advance.employeeId === employeeId && advance.date.slice(0, 7) <= month,
    )
    .reduce((sum, advance) => sum + advance.amount, 0);
  const deducted = payslips
    .filter(
      (payslip) => payslip.employeeId === employeeId && payslip.month < month,
    )
    .reduce((sum, payslip) => sum + payslip.advanceDeduction, 0);
  return roundMoney(Math.max(0, given - deducted));
}

/** Rates are kept to 4 decimals so pay is not distorted by early rounding. */
export function roundRate(value: number) {
  return Math.round(value * 10000 * (1 + Number.EPSILON)) / 10000 || 0;
}

/** Per-hour salary = basic salary ÷ salary days ÷ basic hours a day. */
export function hourlySalary(
  employee: Pick<Employee, 'salary' | 'workHoursPerDay'>,
  settings: Pick<PayrollSettings, 'salaryDays'>,
) {
  const basic = employee.salary ?? 0;
  if (!settings.salaryDays || !employee.workHoursPerDay) return 0;
  return basic / settings.salaryDays / employee.workHoursPerDay;
}

/** Overtime pay per hour: the per-hour salary × the regular or Friday multiplier. */
export function overtimeRates(
  employee: Pick<Employee, 'salary' | 'workHoursPerDay'>,
  settings: PayrollSettings,
) {
  const perHour = hourlySalary(employee, settings);
  return {
    perHour: roundRate(perHour),
    regular: roundRate(perHour * settings.overtimeMultiplier),
    weekend: roundRate(perHour * settings.weekendOvertimeMultiplier),
  };
}

/** Overtime pay on a payslip, regular plus Friday; matches the database. */
export function overtimePay(
  input: Pick<
    PayslipInput,
    | 'overtimeHours'
    | 'overtimeRate'
    | 'weekendOvertimeHours'
    | 'weekendOvertimeRate'
  >,
) {
  return roundMoney(
    roundMoney(input.overtimeHours * input.overtimeRate) +
      roundMoney(input.weekendOvertimeHours * input.weekendOvertimeRate),
  );
}

/** Pay before deductions. */
export function grossPay(
  input: Pick<
    PayslipInput,
    | 'basicPay'
    | 'overtimeHours'
    | 'overtimeRate'
    | 'weekendOvertimeHours'
    | 'weekendOvertimeRate'
    | 'allowance'
  >,
) {
  return roundMoney(input.basicPay + overtimePay(input) + input.allowance);
}

export function totalDeductions(
  input: Pick<
    PayslipInput,
    'absenceDeduction' | 'absenceFine' | 'advanceDeduction' | 'otherDeduction'
  >,
) {
  return roundMoney(
    input.absenceDeduction +
      input.absenceFine +
      input.advanceDeduction +
      input.otherDeduction,
  );
}

/** Same as the database's generated net_pay column. */
export function netPay(input: PayslipInput) {
  return roundMoney(grossPay(input) - totalDeductions(input));
}

/**
 * The default payslip for an employee's month. `advanceDue` is the
 * outstanding advance; as much of it as the pay covers is deducted, and the
 * rest is carried to the next month.
 */
export function calculatePayslip(
  employee: Employee,
  month: string,
  attendance: AttendanceEntry[],
  settings: PayrollSettings,
  advanceDue: number,
): PayslipInput {
  const basis = payBasis(employee.role);
  const basicSalary = employee.salary ?? 0;
  const hourlyRate = employee.hourlyRate ?? 0;
  const summary = summarizeAttendance(employee, attendance, month);
  const { workingDays, employedWorkingDays } = summary;
  // Multiply before dividing so whole months come out exactly.
  const dayShare = (days: number) =>
    workingDays ? (basicSalary * days) / workingDays : 0;
  const ended =
    employee.terminationDate && employee.terminationDate.startsWith(month);
  const base: PayslipInput = {
    employeeId: employee.id,
    month,
    workingDays: employedWorkingDays,
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    vacationDays: 0,
    holidayDays: 0,
    hoursWorked: 0,
    basicSalary: basis === 'hourly' ? 0 : basicSalary,
    hourlyRate: basis === 'hourly' ? hourlyRate : 0,
    basicPay: 0,
    overtimeHours: 0,
    overtimeRate: 0,
    weekendOvertimeHours: 0,
    weekendOvertimeRate: 0,
    allowance: 0,
    absenceDeduction: 0,
    absenceFine: 0,
    advanceDeduction: 0,
    otherDeduction: 0,
    note: ended
      ? `Terminated: last working day ${employee.terminationDate}. Paid ${employedWorkingDays} of ${workingDays} working days.`
      : '',
  };
  // The monthly salary, cut to the working days employed.
  const salaryPay = roundMoney(
    employedWorkingDays === workingDays
      ? basicSalary
      : dayShare(employedWorkingDays),
  );
  let input: PayslipInput;
  if (basis === 'monthly') {
    input = { ...base, basicPay: salaryPay };
  } else {
    const days = {
      presentDays: summary.presentDays,
      absentDays: summary.absentDays,
      leaveDays: summary.leaveDays,
      vacationDays: summary.vacationDays,
      holidayDays: summary.holidayDays,
      hoursWorked: summary.hoursWorked,
    };
    if (basis === 'hourly') {
      input = {
        ...base,
        ...days,
        basicPay: roundMoney(summary.hoursWorked * hourlyRate),
      };
    } else {
      // Absent and leave days count together; the first paidDaysOff are
      // paid, and each one after that is unpaid leave: a day's salary
      // (basic ÷ salary days) is deducted.
      const daysOff =
        summary.absentDays + (settings.leavePaid ? 0 : summary.leaveDays);
      const unpaidLeave = Math.max(0, daysOff - settings.paidDaysOff);
      const unpaidVacation = settings.vacationPaid ? 0 : summary.vacationDays;
      const daySalary = (count: number) =>
        settings.salaryDays ? (basicSalary * count) / settings.salaryDays : 0;
      const absenceFine = roundMoney(
        Math.min(salaryPay, daySalary(unpaidLeave)),
      );
      const rates = overtimeRates(employee, settings);
      input = {
        ...base,
        ...days,
        basicPay: salaryPay,
        overtimeHours: roundMoney(
          summary.overtimeHours - summary.weekendOvertimeHours,
        ),
        overtimeRate: rates.regular,
        weekendOvertimeHours: summary.weekendOvertimeHours,
        weekendOvertimeRate: rates.weekend,
        absenceFine,
        absenceDeduction: roundMoney(
          Math.min(salaryPay - absenceFine, daySalary(unpaidVacation)),
        ),
      };
    }
  }
  const payable = Math.max(
    0,
    grossPay(input) - input.absenceDeduction - input.absenceFine,
  );
  return {
    ...input,
    advanceDeduction: roundMoney(Math.min(advanceDue, payable)),
  };
}

/** Refuses to delete an employee whose payroll history would be lost. */
export function assertNoPayrollHistory(
  name: string,
  history: {
    attendance: boolean;
    advances: boolean;
    payslips: boolean;
    pettyCash: boolean;
  },
) {
  const kept = [
    history.attendance && 'attendance',
    history.advances && 'advances',
    history.payslips && 'payslips',
    history.pettyCash && 'petty cash',
  ].filter(Boolean);
  if (kept.length) {
    throw new AppError(
      'IN_USE',
      `${name} has ${kept.join(', ')} on record, so they cannot be deleted. Their history is kept.`,
    );
  }
}
