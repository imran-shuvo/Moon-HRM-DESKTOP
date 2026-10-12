import { FormEvent, useState } from 'react';
import { formatMonthName } from '../../../shared/months';
import {
  calculatePayslip,
  netPay,
  outstandingAdvance,
  payBasis,
  roundMoney,
  roundRate,
} from '../../../shared/payroll';
import { PayslipInput } from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  EMPLOYEE_ROLE_LABELS,
  Employee,
  PayrollSettings,
  Payslip,
  SalaryAdvance,
  formatAmount,
  formatCurrency,
  formatReportDate,
  todayKey,
} from '../model';
import { formatHours } from './AttendancePrintableReport';
import ConfirmDialog from './ConfirmDialog';
import { PayslipsReport } from './PayrollPrintableReport';
import { PrintJob } from './printJob';

type NumberKey = Exclude<keyof PayslipInput, 'employeeId' | 'month' | 'note'>;
type Form = Record<NumberKey, string> & { note: string };

const DAY_FIELDS: { key: NumberKey; label: string }[] = [
  { key: 'workingDays', label: 'Working days' },
  { key: 'presentDays', label: 'Present days' },
  { key: 'absentDays', label: 'Absent days' },
  { key: 'leaveDays', label: 'Leave days' },
  { key: 'vacationDays', label: 'Vacation days' },
  { key: 'holidayDays', label: 'Holiday days' },
  { key: 'hoursWorked', label: 'Hours worked' },
];
const EARNING_FIELDS: { key: NumberKey; label: string }[] = [
  { key: 'basicSalary', label: 'Basic salary / month' },
  { key: 'hourlyRate', label: 'Rate per hour' },
  { key: 'basicPay', label: 'Basic pay' },
  { key: 'overtimeHours', label: 'Overtime hours (working days)' },
  { key: 'overtimeRate', label: 'Overtime rate / hour (working days)' },
  { key: 'weekendOvertimeHours', label: 'Overtime hours (Fridays)' },
  { key: 'weekendOvertimeRate', label: 'Overtime rate / hour (Fridays)' },
  { key: 'allowance', label: 'Allowance / leave pay' },
];
const DEDUCTION_FIELDS: { key: NumberKey; label: string }[] = [
  { key: 'absenceDeduction', label: 'Unpaid vacation' },
  { key: 'absenceFine', label: 'Unpaid leave deduction' },
  { key: 'advanceDeduction', label: 'Advance deduction' },
  { key: 'otherDeduction', label: 'Other deduction' },
];
const INTEGER_KEYS: NumberKey[] = [
  'workingDays',
  'presentDays',
  'absentDays',
  'leaveDays',
  'vacationDays',
  'holidayDays',
];
const RATE_KEYS: NumberKey[] = ['overtimeRate', 'weekendOvertimeRate'];

function stepFor(key: NumberKey) {
  if (INTEGER_KEYS.includes(key)) return 1;
  return RATE_KEYS.includes(key) ? 0.0001 : 0.01;
}

/** A per-hour rate, e.g. 10.8333. */
const formatRate = (value: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);

const NUMBER_KEYS = [...DAY_FIELDS, ...EARNING_FIELDS, ...DEDUCTION_FIELDS].map(
  (field) => field.key,
);

function toForm(input: PayslipInput): Form {
  const form = { note: input.note } as Form;
  NUMBER_KEYS.forEach((key) => {
    form[key] = String(input[key]);
  });
  return form;
}

/** The form as numbers, or an error message for the first invalid field. */
function parseForm(
  form: Form,
  base: Pick<PayslipInput, 'employeeId' | 'month'>,
): PayslipInput | string {
  const input = { ...base, note: form.note.trim() } as PayslipInput;
  const labels = new Map(
    [...DAY_FIELDS, ...EARNING_FIELDS, ...DEDUCTION_FIELDS].map((field) => [
      field.key,
      field.label,
    ]),
  );
  // eslint-disable-next-line no-restricted-syntax
  for (const key of NUMBER_KEYS) {
    const raw = form[key].trim();
    const value = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return `${labels.get(key)} must be zero or more.`;
    }
    if (
      INTEGER_KEYS.includes(key) &&
      (!Number.isInteger(value) || value > 31)
    ) {
      return `${labels.get(key)} must be a whole number of days (0–31).`;
    }
    input[key] = RATE_KEYS.includes(key) ? roundRate(value) : roundMoney(value);
  }
  return input;
}

