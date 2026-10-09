import { ChangeEvent, FormEvent, useState } from 'react';
import { ExpenseInput } from '../../../shared/types';
import { Expense, PAYMENT_METHODS, todayKey } from '../model';

export default function ExpenseDialog({
  onClose,
  onSubmit,
  categories,
  departments,
  expense,
}: {
  onClose: () => void;
  onSubmit: (input: ExpenseInput, files: File[]) => Promise<void>;
  categories: string[];
  departments: string[];
  expense: Expense | undefined;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [excludingVat, setExcludingVat] = useState(
    expense?.amountExcludingVat?.toString() ?? expense?.amount.toString() ?? '',
  );
  const [vat, setVat] = useState(expense?.vat?.toString() ?? '0');
  const total =
    Math.round(((Number(excludingVat) || 0) + (Number(vat) || 0)) * 100) / 100;
  let submitLabel = expense ? 'Save changes' : 'Save expense';
  if (saving) submitLabel = 'Saving…';

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.currentTarget.files ?? []));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountExcludingVatValue = Number(form.get('amountExcludingVat'));
    const vatValue = Number(form.get('vat'));
    if (
      !Number.isFinite(amountExcludingVatValue) ||
      amountExcludingVatValue <= 0 ||
      !Number.isFinite(vatValue) ||
      vatValue < 0
    ) {
      setError(
        'Enter a valid amount excluding VAT and a VAT amount of zero or more.',
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSubmit(
        {
          date: String(form.get('date')),
          payee: String(form.get('payee')).trim(),
          particulars: String(form.get('particulars')).trim(),
          projectName: String(form.get('projectName')).trim(),
          invoiceNo: String(form.get('invoiceNo')).trim(),
          siteName: String(form.get('siteName')).trim(),
          vatNo: String(form.get('vatNo')).trim(),
          amountExcludingVat: amountExcludingVatValue,
          vat: vatValue,
          category: String(form.get('type')),
          department: String(form.get('department') ?? ''),
          paymentMethod: String(form.get('paymentMethod')),
        },
        files,
      );
    } catch (submitError) {
      // On success the dialog closes, so state is only updated on failure.
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not save the expense. Please try again.',
      );
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="expense-dialog-title"
        aria-modal="true"
        className="expense-dialog expense-entry-dialog"
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
            <p>Enter the invoice details and payment totals.</p>
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
            <label className="form-field" htmlFor="expense-date">
              Invoice date
              <input
                id="expense-date"
                defaultValue={expense?.date ?? todayKey()}
                name="date"
                required
                type="date"
              />
            </label>
            <label className="form-field" htmlFor="expense-invoice">
              Invoice no.
              <input
                id="expense-invoice"
                defaultValue={expense?.invoiceNo ?? ''}
                maxLength={100}
                name="invoiceNo"
                placeholder="Invoice number"
              />
            </label>
            <label className="form-field field-wide" htmlFor="expense-payee">
              Paid to
              <input
                id="expense-payee"
                defaultValue={expense?.payee ?? ''}
                maxLength={100}
                name="payee"
                placeholder="Vendor or recipient name"
                required
              />
            </label>
            <label
              className="form-field field-wide"
              htmlFor="expense-particulars"
            >
              Particulars / details
              <textarea
                id="expense-particulars"
                defaultValue={
                  expense?.particulars ?? expense?.description ?? ''
                }
                maxLength={500}
                name="particulars"
                placeholder="What was this expense for?"
                required
                rows={2}
              />
            </label>
            <label className="form-field" htmlFor="expense-project">
              Project name
              <input
                id="expense-project"
                defaultValue={expense?.projectName ?? ''}
                maxLength={120}
                name="projectName"
                placeholder="Project"
              />
            </label>
            <label className="form-field" htmlFor="expense-site">
              Site name
              <input
                id="expense-site"
                defaultValue={expense?.siteName ?? ''}
                maxLength={120}
                name="siteName"
                placeholder="Site"
              />
            </label>
            <label className="form-field" htmlFor="expense-vat-number">
              VAT no.
              <input
                id="expense-vat-number"
                defaultValue={expense?.vatNo ?? ''}
                maxLength={60}
                name="vatNo"
                placeholder="VAT registration number"
              />
            </label>
            <label className="form-field" htmlFor="expense-type">
              Type
              <select
                defaultValue={
                  expense?.type ?? expense?.category ?? categories[0]
                }
                id="expense-type"
                name="type"
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="form-field" htmlFor="expense-department">
              Department
              <select
                defaultValue={expense?.department ?? ''}
                id="expense-department"
                name="department"
              >
                <option value="">— None —</option>
                {departments.map((department) => (
                  <option key={department}>{department}</option>
                ))}
                {expense?.department &&
                  !departments.includes(expense.department) && (
                    <option>{expense.department}</option>
                  )}
              </select>
            </label>
            <label
              className="form-field"
              htmlFor="expense-amount-excluding-vat"
            >
              Amount excluding VAT
              <span className="input-with-prefix">
                <span>SAR</span>
                <input
                  aria-label="Amount excluding VAT"
                  id="expense-amount-excluding-vat"
                  min="0.01"
                  name="amountExcludingVat"
                  onChange={(event) =>
                    setExcludingVat(event.currentTarget.value)
                  }
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                  value={excludingVat}
                />
              </span>
            </label>
            <label className="form-field" htmlFor="expense-vat">
              VAT
              <span className="input-with-prefix">
                <span>SAR</span>
                <input
                  aria-label="VAT"
                  id="expense-vat"
                  min="0"
                  name="vat"
                  onChange={(event) => setVat(event.currentTarget.value)}
                  placeholder="0.00"
                  required
                  step="0.01"
                  type="number"
                  value={vat}
                />
              </span>
            </label>
            <label className="form-field" htmlFor="expense-total">
              Amount including VAT
              <span className="input-with-prefix calculated-amount">
                <span>SAR</span>
                <input
                  aria-label="Amount including VAT"
                  id="expense-total"
                  readOnly
                  value={total.toFixed(2)}
                />
              </span>
            </label>
            <label className="form-field" htmlFor="expense-payment-method">
              Payment method
              <select
                defaultValue={expense?.paymentMethod ?? PAYMENT_METHODS[0]}
                id="expense-payment-method"
                name="paymentMethod"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <label className="form-field field-wide" htmlFor="expense-files">
              Invoice photo or files
              <input
                id="expense-files"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                multiple
                onChange={handleFileChange}
                type="file"
              />
              {expense?.attachments && expense.attachments.length > 0 && (
                <span className="attachment-help">
                  {expense.attachments.length} existing attachment
                  {expense.attachments.length === 1 ? '' : 's'} will be kept.
                </span>
              )}
              {files.length > 0 && (
                <span className="attachment-help">
                  {files.length} new file{files.length === 1 ? '' : 's'}{' '}
                  selected.
                </span>
              )}
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
              {submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
