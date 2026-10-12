import { ReactNode } from 'react';
import { monthKey } from '../../../shared/months';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_CODES,
  ATTENDANCE_STATUS_LABELS,
} from '../../../shared/payroll';
import {
  AttendanceStatus,
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  Employee,
  EmployeeRole,
  distinctValues,
  toDateKey,
  todayKey,
} from '../model';

/** Building blocks shared by the Attendance and Payroll sections. */

export type SectionTab<T extends string> = {
  id: T;
  icon: string;
  label: string;
  hint: string;
};

/** Large tabs that split a section into subsections. */
export function SectionTabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: SectionTab<T>[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div aria-label={label} className="section-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={tab.id === active}
          className={`section-tab${tab.id === active ? ' active' : ''}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          type="button"
        >
          <span aria-hidden="true" className="section-tab-icon">
            {tab.icon}
          </span>
          <span className="section-tab-text">
            <strong>{tab.label}</strong>
            <small>{tab.hint}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export type Tone =
  | AttendanceStatus
  | 'none'
  | 'violet'
  | 'green'
  | 'orange'
  | 'blue'
  | 'red';

export function KpiCard({
  tone,
  icon,
  label,
  value,
  hint = null,
}: {
  tone: Tone;
  icon: string;
  label: string;
  value: ReactNode;
  // Most cards have no hint; it defaults to null above.
  // eslint-disable-next-line react/require-default-props
  hint?: ReactNode;
}) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span aria-hidden="true" className="kpi-icon">
        {icon}
      </span>
      <div>
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}

export const STATUS_ICONS: Record<AttendanceStatus, string> = {
  present: '✓',
  absent: '✕',
  leave: '☂',
  vacation: '✈',
  holiday: '★',
};

/** What each colour and letter means. */
export function StatusLegend() {
  return (
    <div aria-label="Legend" className="status-legend">
      {ATTENDANCE_STATUSES.map((status) => (
        <span key={status}>
          <i className={`legend-swatch status-${status}`}>
            {ATTENDANCE_STATUS_CODES[status]}
          </i>
          {ATTENDANCE_STATUS_LABELS[status]}
        </span>
      ))}
      <span>
        <i className="legend-swatch status-friday">F</i>
        Friday (weekly holiday)
      </span>
    </div>
  );
}

/**
 * One-click status buttons for an employee's day. Clicking the chosen
 * status again clears the day.
 */
export function StatusPicker({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: AttendanceStatus | null;
  disabled: boolean;
  onChange: (status: AttendanceStatus | null) => void;
}) {
  return (
    <div
      aria-label={`Status for ${name}`}
      className="status-picker"
      role="radiogroup"
    >
      {ATTENDANCE_STATUSES.map((status) => (
        <button
          aria-checked={value === status}
          aria-label={ATTENDANCE_STATUS_LABELS[status]}
          className={`status-option status-${status}${value === status ? ' selected' : ''}`}
          disabled={disabled}
          key={status}
          onClick={() => onChange(value === status ? null : status)}
          role="radio"
          title={
            value === status
              ? `${ATTENDANCE_STATUS_LABELS[status]} (click again to clear)`
              : ATTENDANCE_STATUS_LABELS[status]
          }
          type="button"
        >
          <span aria-hidden="true">{ATTENDANCE_STATUS_CODES[status]}</span>
          <small aria-hidden="true">{ATTENDANCE_STATUS_LABELS[status]}</small>
        </button>
      ))}
    </div>
  );
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return toDateKey(new Date(year, month - 1, day + days));
}

export function shiftMonth(month: string, months: number) {
  const [year, number] = month.split('-').map(Number);
  return monthKey(new Date(year, number - 1 + months, 1));
}

/** ‹ date › with a Today button; future dates cannot be chosen. */
export function DateNavigator({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const today = todayKey();
  return (
    <div className="navigator">
      <button
        aria-label="Previous day"
        className="navigator-step"
        onClick={() => onChange(shiftDate(value, -1))}
        type="button"
      >
        ‹
      </button>
      <input
        aria-label="Date"
        id={id}
        max={today}
        onChange={(event) => {
          if (event.currentTarget.value) onChange(event.currentTarget.value);
        }}
        type="date"
        value={value}
      />
      <button
        aria-label="Next day"
        className="navigator-step"
        disabled={value >= today}
        onClick={() => onChange(shiftDate(value, 1))}
        type="button"
      >
        ›
      </button>
      <button
        className="button button-secondary navigator-today"
        disabled={value === today}
        onClick={() => onChange(today)}
        type="button"
      >
        Today
      </button>
    </div>
  );
}

/** ‹ month › ; future months cannot be chosen. */
export function MonthNavigator({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (month: string) => void;
}) {
  const current = monthKey();
  return (
    <div className="navigator">
      <button
        aria-label="Previous month"
        className="navigator-step"
        onClick={() => onChange(shiftMonth(value, -1))}
        type="button"
      >
        ‹
      </button>
      <input
        aria-label="Month"
        id={id}
        max={current}
        onChange={(event) => {
          if (event.currentTarget.value) onChange(event.currentTarget.value);
        }}
        type="month"
        value={value}
      />
      <button
        aria-label="Next month"
        className="navigator-step"
        disabled={value >= current}
        onClick={() => onChange(shiftMonth(value, 1))}
        type="button"
      >
        ›
      </button>
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  return (
    <span aria-hidden="true" className="person-avatar">
      {initials || '?'}
    </span>
  );
}

/* Grouping by project, camp or role */

export type GroupBy = 'none' | 'project' | 'camp' | 'role';

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: 'No grouping',
  project: 'Project',
  camp: 'Camp',
  role: 'Role',
};

type Grouped = { projectName: string; campName: string; role: EmployeeRole };

export function groupLabel(item: Grouped, by: GroupBy) {
  if (by === 'project') return item.projectName || 'No project';
  if (by === 'camp') return item.campName || 'No camp';
  if (by === 'role') return EMPLOYEE_ROLE_LABELS[item.role];
  return 'Everyone';
}

/** Splits items into labelled groups, sorted, with "No …" groups last. */
export function groupItems<T>(
  items: T[],
  by: GroupBy,
  pick: (item: T) => Grouped,
): { label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const label = groupLabel(pick(item), by);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  });
  const empty = (label: string) => label.startsWith('No ');
  return [...groups.entries()]
    .sort(
      ([a], [b]) => Number(empty(a)) - Number(empty(b)) || a.localeCompare(b),
    )
    .map(([label, list]) => ({ label, items: list }));
}

export function GroupBySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: GroupBy;
  onChange: (value: GroupBy) => void;
}) {
  return (
    <label className="filter-control" htmlFor={id}>
      Group by
      <select
        id={id}
        onChange={(event) => onChange(event.currentTarget.value as GroupBy)}
        value={value}
      >
        {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((option) => (
          <option key={option} value={option}>
            {GROUP_BY_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** e.g. "Karim Uddin · Company worker · 2400100001" for employee pickers. */
export function employeeOptionLabel(
  employee: Pick<Employee, 'name' | 'role' | 'iqamaNo' | 'terminationDate'>,
) {
  return [
    employee.name,
    EMPLOYEE_ROLE_LABELS[employee.role],
    employee.iqamaNo,
    employee.terminationDate ? 'terminated' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/* Choosing who a batch applies to */

export type TargetKind = 'one' | 'all' | 'project' | 'camp' | 'role';

/** Who a batch is for: one employee, everyone, or one project, camp or role. */
export type Target = { kind: TargetKind; value: string };

const KIND_LABELS: Record<TargetKind, string> = {
  one: 'One employee',
  all: 'Everyone',
  project: 'A project',
  camp: 'A camp',
  role: 'A role',
};

const KIND_NOUNS: Record<TargetKind, string> = {
  one: 'Employee',
  all: '',
  project: 'Project',
  camp: 'Camp',
  role: 'Role',
};

function targetValue(employee: Employee, kind: TargetKind) {
  if (kind === 'one') return employee.id;
  if (kind === 'project') return employee.projectName;
  if (kind === 'camp') return employee.campName;
  if (kind === 'role') return employee.role;
  return '';
}

export function matchesTarget(employee: Employee, target: Target) {
  return (
    target.kind === 'all' || targetValue(employee, target.kind) === target.value
  );
}

/** The choices for the second dropdown, with how many employees each has. */
export function targetOptions(employees: Employee[], kind: TargetKind) {
  const count = (value: string) =>
    employees.filter((employee) => targetValue(employee, kind) === value)
      .length;
  if (kind === 'all') return [];
  if (kind === 'one') {
    return [...employees]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((employee) => ({
        value: employee.id,
        label: employeeOptionLabel(employee),
      }));
  }
  const values =
    kind === 'role'
      ? EMPLOYEE_ROLES.filter((role) =>
          employees.some((employee) => employee.role === role),
        )
      : distinctValues(
          employees.map((employee) => targetValue(employee, kind)),
        );
  const options = values.map((value) => ({
    value,
    label: `${kind === 'role' ? EMPLOYEE_ROLE_LABELS[value as EmployeeRole] : value} (${count(value)})`,
  }));
  if (
    kind !== 'role' &&
    employees.some((employee) => !targetValue(employee, kind))
  ) {
    options.push({ value: '', label: `No ${kind} (${count('')})` });
  }
  return options;
}

export function describeTarget(target: Target, employees: Employee[]) {
  if (target.kind === 'all') return 'everyone';
  if (target.kind === 'one') {
    return (
      employees.find((employee) => employee.id === target.value)?.name ?? ''
    );
  }
  if (target.kind === 'role') {
    return EMPLOYEE_ROLE_LABELS[target.value as EmployeeRole];
  }
  return target.value || `No ${target.kind}`;
}

/** Value of the second dropdown before anything is chosen. */
export const NO_CHOICE = '__choose__';

export function newTarget(kind: TargetKind): Target {
  return { kind, value: kind === 'all' ? '' : NO_CHOICE };
}

export function isTargetChosen(target: Target) {
  return target.value !== NO_CHOICE;
}

/**
 * Two dropdowns: who it is for ("A project"), then which one ("Mall").
 * A project, camp or role starts unchosen so nothing is applied by mistake.
 */
export function TargetSelect({
  id,
  employees,
  kinds,
  value,
  onChange,
}: {
  id: string;
  employees: Employee[];
  kinds: TargetKind[];
  value: Target;
  onChange: (value: Target) => void;
}) {
  const { kind } = value;
  const options = targetOptions(employees, kind);
  return (
    <div className="target-select">
      <label className="form-field" htmlFor={`${id}-kind`}>
        For
        <select
          id={`${id}-kind`}
          onChange={(event) =>
            onChange(newTarget(event.currentTarget.value as TargetKind))
          }
          value={kind}
        >
          {kinds.map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      {kind !== 'all' && (
        <label className="form-field" htmlFor={`${id}-value`}>
          {KIND_NOUNS[kind]}
          <select
            id={`${id}-value`}
            onChange={(event) =>
              onChange({ kind, value: event.currentTarget.value })
            }
            value={value.value}
          >
            <option disabled value={NO_CHOICE}>
              Choose {KIND_NOUNS[kind].toLowerCase()}
            </option>
            {options.map((option) => (
              <option key={option.value || 'none'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
