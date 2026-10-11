import { FormEvent, useState } from 'react';
import { overtimeRate } from '../../../shared/payroll';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import { PayrollSettings, formatReportAmount } from '../model';

type NumberKey = Exclude<keyof PayrollSettings, 'leavePaid' | 'vacationPaid'>;

const FIELDS: { key: NumberKey; label: string; hint: string; step: number }[] =
  [
    {
      key: 'overtimeBaseRate',
      label: 'Overtime base rate (SAR / hour)',
      hint: 'Multiplied by the multiplier below',
      step: 0.01,
    },
    {
      key: 'overtimeMultiplier',
      label: 'Overtime multiplier',
      hint: 'e.g. 1.5',
      step: 0.01,
    },
    {
      key: 'absenceFine',
      label: 'Fine per absent day (SAR)',
      hint: 'Company and camp workers',
      step: 0.01,
    },
    {
      key: 'absenceFineFreeDays',
      label: 'Absent days without a fine',
      hint: 'Fines start after these days',
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
    label: 'Leave days are paid',
    hint: 'When off, a day’s pay is deducted for each leave day.',
  },
  {
    key: 'vacationPaid',
    label: 'Vacation days are paid',
    hint: 'When off, a day’s pay is deducted for each vacation day.',
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
  const [form, setForm] = useState(() =>
    Object.fromEntries(FIELDS.map(({ key }) => [key, String(settings[key])])),
  );
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
  const valid = FIELDS.every(
    ({ key }) =>
      form[key].trim() !== '' &&
      Number.isFinite(numbers[key]) &&
      numbers[key] >= 0,
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setStatus({ kind: 'error', text: 'Every setting must be zero or more.' });
      return;
    }
    setSaving(true);
    setStatus(undefined);
    try {
      onSaved(await api.payroll.updateSettings(values));
      setStatus({
        kind: 'ok',
        text: 'Payroll settings saved. They apply to payslips generated or recalculated from now on.',
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
            Defaults for new payslips. Saved payslips keep their amounts, and
            every amount can still be edited on a payslip.
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
              min={0}
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
          ? `Overtime pays ${formatReportAmount(overtimeRate(values))} SAR an hour. Absent days beyond ${numbers.absenceFineFreeDays} are fined ${formatReportAmount(numbers.absenceFine)} SAR each. Leave is ${flags.leavePaid ? 'paid' : 'unpaid'}; vacation is ${flags.vacationPaid ? 'paid' : 'unpaid'}.`
          : 'Enter a value of zero or more in each field.'}
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
