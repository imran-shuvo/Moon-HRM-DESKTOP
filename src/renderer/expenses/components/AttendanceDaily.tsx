import {
  ATTENDANCE_STATUS_LABELS,
  isFriday,
  overtimeHoursFor,
  payBasis,
} from '../../../shared/payroll';
import { AttendanceStatus, EMPLOYEE_ROLE_LABELS, Employee } from '../model';
import { formatHours } from './AttendancePrintableReport';
import { Avatar, StatusPicker } from './peopleUi';

export type AttendanceDraft = {
  status: AttendanceStatus | null;
  hours: number;
  note: string;
};

export default function AttendanceDaily({
  date,
  groups,
  rowFor,
  isChanged,
  saving,
  onChange,
  onFill,
}: {
  date: string;
  groups: { label: string; employees: Employee[] }[];
  rowFor: (employee: Employee) => AttendanceDraft;
  isChanged: (employee: Employee) => boolean;
  saving: boolean;
  onChange: (employee: Employee, change: Partial<AttendanceDraft>) => void;
  /** Sets every listed employee with nothing recorded to `status`. */
  onFill: (employees: Employee[], status: AttendanceStatus) => void;
}) {
  const friday = isFriday(date);
  const quickFill: AttendanceStatus[] = friday
    ? ['present']
    : ['present', 'absent', 'holiday'];
  return (
    <div className="daily-register">
      {friday && (
        <p className="notice notice-holiday">
          <span aria-hidden="true">★</span> Friday is the weekly holiday. Mark
          only the employees who worked — all their hours count as overtime.
        </p>
      )}
      {groups.map((group) => {
        const unrecorded = group.employees.filter(
          (employee) => rowFor(employee).status === null,
        );
        return (
          <section className="register-group" key={group.label}>
            <header className="register-group-heading">
              <div>
                <h3>{group.label}</h3>
                <span>
                  {group.employees.length} employees
                  {unrecorded.length > 0 &&
                    ` · ${unrecorded.length} not recorded`}
                </span>
              </div>
              {unrecorded.length > 0 && (
                <div className="quick-fill">
                  <span>Mark not recorded as</span>
                  {quickFill.map((status) => (
                    <button
                      aria-label={`Mark not recorded in ${group.label} as ${ATTENDANCE_STATUS_LABELS[status]}`}
                      className={`quick-fill-button status-${status}`}
                      disabled={saving}
                      key={status}
                      onClick={() => onFill(unrecorded, status)}
                      type="button"
                    >
                      {ATTENDANCE_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              )}
            </header>
            <ul className="register-list">
              {group.employees.map((employee) => {
                const row = rowFor(employee);
                const present = row.status === 'present';
                const daily = payBasis(employee.role) === 'daily';
                const overtime = present
                  ? overtimeHoursFor(
                      { date, status: 'present', hours: row.hours },
                      employee.workHoursPerDay,
                    )
                  : 0;
                return (
                  <li
                    className={`register-row${isChanged(employee) ? ' changed' : ''}${row.status ? ` row-${row.status}` : ''}`}
                    key={employee.id}
                  >
                    <div className="register-person">
                      <Avatar name={employee.name} />
                      <div>
                        <strong>{employee.name}</strong>
                        <span>
                          {employee.iqamaNo} ·{' '}
                          {EMPLOYEE_ROLE_LABELS[employee.role]}
                          {payBasis(employee.role) === 'hourly'
                            ? ' · paid hourly'
                            : ` · ${formatHours(employee.workHoursPerDay)} h day`}
                        </span>
                      </div>
                    </div>
                    <StatusPicker
                      disabled={saving}
                      name={employee.name}
                      onChange={(status) => onChange(employee, { status })}
                      value={row.status}
                    />
                    <div className="register-hours">
                      {present ? (
                        <>
                          <div className="stepper">
                            <button
                              aria-label={`Fewer hours for ${employee.name}`}
                              disabled={saving || row.hours <= 0}
                              onClick={() =>
                                onChange(employee, {
                                  hours: Math.max(0, row.hours - 0.5),
                                })
                              }
                              type="button"
                            >
                              −
                            </button>
                            <input
                              aria-label={`Hours worked by ${employee.name}`}
                              disabled={saving}
                              max={24}
                              min={0}
                              onChange={(event) =>
                                onChange(employee, {
                                  hours: Number(event.currentTarget.value) || 0,
                                })
                              }
                              step={0.25}
                              type="number"
                              value={row.hours}
                            />
                            <button
                              aria-label={`More hours for ${employee.name}`}
                              disabled={saving || row.hours >= 24}
                              onClick={() =>
                                onChange(employee, {
                                  hours: Math.min(24, row.hours + 0.5),
                                })
                              }
                              type="button"
                            >
                              +
                            </button>
                          </div>
                          <span className="hours-caption">
                            {daily && overtime > 0 ? (
                              <b className="overtime-badge">
                                +{formatHours(overtime)} h OT
                              </b>
                            ) : (
                              'hours'
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="hours-caption muted">—</span>
                      )}
                    </div>
                    <input
                      aria-label={`Note for ${employee.name}`}
                      className="register-note"
                      disabled={saving || !row.status}
                      maxLength={200}
                      onChange={(event) =>
                        onChange(employee, { note: event.currentTarget.value })
                      }
                      placeholder={row.status ? 'Add a note' : ''}
                      value={row.note}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
