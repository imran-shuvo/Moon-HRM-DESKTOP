import { useState } from 'react';
import {
  formatMonthName,
  monthKey,
  previousMonthKey,
} from '../../../shared/months';
import { errorMessage } from '../../data/FinanceApiContext';

export default function MonthClosingPanel({
  reopenedMonths,
  onReopen,
  onClose,
}: {
  reopenedMonths: string[];
  onReopen: (month: string) => Promise<void>;
  onClose: (month: string) => Promise<void>;
}) {
  const lastClosedMonth = previousMonthKey(monthKey());
  const [month, setMonth] = useState(lastClosedMonth);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setError('');
    } catch (actionError) {
      setError(errorMessage(actionError, 'The change could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel month-closing-panel">
      <div className="panel-heading">
        <div>
          <h2>Month closing</h2>
          <p>
            Each month closes automatically when it ends: its expenses and
            budgets become read-only and its remaining budget is carried into
            the next month. Reopen a month only to correct it, then close it
            again.
          </p>
        </div>
      </div>
      <div className="manager-add-form">
        <input
          aria-label="Month to reopen"
          max={lastClosedMonth}
          onChange={(event) => setMonth(event.currentTarget.value)}
          type="month"
          value={month}
        />
        <button
          className="button button-primary"
          disabled={busy || !month || reopenedMonths.includes(month)}
          onClick={() => run(() => onReopen(month))}
          type="button"
        >
          Reopen month
        </button>
      </div>
      {error && (
        <p className="form-error manager-error" role="alert">
          {error}
        </p>
      )}
      {reopenedMonths.length > 0 ? (
        <ul className="managed-list" aria-label="Reopened months">
          {reopenedMonths.map((item) => (
            <li key={item}>
              <span>{formatMonthName(item)} — reopened</span>
              <span className="manager-actions">
                <button
                  aria-label={`Close ${formatMonthName(item)} again`}
                  className="table-action"
                  disabled={busy}
                  onClick={() => run(() => onClose(item))}
                  type="button"
                >
                  Close again
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">All past months are closed.</p>
      )}
    </section>
  );
}
