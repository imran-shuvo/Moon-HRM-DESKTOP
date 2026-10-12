import { FormEvent, useState } from 'react';
import { hourlySalary } from '../../../shared/payroll';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import { PayrollSettings, formatAmount } from '../model';

type NumberKey =
  | 'overtimeMultiplier'
  | 'weekendOvertimeMultiplier'
  | 'salaryDays'
  | 'paidDaysOff';

const FIELDS: { key: NumberKey; label: string; hint: string; step: number }[] =
  [
    {
      key: 'overtimeMultiplier',
      label: 'Overtime on working days (× per-hour salary)',
      hint: 'Hours beyond the basic hours; policy 1.25',
      step: 0.01,
    },
    {
      key: 'weekendOvertimeMultiplier',
      label: 'Overtime on Fridays (× per-hour salary)',
      hint: 'Every hour worked on a Friday; policy 1.50',
      step: 0.01,
    },
    {
      key: 'salaryDays',
      label: 'Days in a salary month',
      hint: "Per-hour salary = basic ÷ this ÷ basic hours; a day's salary = basic ÷ this; policy 30",
      step: 1,
    },
    {
      key: 'paidDaysOff',
      label: 'Paid days off a month',
      hint: 'Absent and leave days count together; days beyond this are unpaid leave; policy 1',
      step: 1,
    },
  ];

const TOGGLES: {
  key: 'leavePaid' | 'vacationPaid';
  label: string;
  hint: string;
}[] = [
  {
    key: 'leavePaid',
    label: 'Leave days are always paid',
    hint: 'When off, leave days count like absent days.',
  },
  {
    key: 'vacationPaid',
    label: 'Vacation days are paid',
    hint: "When off, a day's salary is deducted for each vacation day.",
  },
];

export default function PayrollSettingsPanel({
  settings,
  onSaved,
}: {
  settings: PayrollSettings;
  onSaved: (settings: PayrollSettings) => void;
}) {
  const api = useFinanceApi();
  const [form, setForm] = useState<Record<NumberKey, string>>(() => ({
    overtimeMultiplier: String(settings.overtimeMultiplier),
    weekendOvertimeMultiplier: String(settings.weekendOvertimeMultiplier),
    salaryDays: String(settings.salaryDays),
    paidDaysOff: String(settings.paidDaysOff),
  }));
  const [flags, setFlags] = useState({
    leavePaid: settings.leavePaid,
    vacationPaid: settings.vacationPaid,
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();
  const numbers = Object.fromEntries(
    FIELDS.map(({ key }) => [key, Number(form[key])]),
  ) as Record<NumberKey, number>;
  const values: PayrollSettings = { ...numbers, ...flags };
  const valid =
    FIELDS.every(
      ({ key }) =>
        form[key].trim() !== '' &&
        Number.isFinite(numbers[key]) &&
        numbers[key] >= 0,
    ) &&
    numbers.salaryDays >= 1 &&
    numbers.salaryDays <= 31 &&
    Number.isInteger(numbers.paidDaysOff);
  // Example worker for the summary: 2,600 basic, 10 hours a day.
  const perHour = hourlySalary({ salary: 2600, workHoursPerDay: 10 }, values);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setStatus({
        kind: 'error',
        text: 'Check the values: days in a month must be 1–31 and paid days off a whole number.',
      });
      return;
    }
    setSaving(true);
    setStatus(undefined);
    try {
      onSaved(await api.payroll.updateSettings(values));
      setStatus({
        kind: 'ok',
        text: 'Payroll settings saved. They apply to payslips created or recalculated from now on.',
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: errorMessage(error, 'The payroll settings could not be saved.'),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="payroll-settings" onSubmit={save}>
      <div className="people-toolbar-main">
        <div>
          <h2>Payroll settings</h2>
          <p>
            For company workers and outsource camp workers. Saved payslips keep
            their amounts, and every amount can still be edited on a payslip.
            Settings → Terms &amp; policy explains every rule in full.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        {FIELDS.map(({ key, label, hint, step }) => (
          <label
            className="form-field settings-field"
            htmlFor={`payroll-${key}`}
            key={key}
          >
            {label}
            <input
              id={`payroll-${key}`}
              min={key === 'salaryDays' ? 1 : 0}
              onChange={(event) => {
                const { value } = event.currentTarget;
                setForm((current) => ({ ...current, [key]: value }));
              }}
              step={step}
              type="number"
              value={form[key]}
            />
            <small>{hint}</small>
          </label>
        ))}
      </div>
      <div className="settings-toggles">
        {TOGGLES.map(({ key, label, hint }) => (
          <label className="toggle-row" htmlFor={`payroll-${key}`} key={key}>
            <input
              checked={flags[key]}
              id={`payroll-${key}`}
              onChange={(event) => {
                const { checked } = event.currentTarget;
                setFlags((current) => ({ ...current, [key]: checked }));
              }}
              role="switch"
              type="checkbox"
            />
            <span className="toggle-track" aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
          </label>
        ))}
      </div>
      <p className="notice">
        {valid
          ? `Example — basic 2,600, 10 hours a day: per-hour salary 2,600 ÷ ${numbers.salaryDays} ÷ 10 = ${formatAmount(perHour)}; overtime ${formatAmount(perHour * numbers.overtimeMultiplier)} an hour on working days and ${formatAmount(perHour * numbers.weekendOvertimeMultiplier)} on Fridays; each unpaid day off deducts ${formatAmount(2600 / numbers.salaryDays)}.`
          : 'Enter valid values in each field.'}
      </p>
      {status && (
        <p
          className={status.kind === 'ok' ? 'form-success' : 'form-error'}
          role={status.kind === 'ok' ? 'status' : 'alert'}
        >
          {status.text}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button button-primary"
          disabled={saving}
          type="submit"
        >
          Save payroll settings
        </button>
      </div>
    </form>
  );
}
