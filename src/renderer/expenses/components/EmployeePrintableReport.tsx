import {
  EMPLOYEE_ROLE_LABELS,
  Employee,
  IQAMA_STATUS_LABELS,
  formatReportDate,
  iqamaStatus,
  isIqamaExpiring,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintableEmployeeReportData = {
  employees: Employee[];
  /** e.g. "Designation: Cleaner · Iqama status: Expired" */
  filterSummary: string;
  fileName: string;
  generatedAt: Date;
};

export default function EmployeePrintableReport({
  data,
}: {
  data: PrintableEmployeeReportData;
}) {
  const expiring = data.employees.filter((employee) =>
    isIqamaExpiring(employee),
  ).length;

  return (
    <article className="standalone-print-report moon-report">
      <ReportBrandHeader title="EMPLOYEE REPORT" />
      {data.filterSummary && (
        <p className="moon-report-filters">{data.filterSummary}</p>
      )}
      <section className="moon-report-section">
        <h2>1. Employees</h2>
        <table className="moon-report-table moon-report-employees">
          <thead>
            <tr>
              <th className="sl">SL NO</th>
              <th>NAME</th>
              <th>IQAMA NO.</th>
              <th>ROLE</th>
              <th>DESIGNATION</th>
              <th>PROJECT NAME</th>
              <th>IQAMA EXPIRY</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {data.employees.map((employee, index) => (
              <tr
                className={
                  isIqamaExpiring(employee) ? 'iqama-expiring' : undefined
                }
                key={employee.id}
              >
                <td className="sl">{index + 1}</td>
                <td>{employee.name}</td>
                <td>{employee.iqamaNo}</td>
                <td>{EMPLOYEE_ROLE_LABELS[employee.role]}</td>
                <td>{employee.designation || '—'}</td>
                <td>{employee.projectName || '—'}</td>
                <td>
                  {employee.iqamaExpiry
                    ? formatReportDate(employee.iqamaExpiry)
                    : '—'}
                </td>
                <td>{IQAMA_STATUS_LABELS[iqamaStatus(employee)]}</td>
              </tr>
            ))}
            {data.employees.length === 0 && (
              <tr>
                <td className="empty" colSpan={8}>
                  No employees match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <th colSpan={4}>TOTAL EMPLOYEES: {data.employees.length}</th>
              <th colSpan={3}>EXPIRED / EXPIRING: {expiring}</th>
            </tr>
          </tfoot>
        </table>
      </section>
    </article>
  );
}
