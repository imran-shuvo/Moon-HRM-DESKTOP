import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BackupDetails,
  BackupFileInfo,
  BackupKind,
  BackupSettings,
  DatabaseStatus,
} from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import { plural } from '../model';
import DatabaseConnectionForm from './DatabaseConnectionForm';

const KIND_LABELS: Record<BackupKind, string> = {
  automatic: 'Automatic',
  manual: 'Manual',
  'pre-restore': 'Before restore',
};

const INTERVALS = [
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Every day' },
  { hours: 168, label: 'Every week' },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function RestoreDialog({
  backup,
  onCancel,
  onConfirm,
}: {
  backup: BackupDetails;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [understood, setUnderstood] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const { counts } = backup;

  async function confirm() {
    setRestoring(true);
    setError('');
    try {
      await onConfirm();
    } catch (restoreError) {
      setError(errorMessage(restoreError, 'The backup could not be restored.'));
      setRestoring(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="restore-backup-title"
        aria-modal="true"
        className="expense-dialog confirmation-dialog"
        role="alertdialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">RESTORE FROM BACKUP</p>
            <h2 id="restore-backup-title">
              Replace all data with this backup?
            </h2>
            <p>
              Backup from <strong>{formatDateTime(backup.createdAt)}</strong> (
              {KIND_LABELS[backup.kind].toLowerCase()}, {backup.fileName})
            </p>
          </div>
        </div>
        <ul className="restore-counts">
          <li>{plural(counts.expenses, 'expense')}</li>
          <li>{plural(counts.attachments, 'receipt file')}</li>
          <li>{plural(counts.budgetTransactions, 'budget payment')}</li>
          <li>
            {plural(counts.categories, 'type')} ·{' '}
            {plural(counts.departments, 'department')} ·{' '}
            {plural(counts.employees, 'employee')}
          </li>
          <li>
            {plural(counts.attendance ?? 0, 'attendance record')} ·{' '}
            {plural(counts.salaryAdvances ?? 0, 'advance')} ·{' '}
            {plural(counts.payslips ?? 0, 'payslip')}
          </li>
        </ul>
        <p className="restore-warning">
          Every expense, budget payment, type, department, employee, attendance
          record, advance and payslip in the database will be replaced by the
          contents of this backup. A safety backup of the current data is saved
          first, so this can be undone.
        </p>
        <label className="checkbox-field" htmlFor="restore-understood">
          <input
            checked={understood}
            id="restore-understood"
            onChange={(event) => setUnderstood(event.currentTarget.checked)}
            type="checkbox"
          />
          I understand that current data will be replaced.
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button button-secondary"
            disabled={restoring}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button button-danger"
            disabled={!understood || restoring}
            onClick={confirm}
            type="button"
          >
            {restoring ? 'Restoring…' : 'Restore backup'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function BackupPanel({
  status,
  onStatusChange,
  onRestored,
}: {
  status: DatabaseStatus | undefined;
  onStatusChange: (status: DatabaseStatus) => void;
  onRestored: () => Promise<void>;
}) {
  const api = useFinanceApi();
  const [settings, setSettings] = useState<BackupSettings>();
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();
  const [restoreCandidate, setRestoreCandidate] = useState<BackupDetails>();
  const [editingConnection, setEditingConnection] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextSettings, nextBackups] = await Promise.all([
        api.backup.settings(),
        api.backup.list(),
      ]);
      setSettings(nextSettings);
      setBackups(nextBackups);
    } catch (error) {
      setNotice({
        kind: 'error',
        text: errorMessage(error, 'Could not load backups.'),
      });
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(action: () => Promise<string | undefined>) {
    setBusy(true);
    setNotice(undefined);
    try {
      const text = await action();
      if (text) setNotice({ kind: 'ok', text });
      await refresh();
    } catch (error) {
      setNotice({
        kind: 'error',
        text: errorMessage(error, 'Something went wrong.'),
      });
    } finally {
      setBusy(false);
    }
  }

  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(async () => {
      setSettings(
        await api.backup.updateSettings({
          automaticEnabled: form.get('automaticEnabled') === 'on',
          intervalHours: Number(form.get('intervalHours')),
          keep: Number(form.get('keep')),
        }),
      );
      return 'Backup schedule saved.';
    });
  }

  const restoreConfirmed = useCallback(async () => {
    if (!restoreCandidate) return;
    const result = await api.backup.restore(restoreCandidate.path);
    setRestoreCandidate(undefined);
    await onRestored();
    setNotice({
      kind: 'ok',
      text: `Restored ${plural(result.restored.expenses, 'expense')} and ${plural(result.restored.budgetTransactions, 'budget payment')}. The previous data was saved to ${result.safetyBackup.fileName}.`,
    });
    await refresh();
  }, [api, onRestored, refresh, restoreCandidate]);

  return (
    <>
      <section className="panel backup-panel" aria-labelledby="db-status-title">
        <div className="panel-heading">
          <div>
            <h2 id="db-status-title">Database</h2>
            <p>
              All expenses, budgets and receipt files are stored in PostgreSQL.
            </p>
          </div>
          {status?.source === 'settings' && !editingConnection && (
            <button
              className="button button-secondary"
              onClick={() => setEditingConnection(true)}
              type="button"
            >
              Change connection
            </button>
          )}
        </div>
        {editingConnection ? (
          <DatabaseConnectionForm
            status={status}
            onCancel={() => setEditingConnection(false)}
            onConnected={(next) => {
              setEditingConnection(false);
              onStatusChange(next);
              refresh();
            }}
          />
        ) : (
          <dl className="db-status-grid">
            <div>
              <dt>Status</dt>
              <dd>
                <span
                  className={`status-dot ${status?.connected ? 'online' : 'offline'}`}
                />
                {status?.connected ? 'Connected' : 'Not connected'}
              </dd>
            </div>
            <div>
              <dt>Server</dt>
              <dd>
                {status?.source === 'env'
                  ? 'Set by DATABASE_URL'
                  : `${status?.settings?.host ?? '—'}:${status?.settings?.port ?? ''}`}
              </dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>{status?.settings?.database ?? '—'}</dd>
            </div>
            <div>
              <dt>PostgreSQL version</dt>
              <dd>{status?.serverVersion ?? '—'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="panel backup-panel" aria-labelledby="backup-title">
        <div className="panel-heading">
          <div>
            <h2 id="backup-title">Backup &amp; restore</h2>
            <p>
              A backup is one file containing every expense, budget payment and
              receipt. Keep a copy somewhere other than this computer.
            </p>
          </div>
        </div>
        <div className="backup-actions">
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const backup = await api.backup.create();
                return `Backup saved: ${backup.fileName}`;
              })
            }
            type="button"
          >
            Back up now
          </button>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const backup = await api.backup.saveAs();
                return backup ? `Backup saved to ${backup.path}` : undefined;
              })
            }
            type="button"
          >
            Save backup as…
          </button>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const details = await api.backup.chooseFile();
                if (details) setRestoreCandidate(details);
                return undefined;
              })
            }
            type="button"
          >
            Restore from file…
          </button>
        </div>
        {notice && (
          <p
            className={notice.kind === 'ok' ? 'form-success' : 'form-error'}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}

        {settings && (
          <form className="backup-schedule" onSubmit={saveSchedule}>
            <label className="checkbox-field" htmlFor="backup-auto">
              <input
                defaultChecked={settings.automaticEnabled}
                id="backup-auto"
                name="automaticEnabled"
                type="checkbox"
              />
              Back up automatically
            </label>
            <label className="filter-control" htmlFor="backup-interval">
              Frequency
              <select
                defaultValue={settings.intervalHours}
                id="backup-interval"
                name="intervalHours"
              >
                {INTERVALS.map((interval) => (
                  <option key={interval.hours} value={interval.hours}>
                    {interval.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control" htmlFor="backup-keep">
              Keep last
              <input
                defaultValue={settings.keep}
                id="backup-keep"
                max={365}
                min={1}
                name="keep"
                type="number"
              />
            </label>
            <button
              className="button button-secondary"
              disabled={busy}
              type="submit"
            >
              Save schedule
            </button>
            <div className="backup-folder">
              <span>Backup folder</span>
              <code>{settings.directory}</code>
              <span className="backup-folder-actions">
                <button
                  className="table-action"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const next = await api.backup.chooseDirectory();
                      if (next) setSettings(next);
                      return next ? 'Backup folder changed.' : undefined;
                    })
                  }
                  type="button"
                >
                  Change folder
                </button>
                <button
                  className="table-action"
                  onClick={() =>
                    run(async () => {
                      await api.backup.openDirectory();
                      return undefined;
                    })
                  }
                  type="button"
                >
                  Open folder
                </button>
              </span>
            </div>
            <p className="backup-last">
              Last automatic backup:{' '}
              {settings.lastAutomaticBackupAt
                ? formatDateTime(settings.lastAutomaticBackupAt)
                : 'not yet'}
            </p>
          </form>
        )}

        <div className="table-scroll">
          <table
            className="expense-table backup-table"
            aria-label="Saved backups"
          >
            <thead>
              <tr>
                <th>CREATED</th>
                <th>TYPE</th>
                <th className="amount-cell">SIZE</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.path}>
                  <td>{formatDateTime(backup.createdAt)}</td>
                  <td>{KIND_LABELS[backup.kind]}</td>
                  <td className="amount-cell">
                    {formatSize(backup.sizeBytes)}
                  </td>
                  <td className="amount-cell">
                    <button
                      className="table-action"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setRestoreCandidate(
                            await api.backup.inspect(backup.path),
                          );
                          return undefined;
                        })
                      }
                      type="button"
                    >
                      Restore…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {backups.length === 0 && (
            <p className="empty-state">No backups in this folder yet.</p>
          )}
        </div>
      </section>
      {restoreCandidate && (
        <RestoreDialog
          backup={restoreCandidate}
          onCancel={() => setRestoreCandidate(undefined)}
          onConfirm={restoreConfirmed}
        />
      )}
    </>
  );
}
