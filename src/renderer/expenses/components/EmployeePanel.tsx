import { useMemo, useState } from 'react';
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  Employee,
  EmployeeRole,
  IQAMA_STATUS_LABELS,
  IQAMA_WARNING_DAYS,
  IqamaStatus,
  daysUntil,
  distinctValues,
  fileTimestamp,
  formatReportDate,
  iqamaStatus,
  isIqamaExpiring,
  matchesAny,
  selfLabels,
} from '../model';
import EmployeePrintableReport, {
  PrintableEmployeeReportData,
} from './EmployeePrintableReport';
import ExportPreviewDialog from './ExportPreviewDialog';
import FilterBar, {
  multiChips,
  searchChip,
  summarizeChips,
  useSessionState,
} from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';

type Filters = {
  search: string;
  roles: EmployeeRole[];
  designations: string[];
  projects: string[];
  camps: string[];
  statuses: IqamaStatus[];
};

const NO_FILTERS: Filters = {
  search: '',
  roles: [],
  designations: [],
  projects: [],
  camps: [],
  statuses: [],
};

const STATUSES = Object.keys(IQAMA_STATUS_LABELS) as IqamaStatus[];

/** Options for a text field, with "Not recorded" for employees without one. */
function textOptions(values: string[]) {
  const options = distinctValues(values);
  const labels = selfLabels(options);
  if (values.includes('')) {
    options.push('');
    labels[''] = 'Not recorded';
  }
  return { options, labels };
}

