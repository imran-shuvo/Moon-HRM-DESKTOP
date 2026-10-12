import {
  datesInMonth,
  isFriday,
  summarizeAttendance,
} from '../../../shared/payroll';
import {
  AttendanceEntry,
  Employee,
  formatReportDate,
  todayKey,
} from '../model';
import {
  SUMMARY_COLUMNS,
  attendanceCode,
  dayCellClass,
  entriesByEmployeeDate,
  summaryValue,
  weekday,
} from './AttendancePrintableReport';
import { Avatar } from './peopleUi';

export default function AttendanceMonthly({
  month,
  groups,
  entries,
  onOpenDay,
  onOpenEmployee,
}: {
  month: string;
  groups: { label: string; employees: Employee[] }[];
  entries: AttendanceEntry[];
  onOpenDay: (date: string) => void;
  onOpenEmployee: (employee: Employee) => void;
}) {
  const dates = datesInMonth(month);
  const byKey = entriesByEmployeeDate(entries);
  const today = todayKey();
  const columns = dates.length + 1 + SUMMARY_COLUMNS.length;
  return (
    <div className="table-scroll month-sheet-scroll">
      <table className="month-sheet">
        <thead>
          <tr>
            <th className="sheet-name">Employee</th>
            {dates.map((date) => (
              <th
                className={`${isFriday(date) ? 'friday' : ''}${date === today ? ' today' : ''}`}
                key={date}
              >
                <button
                  aria-label={`Open ${formatReportDate(date)}`}
                  className="sheet-day"
                  disabled={date > today}
                  onClick={() => onOpenDay(date)}
                  title="Open this day"
                  type="button"
                >
                  <small>{weekday(date).slice(0, 2)}</small>
                  {Number(date.slice(8))}
                </button>
              </th>
            ))}
            {SUMMARY_COLUMNS.map((column) => (
              <th
                className={`sheet-total ${column.status ? `status-${column.status}` : ''}`}
                key={column.key}
                title={column.status ? undefined : column.label}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => [
            groups.length > 1 && (
              <tr className="sheet-group" key={`group-${group.label}`}>
                <td colSpan={columns}>
                  {group.label}
                  <span>{group.employees.length}</span>
                </td>
              </tr>
            ),
            ...group.employees.map((employee) => {
              const summary = summarizeAttendance(employee, entries, month);
              return (
                <tr key={employee.id}>
                  <td className="sheet-name">
                    <button
                      aria-label={`Attendance report for ${employee.name}`}
                      className="sheet-person"
                      onClick={() => onOpenEmployee(employee)}
                      title="Open this employee's report"
                      type="button"
                    >
                      <Avatar name={employee.name} />
                      <span>{employee.name}</span>
                    </button>
                  </td>
                  {dates.map((date) => {
                    const entry = byKey.get(`${employee.id}|${date}`);
                    return (
                      <td
                        className={`sheet-cell ${dayCellClass(entry, date, employee)}${date === today ? ' today' : ''}`}
                        key={date}
                        title={entry?.note || undefined}
                      >
                        {attendanceCode(entry, employee)}
                      </td>
                    );
                  })}
                  {SUMMARY_COLUMNS.map((column) => (
                    <td className="sheet-total" key={column.key}>
                      {summaryValue(summary, column.key, employee)}
                    </td>
                  ))}
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
    </div>
  );
}
