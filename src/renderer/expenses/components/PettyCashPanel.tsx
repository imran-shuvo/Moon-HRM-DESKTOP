import { useMemo, useState } from 'react';
import { roundMoney } from '../../../shared/payroll';
import {
  AttachmentUpload,
  PettyCashInput,
  PettyCashKind,
} from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  Employee,
  PettyCashTransaction,
  byPettyCashOrder,
  distinctValues,
  fileTimestamp,
  formatAmount,
  formatCurrency,
  formatReportDate,
  inDateRange,
  matchesAny,
  pettyCashBalances,
  pettyCashRunningBalances,
  plural,
  selfLabels,
} from '../model';
import ConfirmDialog from './ConfirmDialog';
import FilterBar, {
  DateRangeFilter,
  dateChip,
  multiChips,
  searchChip,
  summarizeChips,
  useSessionState,
} from './FilterBar';
import ExportPreviewDialog from './ExportPreviewDialog';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';
import PettyCashDialog, { PETTY_CASH_KIND_LABELS } from './PettyCashDialog';
import PettyCashPrintableReport from './PettyCashPrintableReport';
import { Avatar } from './peopleUi';
import { PrintJob } from './printJob';

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

async function toUploads(files: File[]): Promise<AttachmentUpload[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

type Filters = {
  search: string;
  from: string;
  to: string;
  workers: string[];
  kinds: string[];
  projects: string[];
};

const NO_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  workers: [],
  kinds: [],
  projects: [],
};

const KIND_OPTIONS: PettyCashKind[] = ['given', 'received'];