function expiryNote(date: string) {
  const days = daysUntil(date);
  if (days < 0) return `Expired ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export default function EmployeePanel({
  employees,
  onSelect,
  onExportPdf,
}: {
  employees: Employee[];
  onSelect: (employee: Employee) => void;
  onExportPdf: (data: PrintableEmployeeReportData) => void;
}) {
  const [filters, setFilters] = useSessionState('employees', NO_FILTERS);
  const [previewData, setPreviewData] = useState<PrintableEmployeeReportData>();
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const options = useMemo(
    () => ({
      designations: textOptions(employees.map((e) => e.designation)),
      projects: textOptions(employees.map((e) => e.projectName)),
      camps: textOptions(employees.map((e) => e.campName)),
    }),
    [employees],
  );
  const needle = filters.search.trim().toLowerCase();
  const filtered = employees.filter(
    (employee) =>
      matchesAny(filters.roles, employee.role) &&
      matchesAny(filters.designations, employee.designation) &&
      matchesAny(filters.projects, employee.projectName) &&
      matchesAny(filters.camps, employee.campName) &&
      matchesAny(filters.statuses, iqamaStatus(employee)) &&
      (!needle ||
        [
          employee.name,
          employee.nickname,
          employee.iqamaNo,
          employee.phoneNo,
          employee.insuranceNo,
          employee.designation,
        ].some((value) => value.toLowerCase().includes(needle))),
  );
  const expiringCount = employees.filter((employee) =>
    isIqamaExpiring(employee),
  ).length;
  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...multiChips('Role', filters.roles, EMPLOYEE_ROLE_LABELS, (v) =>
      set({ roles: v }),
    ),
    ...multiChips(
      'Designation',
      filters.designations,
      options.designations.labels,
      (v) => set({ designations: v }),
    ),
    ...multiChips('Project', filters.projects, options.projects.labels, (v) =>
      set({ projects: v }),
    ),
    ...multiChips('Camp', filters.camps, options.camps.labels, (v) =>
      set({ camps: v }),
    ),
    ...multiChips('Iqama', filters.statuses, IQAMA_STATUS_LABELS, (v) =>
      set({ statuses: v }),
    ),
  ];

  /** The PDF contains exactly the employees listed under these filters. */
  function createReportData(): PrintableEmployeeReportData {
    const generatedAt = new Date();
    return {
      employees: filtered,
      filterSummary: summarizeChips(chips),
      fileName: `employees_${fileTimestamp(generatedAt)}`,
      generatedAt,
    };
  }

  return (
    <section className="panel full-panel employee-panel">
      <div className="panel-heading transaction-heading">
        <div>
          <h2>All employees</h2>
          <p>
            Rows in red have an Iqama that expires within {IQAMA_WARNING_DAYS}{' '}
            days or has expired
            {expiringCount > 0 && ` (${expiringCount} now)`}.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-secondary"
            onClick={() => setPreviewData(createReportData())}
            type="button"
          >
            Preview PDF
          </button>
          <button
            className="button button-secondary"
            onClick={() => onExportPdf(createReportData())}
            type="button"
          >
            ↓ Export employees as PDF
          </button>
        </div>
      </div>
      <FilterBar
        searchId="employee-search"
        searchLabel="Search employees"
        searchPlaceholder="Search name, Iqama, phone, insurance…"
        search={filters.search}
        onSearchChange={(search) => set({ search })}
        chips={chips}
        shown={filtered.length}
        total={employees.length}
        noun="employees"
        onClearAll={() => setFilters(NO_FILTERS)}
      >
        <MultiSelectFilter
          id="employee-filter-role"
          label="Role"
          allLabel="All roles"
          options={EMPLOYEE_ROLES}
          labels={EMPLOYEE_ROLE_LABELS}
          counts={countBy(employees, (employee) => employee.role)}
          selected={filters.roles}
          onChange={(v) => set({ roles: v })}
        />
        <MultiSelectFilter
          id="employee-filter-designation"
          label="Designation"
          allLabel="All designations"
          options={options.designations.options}
          labels={options.designations.labels}
          counts={countBy(employees, (employee) => employee.designation)}
          selected={filters.designations}
          onChange={(v) => set({ designations: v })}
        />
        <MultiSelectFilter
          id="employee-filter-project"
          label="Project"
          allLabel="All projects"
          options={options.projects.options}
          labels={options.projects.labels}
          counts={countBy(employees, (employee) => employee.projectName)}
          selected={filters.projects}
          onChange={(v) => set({ projects: v })}
        />
        <MultiSelectFilter
          id="employee-filter-camp"
          label="Camp"
          allLabel="All camps"
          options={options.camps.options}
          labels={options.camps.labels}
          counts={countBy(employees, (employee) => employee.campName)}
          selected={filters.camps}
          onChange={(v) => set({ camps: v })}
        />
        <MultiSelectFilter
          id="employee-filter-status"
          label="Iqama status"
          allLabel="All statuses"
          options={STATUSES}
          labels={IQAMA_STATUS_LABELS}
          counts={countBy(employees, (employee) => iqamaStatus(employee))}
          selected={filters.statuses}
          onChange={(v) => set({ statuses: v })}
        />
      </FilterBar>
      <div className="table-scroll">
        <table className="expense-table employee-table">
          <thead>
            <tr>
              <th>NAME</th>
              <th>IQAMA NO.</th>
              <th>ROLE</th>
              <th>DESIGNATION</th>
              <th>PROJECT NAME</th>
              <th>IQAMA EXPIRY</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((employee) => {
              const expiring = isIqamaExpiring(employee);
              return (
                <tr
                  className={expiring ? 'iqama-expiring' : undefined}
                  key={employee.id}
                >
                  <td>
                    <button
                      aria-label={`View employee ${employee.name}`}
                      className="transaction-row-button"
                      onClick={() => onSelect(employee)}
                      type="button"
                    >
                      {employee.name}
                    </button>
                  </td>
                  <td>{employee.iqamaNo}</td>
                  <td>{EMPLOYEE_ROLE_LABELS[employee.role]}</td>
                  <td>{employee.designation || '—'}</td>
                  <td>{employee.projectName || '—'}</td>
                  <td className="date-cell">
                    {employee.iqamaExpiry ? (
                      <>
                        {formatReportDate(employee.iqamaExpiry)}
                        {expiring && (
                          <span className="iqama-note">
                            {expiryNote(employee.iqamaExpiry)}
                          </span>
                        )}
                      </>
                    ) : (
                      'Not recorded'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="empty-state">
          {employees.length === 0
            ? 'No employees yet. Add one to choose them as Paid to or payee.'
            : 'No employees match these filters.'}
          {employees.length > 0 && chips.length > 0 && (
            <button
              className="button button-secondary empty-inline-action"
              onClick={() => setFilters(NO_FILTERS)}
              type="button"
            >
              Show all employees
            </button>
          )}
        </p>
      )}
      {previewData && (
        <ExportPreviewDialog
          title="Preview employee PDF"
          exportLabel="Print / Save PDF"
          onClose={() => setPreviewData(undefined)}
          onExport={() => {
            onExportPdf(previewData);
            setPreviewData(undefined);
          }}
        >
          <EmployeePrintableReport data={previewData} />
        </ExportPreviewDialog>
      )}
    </section>
  );
}
