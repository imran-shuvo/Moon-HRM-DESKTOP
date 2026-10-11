import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
  AttendanceSummary,
  isFriday,
  summarizeAttendance,
  takesAttendance,
} from '../../../shared/payroll';
import { formatMonthName } from '../../../shared/months';
import { AttendanceDayInput } from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  AttendanceEntry,
  AttendanceStatus,
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  Employee,
  EmployeeRole,
  distinctValues,
  fileTimestamp,
  formatReportDate,
  matchesAny,
  plural,
  selfLabels,
  todayKey,
} from '../model';
import AttendanceDaily, { AttendanceDraft } from './AttendanceDaily';
import AttendanceEmployee from './AttendanceEmployee';
import AttendanceMonthly from './AttendanceMonthly';
import {
  AttendanceSheetReport,
  EmployeeAttendanceReport,
  entriesByEmployeeDate,
  formatHours,
  weekday,
} from './AttendancePrintableReport';
import ConfirmDialog from './ConfirmDialog';
import ExportPreviewDialog from './ExportPreviewDialog';
import FilterBar, {
  multiChips,
  searchChip,
  summarizeChips,
  useSessionState,
} from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';
import {
  DateNavigator,
  GROUP_BY_LABELS,
  GroupBy,
  GroupBySelect,
  KpiCard,
  MonthNavigator,
  SectionTab,
  SectionTabs,
  StatusLegend,
  groupItems,
} from './peopleUi';
import { PrintJob } from './printJob';

type Tab = 'daily' | 'monthly' | 'employee';

const TABS: SectionTab<Tab>[] = [
  {
    id: 'daily',
    icon: '✎',
    label: 'Daily register',
    hint: 'Mark a day’s attendance',
  },
  {
    id: 'monthly',
    icon: '▦',
    label: 'Monthly sheet',
    hint: 'Everyone, every day',
  },
  {
    id: 'employee',
    icon: '☺',
    label: 'Employee report',
    hint: 'One person’s month',
  },
];

const ATTENDANCE_ROLES = EMPLOYEE_ROLES.filter(takesAttendance);

type DayStatus = AttendanceStatus | 'none';
const DAY_STATUSES: DayStatus[] = ['none', ...ATTENDANCE_STATUSES];
const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  none: 'Not recorded',
  ...ATTENDANCE_STATUS_LABELS,
};

type Filters = {
  search: string;
  roles: EmployeeRole[];
  projects: string[];
  camps: string[];
  statuses: DayStatus[];
  groupBy: GroupBy;
};

const NO_FILTERS: Filters = {
  search: '',
  roles: [],
  projects: [],
  camps: [],
  statuses: [],
  groupBy: 'project',
};

/** Filter options with a "No …" option for employees without a value. */
function noneOption(values: string[], noneLabel: string) {
  const options = distinctValues(values);
  const labels = selfLabels(options);
  if (values.includes('')) {
    options.push('');
    labels[''] = noneLabel;
  }
  return { options, labels };
}

type MonthTotals = Pick<
  AttendanceSummary,
  | 'presentDays'
  | 'absentDays'
  | 'leaveDays'
  | 'vacationDays'
  | 'holidayDays'
  | 'hoursWorked'
  | 'overtimeHours'
>;

const NO_TOTALS: MonthTotals = {
  presentDays: 0,
  absentDays: 0,
  leaveDays: 0,
  vacationDays: 0,
  holidayDays: 0,
  hoursWorked: 0,
  overtimeHours: 0,
};

