import { FormEvent, useState } from 'react';
import { Expense, PAYMENT_METHODS, todayKey } from '../model';

export default function ExpenseDialog({
  onClose,
  onSubmit,
  categories,
  departments,
  expense,
}: {
  onClose: () => void;
  onSubmit: (expense: Omit<Expense, 'id'>) => void;
  categories: string[];
  departments: string[];
  expense: Expense | undefined;
}) {
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    onSubmit({
      date: String(form.get('date')),
      payee: String(form.get('payee')).trim(),
      description: String(form.get('description')).trim(),
      category: String(form.get('category')),
      department: String(form.get('department')),
      paymentMethod: String(form.get('paymentMethod')),
      amount,
    });
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="expense-dialog-title"
        aria-modal="true"
        className="expense-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {expense ? 'EDIT TRANSACTION' : 'NEW TRANSACTION'}
            </p>
            <h2 id="expense-dialog-title">
              {expense ? 'Edit expense' : 'Add an expense'}
            </h2>
            <p>Record a company payment and keep your budget up to date.</p>
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
            <label className="form-field field-wide" htmlFor="expense-payee">
              Paid to
              <input
                id="expense-payee"
                maxLength={100}
                name="payee"
                placeholder="Vendor or recipient name"
                defaultValue={expense?.payee ?? ''}
                required
              />
            </label>
            <label
              className="form-field field-wide"
              htmlFor="expense-description"
            >
              Description
              <input
                id="expense-description"
                maxLength={160}
                name="description"
                placeholder="What was this expense for?"
                defaultValue={expense?.description ?? ''}
                required
              />
            </label>
            <label className="form-field" htmlFor="expense-amount">
              Amount
              <span className="input-with-prefix">
                <span>$</span>
                <input
                  aria-label="Amount"
                  id="expense-amount"
                  min="0.01"
                  name="amount"
                  placeholder="0.00"
                  defaultValue={expense?.amount ?? ''}
                  required
                  step="0.01"
                  type="number"
                />
              </span>
            </label>
            <label className="form-field" htmlFor="expense-date">
              Date
              <input
                id="expense-date"
                defaultValue={expense?.date ?? todayKey()}
                name="date"
                required
                type="date"
              />
            </label>
            <label className="form-field" htmlFor="expense-category">
              Category
              <select
                defaultValue={expense?.category ?? categories[0]}
                id="expense-category"
                name="category"
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="form-field" htmlFor="expense-department">
              Department
              <select
                defaultValue={expense?.department ?? departments[0]}
                id="expense-department"
                name="department"
              >
                {departments.map((department) => (
                  <option key={department}>{department}</option>
                ))}
              </select>
            </label>
            <label className="form-field field-wide" htmlFor="expense-payment">
              Payment method
              <select
                defaultValue={expense?.paymentMethod ?? PAYMENT_METHODS[0]}
                id="expense-payment"
                name="paymentMethod"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
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
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button className="button button-primary" type="submit">
              {expense ? 'Save changes' : 'Save expense'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
