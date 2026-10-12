import { useState } from 'react';
import { formatMonthName } from '../../../shared/months';
import {
  isEmployedInMonth,
  payBasis,
  roundMoney,
} from '../../../shared/payroll';
import { PayslipStatus } from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  EMPLOYEE_ROLE_LABELS,
  Employee,
  Payslip,
  distinctValues,
  fileTimestamp,
  formatAmount,
  formatCurrency,
  formatReportDate,
  matchesAny,
  plural,
  todayKey,
} from '../model';
import FilterBar, { multiChips, searchChip, summarizeChips } from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';
import { PayrollSheetReport, PayslipsReport } from './PayrollPrintableReport';
import { Avatar } from './peopleUi';
import { PrintJob } from './printJob';

export type PayslipFilters = {
  search: string;
  projects: string[];
  camps: string[];
  statuses: PayslipStatus[];
};

export const NO_PAYSLIP_FILTERS: PayslipFilters = {
  search: '',
  projects: [],
  camps: [],
  statuses: [],
};

const STATUSES: PayslipStatus[] = ['unpaid', 'paid'];
const STATUS_LABELS: Record<PayslipStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
};

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

/** Filter options, with a "No …" option when some payslips have none. */
function withNone(values: string[], noun: string) {
  const options = distinctValues(values);
  const labels: Record<string, string> = Object.fromEntries(
    options.map((value) => [value, value]),
  );
  if (values.includes('')) {
    options.push('');
    labels[''] = `No ${noun}`;
  }
  return { options, labels };
}

