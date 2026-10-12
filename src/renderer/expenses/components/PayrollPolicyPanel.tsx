import {
  DEFAULT_WORK_HOURS_PER_DAY,
  hourlySalary,
  roundMoney,
  roundRate,
} from '../../../shared/payroll';
import { PayrollSettings, fileTimestamp, formatReportAmount } from '../model';
import { PrintJob } from './printJob';
import ReportBrandHeader from './ReportBrandHeader';

type PolicySection = { title: string; points: string[] };

const sar = (value: number) => `${formatReportAmount(value)} SAR`;

/** A per-hour rate, e.g. 8.6667. */
const formatRate = (value: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);

/**
 * The attendance and pay rules in plain words, using the current payroll
 * settings, so the policy always matches how payslips are worked out.
 */
export function policySections(settings: PayrollSettings): PolicySection[] {
  const hours = DEFAULT_WORK_HOURS_PER_DAY;
  const exampleBasic = 2600;
  const perHour = hourlySalary(
    { salary: exampleBasic, workHoursPerDay: hours },
    settings,
  );
  const daySalary = exampleBasic / settings.salaryDays;
  const regular = roundRate(perHour * settings.overtimeMultiplier);
  const weekend = roundRate(perHour * settings.weekendOvertimeMultiplier);
  const paid = settings.paidDaysOff;
  const daysOff = settings.leavePaid
    ? 'Absent days'
    : 'Absent days and leave days';
  const unpaidFor = (days: number) =>
    roundMoney(Math.max(0, days - paid) * daySalary);
  return [
    {
      title: 'Working days and hours',
      points: [
        'Friday is the weekly holiday (weekend). Every other day of the month is a working day.',
        `The standard working day is ${hours} hours; a few employees have 8. Each employee's basic hours are set on their employee record.`,
        'Staff do not record attendance. Company workers, outsource workers and outsource camp workers record attendance every working day.',
        'Each day is recorded as Present (with hours worked), Absent, Leave, Vacation or Holiday.',
      ],
    },
    {
      title: 'Per-hour salary',
      points: [
        `Per-hour salary = (basic salary ÷ ${settings.salaryDays}) ÷ basic hours a day.`,
        `Example: basic ${formatReportAmount(exampleBasic)}, ${hours} hours a day: ${formatReportAmount(exampleBasic)} ÷ ${settings.salaryDays} ÷ ${hours} = ${formatRate(roundRate(perHour))} SAR an hour.`,
      ],
    },
    {
      title: 'Overtime (company workers and outsource camp workers)',
      points: [
        `Working day: hours beyond the basic hours are overtime, paid at per-hour salary × ${settings.overtimeMultiplier}.`,
        `Friday (weekend): every hour worked is overtime, paid at per-hour salary × ${settings.weekendOvertimeMultiplier}.`,
        `Example (basic ${formatReportAmount(exampleBasic)}, ${hours} hours): 12 hours on a working day = 2 h × ${formatRate(regular)} = ${sar(roundMoney(2 * regular))}; 6 hours on a Friday = 6 h × ${formatRate(weekend)} = ${sar(roundMoney(6 * weekend))}.`,
        'Outsource workers are paid for every hour at their hourly rate, so they have no separate overtime.',
      ],
    },
    {
      title: 'Leave and absence (company workers and outsource camp workers)',
      points: [
        `${daysOff} are counted together for the month.`,
        `${paid === 1 ? 'One day' : `${paid} days`} a month ${paid === 1 ? 'is' : 'are'} paid leave. Each day after that is unpaid leave: one day's salary (basic salary ÷ ${settings.salaryDays}) is deducted.`,
        settings.leavePaid
          ? `Example (basic ${formatReportAmount(exampleBasic)}): 1 absent day = ${sar(unpaidFor(1))}; 3 absent days = ${sar(unpaidFor(3))}. Leave days are always paid and not counted.`
          : `Example (basic ${formatReportAmount(exampleBasic)}, a day's salary ${formatReportAmount(roundMoney(daySalary))}): 1 absent day = ${sar(unpaidFor(1))}; 1 absent + 1 leave day = ${sar(unpaidFor(2))}; 2 absent + 2 leave days = ${sar(unpaidFor(4))}.`,
        settings.vacationPaid
          ? 'Vacation days are paid in full.'
          : `Vacation days are unpaid: one day's salary (basic salary ÷ ${settings.salaryDays}) is deducted for each.`,
        'Holidays are paid in full.',
      ],
    },
    {
      title: 'Outsource workers',
      points: [
        'Paid for the hours they work: hours worked × their rate per hour.',
        'Days not worked are simply not paid; there are no other deductions for absence.',
      ],
    },
    {
      title: 'Staff',
      points: [
        'Paid their monthly basic salary in full, including during vacation, as staff do not record attendance.',
      ],
    },
    {
      title: 'Termination',
      points: [
        'When an employee is terminated, their pay is calculated up to and including their last working day; nothing after that day counts.',
        'Salary for the last month = basic salary × working days up to the last working day ÷ working days in the month.',
        'Example: an employee whose last working day is 15 October 2026 worked 13 of 26 working days and is paid half of the monthly salary.',
        'No attendance can be recorded after the last working day, and no payslip is made for later months.',
      ],
    },
    {
      title: 'Salary advances',
      points: [
        'An advance is deducted from the next payslip.',
        'If that payslip cannot cover the whole advance, the rest is deducted from the following months. Net pay is never taken below zero by an advance.',
      ],
    },
    {
      title: 'Payslips',
      points: [
        'Net pay = basic pay + overtime + allowances − deductions (unpaid leave, unpaid vacation, advances and any other deduction).',
        'Amounts are rounded to the nearest halala; per-hour rates are kept to four decimals.',
        'Payslips are worked out from attendance when they are made. Any amount can be corrected on the payslip before it is paid.',
        'Once a payslip is marked as paid, it is locked. It must be marked unpaid before it can be changed.',
        'Changing these rules applies to payslips made or recalculated afterwards; payslips already made keep their amounts.',
      ],
    },
  ];
}

/** The policy as an A4 document for printing or PDF. */
export function PayrollPolicyReport({
  settings,
}: {
  settings: PayrollSettings;
}) {
  return (
    <article className="standalone-print-report moon-report policy-report">
      <ReportBrandHeader title="ATTENDANCE & PAYROLL POLICY" />
      {policySections(settings).map((section, index) => (
        <section className="moon-report-section" key={section.title}>
          <h2>
            {index + 1}. {section.title}
          </h2>
          <ul>
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

export default function PayrollPolicyPanel({
  settings,
  onPrint,
}: {
  settings: PayrollSettings;
  onPrint: (job: PrintJob) => void;
}) {
  return (
    <section
      aria-labelledby="policy-title"
      className="panel report-export-panel policy-panel"
    >
      <div className="panel-heading">
        <div>
          <h2 id="policy-title">Terms &amp; policy</h2>
          <p>
            How attendance and pay are worked out. It always shows the current
            payroll settings, which can be changed in Payroll → ⚙ Payroll
            settings.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={() =>
            onPrint({
              fileName: `payroll-policy_${fileTimestamp(new Date())}`,
              content: <PayrollPolicyReport settings={settings} />,
            })
          }
          type="button"
        >
          ↓ Print / Save PDF
        </button>
      </div>
      <div className="policy-sections">
        {policySections(settings).map((section, index) => (
          <section className="policy-section" key={section.title}>
            <h3>
              <span>{index + 1}</span>
              {section.title}
            </h3>
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