export default function PayslipDialog({
  payslip,
  employee,
  settings,
  advances,
  payslips,
  onClose,
  onSaved,
  onRemoved,
  onPrint,
}: {
  payslip: Payslip;
  /** Undefined only if the employee record is no longer loaded. */
  employee: Employee | undefined;
  settings: PayrollSettings;
  advances: SalaryAdvance[];
  payslips: Payslip[];
  onClose: () => void;
  onSaved: (payslips: Payslip[]) => void;
  onRemoved: (id: string) => void;
  /** Opens the print preview for a payslip. */
  onPrint: (job: PrintJob) => void;
}) {
  const api = useFinanceApi();
  const [editing, setEditing] = useState(false);
  const [initial, setInitial] = useState(() => toForm(payslip));
  const [form, setForm] = useState(initial);
  const [paidDate, setPaidDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<'discard' | 'delete'>();
  const paid = payslip.status === 'paid';
  const dirty =
    NUMBER_KEYS.some((key) => form[key] !== initial[key]) ||
    form.note !== initial.note;
  const parsed = parseForm(form, payslip);
  const basis = payBasis(payslip.role);
  const advanceDue = outstandingAdvance(
    payslip.employeeId,
    payslip.month,
    advances,
    payslips,
  );

  const close = () => (dirty ? setConfirm('discard') : onClose());

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (workError) {
      setError(errorMessage(workError, fallback));
    } finally {
      setBusy(false);
    }
  }

  const recalculate = () =>
    run(async () => {
      if (!employee) throw new Error('The employee no longer exists.');
      const attendance = await api.attendance.list(payslip.month);
      const next = calculatePayslip(
        employee,
        payslip.month,
        attendance,
        settings,
        advanceDue,
      );
      // Recalculating replaces the amounts; the note is kept.
      setForm({ ...toForm(next), note: form.note });
      setNotice('Recalculated. Check the amounts, then save.');
    }, 'Could not recalculate the payslip.');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    if (netPay(parsed) < 0) {
      setError('Net pay cannot be negative. Lower a deduction first.');
      return;
    }
    await run(async () => {
      const [saved] = await api.payslips.save([parsed]);
      onSaved([saved]);
      const next = toForm(saved);
      setInitial(next);
      setForm(next);
      setEditing(false);
      setNotice('Payslip saved.');
    }, 'Could not save the payslip. Your changes are kept.');
  }

  const setPaid = (date: string | null) =>
    run(async () => {
      const saved = await api.payslips.setPaid([payslip.id], date);
      onSaved(saved);
      setNotice(
        date ? 'Marked as paid.' : 'Marked as unpaid. It can be edited again.',
      );
    }, 'Could not change the payment status.');

  const cancelEdit = () => {
    setForm(initial);
    setEditing(false);
    setError('');
    setNotice('');
  };

  const field = ({ key, label }: { key: NumberKey; label: string }) => (
    <label className="form-field" htmlFor={`payslip-${key}`} key={key}>
      {label}
      <input
        id={`payslip-${key}`}
        min={0}
        onChange={(event) => {
          const { value } = event.currentTarget;
          setForm((current) => ({ ...current, [key]: value }));
        }}
        step={stepFor(key)}
        type="number"
        value={form[key]}
      />
    </label>
  );

  // What the payslip shows: the saved payslip, or the edits in progress.
  const shown: PayslipInput = typeof parsed === 'string' ? payslip : parsed;
  const regularOvertime = roundMoney(shown.overtimeHours * shown.overtimeRate);
  const fridayOvertime = roundMoney(
    shown.weekendOvertimeHours * shown.weekendOvertimeRate,
  );
  const earnings: [string, number][] = [
    [
      basis === 'hourly'
        ? `${formatHours(shown.hoursWorked)} hours × ${formatAmount(shown.hourlyRate)}`
        : 'Basic salary',
      shown.basicPay,
    ],
    [
      `Overtime ${formatHours(shown.overtimeHours)} h × ${formatRate(shown.overtimeRate)}`,
      regularOvertime,
    ],
    [
      `Friday overtime ${formatHours(shown.weekendOvertimeHours)} h × ${formatRate(shown.weekendOvertimeRate)}`,
      fridayOvertime,
    ],
    ['Allowance / leave pay', shown.allowance],
  ];
  const deductions: [string, number][] = [
    ['Unpaid vacation', shown.absenceDeduction],
    ['Unpaid leave', shown.absenceFine],
    ['Advance', shown.advanceDeduction],
    ['Other', shown.otherDeduction],
  ];
  const visible = (rows: [string, number][], keepFirst: boolean) =>
    rows.filter(
      ([, value], index) => value !== 0 || (keepFirst && index === 0),
    );
  const net = netPay(shown);

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="payslip-dialog-title"
        aria-modal="true"
        className="expense-dialog payslip-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              PAYSLIP · {formatMonthName(payslip.month).toUpperCase()}
            </p>
            <h2 id="payslip-dialog-title">{payslip.employeeName}</h2>
            <p>
              {EMPLOYEE_ROLE_LABELS[payslip.role]}
              {payslip.projectName && ` · ${payslip.projectName}`}
              {payslip.campName && ` · ${payslip.campName}`}
            </p>
          </div>
          <div className="payslip-heading-side">
            <span className={`pill ${paid ? 'pill-green' : 'pill-red'}`}>
              {paid ? `Paid ${formatReportDate(payslip.paidDate)}` : 'Unpaid'}
            </span>
            <button
              aria-label="Close dialog"
              className="dialog-close"
              onClick={close}
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={save}>
          {basis !== 'monthly' && !editing && (
            <p className="payslip-attendance">
              <span className="status-present">
                {shown.presentDays} present
              </span>
              <span className="status-absent">{shown.absentDays} absent</span>
              <span className="status-leave">{shown.leaveDays} leave</span>
              <span className="status-vacation">
                {shown.vacationDays} vacation
              </span>
              <span>
                {formatHours(shown.hoursWorked)} h of {shown.workingDays}{' '}
                working days
              </span>
            </p>
          )}

          {!editing && (
            <div className="payslip-view">
              <section>
                <h3>Earnings</h3>
                {visible(earnings, true).map(([label, value]) => (
                  <p key={label}>
                    <span>{label}</span>
                    <b>{formatAmount(value)}</b>
                  </p>
                ))}
              </section>
              <section>
                <h3>Deductions</h3>
                {visible(deductions, false).map(([label, value]) => (
                  <p key={label}>
                    <span>{label}</span>
                    <b>− {formatAmount(value)}</b>
                  </p>
                ))}
                {visible(deductions, false).length === 0 && (
                  <p className="muted-cell">No deductions</p>
                )}
              </section>
            </div>
          )}

          {editing && (
            <fieldset className="payslip-fields" disabled={busy}>
              {basis !== 'monthly' && (
                <>
                  <h3>Attendance</h3>
                  <div className="form-grid form-grid-3">
                    {DAY_FIELDS.map(field)}
                  </div>
                </>
              )}
              <h3>Earnings (SAR)</h3>
              <div className="form-grid form-grid-3">
                {EARNING_FIELDS.filter(
                  ({ key }) =>
                    !(basis === 'hourly' && key === 'basicSalary') &&
                    !(basis !== 'hourly' && key === 'hourlyRate'),
                ).map(field)}
              </div>
              <h3>Deductions (SAR)</h3>
              <div className="form-grid form-grid-3">
                {DEDUCTION_FIELDS.map(field)}
              </div>
              <p className="attachment-help">
                Advances not yet deducted: {formatCurrency(advanceDue)}. Any
                part not deducted here is carried to next month.
              </p>
              <label className="form-field field-wide" htmlFor="payslip-note">
                Note
                <input
                  id="payslip-note"
                  maxLength={300}
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setForm((current) => ({ ...current, note: value }));
                  }}
                  value={form.note}
                />
              </label>
            </fieldset>
          )}

          <div className={`payslip-net${net < 0 ? ' negative' : ''}`}>
            <span>Net pay</span>
            <strong>{formatCurrency(net)}</strong>
          </div>
          {!editing && payslip.note && (
            <p className="attachment-help">Note: {payslip.note}</p>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-success" role="status">
              {notice}
            </p>
          )}

          <div className="dialog-actions payslip-actions">
            {editing && (
              <>
                <button
                  className="button button-secondary push-left"
                  disabled={busy || !employee}
                  onClick={recalculate}
                  type="button"
                >
                  ↻ Recalculate from attendance
                </button>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={cancelEdit}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  disabled={busy || !dirty}
                  type="submit"
                >
                  Save payslip
                </button>
              </>
            )}
            {!editing && paid && (
              <>
                <button
                  className="button button-secondary push-left"
                  disabled={busy}
                  onClick={() => setPaid(null)}
                  type="button"
                >
                  Mark unpaid
                </button>
                <button
                  className="button button-secondary"
                  onClick={() =>
                    onPrint({
                      fileName: `payslip_${payslip.employeeName.replace(/\s+/g, '-')}_${payslip.month}`,
                      content: <PayslipsReport payslips={[payslip]} />,
                    })
                  }
                  type="button"
                >
                  🖨 Print
                </button>
              </>
            )}
            {!editing && !paid && (
              <>
                <button
                  className="text-button danger-text push-left"
                  disabled={busy}
                  onClick={() => setConfirm('delete')}
                  type="button"
                >
                  Delete payslip
                </button>
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => {
                    setNotice('');
                    setEditing(true);
                  }}
                  type="button"
                >
                  ✎ Edit amounts
                </button>
                <button
                  className="button button-secondary"
                  onClick={() =>
                    onPrint({
                      fileName: `payslip_${payslip.employeeName.replace(/\s+/g, '-')}_${payslip.month}`,
                      content: <PayslipsReport payslips={[payslip]} />,
                    })
                  }
                  type="button"
                >
                  🖨 Print
                </button>
                <span className="pay-group">
                  <input
                    aria-label="Paid on"
                    id="payslip-paid-date"
                    onChange={(event) => setPaidDate(event.currentTarget.value)}
                    type="date"
                    value={paidDate}
                  />
                  <button
                    className="button button-primary"
                    disabled={busy || !paidDate}
                    onClick={() => setPaid(paidDate)}
                    type="button"
                  >
                    ✓ Mark as paid
                  </button>
                </span>
              </>
            )}
          </div>
        </form>
      </section>
      {confirm === 'discard' && (
        <ConfirmDialog
          id="discard-payslip"
          eyebrow="UNSAVED PAYSLIP"
          title="Discard your changes?"
          confirmLabel="Discard changes"
          danger
          busy={false}
          onCancel={() => setConfirm(undefined)}
          onConfirm={onClose}
        >
          The changes to {payslip.employeeName}&apos;s payslip have not been
          saved.
        </ConfirmDialog>
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          id="delete-payslip"
          eyebrow="DELETE PAYSLIP"
          title={`Delete ${payslip.employeeName}'s payslip?`}
          confirmLabel="Delete payslip"
          danger
          busy={busy}
          onCancel={() => setConfirm(undefined)}
          onConfirm={() =>
            run(async () => {
              await api.payslips.remove(payslip.id);
              onRemoved(payslip.id);
            }, 'Could not delete the payslip.').finally(() =>
              setConfirm(undefined),
            )
          }
        >
          The payslip for {formatMonthName(payslip.month)} will be removed.
          Attendance and advances are not changed; you can create the payslip
          again.
        </ConfirmDialog>
      )}
    </div>
  );
}
