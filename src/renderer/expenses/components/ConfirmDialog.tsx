import { ReactNode } from 'react';

export default function ConfirmDialog({
  id,
  eyebrow,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="expense-dialog confirmation-dialog"
        role="alertdialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>{children}</p>
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={`button ${danger ? 'button-danger' : 'button-primary'}`}
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
