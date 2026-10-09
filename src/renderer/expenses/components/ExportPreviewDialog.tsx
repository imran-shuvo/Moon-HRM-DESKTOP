import { ReactNode } from 'react';

export default function ExportPreviewDialog({
  title,
  exportLabel,
  error,
  onClose,
  onExport,
  children,
}: {
  title: string;
  exportLabel: string;
  error: string | undefined;
  onClose: () => void;
  onExport: () => void;
  children: ReactNode;
}) {
  return (
    <div className="export-preview-backdrop">
      <section
        aria-labelledby="export-preview-title"
        aria-modal="true"
        className="export-preview-dialog"
        role="dialog"
      >
        <header className="export-preview-heading">
          <h2 id="export-preview-title">{title}</h2>
          <button
            aria-label="Close preview"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="export-preview-content">{children}</div>
        {error && (
          <p className="form-error export-preview-error" role="alert">
            {error}
          </p>
        )}
        <footer className="export-preview-actions">
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="button button-primary"
            onClick={onExport}
            type="button"
          >
            {exportLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