export default function AttendancePanel({
  employees,
  onPrint,
  onDirtyChange,
}: {
  employees: Employee[];
  onPrint: (job: PrintJob) => void;
  /** Tells the app there are unsaved changes, so leaving can be confirmed. */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const api = useFinanceApi();
  const [tab, setTab] = useState<Tab>('daily');
  const [date, setDate] = useState(todayKey());
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [cache, setCache] = useState<Record<string, AttendanceEntry[]>>({});
  const [loadError, setLoadError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [pendingDate, setPendingDate] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();
  const [filters, setFilters] = useSessionState('attendance', NO_FILTERS);
  const { roles, projects, camps, search, groupBy } = filters;
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const [employeeId, setEmployeeId] = useState('');
  const [preview, setPreview] = useState<PrintJob>();
  const dirtyCount = Object.keys(drafts).length;
  const viewMonth = tab === 'daily' ? date.slice(0, 7) : month;

  useEffect(() => onDirtyChange(dirtyCount > 0), [dirtyCount, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const loadMonth = useCallback(
    async (target: string) => {
      setLoadError('');
      try {
        const list = await api.attendance.list(target);
        setCache((current) => ({ ...current, [target]: list }));
      } catch (error) {
        setLoadError(errorMessage(error, 'Attendance could not be loaded.'));
      }
    },
    [api],
  );

  useEffect(() => {
    loadMonth(viewMonth);
  }, [loadMonth, viewMonth]);

  const entries = useMemo(() => cache[viewMonth] ?? [], [cache, viewMonth]);
  const ready = viewMonth in cache;
  const byKey = useMemo(() => entriesByEmployeeDate(entries), [entries]);

  const workers = useMemo(
    () => employees.filter((employee) => takesAttendance(employee.role)),
    [employees],
  );
  const options = useMemo(
    () => ({
      projects: noneOption(
        workers.map((employee) => employee.projectName),
        'No project',
      ),
      camps: noneOption(
        workers.map((employee) => employee.campName),
        'No camp',
      ),
    }),
    [workers],
  );
  const needle = search.trim().toLowerCase();
  const shown = workers.filter(
    (employee) =>
      matchesAny(roles, employee.role) &&
      matchesAny(projects, employee.projectName) &&
      matchesAny(camps, employee.campName) &&
      (!needle ||
        [employee.name, employee.nickname, employee.iqamaNo].some((value) =>
          value.toLowerCase().includes(needle),
        )),
  );

  const savedRow = (employee: Employee): AttendanceDraft => {
    const entry = byKey.get(`${employee.id}|${date}`);
    return entry
      ? { status: entry.status, hours: entry.hours, note: entry.note }
      : { status: null, hours: 0, note: '' };
  };
  const rowFor = (employee: Employee) =>
    drafts[employee.id] ?? savedRow(employee);
  const dayStatus = (employee: Employee): DayStatus =>
    rowFor(employee).status ?? 'none';
  // The status filter applies to the daily register only.
  const listed =
    tab === 'daily'
      ? shown.filter((employee) =>
          matchesAny(filters.statuses, dayStatus(employee)),
        )
      : shown;
  const groups = groupItems(listed, groupBy, (employee) => employee).map(
    (group) => ({ label: group.label, employees: group.items }),
  );
  const chips = [
    ...searchChip(search, (value) => set({ search: value })),
    ...multiChips('Role', roles, EMPLOYEE_ROLE_LABELS, (v) =>
      set({ roles: v }),
    ),
    ...multiChips('Project', projects, options.projects.labels, (v) =>
      set({ projects: v }),
    ),
    ...multiChips('Camp', camps, options.camps.labels, (v) =>
      set({ camps: v }),
    ),
    ...(tab === 'daily'
      ? multiChips('Status', filters.statuses, DAY_STATUS_LABELS, (v) =>
          set({ statuses: v }),
        )
      : []),
  ];

  const applyChanges = (
    changes: { employee: Employee; change: Partial<AttendanceDraft> }[],
  ) =>
    setDrafts((current) => {
      const updated = { ...current };
      changes.forEach(({ employee, change }) => {
        const previous = updated[employee.id] ?? savedRow(employee);
        const next = { ...previous, ...change };
        if (change.status !== undefined) {
          // A present day starts at the employee's basic hours (0 on Friday).
          if (next.status === 'present' && previous.status !== 'present') {
            next.hours = isFriday(date) ? 0 : employee.workHoursPerDay;
          }
          if (next.status !== 'present') next.hours = 0;
          if (next.status === null) next.note = '';
        }
        next.hours =
          Math.round(Math.min(24, Math.max(0, next.hours)) * 100) / 100;
        const saved = savedRow(employee);
        const unchanged =
          saved.status === next.status &&
          saved.hours === next.hours &&
          saved.note === next.note;
        if (unchanged) delete updated[employee.id];
        else updated[employee.id] = next;
      });
      return updated;
    });

  const changeDate = (next: string) => {
    if (!next) return;
    if (next !== date && dirtyCount > 0) {
      setPendingDate(next);
      return;
    }
    setDate(next);
    setTab('daily');
  };

  async function save() {
    const rows: AttendanceDayInput[] = Object.entries(drafts).map(
      ([id, draft]) => ({ employeeId: id, ...draft }),
    );
    const invalid = rows.find(
      (row) => row.status === 'present' && !(row.hours > 0 && row.hours <= 24),
    );
    if (invalid) {
      const name = workers.find((item) => item.id === invalid.employeeId)?.name;
      setMessage({
        kind: 'error',
        text: `Enter the hours ${name} worked (more than 0, at most 24).`,
      });
      return;
    }
    setSaving(true);
    setMessage(undefined);
    try {
      const saved = await api.attendance.saveDay(date, rows);
      const key = date.slice(0, 7);
      setCache((current) => ({
        ...current,
        [key]: [
          ...(current[key] ?? []).filter((entry) => entry.date !== date),
          ...saved,
        ],
      }));
      setDrafts({});
      setMessage({
        kind: 'ok',
        text: `Attendance for ${formatReportDate(date)} saved (${plural(rows.length, 'change')}).`,
      });
    } catch (error) {
      // Drafts are kept, so nothing typed is lost when a save fails.
      setMessage({
        kind: 'error',
        text: errorMessage(
          error,
          'Attendance could not be saved. Your changes are kept.',
        ),
      });
    } finally {
      setSaving(false);
    }
  }

  const filterSummary = [
    summarizeChips(chips),
    groupBy === 'none'
      ? ''
      : `Grouped by ${GROUP_BY_LABELS[groupBy].toLowerCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const sheetJob = (): PrintJob => ({
    fileName: `attendance_${month}_${fileTimestamp(new Date())}`,
    landscape: true,
    content: (
      <AttendanceSheetReport
        month={month}
        groups={groups}
        entries={entries}
        filterSummary={filterSummary}
      />
    ),
  });
  const selected = workers.find((employee) => employee.id === employeeId);
  const employeeJob = (employee: Employee): PrintJob => ({
    fileName: `attendance_${employee.name.replace(/\s+/g, '-')}_${month}`,
    content: (
      <EmployeeAttendanceReport
        month={month}
        employee={employee}
        entries={entries}
      />
    ),
  });

  let kpis: ReactNode;
  if (tab === 'daily') {
    const count = (status: AttendanceStatus | null) =>
      shown.filter((employee) => rowFor(employee).status === status).length;
    kpis = (
      <>
        <KpiCard
          tone="present"
          icon="✓"
          label="Present"
          value={count('present')}
        />
        <KpiCard
          tone="absent"
          icon="✕"
          label="Absent"
          value={count('absent')}
        />
        <KpiCard tone="leave" icon="☂" label="Leave" value={count('leave')} />
        <KpiCard
          tone="vacation"
          icon="✈"
          label="Vacation"
          value={count('vacation')}
        />
        <KpiCard
          tone="holiday"
          icon="★"
          label="Holiday"
          value={count('holiday')}
        />
        <KpiCard
          tone="none"
          icon="?"
          label="Not recorded"
          value={count(null)}
          hint={`of ${shown.length} shown`}
        />
      </>
    );
  } else {
    const people = tab === 'employee' ? [selected].filter(Boolean) : shown;
    const totals = (people as Employee[]).reduce<MonthTotals>(
      (sum, employee) => {
        const summary = summarizeAttendance(employee, entries, month);
        return {
          presentDays: sum.presentDays + summary.presentDays,
          absentDays: sum.absentDays + summary.absentDays,
          leaveDays: sum.leaveDays + summary.leaveDays,
          vacationDays: sum.vacationDays + summary.vacationDays,
          holidayDays: sum.holidayDays + summary.holidayDays,
          hoursWorked: sum.hoursWorked + summary.hoursWorked,
          overtimeHours: sum.overtimeHours + summary.overtimeHours,
        };
      },
      NO_TOTALS,
    );
    kpis = (
      <>
        <KpiCard
          tone="present"
          icon="✓"
          label="Present days"
          value={totals.presentDays}
        />
        <KpiCard
          tone="absent"
          icon="✕"
          label="Absent days"
          value={totals.absentDays}
        />
        <KpiCard
          tone="leave"
          icon="☂"
          label="Leave days"
          value={totals.leaveDays}
        />
        <KpiCard
          tone="vacation"
          icon="✈"
          label="Vacation days"
          value={totals.vacationDays}
        />
        <KpiCard
          tone="holiday"
          icon="★"
          label="Holidays"
          value={totals.holidayDays}
        />
        <KpiCard
          tone="violet"
          icon="◷"
          label="Hours worked"
          value={formatHours(totals.hoursWorked)}
          hint={`${formatHours(totals.overtimeHours)} h overtime`}
        />
      </>
    );
  }

  return (
    <div className="people-section">
      <SectionTabs
        label="Attendance views"
        tabs={TABS}
        active={tab}
        onChange={setTab}
      />

      <section className="panel people-panel">
        <div className="people-toolbar">
          <div className="people-toolbar-main">
            <div>
              <h2>
                {tab === 'daily'
                  ? `${weekday(date)}, ${formatReportDate(date)}`
                  : formatMonthName(month)}
              </h2>
              <p>
                {tab === 'daily' &&
                  'Click a status for each employee, then save. Staff have no attendance.'}
                {tab === 'monthly' &&
                  'Click a day to edit it, or a name for that employee’s report.'}
                {tab === 'employee' &&
                  'Each day of the month at a glance. Click a day to edit it.'}
              </p>
            </div>
            {tab === 'daily' ? (
              <DateNavigator
                id="attendance-date"
                value={date}
                onChange={changeDate}
              />
            ) : (
              <MonthNavigator
                id="attendance-month"
                value={month}
                onChange={setMonth}
              />
            )}
          </div>
        </div>
        {tab !== 'employee' && (
          <FilterBar
            searchId="attendance-search"
            searchLabel="Search employees"
            searchPlaceholder="Search name or Iqama"
            search={search}
            onSearchChange={(value) => set({ search: value })}
            chips={chips}
            shown={listed.length}
            total={workers.length}
            noun="workers"
            onClearAll={() =>
              setFilters((current) => ({
                ...NO_FILTERS,
                groupBy: current.groupBy,
              }))
            }
          >
            <MultiSelectFilter
              id="attendance-filter-role"
              label="Role"
              allLabel="All roles"
              options={ATTENDANCE_ROLES}
              labels={EMPLOYEE_ROLE_LABELS}
              counts={countBy(workers, (employee) => employee.role)}
              selected={roles}
              onChange={(v) => set({ roles: v })}
            />
            <MultiSelectFilter
              id="attendance-filter-project"
              label="Project"
              allLabel="All projects"
              options={options.projects.options}
              labels={options.projects.labels}
              counts={countBy(workers, (employee) => employee.projectName)}
              selected={projects}
              onChange={(v) => set({ projects: v })}
            />
            <MultiSelectFilter
              id="attendance-filter-camp"
              label="Camp"
              allLabel="All camps"
              options={options.camps.options}
              labels={options.camps.labels}
              counts={countBy(workers, (employee) => employee.campName)}
              selected={camps}
              onChange={(v) => set({ camps: v })}
            />
            {tab === 'daily' && (
              <MultiSelectFilter
                id="attendance-filter-status"
                label="Status"
                allLabel="Any status"
                options={DAY_STATUSES}
                labels={DAY_STATUS_LABELS}
                counts={countBy(shown, dayStatus)}
                selected={filters.statuses}
                onChange={(v) => set({ statuses: v })}
              />
            )}
            <GroupBySelect
              id="attendance-group"
              value={groupBy}
              onChange={(value) => set({ groupBy: value })}
            />
          </FilterBar>
        )}

        <div className="kpi-grid">{kpis}</div>

        {loadError && (
          <div className="app-message error panel-message" role="alert">
            <span>{loadError}</span>
            <button
              className="button button-secondary"
              onClick={() => loadMonth(viewMonth)}
              type="button"
            >
              Try again
            </button>
          </div>
        )}
        {message && (
          <div
            className={`app-message ${message.kind} panel-message`}
            role={message.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{message.text}</span>
            <button
              aria-label="Dismiss message"
              className="dialog-close"
              onClick={() => setMessage(undefined)}
              type="button"
            >
              ×
            </button>
          </div>
        )}

        {tab !== 'daily' && ready && (
          <div className="people-actions">
            <StatusLegend />
            <div className="people-actions-buttons">
              {tab === 'monthly' && (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => setPreview(sheetJob())}
                    type="button"
                  >
                    Preview PDF
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => onPrint(sheetJob())}
                    type="button"
                  >
                    ↓ Export sheet as PDF
                  </button>
                </>
              )}
              {tab === 'employee' && selected && (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => setPreview(employeeJob(selected))}
                    type="button"
                  >
                    Preview PDF
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => onPrint(employeeJob(selected))}
                    type="button"
                  >
                    ↓ Export report as PDF
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {!ready && !loadError && (
          <p className="empty-state" role="status">
            Loading attendance…
          </p>
        )}
        {ready && tab === 'daily' && shown.length > 0 && (
          <AttendanceDaily
            date={date}
            groups={groups}
            rowFor={rowFor}
            isChanged={(employee) => Boolean(drafts[employee.id])}
            saving={saving}
            onChange={(employee, change) =>
              applyChanges([{ employee, change }])
            }
            onFill={(list, status) =>
              applyChanges(
                list.map((employee) => ({ employee, change: { status } })),
              )
            }
          />
        )}
        {ready && tab === 'monthly' && shown.length > 0 && (
          <AttendanceMonthly
            month={month}
            groups={groups}
            entries={entries}
            onOpenDay={changeDate}
            onOpenEmployee={(employee) => {
              setEmployeeId(employee.id);
              setTab('employee');
            }}
          />
        )}
        {ready && tab === 'employee' && (
          <AttendanceEmployee
            month={month}
            employees={workers}
            employee={selected}
            entries={entries}
            onSelect={setEmployeeId}
            onOpenDay={changeDate}
          />
        )}
        {ready && tab !== 'employee' && shown.length === 0 && (
          <p className="empty-state">
            {workers.length === 0
              ? 'No company, outsource or camp workers yet. Add them under Employees.'
              : 'No employees match these filters.'}
          </p>
        )}
      </section>

      {tab === 'daily' && dirtyCount > 0 && (
        <div aria-label="Unsaved attendance" className="save-bar" role="region">
          <span>
            <b>{plural(dirtyCount, 'unsaved change')}</b> for{' '}
            {formatReportDate(date)}
          </span>
          <button
            className="button button-secondary"
            disabled={saving}
            onClick={() => setDrafts({})}
            type="button"
          >
            Discard changes
          </button>
          <button
            className="button button-primary"
            disabled={saving}
            onClick={save}
            type="button"
          >
            {saving ? 'Saving…' : 'Save attendance'}
          </button>
        </div>
      )}

      {pendingDate && (
        <ConfirmDialog
          id="discard-attendance"
          eyebrow="UNSAVED ATTENDANCE"
          title="Discard unsaved attendance?"
          confirmLabel="Discard changes"
          danger
          busy={false}
          onCancel={() => setPendingDate(undefined)}
          onConfirm={() => {
            setDrafts({});
            setDate(pendingDate);
            setTab('daily');
            setPendingDate(undefined);
          }}
        >
          {plural(dirtyCount, 'unsaved change')} for {formatReportDate(date)}{' '}
          will be lost. Cancel and save them first to keep them.
        </ConfirmDialog>
      )}
      {preview && (
        <ExportPreviewDialog
          title="Preview attendance PDF"
          exportLabel="Print / Save PDF"
          onClose={() => setPreview(undefined)}
          onExport={() => {
            onPrint(preview);
            setPreview(undefined);
          }}
        >
          {preview.content}
        </ExportPreviewDialog>
      )}
    </div>
  );
}
