import { ReactNode } from 'react';
import {
  ATTENDANCE_STATUS_LABELS,
  datesInMonth,
  isFriday,
  overtimeHoursFor,
  payBasis,
} from '../../../shared/payroll';
import {
  AttendanceEntry,
  EMPLOYEE_ROLE_LABELS,
  Employee,
  formatReportDate,
  todayKey,
} from '../model';
import {
  attendanceCode,
  dayCellClass,
  entriesByEmployeeDate,
  formatHours,
  weekdayIndex,
} from './AttendancePrintableReport';
import { Avatar, employeeOptionLabel } from './peopleUi';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One employee's month as a calendar. */
export default function AttendanceEmployee({
  month,
  employees,
  employee,
  entries,
  onSelect,
  onOpenDay,
  payCalculation,
}: {
  month: string;
  employees: Employee[];
  employee: Employee | undefined;
  entries: AttendanceEntry[];
  onSelect: (id: string) => void;
  onOpenDay: (date: string) => void;
  /** The month's pay worked out, shown under the calendar. */
  payCalculation: ReactNode;
}) {
  const dates = datesInMonth(month);
  const byKey = entriesByEmployeeDate(entries);
  const today = todayKey();
  return (
    <div className="employee-attendance">
      <label
        className="filter-control employee-picker"
        htmlFor="attendance-employee"
      >
        Employee
        <select
          id="attendance-employee"
          onChange={(event) => onSelect(event.currentTarget.value)}
          value={employee?.id ?? ''}
        >
          <option disabled value="">
            Choose an employee
          </option>
          {employees.map((item) => (
            <option key={item.id} value={item.id}>
              {employeeOptionLabel(item)}
            </option>
          ))}
        </select>
      </label>
      {!employee && (
        <p className="empty-state">
          Choose an employee to see their month, or click a name on the monthly
          sheet.
        </p>
      )}
      {employee && (
        <>
          <div className="person-card">
            <Avatar name={employee.name} />
            <div>
              <strong>{employee.name}</strong>
              <span>
                {EMPLOYEE_ROLE_LABELS[employee.role]} · Iqama {employee.iqamaNo}
                {employee.projectName && ` · ${employee.projectName}`}
                {employee.campName && ` · ${employee.campName}`}
              </span>
            </div>
          </div>
          <div className="calendar">
            {WEEKDAYS.map((day) => (
              <b className={day === 'Fri' ? 'friday' : undefined} key={day}>
                {day}
              </b>
            ))}
            {Array.from({ length: weekdayIndex(dates[0]) }, (_, index) => (
              <span className="calendar-blank" key={`blank-${index}`} />
            ))}
            {dates.map((date) => {
              const entry = byKey.get(`${employee.id}|${date}`);
              const overtime =
                entry && payBasis(employee.role) === 'daily'
                  ? overtimeHoursFor(entry, employee.workHoursPerDay)
                  : 0;
              let label = isFriday(date) ? 'Friday' : 'Not recorded';
              if (entry) label = ATTENDANCE_STATUS_LABELS[entry.status];
              return (
                <button
                  aria-label={`${formatReportDate(date)}: ${label}`}
                  className={`calendar-day ${dayCellClass(entry, date, employee)}${date === today ? ' today' : ''}`}
                  disabled={date > today}
                  key={date}
                  onClick={() => onOpenDay(date)}
                  title={entry?.note || 'Open this day'}
                  type="button"
                >
                  <em>{Number(date.slice(8))}</em>
                  <strong>
                    {entry ? attendanceCode(entry, employee) : ''}
                  </strong>
                  <small>
                    {entry?.status === 'present'
                      ? `${formatHours(entry.hours)} h${overtime > 0 ? ` · +${formatHours(overtime)} OT` : ''}`
                      : label}
                  </small>
                </button>
              );
            })}
          </div>
          {payCalculation}
        </>
      )}
    </div>
  );
}
