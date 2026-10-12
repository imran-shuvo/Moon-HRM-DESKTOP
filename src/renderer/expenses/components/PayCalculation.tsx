import { formatMonthName } from '../../../shared/months';
import {
  calculatePayslip,
  grossPay,
  isFriday,
  netPay,
  outstandingAdvance,
  overtimeHoursFor,
  overtimeRates,
  payBasis,
  roundMoney,
  summarizeAttendance,
  totalDeductions,
} from '../../../shared/payroll';
import {
  AttendanceEntry,
  Employee,
  PayrollSettings,
  Payslip,
  SalaryAdvance,
  formatAmount,
  formatCurrency,
  formatReportDate,
} from '../model';
import { formatHours } from './AttendancePrintableReport';

export type CalculationRow = {
  label: string;
  /** How the amount is worked out, e.g. "11 h × 20.00". */
  working: string;
  /** Positive for pay, negative for deductions; undefined for notes. */
  amount?: number;
};

const dayMonth = (date: string) =>
  `${formatReportDate(date).slice(0, 6)}${isFriday(date) ? ' (Fri)' : ''}`;

/** A per-hour rate, e.g. 8.6667. */
const formatRate = (value: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);

/**
 * The month's pay for one employee, line by line, worked out exactly as a
 * new payslip would be (same rules, current payroll settings).
 */
export function payCalculation(
  employee: Employee,
  month: string,
  attendance: AttendanceEntry[],
  settings: PayrollSettings,
  advances: SalaryAdvance[],
  payslips: Payslip[],
) {
  const basis = payBasis(employee.role);
  const summary = summarizeAttendance(employee, attendance, month);
  const advanceDue = outstandingAdvance(employee.id, month, advances, payslips);
  const input = calculatePayslip(
    employee,
    month,
    attendance,
    settings,
    advanceDue,
  );
  const basic = employee.salary ?? 0;
  const ended =
    employee.terminationDate && employee.terminationDate.startsWith(month);
  const rows: CalculationRow[] = [];

  // Basic pay
  if (basis === 'hourly') {
    rows.push({
      label: 'Hours worked',
      working: `${formatHours(summary.hoursWorked)} h × ${formatAmount(employee.hourlyRate ?? 0)} per hour`,
      amount: input.basicPay,
    });
  } else {
    rows.push({
      label: basis === 'monthly' ? 'Basic salary (staff)' : 'Basic salary',
      working: ended
        ? `${formatAmount(basic)} × ${summary.employedWorkingDays} ÷ ${summary.workingDays} working days (last working day ${formatReportDate(employee.terminationDate)})`
        : `Monthly basic salary${basis === 'monthly' ? '; staff record no attendance' : ''}`,
      amount: input.basicPay,
    });
  }

  if (basis === 'daily') {
    const rates = overtimeRates(employee, settings);
    rows.push({
      label: 'Per-hour salary',
      working: `${formatAmount(basic)} ÷ ${settings.salaryDays} days ÷ ${formatHours(employee.workHoursPerDay)} basic hours = ${formatRate(rates.perHour)}`,
    });

    // Overtime, day by day
    const overtimeOn = (friday: boolean) =>
      attendance
        .filter(
          (entry) =>
            entry.employeeId === employee.id &&
            entry.date.startsWith(month) &&
            isFriday(entry.date) === friday &&
            overtimeHoursFor(entry, employee.workHoursPerDay) > 0 &&
            (!employee.terminationDate ||
              entry.date <= employee.terminationDate),
        )
        .sort((x, y) => x.date.localeCompare(y.date))
        .map(
          (entry) =>
            `${dayMonth(entry.date)} ${formatHours(overtimeHoursFor(entry, employee.workHoursPerDay))} h`,
        );
    rows.push({
      label: 'Overtime (working days)',
      working: input.overtimeHours
        ? `${formatHours(input.overtimeHours)} h × ${formatRate(rates.perHour)} × ${settings.overtimeMultiplier} = ${formatHours(input.overtimeHours)} h × ${formatRate(input.overtimeRate)} — hours beyond ${formatHours(employee.workHoursPerDay)} a day: ${overtimeOn(false).join(', ')}`
        : `No hours beyond ${formatHours(employee.workHoursPerDay)} a day`,
      amount: roundMoney(input.overtimeHours * input.overtimeRate),
    });
    if (input.weekendOvertimeHours) {
      rows.push({
        label: 'Overtime (Fridays)',
        working: `${formatHours(input.weekendOvertimeHours)} h × ${formatRate(rates.perHour)} × ${settings.weekendOvertimeMultiplier} = ${formatHours(input.weekendOvertimeHours)} h × ${formatRate(input.weekendOvertimeRate)} — every Friday hour: ${overtimeOn(true).join(', ')}`,
        amount: roundMoney(
          input.weekendOvertimeHours * input.weekendOvertimeRate,
        ),
      });
    }

    // Days off: the first paidDaysOff are paid, the rest are unpaid leave.
    const leaveCounted = settings.leavePaid ? 0 : summary.leaveDays;
    const daysOff = summary.absentDays + leaveCounted;
    const unpaid = Math.max(0, daysOff - settings.paidDaysOff);
    rows.push({
      label: 'Unpaid leave',
      working:
        daysOff === 0
          ? 'No absent or leave days'
          : `${summary.absentDays} absent${settings.leavePaid ? '' : ` + ${summary.leaveDays} leave`} = ${daysOff} ${daysOff === 1 ? 'day' : 'days'}; ${settings.paidDaysOff} paid; ${unpaid} unpaid × ${formatAmount(basic)} ÷ ${settings.salaryDays}`,
      amount: -input.absenceFine,
    });
    if (settings.leavePaid && summary.leaveDays) {
      rows.push({
        label: 'Leave days',
        working: `${summary.leaveDays} ${summary.leaveDays === 1 ? 'day' : 'days'} — paid, not counted`,
      });
    }

    // Vacation
    if (summary.vacationDays) {
      rows.push(
        settings.vacationPaid
          ? {
              label: 'Vacation',
              working: `${summary.vacationDays} ${summary.vacationDays === 1 ? 'day' : 'days'} — paid in full`,
            }
          : {
              label: 'Unpaid vacation',
              working: `${summary.vacationDays} days × ${formatAmount(basic)} ÷ ${settings.salaryDays}`,
              amount: -input.absenceDeduction,
            },
      );
    }
    if (summary.holidayDays) {
      rows.push({
        label: 'Holidays',
        working: `${summary.holidayDays} ${summary.holidayDays === 1 ? 'day' : 'days'} — paid in full`,
      });
    }
  }

  if (basis !== 'monthly' && summary.notRecordedDays) {
    rows.push({
      label: 'Not recorded',
      working: `${summary.notRecordedDays} working ${summary.notRecordedDays === 1 ? 'day' : 'days'} without attendance — ${
        basis === 'hourly'
          ? 'no hours, so not paid'
          : 'paid as normal; check before paying'
      }`,
    });
  }

  // Advances
  if (advanceDue > 0) {
    const carried = roundMoney(advanceDue - input.advanceDeduction);
    rows.push({
      label: 'Advance',
      working: `${formatAmount(advanceDue)} not yet deducted${
        carried > 0
          ? `; pay covers ${formatAmount(input.advanceDeduction)}, ${formatAmount(carried)} carried to next month`
          : ''
      }`,
      amount: -input.advanceDeduction,
    });
  }

  const saved = payslips.find(
    (payslip) => payslip.employeeId === employee.id && payslip.month === month,
  );
  return {
    rows,
    gross: grossPay(input),
    deductions: totalDeductions(input),
    net: netPay(input),
    saved,
  };
}

