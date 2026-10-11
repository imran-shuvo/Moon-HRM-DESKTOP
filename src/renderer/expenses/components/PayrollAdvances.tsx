import { useMemo, useState } from 'react';
import { roundMoney } from '../../../shared/payroll';
import { SalaryAdvanceInput } from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  Employee,
  Payslip,
  SalaryAdvance,
  distinctValues,
  formatAmount,
  formatCurrency,
  formatReportDate,
  inDateRange,
  matchesAny,
  plural,
  selfLabels,
} from '../model';
import AdvanceDialog from './AdvanceDialog';
import ConfirmDialog from './ConfirmDialog';
import FilterBar, {
  DateRangeFilter,
  dateChip,
  multiChips,
  searchChip,
  useSessionState,
} from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';
import { Avatar } from './peopleUi';

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

type Filters = {
  search: string;
  from: string;
  to: string;
  projects: string[];
  camps: string[];
};

const NO_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  projects: [],
  camps: [],
};

export default function PayrollAdvances({
  employees,
  advances,
  payslips,
  onSaved,
  onRemoved,
}: {
  employees: Employee[];
  advances: SalaryAdvance[];
  payslips: Payslip[];
  onSaved: (advances: SalaryAdvance[]) => void;
  onRemoved: (id: string) => void;
}) {
  const api = useFinanceApi();
  const [view, setView] = useState<'history' | 'owed'>('history');
  const [filters, setFilters] = useSessionState('advances', NO_FILTERS);
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const [dialog, setDialog] = useState<{ advance?: SalaryAdvance }>();
  const [toDelete, setToDelete] = useState<SalaryAdvance>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();

  const byId = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const options = {
    projects: distinctValues(employees.map((employee) => employee.projectName)),
    camps: distinctValues(employees.map((employee) => employee.campName)),
  };
  const needle = filters.search.trim().toLowerCase();
  const shownEmployees = employees.filter(
    (employee) =>
      matchesAny(filters.projects, employee.projectName) &&
      matchesAny(filters.camps, employee.campName) &&
      (!needle ||
        [employee.name, employee.nickname, employee.iqamaNo].some((value) =>
          value.toLowerCase().includes(needle),
        )),
  );
  const shownIds = new Set(shownEmployees.map((employee) => employee.id));
  const history = advances
    .filter(
      (advance) =>
        shownIds.has(advance.employeeId) &&
        inDateRange(advance.date, filters.from, filters.to),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const owed = shownEmployees
    .map((employee) => {
      const given = sum(
        advances
          .filter((advance) => advance.employeeId === employee.id)
          .map((advance) => advance.amount),
      );
      const deducted = sum(
        payslips
          .filter((payslip) => payslip.employeeId === employee.id)
          .map((payslip) => payslip.advanceDeduction),
      );
      return {
        employee,
        given,
        deducted,
        outstanding: Math.max(0, roundMoney(given - deducted)),
      };
    })
    .filter((row) => row.given > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  const totalOwed = sum(owed.map((row) => row.outstanding));
  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...(view === 'history' ? dateChip(filters, (range) => set(range)) : []),
    ...multiChips(
      'Project',
      filters.projects,
      selfLabels(options.projects),
      (v) => set({ projects: v }),
    ),
    ...multiChips('Camp', filters.camps, selfLabels(options.camps), (v) =>
      set({ camps: v }),
    ),
  ];

  const save = async (inputs: SalaryAdvanceInput[]) => {
    const editing = dialog?.advance;
    if (editing) {
      onSaved([await api.salaryAdvances.update(editing.id, inputs[0])]);
    } else {
      onSaved(await api.salaryAdvances.create(inputs));
    }
    setDialog(undefined);
    setMessage({
      kind: 'ok',
      text: editing
        ? 'Advance updated.'
        : `${plural(inputs.length, 'advance')} saved, ${formatCurrency(sum(inputs.map((input) => input.amount)))} in total.`,
    });
  };

  async function remove(advance: SalaryAdvance) {
    setBusy(true);
    try {
      await api.salaryAdvances.remove(advance.id);
      onRemoved(advance.id);
      setMessage({ kind: 'ok', text: 'Advance deleted.' });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'The advance could not be deleted.'),
      });
    } finally {
      setBusy(false);
      setToDelete(undefined);
    }
  }

  return (
    <div className="advances-view">
      <div className="list-actions list-actions-split">
        <div aria-label="Advances view" className="segmented" role="tablist">
          <button
            aria-selected={view === 'history'}
            className={view === 'history' ? 'active' : undefined}
            onClick={() => setView('history')}
            role="tab"
            type="button"
          >
            All advances
          </button>
          <button
            aria-selected={view === 'owed'}
            className={view === 'owed' ? 'active' : undefined}
            onClick={() => setView('owed')}
            role="tab"
            type="button"
          >
            Still owed
          </button>
        </div>
        <span className="list-actions-note">
          Still owed: <b>{formatCurrency(totalOwed)}</b>
        </span>
        <button
          className="button button-primary"
          disabled={employees.length === 0}
          onClick={() => setDialog({})}
          type="button"
        >
          ＋ Give advance
        </button>
      </div>

      <FilterBar
        searchId="advance-search"
        searchLabel="Search advances"
        searchPlaceholder="Search name or Iqama"
        search={filters.search}
        onSearchChange={(search) => set({ search })}
        chips={chips}
        shown={view === 'history' ? history.length : owed.length}
        total={
          view === 'history'
            ? advances.length
            : new Set(advances.map((advance) => advance.employeeId)).size
        }
        noun={view === 'history' ? 'advances' : 'employees with advances'}
        onClearAll={() => setFilters(NO_FILTERS)}
      >
        {view === 'history' && (
          <DateRangeFilter
            id="advance-dates"
            label="Date given"
            fromLabel="Advances given from"
            toLabel="Advances given to"
            value={filters}
            onChange={(range) => set(range)}
          />
        )}
        <MultiSelectFilter
          id="advance-filter-project"
          label="Project"
          allLabel="All projects"
          options={options.projects}
          labels={selfLabels(options.projects)}
          counts={countBy(employees, (employee) => employee.projectName)}
          selected={filters.projects}
          onChange={(v) => set({ projects: v })}
        />
        <MultiSelectFilter
          id="advance-filter-camp"
          label="Camp"
          allLabel="All camps"
          options={options.camps}
          labels={selfLabels(options.camps)}
          counts={countBy(employees, (employee) => employee.campName)}
          selected={filters.camps}
          onChange={(v) => set({ camps: v })}
        />
      </FilterBar>

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

      {view === 'history' && history.length > 0 && (
        <div className="table-scroll">
          <table className="expense-table payroll-table simple-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>EMPLOYEE</th>
                <th className="amount-cell">AMOUNT</th>
                <th>NOTE</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((advance) => {
                const employee = byId.get(advance.employeeId);
                return (
                  <tr key={advance.id}>
                    <td className="date-cell">
                      {formatReportDate(advance.date)}
                    </td>
                    <td>
                      <div className="person-cell">
                        <Avatar name={employee?.name ?? '?'} />
                        <div>
                          <strong>{employee?.name}</strong>
                          <span>
                            {employee?.projectName || employee?.iqamaNo}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="amount-cell">
                      {formatAmount(advance.amount)}
                    </td>
                    <td className="muted-cell">{advance.note || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Edit advance for ${employee?.name}`}
                          className="button button-secondary button-small"
                          onClick={() => setDialog({ advance })}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          aria-label={`Delete advance for ${employee?.name}`}
                          className="button button-secondary button-small danger-text"
                          onClick={() => setToDelete(advance)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Total · {plural(history.length, 'advance')}</th>
                <th className="amount-cell">
                  {formatCurrency(
                    sum(history.map((advance) => advance.amount)),
                  )}
                </th>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {view === 'owed' && owed.length > 0 && (
        <div className="table-scroll">
          <table className="expense-table payroll-table simple-table">
            <thead>
              <tr>
                <th>EMPLOYEE</th>
                <th className="amount-cell">GIVEN</th>
                <th className="amount-cell">DEDUCTED</th>
                <th className="amount-cell">STILL OWED</th>
              </tr>
            </thead>
            <tbody>
              {owed.map((row) => (
                <tr key={row.employee.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={row.employee.name} />
                      <div>
                        <strong>{row.employee.name}</strong>
                        <span>
                          {row.employee.projectName || row.employee.iqamaNo}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="amount-cell">{formatAmount(row.given)}</td>
                  <td className="amount-cell">{formatAmount(row.deducted)}</td>
                  <td className="amount-cell">
                    <span
                      className={`pill ${row.outstanding > 0 ? 'pill-orange' : 'pill-green'}`}
                    >
                      {row.outstanding > 0
                        ? formatAmount(row.outstanding)
                        : 'Settled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th className="amount-cell">
                  {formatCurrency(sum(owed.map((row) => row.given)))}
                </th>
                <th className="amount-cell">
                  {formatCurrency(sum(owed.map((row) => row.deducted)))}
                </th>
                <th className="amount-cell">{formatCurrency(totalOwed)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {((view === 'history' && history.length === 0) ||
        (view === 'owed' && owed.length === 0)) && (
        <div className="empty-state empty-action">
          <p>
            {advances.length === 0
              ? 'No advances yet.'
              : 'No advances match these filters.'}
          </p>
        </div>
      )}

      {dialog && (
        <AdvanceDialog
          advance={dialog.advance}
          employees={employees}
          onClose={() => setDialog(undefined)}
          onSubmit={save}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          id="delete-advance"
          eyebrow="DELETE ADVANCE"
          title="Delete this advance?"
          confirmLabel="Delete advance"
          danger
          busy={busy}
          onCancel={() => setToDelete(undefined)}
          onConfirm={() => remove(toDelete)}
        >
          {formatAmount(toDelete.amount)} given to{' '}
          {byId.get(toDelete.employeeId)?.name ?? 'this employee'} on{' '}
          {formatReportDate(toDelete.date)} will be removed. Payslips that
          already deducted it are not changed.
        </ConfirmDialog>
      )}
    </div>
  );
}
