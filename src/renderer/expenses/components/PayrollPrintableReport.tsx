import { formatMonthName } from '../../../shared/months';
import {
  grossPay,
  payBasis,
  roundMoney,
  totalDeductions,
} from '../../../shared/payroll';
import {
  EMPLOYEE_ROLE_LABELS,
  Payslip,
  formatCurrency,
  formatReportAmount,
  formatReportDate,
} from '../model';
import { formatHours } from './AttendancePrintableReport';
import ReportBrandHeader from './ReportBrandHeader';

/** A per-hour rate, e.g. 10.8333. */
const formatRate = (value: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);

function Amount({ value }: { value: number }) {
  return <td className="amount">{formatReportAmount(value)}</td>;
}

/** Totals show the currency. */
function TotalAmount({ value }: { value: number }) {
  return <td className="amount">{formatCurrency(value)}</td>;
}

function PayslipSheet({ payslip }: { payslip: Payslip }) {
  const basis = payBasis(payslip.role);
  const earnings: [string, number][] = [
    [
      basis === 'hourly'
        ? `Hours worked (${formatHours(payslip.hoursWorked)} h × ${formatReportAmount(payslip.hourlyRate)})`
        : 'Basic salary',
      payslip.basicPay,
    ],
    [
      `Overtime, working days (${formatHours(payslip.overtimeHours)} h × ${formatRate(payslip.overtimeRate)})`,
      roundMoney(payslip.overtimeHours * payslip.overtimeRate),
    ],
    [
      `Overtime, Fridays (${formatHours(payslip.weekendOvertimeHours)} h × ${formatRate(payslip.weekendOvertimeRate)})`,
      roundMoney(payslip.weekendOvertimeHours * payslip.weekendOvertimeRate),
    ],
    ['Allowance / other pay', payslip.allowance],
  ];
  const deductions: [string, number][] = [
    ['Unpaid vacation', payslip.absenceDeduction],
    ['Unpaid leave', payslip.absenceFine],
    ['Advance deduction', payslip.advanceDeduction],
    ['Other deduction', payslip.otherDeduction],
  ];
  return (
    <section className="moon-payslip">
      <ReportBrandHeader
        title={`PAYSLIP · ${formatMonthName(payslip.month).toUpperCase()}`}
      />
      <table className="moon-report-table moon-report-details">
        <tbody>
          <tr>
            <th>Name</th>
            <td>{payslip.employeeName}</td>
            <th>Iqama no.</th>
            <td>{payslip.iqamaNo}</td>
          </tr>
          <tr>
            <th>Role</th>
            <td>{EMPLOYEE_ROLE_LABELS[payslip.role]}</td>
            <th>Designation</th>
            <td>{payslip.designation || '—'}</td>
          </tr>
          <tr>
            <th>Project</th>
            <td>{payslip.projectName || '—'}</td>
            <th>Camp</th>
            <td>{payslip.campName || '—'}</td>
          </tr>
        </tbody>
      </table>
      {basis !== 'monthly' && (
        <table className="moon-report-table moon-payslip-attendance">
          <thead>
            <tr>
              <th>WORKING DAYS</th>
              <th>PRESENT</th>
              <th>ABSENT</th>
              <th>LEAVE</th>
              <th>VACATION</th>
              <th>HOLIDAY</th>
              <th>HOURS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{payslip.workingDays}</td>
              <td className="status-present">{payslip.presentDays}</td>
              <td className="status-absent">{payslip.absentDays}</td>
              <td className="status-leave">{payslip.leaveDays}</td>
              <td className="status-vacation">{payslip.vacationDays}</td>
              <td className="status-holiday">{payslip.holidayDays}</td>
              <td>{formatHours(payslip.hoursWorked)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="moon-payslip-columns">
        <table className="moon-report-table">
          <thead>
            <tr>
              <th>EARNINGS</th>
              <th className="amount">SAR</th>
            </tr>
          </thead>
          <tbody>
            {earnings.map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <Amount value={value} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>GROSS PAY</th>
              <TotalAmount value={grossPay(payslip)} />
            </tr>
          </tfoot>
        </table>
        <table className="moon-report-table">
          <thead>
            <tr>
              <th>DEDUCTIONS</th>
              <th className="amount">SAR</th>
            </tr>
          </thead>
          <tbody>
            {deductions.map(([label, value]) => (
              <tr key={label}>
                <td>{label}</td>
                <Amount value={value} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>TOTAL DEDUCTIONS</th>
              <TotalAmount value={totalDeductions(payslip)} />
            </tr>
          </tfoot>
        </table>
      </div>
      <table className="moon-report-table moon-report-summary moon-payslip-net">
        <tfoot>
          <tr>
            <th>NET PAY (SAR)</th>
            <td className="amount">{formatCurrency(payslip.netPay)}</td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <th>Status</th>
            <td className="amount">
              {payslip.status === 'paid'
                ? `Paid on ${formatReportDate(payslip.paidDate)}`
                : 'Unpaid'}
            </td>
          </tr>
        </tbody>
      </table>
      {payslip.note && (
        <p className="moon-report-filters">Note: {payslip.note}</p>
      )}
      <div className="moon-signatures">
        <span>Employee signature</span>
        <span>Authorized signature</span>
      </div>
    </section>
  );
}

/** One payslip per A4 page. */
export function PayslipsReport({ payslips }: { payslips: Payslip[] }) {
  return (
    <article className="standalone-print-report moon-report">
      {payslips.map((payslip) => (
        <PayslipSheet key={payslip.id} payslip={payslip} />
      ))}
    </article>
  );
}

/** Every payslip of a month in one table, with group subtotals (A4 landscape). */
export function PayrollSheetReport({
  month,
  groups,
  filterSummary,
}: {
  month: string;
  /** One group with an empty label when not grouped. */
  groups: { label: string; payslips: Payslip[] }[];
  filterSummary: string;
}) {
  const all = groups.flatMap((group) => group.payslips);
  const deductions = (p: Payslip) =>
    roundMoney(p.absenceDeduction + p.absenceFine + p.otherDeduction);
  const totals = (list: Payslip[]) => {
    const sum = (pick: (payslip: Payslip) => number) =>
      roundMoney(list.reduce((total, payslip) => total + pick(payslip), 0));
    return [
      sum((p) => p.basicPay),
      sum((p) => p.overtimePay),
      sum((p) => p.allowance),
      sum(deductions),
      sum((p) => p.advanceDeduction),
      sum((p) => p.netPay),
    ];
  };
  let serial = 0;
  return (
    <article className="standalone-print-report moon-report landscape-report">
      <ReportBrandHeader
        title={`PAYROLL · ${formatMonthName(month).toUpperCase()}`}
      />
      <p className="moon-report-filters">
        {[filterSummary, `${all.length} payslips · amounts in SAR`]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <section className="moon-report-section">
        <table className="moon-report-table moon-payroll-sheet">
          <thead>
            <tr>
              <th className="sl">SL</th>
              <th>NAME</th>
              <th>IQAMA NO.</th>
              <th>PROJECT / CAMP</th>
              <th>P/A/L/V · HRS</th>
              <th className="amount">BASIC</th>
              <th className="amount">OVERTIME</th>
              <th className="amount">ALLOWANCE</th>
              <th className="amount">DEDUCTIONS</th>
              <th className="amount">ADVANCE</th>
              <th className="amount">NET PAY</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => [
              group.label && (
                <tr className="group-row" key={`group-${group.label}`}>
                  <td colSpan={12}>
                    {group.label} · {group.payslips.length}
                  </td>
                </tr>
              ),
              ...group.payslips.map((payslip) => {
                serial += 1;
                return (
                  <tr key={payslip.id}>
                    <td className="sl">{serial}</td>
                    <td>{payslip.employeeName}</td>
                    <td>{payslip.iqamaNo}</td>
                    <td>
                      {[payslip.projectName, payslip.campName]
                        .filter(Boolean)
                        .join(' / ') || '—'}
                    </td>
                    <td>
                      {payBasis(payslip.role) === 'monthly'
                        ? 'Monthly'
                        : `${payslip.presentDays}/${payslip.absentDays}/${payslip.leaveDays}/${payslip.vacationDays} · ${formatHours(payslip.hoursWorked)}`}
                    </td>
                    <Amount value={payslip.basicPay} />
                    <Amount value={payslip.overtimePay} />
                    <Amount value={payslip.allowance} />
                    <Amount value={deductions(payslip)} />
                    <Amount value={payslip.advanceDeduction} />
                    <td className="amount">
                      <b>{formatReportAmount(payslip.netPay)}</b>
                    </td>
                    <td>
                      <span
                        className={`print-badge ${payslip.status === 'paid' ? 'status-present' : 'status-absent'}`}
                      >
                        {payslip.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                );
              }),
              group.label && (
                <tr className="subtotal-row" key={`subtotal-${group.label}`}>
                  <td />
                  <td colSpan={4}>Subtotal · {group.label}</td>
                  {totals(group.payslips).map((value, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TotalAmount key={index} value={value} />
                  ))}
                  <td />
                </tr>
              ),
            ])}
            {all.length === 0 && (
              <tr>
                <td className="empty" colSpan={12}>
                  No payslips match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <th colSpan={4}>TOTAL ({all.length} payslips)</th>
              {totals(all).map((value, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <TotalAmount key={index} value={value} />
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </section>
      <div className="moon-signatures">
        <span>Prepared by</span>
        <span>Checked by</span>
        <span>Approved by</span>
      </div>
    </article>
  );
}
