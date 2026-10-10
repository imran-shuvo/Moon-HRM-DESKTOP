import { FormEvent, useState } from 'react';
import { BudgetTransactionInput } from '../../../shared/types';
import { errorMessage } from '../../data/FinanceApiContext';
import { BudgetTransaction, todayKey } from '../model';
import ListSelectField from './ListSelectField';

export default function BudgetPaymentDialog({
  payment,
  payers,
  onClose,
  onSubmit,
}: {
  payment: BudgetTransaction | undefined;
  payers: string[];
  onClose: () => void;
  onSubmit: (payment: BudgetTransactionInput) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    const paymentMethod = String(form.get('paymentMethod'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    if (paymentMethod !== 'Cash' && paymentMethod !== 'Card') {
      setError('Choose Cash or Card as the payment method.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        date: String(form.get('date')),
        amount,
        paidBy: String(form.get('paidBy')).trim(),
        paymentMethod,
        note: String(form.get('note')).trim(),
      });
    } catch (submitError) {
      setError(
        errorMessage(
          submitError,
          'Could not save the payment. Please try again.',
        ),
      );
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="budget-payment-title"
        aria-modal="true"
        className="expense-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {payment ? 'EDIT COMPANY PAYMENT' : 'NEW COMPANY PAYMENT'}
            </p>
            <h2 id="budget-payment-title">
              {payment ? 'Edit budget payment' : 'Record a budget payment'}
            </h2>
            <p>Record funds received from the company.</p>
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
          <div className="form-grid">
            <label className="form-field" htmlFor="budget-payment-date">
              Date received
              <input
                id="budget-payment-date"
                name="date"
                type="date"
                defaultValue={payment?.date ?? todayKey()}
                required
              />
            </label>
            <label className="form-field" htmlFor="budget-payment-amount">
              Amount received
              <span className="input-with-prefix">
                <span>SAR</span>
                <input
                  aria-label="Payment amount"
                  id="budget-payment-amount"
                  min="0.01"
                  name="amount"
                  type="number"
                  step="0.01"
                  defaultValue={payment?.amount ?? ''}
                  required
                />
              </span>
            </label>
            <ListSelectField
              className="form-field"
              defaultValue={payment?.paidBy ?? ''}
              id="budget-payment-paid-by"
              label="Received from"
              maxLength={100}
              name="paidBy"
              newOptionLabel="New payee name"
              options={payers}
              placeholder="Person or company"
            />
            <label className="form-field" htmlFor="budget-payment-method">
              Budget payment method
              <select
                id="budget-payment-method"
                name="paymentMethod"
                defaultValue={payment?.paymentMethod ?? 'Cash'}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </label>
            <label
              className="form-field field-wide"
              htmlFor="budget-payment-note"
            >
              Note (optional)
              <input
                id="budget-payment-note"
                maxLength={160}
                name="note"
                placeholder="Optional reference or payment details"
                defaultValue={payment?.note ?? ''}
              />
            </label>
          </div>
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
              {payment ? 'Save changes' : 'Save payment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
