import { DragEvent, FormEvent, useRef, useState } from 'react';
import { roundMoney } from '../../../shared/payroll';
import { PettyCashInput } from '../../../shared/types';
import {
  MAX_ATTACHMENTS_PER_SAVE,
  MAX_ATTACHMENT_BYTES,
} from '../../../shared/validation';
import { errorMessage } from '../../data/FinanceApiContext';
import {
  Employee,
  PettyCashBalance,
  PettyCashKind,
  PettyCashTransaction,
  formatCurrency,
  formatFileSize,
  todayKey,
} from '../model';
import { employeeOptionLabel } from './peopleUi';

export const PETTY_CASH_KIND_LABELS: Record<PettyCashKind, string> = {
  given: 'Cash given',
  received: 'Settled amount',
};

/**
 * Records cash given to a worker or an amount they settle, with reference
 * documents. Editing can add files and remove existing ones.
 */
export default function PettyCashDialog({
  entry,
  defaults,
  employees,
  balances,
  onClose,
  onSubmit,
}: {
  /** The entry being edited; undefined for a new one. */
  entry: PettyCashTransaction | undefined;
  defaults: { kind: PettyCashKind; employeeId: string };
  employees: Employee[];
  /** Current balances by employee id, including `entry` as saved. */
  balances: Map<string, PettyCashBalance>;
  onClose: () => void;
  onSubmit: (
    input: PettyCashInput,
    files: File[],
    removeAttachmentIds: string[],
  ) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PettyCashKind>(entry?.kind ?? defaults.kind);
  const [employeeId, setEmployeeId] = useState(
    entry?.employeeId ?? defaults.employeeId,
  );
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const value = roundMoney(Number(amount) || 0);
  const employee = employees.find((item) => item.id === employeeId);
  // The balance without this entry, so editing shows the right result.
  const savedEffect =
    entry && entry.employeeId === employeeId
      ? (entry.kind === 'given' ? 1 : -1) * entry.amount
      : 0;
  const before = roundMoney(
    (balances.get(employeeId)?.inHand ?? 0) - savedEffect,
  );
  const after = roundMoney(before + (kind === 'given' ? value : -value));
  const keptAttachments = (entry?.attachments ?? []).filter(
    (attachment) => !removed.includes(attachment.id),
  );

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    const tooBig = added.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
    const fitting = added.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    const room = MAX_ATTACHMENTS_PER_SAVE - files.length;
    const problems = [
      tooBig.length
        ? `${tooBig.map((file) => file.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`
        : '',
      fitting.length > room
        ? `Attach at most ${MAX_ATTACHMENTS_PER_SAVE} files at a time; save, then edit the entry to add more.`
        : '',
    ];
    setError(problems.filter(Boolean).join(' '));
    setFiles((current) => [...current, ...fitting.slice(0, Math.max(0, room))]);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!employeeId) {
      setError('Choose the worker.');
      return;
    }
    if (!(value > 0)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit(
        {
          employeeId,
          kind,
          amount: value,
          date: String(form.get('date') ?? ''),
          note: String(form.get('note') ?? '').trim(),
          remarks: String(form.get('remarks') ?? '').trim(),
        },
        files,
        removed,
      );
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save the petty cash.'));
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="petty-cash-dialog-title"
        aria-modal="true"
        className="expense-dialog simple-dialog petty-cash-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {entry ? 'EDIT PETTY CASH' : 'NEW PETTY CASH'}
            </p>
            <h2 id="petty-cash-dialog-title">
              {kind === 'given'
                ? 'Give petty cash to a worker'
                : 'Record settled amount'}
            </h2>
            <p>
              {kind === 'given'
                ? 'Adds to the cash the worker holds.'
                : 'Reduces the cash the worker holds.'}
            </p>
          </div>
          <button
            aria-label="Close dialog"
            className="dialog-close"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <fieldset className="petty-cash-fields" disabled={saving}>
            <div
              aria-label="Kind of entry"
              className="segmented segmented-large petty-cash-kind"
              role="radiogroup"
            >
              {(['received', 'given'] as const).map((option) => (
                <button
                  aria-checked={kind === option}
                  className={kind === option ? 'active' : undefined}
                  key={option}
                  onClick={() => setKind(option)}
                  role="radio"
                  type="button"
                >
                  {option === 'given' ? '↑ ' : '↓ '}
                  {PETTY_CASH_KIND_LABELS[option]}
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label className="form-field field-wide" htmlFor="petty-employee">
                Worker
                <select
                  id="petty-employee"
                  onChange={(event) => setEmployeeId(event.currentTarget.value)}
                  required
                  value={employeeId}
                >
                  <option value="">Choose a worker</option>
                  {[...employees]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {employeeOptionLabel(item)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="form-field" htmlFor="petty-amount">
                Amount (SAR)
                <input
                  id="petty-amount"
                  min={0.01}
                  onChange={(event) => setAmount(event.currentTarget.value)}
                  required
                  step={0.01}
                  type="number"
                  value={amount}
                />
              </label>
              <label className="form-field" htmlFor="petty-date">
                Date
                <input
                  defaultValue={entry?.date ?? todayKey()}
                  id="petty-date"
                  name="date"
                  required
                  type="date"
                />
              </label>
              <label className="form-field field-wide" htmlFor="petty-note">
                Description (optional)
                <input
                  defaultValue={entry?.note ?? ''}
                  id="petty-note"
                  maxLength={300}
                  name="note"
                  placeholder={
                    kind === 'given'
                      ? 'e.g. For site supplies'
                      : 'e.g. Returned unused cash, receipts attached'
                  }
                />
              </label>
              <label className="form-field field-wide" htmlFor="petty-remarks">
                Remarks (optional)
                <textarea
                  defaultValue={entry?.remarks ?? ''}
                  id="petty-remarks"
                  maxLength={1000}
                  name="remarks"
                  placeholder="Anything else to remember about this entry"
                  rows={3}
                />
              </label>
            </div>

            {employee && (
              <p className="simple-summary" role="status">
                {employee.name} holds <b>{formatCurrency(before)}</b>
                {value > 0 && (
                  <>
                    {' '}
                    → after this <b>{formatCurrency(after)}</b>
                  </>
                )}
                {after < 0 && value > 0 && (
                  <span className="petty-cash-warning">
                    That is more than they hold, so their balance goes below
                    zero (you owe them {formatCurrency(-after)}).
                  </span>
                )}
              </p>
            )}

            <h3 className="petty-cash-files-heading">Reference documents</h3>
            {keptAttachments.length + removed.length > 0 && (
              <ul aria-label="Attached files" className="upload-list">
                {(entry?.attachments ?? []).map((attachment) => {
                  const isRemoved = removed.includes(attachment.id);
                  return (
                    <li
                      className={isRemoved ? 'upload-removed' : undefined}
                      key={attachment.id}
                    >
                      <span>{attachment.name}</span>
                      <small>
                        {isRemoved
                          ? 'Removed when saved'
                          : formatFileSize(attachment.size)}
                      </small>
                      <button
                        aria-label={`${isRemoved ? 'Keep' : 'Remove'} ${attachment.name}`}
                        className={`text-button${isRemoved ? '' : ' danger-text'}`}
                        onClick={() =>
                          setRemoved((current) =>
                            isRemoved
                              ? current.filter((id) => id !== attachment.id)
                              : [...current, attachment.id],
                          )
                        }
                        type="button"
                      >
                        {isRemoved ? 'Keep' : 'Remove'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <input
              aria-label="Choose reference documents"
              className="visually-hidden"
              multiple
              onChange={(event) => {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
              ref={fileInput}
              type="file"
            />
            <button
              className={`drop-zone${dragging ? ' dragging' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDrop={onDrop}
              type="button"
            >
              <span aria-hidden="true">⇪</span>
              <strong>Drop receipts here or click to choose</strong>
              <small>
                Photos, PDFs or scans · up to{' '}
                {MAX_ATTACHMENT_BYTES / 1024 / 1024} MB each
              </small>
            </button>
            {files.length > 0 && (
              <ul aria-label="Files to attach" className="upload-list">
                {files.map((file, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <small>{formatFileSize(file.size)}</small>
                    <button
                      aria-label={`Remove ${file.name}`}
                      className="text-button danger-text"
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((_, item) => item !== index),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
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
              {saving && 'Saving…'}
              {!saving && entry && 'Save changes'}
              {!saving &&
                !entry &&
                (kind === 'given' ? 'Give cash' : 'Save settled amount')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
