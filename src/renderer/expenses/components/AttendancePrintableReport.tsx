import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_CODES,
  ATTENDANCE_STATUS_LABELS,
  AttendanceSummary,
  datesInMonth,
  isFriday,
  overtimeHoursFor,
  payBasis,
  summarizeAttendance,
} from '../../../shared/payroll';
import { formatMonthName } from '../../../shared/months';
import {
  AttendanceEntry,
  EMPLOYEE_ROLE_LABELS,
  Employee,
  formatReportDate,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayIndex(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekday(date: string) {
  return WEEKDAYS[weekdayIndex(date)];
}

/** e.g. 1.5 → '1.5', 8 → '8' */
export function formatHours(hours: number) {
  return String(Math.round(hours * 100) / 100);
}

/**
 * What a day shows on the monthly sheet: hours for hourly workers, P for
 * others with any overtime added (P+2), and A, L, V or H otherwise.
 */
export function attendanceCode(
  entry: AttendanceEntry | undefined,
  employee: Employee,
) {
  if (!entry) return '';
  if (entry.status !== 'present') return ATTENDANCE_STATUS_CODES[entry.status];
  if (payBasis(employee.role) === 'hourly') return formatHours(entry.hours);
  const overtime = overtimeHoursFor(entry, employee.workHoursPerDay);
  return overtime > 0 ? `P+${formatHours(overtime)}` : 'P';
}

/** Class for a day cell: its status colour, or Friday / not recorded. */
export function dayCellClass(entry: AttendanceEntry | undefined, date: string) {
  if (entry) return `status-${entry.status}`;
  return isFriday(date) ? 'status-friday' : 'status-empty';
}

export function entriesByEmployeeDate(entries: AttendanceEntry[]) {
  return new Map(
    entries.map((entry) => [`${entry.employeeId}|${entry.date}`, entry]),
  );
}

/** Totals columns, in the order shown on sheets. */
export const SUMMARY_COLUMNS: {
  key: keyof AttendanceSummary;
  label: string;
  status?: (typeof ATTENDANCE_STATUSES)[number];
}[] = [
  { key: 'presentDays', label: 'P', status: 'present' },
  { key: 'absentDays', label: 'A', status: 'absent' },
  { key: 'leaveDays', label: 'L', status: 'leave' },
  { key: 'vacationDays', label: 'V', status: 'vacation' },
  { key: 'holidayDays', label: 'H', status: 'holiday' },
  { key: 'hoursWorked', label: 'HRS' },
  { key: 'overtimeHours', label: 'OT' },
];

export function summaryValue(
  summary: AttendanceSummary,
  key: keyof AttendanceSummary,
  employee: Employee,
) {
  if (key === 'overtimeHours' && payBasis(employee.role) !== 'daily') {
    return '—';
  }
  const value = summary[key];
  return key === 'hoursWorked' || key === 'overtimeHours'
    ? formatHours(value)
    : String(value);
}

function PrintLegend() {
  return (
    <div className="print-legend">
      {ATTENDANCE_STATUSES.map((status) => (
        <span key={status}>
          <i className={`status-${status}`}>
            {ATTENDANCE_STATUS_CODES[status]}
          </i>
          {ATTENDANCE_STATUS_LABELS[status]}
        </span>
      ))}
      <span>
        <i className="status-friday">F</i>Friday
      </span>
      <span>
        <i className="status-present">P+2</i>Present with 2 h overtime
      </span>
      <span>
        <i className="status-present">9</i>Hours (hourly workers)
      </span>
    </div>
  );
}

function Signatures() {
  return (
    <div className="moon-signatures">
      <span>Prepared by</span>
      <span>Checked by</span>
      <span>Approved by</span>
    </div>
  );
}

/** The month's attendance for many employees, one row each (A4 landscape). */
export function AttendanceSheetReport({
  month,
  groups,
  entries,
  filterSummary,
}: {
  month: string;
  /** Employees, in groups (one unnamed group when not grouped). */
  groups: { label: string; employees: Employee[] }[];
  entries: AttendanceEntry[];
  filterSummary: string;
}) {
  const dates = datesInMonth(month);
  const byKey = entriesByEmployeeDate(entries);
  const columns = dates.length + 2 + SUMMARY_COLUMNS.length;
  const total = groups.reduce((sum, group) => sum + group.employees.length, 0);
  let serial = 0;
  return (
    <article className="standalone-print-report moon-report landscape-report">
      <ReportBrandHeader
        title={`ATTENDANCE SHEET · ${formatMonthName(month).toUpperCase()}`}
      />
      <p className="moon-report-filters">
        {[filterSummary, `${total} employees`].filter(Boolean).join(' · ')}
      </p>
      <PrintLegend />
      <table className="moon-report-table moon-attendance-sheet">
        <thead>
          <tr>
            <th className="sl">SL</th>
            <th className="name">NAME</th>
            {dates.map((date) => (
              <th className={isFriday(date) ? 'friday' : undefined} key={date}>
                {Number(date.slice(8))}
                <small>{weekday(date).slice(0, 2)}</small>
              </th>
            ))}
            {SUMMARY_COLUMNS.map((column) => (
              <th
                className={`total ${column.status ? `status-${column.status}` : ''}`}
                key={column.key}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => [
            groups.length > 1 && (
              <tr className="group-row" key={`group-${group.label}`}>
                <td colSpan={columns}>
                  {group.label} · {group.employees.length}
                </td>
              </tr>
            ),
            ...group.employees.map((employee) => {
              serial += 1;
              const summary = summarizeAttendance(employee, entries, month);
              return (
                <tr key={employee.id}>
                  <td className="sl">{serial}</td>
                  <td className="name">
                    {employee.name}
                    <small>
                      {employee.iqamaNo} · {EMPLOYEE_ROLE_LABELS[employee.role]}
                    </small>
                  </td>
                  {dates.map((date) => {
                    const entry = byKey.get(`${employee.id}|${date}`);
                    return (
                      <td className={dayCellClass(entry, date)} key={date}>
                        {attendanceCode(entry, employee)}
                      </td>
                    );
                  })}
                  {SUMMARY_COLUMNS.map((column) => (
                    <td className="total" key={column.key}>
                      {summaryValue(summary, column.key, employee)}
                    </td>
                  ))}
                </tr>
              );
            }),
          ])}
          {total === 0 && (
            <tr>
              <td className="empty" colSpan={columns}>
                No employees match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <Signatures />
    </article>
  );
}

/** One employee's month as a calendar plus a day list (A4 portrait). */
export function EmployeeAttendanceReport({
  month,
  employee,
  entries,
}: {
  month: string;
  employee: Employee;
  entries: AttendanceEntry[];
}) {
  const byKey = entriesByEmployeeDate(entries);
  const summary = summarizeAttendance(employee, entries, month);
  const daily = payBasis(employee.role) === 'daily';
  const dates = datesInMonth(month);
  const leading = weekdayIndex(dates[0]);
  return (
    <article className="standalone-print-report moon-report">
      <ReportBrandHeader
        title={`ATTENDANCE REPORT · ${formatMonthName(month).toUpperCase()}`}
      />
      <table className="moon-report-table moon-report-details">
        <tbody>
          <tr>
            <th>Name</th>
            <td>{employee.name}</td>
            <th>Iqama no.</th>
            <td>{employee.iqamaNo}</td>
          </tr>
          <tr>
            <th>Role</th>
            <td>{EMPLOYEE_ROLE_LABELS[employee.role]}</td>
            <th>Designation</th>
            <td>{employee.designation || '—'}</td>
          </tr>
          <tr>
            <th>Project</th>
            <td>{employee.projectName || '—'}</td>
            <th>Camp</th>
            <td>{employee.campName || '—'}</td>
          </tr>
        </tbody>
      </table>

      <div className="print-summary">
        {[
          ['Working days', summary.workingDays, ''],
          ['Present', summary.presentDays, 'present'],
          ['Absent', summary.absentDays, 'absent'],
          ['Leave', summary.leaveDays, 'leave'],
          ['Vacation', summary.vacationDays, 'vacation'],
          ['Holiday', summary.holidayDays, 'holiday'],
          ['Not recorded', summary.notRecordedDays, 'empty'],
          ['Hours', formatHours(summary.hoursWorked), ''],
          ...(daily
            ? [['Overtime h', formatHours(summary.overtimeHours), '']]
            : []),
        ].map(([label, value, status]) => (
          <div className={status ? `status-${status}` : undefined} key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section className="moon-report-section">
        <h2>Calendar</h2>
        <div className="print-calendar">
          {WEEKDAYS.map((day) => (
            <b className={day === 'Fri' ? 'friday' : undefined} key={day}>
              {day}
            </b>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <span className="blank" key={`blank-${index}`} />
          ))}
          {dates.map((date) => {
            const entry = byKey.get(`${employee.id}|${date}`);
            return (
              <span className={dayCellClass(entry, date)} key={date}>
                <em>{Number(date.slice(8))}</em>
                {entry
                  ? attendanceCode(entry, employee)
                  : isFriday(date) && 'F'}
              </span>
            );
          })}
        </div>
        <PrintLegend />
      </section>

      <section className="moon-report-section">
        <h2>Day by day</h2>
        <table className="moon-report-table moon-attendance-days">
          <thead>
            <tr>
              <th>DATE</th>
              <th>DAY</th>
              <th>STATUS</th>
              <th className="amount">HOURS</th>
              <th className="amount">OVERTIME</th>
              <th>NOTE</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const entry = byKey.get(`${employee.id}|${date}`);
              const friday = isFriday(date);
              let status = friday ? 'Weekly holiday' : 'Not recorded';
              if (entry) status = ATTENDANCE_STATUS_LABELS[entry.status];
              return (
                <tr className={friday ? 'friday' : undefined} key={date}>
                  <td>{formatReportDate(date)}</td>
                  <td>{weekday(date)}</td>
                  <td>
                    <span
                      className={`print-badge ${dayCellClass(entry, date)}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="amount">
                    {entry?.status === 'present'
                      ? formatHours(entry.hours)
                      : ''}
                  </td>
                  <td className="amount">
                    {daily && entry?.status === 'present'
                      ? formatHours(
                          overtimeHoursFor(entry, employee.workHoursPerDay),
                        )
                      : ''}
                  </td>
                  <td>{entry?.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="moon-signatures">
        <span>Employee signature</span>
        <span>Supervisor signature</span>
      </div>
    </article>
  );
}