export default function PettyCashPanel({
  employees,
  entries,
  onSaved,
  onRemoved,
  onPrint,
}: {
  employees: Employee[];
  entries: PettyCashTransaction[];
  onSaved: (entry: PettyCashTransaction) => void;
  onRemoved: (id: string) => void;
  /** Saves the report as a PDF. */
  onPrint: (job: PrintJob) => void;
}) {
  const api = useFinanceApi();
  const [view, setView] = useState<'balances' | 'history'>('balances');
  const [filters, setFilters] = useSessionState('petty-cash', NO_FILTERS);
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const [dialog, setDialog] = useState<{
    entry?: PettyCashTransaction;
    kind: PettyCashKind;
    employeeId: string;
  }>();
  const [toDelete, setToDelete] = useState<PettyCashTransaction>();
  const [preview, setPreview] = useState<PrintJob>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();

  const byId = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const balances = useMemo(() => pettyCashBalances(entries), [entries]);
  const balanceAfter = useMemo(
    () => pettyCashRunningBalances(entries),
    [entries],
  );
  const workerIds = [...balances.keys()].sort((a, b) =>
    (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''),
  );
  const workerLabels = Object.fromEntries(
    workerIds.map((id) => [id, byId.get(id)?.name ?? 'Unknown']),
  );
  const projects = distinctValues(
    workerIds.map((id) => byId.get(id)?.projectName ?? ''),
  );
  const kindLabels = PETTY_CASH_KIND_LABELS as Record<string, string>;

  const needle = filters.search.trim().toLowerCase();
  const matchesWorker = (employeeId: string, texts: string[] = []) => {
    const employee = byId.get(employeeId);
    return (
      matchesAny(filters.workers, employeeId) &&
      matchesAny(filters.projects, employee?.projectName ?? '') &&
      (!needle ||
        [employee?.name, employee?.nickname, employee?.iqamaNo, ...texts].some(
          (value) => (value ?? '').toLowerCase().includes(needle),
        ))
    );
  };
  const matchesEntry = (entry: PettyCashTransaction) =>
    matchesWorker(entry.employeeId, [entry.note, entry.remarks]);
  const history = entries
    .filter(
      (entry) =>
        inDateRange(entry.date, filters.from, filters.to) &&
        matchesAny(filters.kinds, entry.kind) &&
        matchesEntry(entry),
    )
    .sort((a, b) => byPettyCashOrder(b, a));
  const balanceRows = workerIds
    .filter((id) => matchesWorker(id))
    .map((id) => ({ id, employee: byId.get(id), ...balances.get(id)! }))
    .sort((a, b) => b.inHand - a.inHand);

  const totalInHand = sum(
    [...balances.values()].map((balance) => Math.max(0, balance.inHand)),
  );
  const holding = [...balances.values()].filter((b) => b.inHand > 0).length;
  const historyGiven = sum(
    history.filter((e) => e.kind === 'given').map((e) => e.amount),
  );
  const historyReceived = sum(
    history.filter((e) => e.kind === 'received').map((e) => e.amount),
  );

  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...(view === 'history' ? dateChip(filters, (range) => set(range)) : []),
    ...multiChips('Worker', filters.workers, workerLabels, (v) =>
      set({ workers: v }),
    ),
    ...(view === 'history'
      ? multiChips('Type', filters.kinds, kindLabels, (v) => set({ kinds: v }))
      : []),
    ...multiChips('Project', filters.projects, selfLabels(projects), (v) =>
      set({ projects: v }),
    ),
  ];

  const openNew = (kind: PettyCashKind, employeeId = '') =>
    setDialog({
      kind,
      employeeId:
        employeeId || (filters.workers.length === 1 ? filters.workers[0] : ''),
    });

  const save = async (
    input: PettyCashInput,
    files: File[],
    removeAttachmentIds: string[],
  ) => {
    const editing = dialog?.entry;
    const uploads = await toUploads(files);
    const saved = editing
      ? await api.pettyCash.update(
          editing.id,
          input,
          uploads,
          removeAttachmentIds,
        )
      : await api.pettyCash.create(input, uploads);
    onSaved(saved);
    setDialog(undefined);
    const name = byId.get(saved.employeeId)?.name ?? 'The worker';
    setMessage({
      kind: 'ok',
      text: editing
        ? 'Petty cash entry updated.'
        : `${formatCurrency(saved.amount)} ${saved.kind === 'given' ? `given to ${name}` : `settled by ${name}`}.`,
    });
  };

  async function run(work: () => Promise<void>, fallback: string) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error, fallback) });
    } finally {
      setBusy(false);
    }
  }

  /** The report shows what is on screen: dates and type only in History. */
  const reportJob = (): PrintJob => {
    const shown =
      view === 'history' ? history : entries.filter((e) => matchesEntry(e));
    const worker =
      filters.workers.length === 1 ? byId.get(filters.workers[0]) : undefined;
    const name = worker
      ? `_${worker.name.replace(/[^\w-]+/g, '-').toLowerCase()}`
      : '';
    return {
      fileName: `petty-cash${name}_${fileTimestamp(new Date())}`,
      landscape: true,
      content: (
        <PettyCashPrintableReport
          data={{
            worker,
            filterSummary: summarizeChips(
              worker
                ? chips.filter((chip) => !chip.key.startsWith('Worker:'))
                : chips,
            ),
            balances: balanceRows,
            entries: [...shown].sort(byPettyCashOrder),
            balanceAfter,
            employees: byId,
            dated: view === 'history' && Boolean(filters.from || filters.to),
          }}
        />
      ),
    };
  };

  const showHistory = (employeeId: string) => {
    setFilters({ ...NO_FILTERS, workers: [employeeId] });
    setView('history');
  };

  return (
    <div className="people-section petty-cash">
      <section className="panel people-panel">
        <div className="payroll-header">
          <div
            aria-label="Petty cash view"
            className="segmented segmented-large"
            role="tablist"
          >
            <button
              aria-selected={view === 'balances'}
              className={view === 'balances' ? 'active' : undefined}
              onClick={() => setView('balances')}
              role="tab"
              type="button"
            >
              In hand
            </button>
            <button
              aria-selected={view === 'history'}
              className={view === 'history' ? 'active' : undefined}
              onClick={() => setView('history')}
              role="tab"
              type="button"
            >
              History
            </button>
          </div>
          <button
            className="button button-secondary push-right"
            disabled={entries.length === 0}
            onClick={() => setPreview(reportJob())}
            type="button"
          >
            🖨 Preview
          </button>
          <button
            className="button button-secondary"
            disabled={entries.length === 0}
            onClick={() => onPrint(reportJob())}
            type="button"
          >
            ⤓ Save as PDF
          </button>
          <button
            className="button button-secondary"
            disabled={employees.length === 0}
            onClick={() => openNew('given')}
            type="button"
          >
            ↑ Give cash
          </button>
          <button
            className="button button-primary"
            disabled={employees.length === 0}
            onClick={() => openNew('received')}
            type="button"
          >
            ↓ Record settled amount
          </button>
        </div>

        <div className="payroll-totals" aria-label="Petty cash totals">
          <div className="total-unpaid">
            <span>In workers&apos; hands</span>
            <strong>{formatCurrency(totalInHand)}</strong>
            <small>{plural(holding, 'worker')} holding cash</small>
          </div>
          <div>
            <span>Given{view === 'history' ? ' (shown)' : ''}</span>
            <strong>
              {formatCurrency(
                view === 'history'
                  ? historyGiven
                  : sum(balanceRows.map((row) => row.given)),
              )}
            </strong>
            <small>Cash handed to workers</small>
          </div>
          <div className="total-paid">
            <span>Settled amount{view === 'history' ? ' (shown)' : ''}</span>
            <strong>
              {formatCurrency(
                view === 'history'
                  ? historyReceived
                  : sum(balanceRows.map((row) => row.received)),
              )}
            </strong>
            <small>Cash workers settled with you</small>
          </div>
        </div>

        <FilterBar
          searchId="petty-cash-search"
          searchLabel="Search petty cash"
          searchPlaceholder={
            view === 'history'
              ? 'Search name, Iqama or note'
              : 'Search name or Iqama'
          }
          search={filters.search}
          onSearchChange={(search) => set({ search })}
          chips={chips}
          shown={view === 'history' ? history.length : balanceRows.length}
          total={view === 'history' ? entries.length : workerIds.length}
          noun={view === 'history' ? 'entries' : 'workers'}
          onClearAll={() => setFilters(NO_FILTERS)}
        >
          {view === 'history' && (
            <DateRangeFilter
              id="petty-cash-dates"
              label="Date"
              fromLabel="Petty cash from date"
              toLabel="Petty cash to date"
              value={filters}
              onChange={(range) => set(range)}
            />
          )}
          <MultiSelectFilter
            id="petty-cash-worker"
            label="Worker"
            allLabel="All workers"
            options={workerIds}
            labels={workerLabels}
            counts={countBy(entries, (entry) => entry.employeeId)}
            selected={filters.workers}
            onChange={(v) => set({ workers: v })}
          />
          {view === 'history' && (
            <MultiSelectFilter
              id="petty-cash-kind"
              label="Type"
              allLabel="Given and paid"
              options={KIND_OPTIONS}
              labels={kindLabels}
              counts={countBy(entries, (entry) => entry.kind)}
              selected={filters.kinds}
              onChange={(v) => set({ kinds: v })}
            />
          )}
          <MultiSelectFilter
            id="petty-cash-project"
            label="Project"
            allLabel="All projects"
            options={projects}
            labels={selfLabels(projects)}
            counts={countBy(
              entries,
              (entry) => byId.get(entry.employeeId)?.projectName ?? '',
            )}
            selected={filters.projects}
            onChange={(v) => set({ projects: v })}
          />
        </FilterBar>

        {message && (
          <div
            className={`app-message ${message.kind} panel-message`}
            role={message.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{message.text}</span>
            <button
              aria-label="Dismiss message"
              className="dialog-close"
              onClick={() => setMessage(undefined)}
              type="button"
            >
              ×
            </button>
          </div>
        )}

        {view === 'balances' && balanceRows.length > 0 && (
          <div className="table-scroll">
            <table className="expense-table payroll-table simple-table">
              <thead>
                <tr>
                  <th>WORKER</th>
                  <th className="amount-cell">GIVEN</th>
                  <th className="amount-cell">SETTLED AMOUNT</th>
                  <th className="amount-cell">IN HAND</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {balanceRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={row.employee?.name ?? '?'} />
                        <div>
                          <strong>{row.employee?.name ?? 'Unknown'}</strong>
                          <span>
                            {row.employee?.projectName || row.employee?.iqamaNo}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="amount-cell">{formatAmount(row.given)}</td>
                    <td className="amount-cell">
                      {formatAmount(row.received)}
                    </td>
                    <td className="amount-cell">
                      <span
                        className={`pill ${
                          // eslint-disable-next-line no-nested-ternary
                          row.inHand > 0
                            ? 'pill-orange'
                            : row.inHand < 0
                              ? 'pill-red'
                              : 'pill-green'
                        }`}
                        title={
                          row.inHand < 0
                            ? 'Settled more than given: you owe them'
                            : undefined
                        }
                      >
                        {row.inHand === 0
                          ? 'Settled'
                          : formatAmount(row.inHand)}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={`Settle amount for ${row.employee?.name}`}
                          className="button button-secondary button-small"
                          onClick={() => openNew('received', row.id)}
                          type="button"
                        >
                          Settle
                        </button>
                        <button
                          aria-label={`History for ${row.employee?.name}`}
                          className="button button-secondary button-small"
                          onClick={() => showHistory(row.id)}
                          type="button"
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total · {plural(balanceRows.length, 'worker')}</th>
                  <th className="amount-cell">
                    {formatCurrency(sum(balanceRows.map((row) => row.given)))}
                  </th>
                  <th className="amount-cell">
                    {formatCurrency(
                      sum(balanceRows.map((row) => row.received)),
                    )}
                  </th>
                  <th className="amount-cell">
                    {formatCurrency(sum(balanceRows.map((row) => row.inHand)))}
                  </th>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {view === 'history' && history.length > 0 && (
          <div className="table-scroll">
            <table className="expense-table payroll-table simple-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>WORKER</th>
                  <th>TYPE</th>
                  <th className="amount-cell">AMOUNT</th>
                  <th className="amount-cell">BALANCE AFTER</th>
                  <th>DESCRIPTION, REMARKS &amp; DOCUMENTS</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const employee = byId.get(entry.employeeId);
                  return (
                    <tr key={entry.id}>
                      <td className="date-cell">
                        {formatReportDate(entry.date)}
                      </td>
                      <td>
                        <div className="person-cell">
                          <Avatar name={employee?.name ?? '?'} />
                          <div>
                            <strong>{employee?.name ?? 'Unknown'}</strong>
                            <span>
                              {employee?.projectName || employee?.iqamaNo}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`pill ${entry.kind === 'given' ? 'pill-blue' : 'pill-green'}`}
                        >
                          {PETTY_CASH_KIND_LABELS[entry.kind]}
                        </span>
                      </td>
                      <td className={`amount-cell petty-amount-${entry.kind}`}>
                        {entry.kind === 'given' ? '+' : '−'}
                        {formatAmount(entry.amount)}
                      </td>
                      <td className="amount-cell">
                        {formatAmount(balanceAfter.get(entry.id) ?? 0)}
                      </td>
                      <td className="petty-cash-note">
                        {entry.note && <span>{entry.note}</span>}
                        {entry.remarks && (
                          <span className="petty-cash-remarks">
                            {entry.remarks}
                          </span>
                        )}
                        {entry.attachments.length > 0 && (
                          <div className="petty-cash-files">
                            {entry.attachments.map((attachment) => (
                              <button
                                aria-label={`Open ${attachment.name}`}
                                className="file-chip"
                                disabled={busy}
                                key={attachment.id}
                                onClick={() =>
                                  run(
                                    () =>
                                      api.pettyCash.openAttachment(
                                        attachment.id,
                                      ),
                                    'The file could not be opened.',
                                  )
                                }
                                title={attachment.name}
                                type="button"
                              >
                                📎 {attachment.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {!entry.note &&
                          !entry.remarks &&
                          entry.attachments.length === 0 && (
                            <span className="muted-cell">—</span>
                          )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Edit petty cash for ${employee?.name} on ${entry.date}`}
                            className="button button-secondary button-small"
                            onClick={() =>
                              setDialog({
                                entry,
                                kind: entry.kind,
                                employeeId: entry.employeeId,
                              })
                            }
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            aria-label={`Delete petty cash for ${employee?.name} on ${entry.date}`}
                            className="button button-secondary button-small danger-text"
                            onClick={() => setToDelete(entry)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>
                    Total · {history.length}{' '}
                    {history.length === 1 ? 'entry' : 'entries'}
                  </th>
                  <th className="amount-cell">
                    {formatCurrency(roundMoney(historyGiven - historyReceived))}
                  </th>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {((view === 'balances' && balanceRows.length === 0) ||
          (view === 'history' && history.length === 0)) && (
          <div className="empty-state empty-action">
            <p>
              {entries.length === 0
                ? 'No petty cash yet. Give cash to a worker to start.'
                : 'Nothing matches these filters.'}
            </p>
          </div>
        )}
      </section>

      {dialog && (
        <PettyCashDialog
          entry={dialog.entry}
          defaults={dialog}
          employees={employees}
          balances={balances}
          onClose={() => setDialog(undefined)}
          onSubmit={save}
        />
      )}
      {preview && (
        <ExportPreviewDialog
          title="Petty cash report preview"
          exportLabel="Save as PDF"
          onClose={() => setPreview(undefined)}
          onExport={() => {
            onPrint(preview);
            setPreview(undefined);
          }}
        >
          {preview.content}
        </ExportPreviewDialog>
      )}
      {toDelete && (
        <ConfirmDialog
          id="delete-petty-cash"
          eyebrow="DELETE PETTY CASH"
          title="Delete this petty cash entry?"
          confirmLabel="Delete entry"
          danger
          busy={busy}
          onCancel={() => setToDelete(undefined)}
          onConfirm={() =>
            run(async () => {
              await api.pettyCash.remove(toDelete.id);
              onRemoved(toDelete.id);
              setMessage({ kind: 'ok', text: 'Petty cash entry deleted.' });
            }, 'The entry could not be deleted.').finally(() =>
              setToDelete(undefined),
            )
          }
        >
          {PETTY_CASH_KIND_LABELS[toDelete.kind]}:{' '}
          {formatAmount(toDelete.amount)} for{' '}
          {byId.get(toDelete.employeeId)?.name ?? 'this worker'} on{' '}
          {formatReportDate(toDelete.date)} and its{' '}
          {plural(toDelete.attachments.length, 'file')} will be removed, and the
          balance recalculated.
        </ConfirmDialog>
      )}
    </div>
  );
}