export default function PayrollPayslips({
  month,
  employees,
  payslips,
  filters,
  onFiltersChange,
  onOpen,
  onSaved,
  onPreview,
  onCreate,
}: {
  month: string;
  employees: Employee[];
  payslips: Payslip[];
  filters: PayslipFilters;
  onFiltersChange: (filters: PayslipFilters) => void;
  onOpen: (payslip: Payslip) => void;
  onSaved: (payslips: Payslip[]) => void;
  onPreview: (job: PrintJob) => void;
  onCreate: () => void;
}) {
  const api = useFinanceApi();
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [paidDate, setPaidDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();

  const monthPayslips = payslips.filter((payslip) => payslip.month === month);
  const missing = employees.filter(
    (employee) =>
      isEmployedInMonth(employee, month) &&
      !monthPayslips.some((payslip) => payslip.employeeId === employee.id),
  ).length;
  const projects = withNone(
    monthPayslips.map((payslip) => payslip.projectName),
    'project',
  );
  const camps = withNone(
    monthPayslips.map((payslip) => payslip.campName),
    'camp',
  );
  const needle = filters.search.trim().toLowerCase();
  const shown = monthPayslips
    .filter(
      (payslip) =>
        matchesAny(filters.projects, payslip.projectName) &&
        matchesAny(filters.camps, payslip.campName) &&
        matchesAny(filters.statuses, payslip.status) &&
        (!needle ||
          [payslip.employeeName, payslip.iqamaNo].some((value) =>
            value.toLowerCase().includes(needle),
          )),
    )
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const unpaid = shown.filter((payslip) => payslip.status === 'unpaid');
  const set = (change: Partial<PayslipFilters>) =>
    onFiltersChange({ ...filters, ...change });
  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...multiChips('Project', filters.projects, projects.labels, (v) =>
      set({ projects: v }),
    ),
    ...multiChips('Camp', filters.camps, camps.labels, (v) =>
      set({ camps: v }),
    ),
    ...multiChips('Status', filters.statuses, STATUS_LABELS, (v) =>
      set({ statuses: v }),
    ),
  ];

  const payslipsJob = (): PrintJob => ({
    fileName: `payslips_${month}_${fileTimestamp(new Date())}`,
    content: <PayslipsReport payslips={shown} />,
  });
  const sheetJob = (): PrintJob => ({
    fileName: `payroll_${month}_${fileTimestamp(new Date())}`,
    landscape: true,
    content: (
      <PayrollSheetReport
        month={month}
        groups={[{ label: '', payslips: shown }]}
        filterSummary={summarizeChips(chips)}
      />
    ),
  });

  async function markPaid() {
    setBusy(true);
    setMessage(undefined);
    try {
      const saved = await api.payslips.setPaid(
        unpaid.map((payslip) => payslip.id),
        paidDate,
      );
      onSaved(saved);
      setMarkPaidOpen(false);
      setMessage({
        kind: 'ok',
        text: `${plural(saved.length, 'payslip')} marked as paid on ${formatReportDate(paidDate)}.`,
      });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(
          error,
          'The payslips could not be marked as paid. Nothing was changed.',
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="payslip-list">
      {missing > 0 && (
        <div className="notice notice-action">
          <span>
            <b>{plural(missing, 'employee')}</b>{' '}
            {missing === 1 ? 'has' : 'have'} no payslip for{' '}
            {formatMonthName(month)} yet.
          </span>
          <button
            className="button button-primary"
            onClick={onCreate}
            type="button"
          >
            Create payslips
          </button>
        </div>
      )}

      {monthPayslips.length > 0 && (
        <>
          <FilterBar
            searchId="payslip-search"
            searchLabel="Search payslips"
            searchPlaceholder="Search name or Iqama"
            search={filters.search}
            onSearchChange={(search) => set({ search })}
            chips={chips}
            shown={shown.length}
            total={monthPayslips.length}
            noun="payslips"
            onClearAll={() => onFiltersChange(NO_PAYSLIP_FILTERS)}
          >
            <MultiSelectFilter
              id="payslip-filter-project"
              label="Project"
              allLabel="All projects"
              options={projects.options}
              labels={projects.labels}
              counts={countBy(monthPayslips, (payslip) => payslip.projectName)}
              selected={filters.projects}
              onChange={(values) => set({ projects: values })}
            />
            <MultiSelectFilter
              id="payslip-filter-camp"
              label="Camp"
              allLabel="All camps"
              options={camps.options}
              labels={camps.labels}
              counts={countBy(monthPayslips, (payslip) => payslip.campName)}
              selected={filters.camps}
              onChange={(values) => set({ camps: values })}
            />
            <MultiSelectFilter
              id="payslip-filter-status"
              label="Status"
              allLabel="Paid and unpaid"
              options={STATUSES}
              labels={STATUS_LABELS}
              counts={countBy(monthPayslips, (payslip) => payslip.status)}
              selected={filters.statuses}
              onChange={(statuses) => set({ statuses })}
            />
          </FilterBar>

          <div className="list-actions">
            <button
              className="button button-primary"
              disabled={busy || unpaid.length === 0}
              onClick={() => setMarkPaidOpen(true)}
              type="button"
            >
              ✓ Mark as paid ({unpaid.length})
            </button>
            <button
              className="button button-secondary"
              disabled={shown.length === 0}
              onClick={() => onPreview(payslipsJob())}
              type="button"
            >
              🖨 Print payslips
            </button>
            <button
              className="button button-secondary"
              disabled={shown.length === 0}
              onClick={() => onPreview(sheetJob())}
              type="button"
            >
              🖨 Print payroll sheet
            </button>
          </div>
        </>
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

      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="expense-table payroll-table simple-table">
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th>PROJECT / CAMP</th>
                <th>ATTENDANCE</th>
                <th className="amount-cell">NET PAY</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((payslip) => (
                <tr key={payslip.id}>
                  <td>
                    <button
                      aria-label={`Open payslip for ${payslip.employeeName}`}
                      className="person-cell person-button"
                      onClick={() => onOpen(payslip)}
                      type="button"
                    >
                      <Avatar name={payslip.employeeName} />
                      <span>
                        <strong>{payslip.employeeName}</strong>
                        <small>{EMPLOYEE_ROLE_LABELS[payslip.role]}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    {[payslip.projectName, payslip.campName]
                      .filter(Boolean)
                      .join(' / ') || '—'}
                  </td>
                  <td className="muted-cell">
                    {payBasis(payslip.role) === 'monthly'
                      ? 'Monthly salary'
                      : `${payslip.presentDays} present · ${payslip.absentDays} absent`}
                  </td>
                  <td className="amount-cell">
                    <b>{formatAmount(payslip.netPay)}</b>
                  </td>
                  <td>
                    <span
                      className={`pill ${payslip.status === 'paid' ? 'pill-green' : 'pill-red'}`}
                    >
                      {payslip.status === 'paid'
                        ? `Paid ${formatReportDate(payslip.paidDate)}`
                        : 'Unpaid'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Total · {plural(shown.length, 'payslip')}</th>
                <th className="amount-cell">
                  {formatCurrency(sum(shown.map((p) => p.netPay)))}
                </th>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {monthPayslips.length === 0 && (
        <div className="empty-state empty-action">
          <p>No payslips for {formatMonthName(month)} yet.</p>
          {missing === 0 && <p>Add employees first under Employees.</p>}
        </div>
      )}
      {monthPayslips.length > 0 && shown.length === 0 && (
        <p className="empty-state">No payslips match these filters.</p>
      )}

      {markPaidOpen && (
        <div className="dialog-backdrop">
          <section
            aria-labelledby="mark-paid-title"
            aria-modal="true"
            className="expense-dialog confirmation-dialog"
            role="alertdialog"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">MARK AS PAID</p>
                <h2 id="mark-paid-title">
                  Mark {plural(unpaid.length, 'payslip')} as paid?
                </h2>
                <p>
                  {formatCurrency(sum(unpaid.map((p) => p.netPay)))} in total.
                  Paid payslips are locked until marked unpaid.
                </p>
              </div>
            </div>
            <label className="form-field" htmlFor="mark-paid-date">
              Paid on
              <input
                id="mark-paid-date"
                onChange={(event) => setPaidDate(event.currentTarget.value)}
                type="date"
                value={paidDate}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => setMarkPaidOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                disabled={busy || !paidDate}
                onClick={markPaid}
                type="button"
              >
                Mark as paid
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
