import { useEffect, useMemo, useState } from 'react';
import { formatMonthName } from '../../../shared/months';
import {
  calculatePayslip,
  netPay,
  outstandingAdvance,
  payBasis,
  roundMoney,
  summarizeAttendance,
} from '../../../shared/payroll';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  AttendanceEntry,
  Employee,
  PayrollSettings,
  Payslip,
  SalaryAdvance,
  formatCurrency,
  plural,
} from '../model';
import {
  Target,
  TargetSelect,
  describeTarget,
  isTargetChosen,
  matchesTarget,
} from './peopleUi';

/**
 * Creates the month's missing payslips for everyone, or for one project,
 * camp or role. Existing payslips are never changed.
 */
export default function CreatePayslipsDialog({
  month,
  employees,
  payslips,
  advances,
  settings,
  onClose,
  onCreated,
}: {
  month: string;
  employees: Employee[];
  payslips: Payslip[];
  advances: SalaryAdvance[];
  settings: PayrollSettings;
  onClose: () => void;
  onCreated: (payslips: Payslip[], description: string) => void;
}) {
  const api = useFinanceApi();
  const [target, setTarget] = useState<Target>({ kind: 'all', value: '' });
  const [attendance, setAttendance] = useState<AttendanceEntry[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.attendance
      .list(month)
      .then((entries) => active && setAttendance(entries))
      .catch(
        (loadError) =>
          active &&
          setError(errorMessage(loadError, 'Attendance could not be loaded.')),
      );
    return () => {
      active = false;
    };
  }, [api, month]);

  const chosen = isTargetChosen(target);
  const plan = useMemo(() => {
    if (!attendance || !chosen) return undefined;
    const people = employees.filter((employee) =>
      matchesTarget(employee, target),
    );
    const existing = people.filter((employee) =>
      payslips.some(
        (payslip) =>
          payslip.employeeId === employee.id && payslip.month === month,
      ),
    );
    const fresh = people.filter((employee) => !existing.includes(employee));
    const warnings: string[] = [];
    const inputs = fresh.map((employee) => {
      const basis = payBasis(employee.role);
      if (basis === 'hourly' && !employee.hourlyRate) {
        warnings.push(`${employee.name}: no rate per hour`);
      } else if (basis !== 'hourly' && !employee.salary) {
        warnings.push(`${employee.name}: no basic salary`);
      }
      if (basis !== 'monthly') {
        const { notRecordedDays } = summarizeAttendance(
          employee,
          attendance,
          month,
        );
        if (notRecordedDays > 0) {
          warnings.push(
            `${employee.name}: ${plural(notRecordedDays, 'day')} without attendance`,
          );
        }
      }
      return calculatePayslip(
        employee,
        month,
        attendance,
        settings,
        outstandingAdvance(employee.id, month, advances, payslips),
      );
    });
    return { inputs, existing: existing.length, warnings };
  }, [
    attendance,
    chosen,
    employees,
    target,
    payslips,
    month,
    advances,
    settings,
  ]);

  async function create() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.payslips.create(plan.inputs);
      onCreated(saved, describeTarget(target, employees));
    } catch (createError) {
      setError(
        errorMessage(
          createError,
          'The payslips could not be created. Nothing was saved.',
        ),
      );
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="create-payslips-title"
        aria-modal="true"
        className="expense-dialog simple-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">CREATE PAYSLIPS</p>
            <h2 id="create-payslips-title">{formatMonthName(month)}</h2>
            <p>
              Worked out from attendance, advances and payroll settings. You can
              edit each payslip afterwards.
            </p>
          </div>
          <button
            aria-label="Close dialog"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <TargetSelect
          id="create-payslips"
          employees={employees}
          kinds={['all', 'project', 'camp', 'role']}
          value={target}
          onChange={setTarget}
        />

        {!attendance && !error && (
          <p className="simple-summary" role="status">
            Loading attendance…
          </p>
        )}
        {plan && (
          <div className="simple-summary" role="status">
            {plan.inputs.length > 0 ? (
              <p className="summary-main">
                <b>{plural(plan.inputs.length, 'new payslip')}</b>, net pay{' '}
                <b>
                  {formatCurrency(
                    roundMoney(
                      plan.inputs.reduce(
                        (sum, input) => sum + netPay(input),
                        0,
                      ),
                    ),
                  )}
                </b>
              </p>
            ) : (
              <p className="summary-main">Nothing to create.</p>
            )}
            {plan.existing > 0 && (
              <p>
                {plan.existing === 1
                  ? '1 employee already has a payslip; it will not be changed.'
                  : `${plan.existing} employees already have a payslip; they will not be changed.`}
              </p>
            )}
            {plan.warnings.length > 0 && (
              <details className="summary-warnings">
                <summary>
                  ⚠ {plural(plan.warnings.length, 'thing')} to check before
                  paying
                </summary>
                <ul>
                  {plan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            disabled={busy || !plan || plan.inputs.length === 0}
            onClick={create}
            type="button"
          >
            {busy
              ? 'Creating…'
              : `Create ${plural(plan?.inputs.length ?? 0, 'payslip')}`}
          </button>
        </div>
      </section>
    </div>
  );
}
