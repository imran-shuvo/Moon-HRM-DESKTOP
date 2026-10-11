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
  fileTimestamp,
  formatReportDate,
  iqamaStatus,
  isIqamaExpiring,
} from '../model';
import EmployeePrintableReport, {
  PrintableEmployeeReportData,
} from './EmployeePrintableReport';
import ExportPreviewDialog from './ExportPreviewDialog';
import MultiSelectFilter from './MultiSelectFilter';

type FilterKey = 'designation' | 'projectName' | 'campName';

const FILTERS: { key: FilterKey; label: string; all: string }[] = [
  { key: 'designation', label: 'Designation', all: 'All designations' },
  { key: 'projectName', label: 'Project', all: 'All projects' },
  { key: 'campName', label: 'Camp', all: 'All camps' },
];

const STATUSES = Object.keys(IQAMA_STATUS_LABELS) as IqamaStatus[];

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
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [status, setStatus] = useState<IqamaStatus | ''>('');
  const [previewData, setPreviewData] = useState<PrintableEmployeeReportData>();
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    designation: '',
    projectName: '',
    campName: '',
  });
  const options = useMemo(() => {
    const distinct = (key: FilterKey) =>
      [...new Set(employees.map((employee) => employee[key]))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    return {
      designation: distinct('designation'),
      projectName: distinct('projectName'),
      campName: distinct('campName'),
    };
  }, [employees]);
  const filtered = employees.filter(
    (employee) =>
      FILTERS.every(
        ({ key }) => !filters[key] || employee[key] === filters[key],
      ) &&
      (!roles.length || roles.includes(employee.role)) &&
      (!status || iqamaStatus(employee) === status),
  );
  const expiringCount = employees.filter((employee) =>
    isIqamaExpiring(employee),
  ).length;
  const filtering =
    Boolean(status) ||
    roles.length > 0 ||
    FILTERS.some(({ key }) => filters[key]);

  /** The PDF contains exactly the employees listed under these filters. */
  function createReportData(): PrintableEmployeeReportData {
    const generatedAt = new Date();
    return {
      employees: filtered,
      filterSummary: [
        ['Role', roles.map((role) => EMPLOYEE_ROLE_LABELS[role]).join(', ')],
        ...FILTERS.map(({ key, label }) => [label, filters[key]]),
        ['Iqama status', status && IQAMA_STATUS_LABELS[status]],
      ]
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}: ${value}`)
        .join(' · '),
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
        <div className="transaction-filters">
          <MultiSelectFilter
            id="employee-filter-role"
            label="Role"
            allLabel="All roles"
            options={EMPLOYEE_ROLES}
            labels={EMPLOYEE_ROLE_LABELS}
            selected={roles}
            onChange={setRoles}
          />
          {FILTERS.map(({ key, label, all }) => (
            <label
              className="filter-control"
              htmlFor={`employee-filter-${key}`}
              key={key}
            >
              {label}
              <select
                aria-label={`Filter employees by ${label.toLowerCase()}`}
                id={`employee-filter-${key}`}
                value={filters[key]}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setFilters((current) => ({ ...current, [key]: value }));
                }}
              >
                <option value="">{all}</option>
                {options[key].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="filter-control" htmlFor="employee-filter-status">
            Iqama status
            <select
              aria-label="Filter employees by Iqama status"
              id="employee-filter-status"
              value={status}
              onChange={(event) =>
                setStatus(event.currentTarget.value as IqamaStatus | '')
              }
            >
              <option value="">All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {IQAMA_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          {filtering && (
            <button
              className="button button-secondary clear-filter"
              onClick={() => {
                setFilters({ designation: '', projectName: '', campName: '' });
                setStatus('');
                setRoles([]);
              }}
              type="button"
            >
              Clear filters
            </button>
          )}
          <button
            className="button button-secondary"
            onClick={() => onExportPdf(createReportData())}
            type="button"
          >
            ↓ Export employees as PDF
          </button>
          <button
            className="button button-secondary"
            onClick={() => setPreviewData(createReportData())}
            type="button"
          >
            Preview PDF
          </button>
        </div>
      </div>
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
