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
 * - Company and outsource camp workers are paid by the day: a monthly basic
 *   salary, less a day's pay for each absent day, and each leave or vacation
 *   day unless the settings make it paid (a day's pay is the basic salary
 *   divided by the month's working days). Leave is unpaid and vacation paid
 *   by default. Hours worked beyond
 *   their basic hours a day are overtime. Absent days beyond the free days
 *   are fined.
 * - Outsource workers are paid by the hour: hours worked × rate per hour.
 * - Friday is the weekly holiday: it is not a working day, and hours worked
 *   on a Friday are all overtime.
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
  overtimeBaseRate: 20,
  overtimeMultiplier: 1.5,
  absenceFine: 20,
  absenceFineFreeDays: 1,
  leavePaid: false,
  vacationPaid: true,
};

export const DEFAULT_WORK_HOURS_PER_DAY = 8;

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
  workingDays: number;
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
  overtimeHours: number;
};

/** Totals for one employee's attendance in a month. */
export function summarizeAttendance(
  employee: Pick<Employee, 'id' | 'workHoursPerDay'>,
  entries: AttendanceEntry[],
  month: string,
): AttendanceSummary {
  const summary: AttendanceSummary = {
    workingDays: workingDaysInMonth(month),
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    vacationDays: 0,
    holidayDays: 0,
    notRecordedDays: 0,
    fridaysWorked: 0,
    hoursWorked: 0,
    overtimeHours: 0,
  };
  entries
    .filter(
      (entry) =>
        entry.employeeId === employee.id && entry.date.startsWith(month),
    )
    .forEach((entry) => {
      const friday = isFriday(entry.date);
      if (entry.status === 'present') {
        summary.hoursWorked += entry.hours;
        summary.overtimeHours += overtimeHoursFor(
          entry,
          employee.workHoursPerDay,
        );
        if (friday) summary.fridaysWorked += 1;
        else summary.presentDays += 1;
      } else if (!friday) {
        summary[`${entry.status}Days`] += 1;
      }
    });
  summary.notRecordedDays = Math.max(
    0,
    summary.workingDays -
      summary.presentDays -
      summary.absentDays -
      summary.leaveDays -
      summary.vacationDays -
      summary.holidayDays,
  );
  summary.hoursWorked = roundMoney(summary.hoursWorked);
  summary.overtimeHours = roundMoney(summary.overtimeHours);
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

export function overtimeRate(settings: PayrollSettings) {
  return roundMoney(settings.overtimeBaseRate * settings.overtimeMultiplier);
}

/** Pay before deductions. */
export function grossPay(
  input: Pick<
    PayslipInput,
    'basicPay' | 'overtimeHours' | 'overtimeRate' | 'allowance'
  >,
) {
  return roundMoney(
    input.basicPay +
      roundMoney(input.overtimeHours * input.overtimeRate) +
      input.allowance,
  );
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
  const base: PayslipInput = {
    employeeId: employee.id,
    month,
    workingDays: summary.workingDays,
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
    allowance: 0,
    absenceDeduction: 0,
    absenceFine: 0,
    advanceDeduction: 0,
    otherDeduction: 0,
    note: '',
  };
  let input: PayslipInput;
  if (basis === 'monthly') {
    input = { ...base, basicPay: basicSalary };
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
      // Multiply before dividing so a full month off deducts exactly the salary.
      const unpaidDays =
        summary.absentDays +
        (settings.leavePaid ? 0 : summary.leaveDays) +
        (settings.vacationPaid ? 0 : summary.vacationDays);
      input = {
        ...base,
        ...days,
        basicPay: basicSalary,
        overtimeHours: summary.overtimeHours,
        overtimeRate: overtimeRate(settings),
        absenceDeduction: summary.workingDays
          ? roundMoney(
              Math.min(
                basicSalary,
                (basicSalary * unpaidDays) / summary.workingDays,
              ),
            )
          : 0,
        absenceFine: roundMoney(
          Math.max(0, summary.absentDays - settings.absenceFineFreeDays) *
            settings.absenceFine,
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
  history: { attendance: boolean; advances: boolean; payslips: boolean },
) {
  const kept = [
    history.attendance && 'attendance',
    history.advances && 'advances',
    history.payslips && 'payslips',
  ].filter(Boolean);
  if (kept.length) {
    throw new AppError(
      'IN_USE',
      `${name} has ${kept.join(', ')} on record, so they cannot be deleted. Their payroll history is kept.`,
    );
  }
}
