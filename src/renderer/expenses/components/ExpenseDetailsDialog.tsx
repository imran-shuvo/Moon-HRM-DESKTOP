import { useEffect, useState } from 'react';
import {
  Expense,
  ExpenseAttachment,
  formatCurrency,
  getExpenseTotal,
} from '../model';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentLink({ attachment }: { attachment: ExpenseAttachment }) {
  const api = useFinanceApi();
  const isImage = attachment.type.startsWith('image/');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  // Only images are fetched up front, for the thumbnail.
  useEffect(() => {
    if (!isImage) return undefined;
    let objectUrl = '';
    let active = true;
    api.expenses
      .attachment(attachment.id)
      .then((file) => {
        if (!active) return undefined;
        if (!file) {
          setError('File is unavailable');
          return undefined;
        }
        objectUrl = URL.createObjectURL(
          new Blob([file.data], { type: file.type }),
        );
        setPreviewUrl(objectUrl);
        return undefined;
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError, 'Could not load file'));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, attachment.id, isImage]);

  async function openFile() {
    try {
      await api.expenses.openAttachment(attachment.id);
      setError('');
    } catch (openError) {
      setError(errorMessage(openError, 'Could not open file'));
    }
  }

  return (
    <div className="attachment-item">
      <button className="attachment-link" onClick={openFile} type="button">
        {previewUrl && <img alt="" src={previewUrl} />}
        <span>{attachment.name}</span>
        <small>{formatSize(attachment.size)}</small>
      </button>
      {error && (
        <span className="attachment-error">
          {attachment.name}: {error}
        </span>
      )}
    </div>
  );
}

export default function ExpenseDetailsDialog({
  expense,
  onClose,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
}) {
  const attachments = expense.attachments ?? [];

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="expense-details-title"
        aria-modal="true"
        className="expense-dialog expense-details-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">TRANSACTION DETAILS</p>
            <h2 id="expense-details-title">{expense.payee}</h2>
            <p>{expense.particulars || expense.description}</p>
          </div>
          <button
            aria-label="Close transaction details"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <dl className="expense-detail-grid">
          <div>
            <dt>Invoice date</dt>
            <dd>{expense.date}</dd>
          </div>
          <div>
            <dt>Invoice no.</dt>
            <dd>{expense.invoiceNo || '—'}</dd>
          </div>
          <div>
            <dt>Paid to</dt>
            <dd>{expense.payee}</dd>
          </div>
          <div>
            <dt>Particulars / details</dt>
            <dd>{expense.particulars || expense.description || '—'}</dd>
          </div>
          <div>
            <dt>Project name</dt>
            <dd>{expense.projectName || '—'}</dd>
          </div>
          <div>
            <dt>Site name</dt>
            <dd>{expense.siteName || '—'}</dd>
          </div>
          <div>
            <dt>VAT no.</dt>
            <dd>{expense.vatNo || '—'}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{expense.type || expense.category || '—'}</dd>
          </div>
          <div>
            <dt>Payment method</dt>
            <dd>{expense.paymentMethod || '—'}</dd>
          </div>
          <div>
            <dt>Amount excluding VAT</dt>
            <dd>
              {formatCurrency(expense.amountExcludingVat ?? expense.amount)}
            </dd>
          </div>
          <div>
            <dt>VAT</dt>
            <dd>{formatCurrency(expense.vat ?? 0)}</dd>
          </div>
          <div className="detail-total">
            <dt>Amount including VAT</dt>
            <dd>{formatCurrency(getExpenseTotal(expense))}</dd>
          </div>
        </dl>
        <section className="attachment-list">
          <h3>Invoice photo &amp; files ({attachments.length})</h3>
          {attachments.length ? (
            attachments.map((attachment) => (
              <AttachmentLink attachment={attachment} key={attachment.id} />
            ))
          ) : (
            <p>No files attached.</p>
          )}
        </section>
        <div className="dialog-actions">
          <button
            className="button button-danger"
            onClick={() => onDelete(expense)}
            type="button"
          >
            Delete
          </button>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="button button-primary"
            onClick={() => onEdit(expense)}
            type="button"
          >
            Edit transaction
          </button>
        </div>
      </section>
    </div>
  );
}
