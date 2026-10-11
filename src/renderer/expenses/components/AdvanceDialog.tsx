import { FormEvent, useState } from 'react';
import { roundMoney } from '../../../shared/payroll';
import { SalaryAdvanceInput } from '../../../shared/types';
import { errorMessage } from '../../data/FinanceApiContext';
import {
  Employee,
  SalaryAdvance,
  formatAmount,
  formatCurrency,
  plural,
  todayKey,
} from '../model';
import {
  Target,
  TargetSelect,
  isTargetChosen,
  matchesTarget,
  newTarget,
} from './peopleUi';

export default function AdvanceDialog({
  advance,
  employees,
  onClose,
  onSubmit,
}: {
  advance: SalaryAdvance | undefined;
  employees: Employee[];
  onClose: () => void;
  onSubmit: (inputs: SalaryAdvanceInput[]) => Promise<void>;
}) {
  const [target, setTarget] = useState<Target>(
    advance ? { kind: 'one', value: advance.employeeId } : newTarget('one'),
  );
  const [amount, setAmount] = useState(advance ? String(advance.amount) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const value = Number(amount);
  const recipients = isTargetChosen(target)
    ? employees.filter((employee) => matchesTarget(employee, target))
    : [];
  const group = target.kind !== 'one';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (recipients.length === 0) {
      setError(
        group ? 'No employees match this choice.' : 'Choose an employee.',
      );
      return;
    }
    if (!(value > 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    const base = {
      date: String(form.get('date') ?? ''),
      amount: roundMoney(value),
      note: String(form.get('note') ?? '').trim(),
    };
    setSaving(true);
    setError('');
    try {
      await onSubmit(
        recipients.map((employee) => ({ ...base, employeeId: employee.id })),
      );
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save the advance.'));
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="advance-dialog-title"
        aria-modal="true"
        className="expense-dialog simple-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {advance ? 'EDIT ADVANCE' : 'NEW ADVANCE'}
            </p>
            <h2 id="advance-dialog-title">
              {advance ? 'Edit salary advance' : 'Give a salary advance'}
            </h2>
            <p>It is deducted from the next payslip.</p>
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
        <form onSubmit={handleSubmit}>
          <TargetSelect
            id="advance-target"
            employees={employees}
            kinds={
              advance ? ['one'] : ['one', 'all', 'project', 'camp', 'role']
            }
            value={target}
            onChange={setTarget}
          />
          <div className="form-grid advance-fields">
            <label className="form-field" htmlFor="advance-amount">
              Amount (SAR{group ? ', each' : ''})
              <input
                id="advance-amount"
                min={0.01}
                onChange={(event) => setAmount(event.currentTarget.value)}
                required
                step={0.01}
                type="number"
                value={amount}
              />
            </label>
            <label className="form-field" htmlFor="advance-date">
              Date given
              <input
                defaultValue={advance?.date ?? todayKey()}
                id="advance-date"
                name="date"
                required
                type="date"
              />
            </label>
            <label className="form-field field-wide" htmlFor="advance-note">
              Note (optional)
              <input
                defaultValue={advance?.note ?? ''}
                id="advance-note"
                maxLength={200}
                name="note"
                placeholder="e.g. Eid advance"
              />
            </label>
          </div>
          {group && isTargetChosen(target) && (
            <p className="simple-summary" role="status">
              <b>{plural(recipients.length, 'employee')}</b>
              {value > 0 && (
                <>
                  {' '}
                  × {formatAmount(roundMoney(value))} ={' '}
                  <b>{formatCurrency(roundMoney(value * recipients.length))}</b>
                </>
              )}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button button-secondary"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={saving}
              type="submit"
            >
              {advance && 'Save changes'}
              {!advance &&
                (group
                  ? `Give ${plural(recipients.length, 'advance')}`
                  : 'Give advance')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