function Amount({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="amount" />;
  if (value < 0) return <td className="amount">− {formatAmount(-value)}</td>;
  return <td className="amount">{formatAmount(value)}</td>;
}

/** The calculation as a table; used on screen and in the printed report. */
export function PayCalculationTable({
  calculation,
  className,
}: {
  calculation: ReturnType<typeof payCalculation>;
  className: string;
}) {
  return (
    <table className={className}>
      <thead>
        <tr>
          <th>ITEM</th>
          <th>HOW IT IS WORKED OUT</th>
          <th className="amount">SAR</th>
        </tr>
      </thead>
      <tbody>
        {calculation.rows.map((row) => (
          <tr
            className={row.amount === undefined ? 'calc-note' : undefined}
            key={row.label}
          >
            <td>{row.label}</td>
            <td>{row.working}</td>
            <Amount value={row.amount} />
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Gross pay</td>
          <td>Basic pay + overtime (working days and Fridays)</td>
          <td className="amount">{formatCurrency(calculation.gross)}</td>
        </tr>
        <tr>
          <td>Deductions</td>
          <td>Unpaid leave + unpaid vacation + advance</td>
          <td className="amount">− {formatCurrency(calculation.deductions)}</td>
        </tr>
        <tr className="calc-net">
          <td>Net pay</td>
          <td>Gross pay − deductions</td>
          <td className="amount">{formatCurrency(calculation.net)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** "How this month's pay is worked out" on the employee report. */
export default function PayCalculation({
  calculation,
  month,
}: {
  calculation: ReturnType<typeof payCalculation>;
  month: string;
}) {
  const { saved } = calculation;
  return (
    <section
      aria-labelledby="pay-calculation-title"
      className="pay-calculation"
    >
      <div className="pay-calculation-heading">
        <h3 id="pay-calculation-title">
          How {formatMonthName(month)} pay is worked out
        </h3>
        <p>
          Worked out from this month&apos;s attendance with the current payroll
          settings — the same way a new payslip is. See Settings → Terms &amp;
          policy for the rules.
        </p>
      </div>
      <PayCalculationTable calculation={calculation} className="calc-table" />
      {saved && (
        <p
          className={`notice${saved.netPay === calculation.net ? '' : ' notice-action'}`}
        >
          {saved.netPay === calculation.net
            ? `The saved payslip for ${formatMonthName(month)} matches: net pay ${formatCurrency(saved.netPay)}${saved.status === 'paid' ? ', paid' : ''}.`
            : `The saved payslip shows net pay ${formatCurrency(saved.netPay)}${saved.status === 'paid' ? ' (paid)' : ''}. It differs because it was edited, or attendance or settings changed after it was made.`}
        </p>
      )}
    </section>
  );
}
