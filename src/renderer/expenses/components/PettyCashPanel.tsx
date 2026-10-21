import { useMemo, useState } from 'react';
import {
  formatMonthName,
  monthKey,
  previousMonthKey,
} from '../../../shared/months';
import { roundMoney } from '../../../shared/payroll';
import {
  AttachmentUpload,
  PettyCashInput,
  PettyCashKind,
} from '../../../shared/types';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  Employee,
  PettyCashSection,
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
  pettyCashMonthBalances,
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
import { Avatar, MonthNavigator } from './peopleUi';
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

type Status = 'holding' | 'settled' | 'owed';

const STATUS_LABELS: Record<Status, string> = {
  holding: 'Holding cash',
  settled: 'Fully settled',
  owed: 'Settled more than given',
};

const STATUS_OPTIONS: Status[] = ['holding', 'settled', 'owed'];

const statusOf = (inHand: number): Status => {
  if (inHand > 0) return 'holding';
  return inHand < 0 ? 'owed' : 'settled';
};

type Filters = {
  search: string;
  from: string;
  to: string;
  workers: string[];
  projects: string[];
  statuses: string[];
};

const NO_FILTERS: Filters = {
  search: '',
  from: '',
  to: '',
  workers: [],
  projects: [],
  statuses: [],
};

const FILE_NAMES: Record<PettyCashSection, string> = {
  given: 'petty-cash-given',
  received: 'petty-cash-settlements',
  balances: 'petty-cash-in-hand',
};

/**
 * One page of petty cash for a month: cash given to workers, the amounts
 * they settle (with vouchers), or what each holds. What a worker still
 * holds when a month ends is carried into the next month.
 */
export default function PettyCashPanel({
  view,
  employees,
  entries,
  isDateClosed,
  onSaved,
  onRemoved,
  onPrint,
}: {
  /** The page chosen under Petty Cash in the sidebar. */
  view: PettyCashSection;
  employees: Employee[];
  entries: PettyCashTransaction[];
  /** Whether a YYYY-MM-DD date is in a closed month. */
  isDateClosed: (date: string) => boolean;
  onSaved: (entry: PettyCashTransaction) => void;
  onRemoved: (id: string) => void;
  /** Saves the report as a PDF. */
  onPrint: (job: PrintJob) => void;
}) {
  const api = useFinanceApi();
  /** Cash in hand report: every column, or only each worker's amount. */
  const [inHandOnly, setInHandOnly] = useState(false);
  const [month, setMonthState] = useState(monthKey());
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

  /** A date range belongs to one month, so it is cleared with the month. */
  const setMonth = (next: string) => {
    setMonthState(next);
    set({ from: '', to: '' });
  };

  const current = month === monthKey();
  const monthName = formatMonthName(month);
  const previousName = formatMonthName(previousMonthKey(month));
  const closed = isDateClosed(`${month}-01`);
  const isEntryTab = view !== 'balances';

  const byId = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const balances = useMemo(() => pettyCashBalances(entries), [entries]);
  const monthBalances = useMemo(
    () => pettyCashMonthBalances(entries, month),
    [entries, month],
  );
  const balanceAfter = useMemo(
    () => pettyCashRunningBalances(entries),
    [entries],
  );
  const monthEntries = entries.filter(
    (entry) => entry.date.slice(0, 7) === month,
  );
  const tabEntries = monthEntries.filter((entry) => entry.kind === view);

  const workerIds = [...monthBalances.keys()].sort((a, b) =>
    (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''),
  );
  const workerLabels = Object.fromEntries(
    workerIds.map((id) => [id, byId.get(id)?.name ?? 'Unknown']),
  );
  const projects = distinctValues(
    workerIds.map((id) => byId.get(id)?.projectName ?? ''),
  );

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
  const shownEntries = tabEntries
    .filter(
      (entry) =>
        inDateRange(entry.date, filters.from, filters.to) &&
        matchesWorker(entry.employeeId, [entry.note, entry.remarks]),
    )
    .sort((a, b) => byPettyCashOrder(b, a));

  const rowFor = (id: string) => ({
    id,
    employee: byId.get(id),
    ...monthBalances.get(id)!,
  });
  /** Workers in the filters, whatever their status: the totals use these. */
  const scopeRows = workerIds.filter((id) => matchesWorker(id)).map(rowFor);
  const balanceRows = scopeRows
    .filter((row) => matchesAny(filters.statuses, statusOf(row.inHand)))
    .sort((a, b) => b.inHand - a.inHand);

  const totals = {
    carried: sum(scopeRows.map((row) => row.carried)),
    given: sum(scopeRows.map((row) => row.given)),
    received: sum(scopeRows.map((row) => row.received)),
    inHand: sum(scopeRows.map((row) => row.inHand)),
  };
  const holding = scopeRows.filter((row) => row.inHand > 0).length;

  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...(isEntryTab ? dateChip(filters, (range) => set(range)) : []),
    ...multiChips('Worker', filters.workers, workerLabels, (v) =>
      set({ workers: v }),
    ),
    ...multiChips('Project', filters.projects, selfLabels(projects), (v) =>
      set({ projects: v }),
    ),
    ...(isEntryTab
      ? []
      : multiChips(
          'Status',
          filters.statuses,
          STATUS_LABELS as Record<string, string>,
          (v) => set({ statuses: v }),
        )),
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
    // Show the saved entry in its month.
    if (saved.date.slice(0, 7) !== month) setMonth(saved.date.slice(0, 7));
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

  /**
   * The report prints what is on screen. Filtered to one worker, or for
   * the worker in `statementFor`, Cash in hand is that worker's statement,
   * unless the report shows only what each worker holds.
   */
  const reportJob = (statementFor?: string): PrintJob => {
    const workerId =
      statementFor ?? (filters.workers.length === 1 ? filters.workers[0] : '');
    const worker = byId.get(workerId);
    const section = statementFor ? 'balances' : view;
    const summary = !statementFor && view === 'balances' && inHandOnly;
    let reportEntries: PettyCashTransaction[] = [];
    if (section !== 'balances') reportEntries = shownEntries;
    else if (worker && !summary) {
      reportEntries = monthEntries.filter((e) => e.employeeId === worker.id);
    }
    const name = worker
      ? `_${worker.name.replace(/[^\w-]+/g, '-').toLowerCase()}`
      : '';
    return {
      fileName: `${FILE_NAMES[section]}${summary ? '-only' : ''}_${month}${name}_${fileTimestamp(new Date())}`,
      landscape: true,
      content: (
        <PettyCashPrintableReport
          data={{
            section,
            summary,
            month,
            current,
            worker,
            filterSummary: statementFor
              ? ''
              : summarizeChips(
                  worker
                    ? chips.filter((chip) => !chip.key.startsWith('Worker:'))
                    : chips,
                ),
            balances: statementFor ? [rowFor(statementFor)] : balanceRows,
            entries: [...reportEntries].sort(byPettyCashOrder),
            balanceAfter,
            employees: byId,
          }}
        />
      ),
    };
  };

  const hasReport = isEntryTab ? tabEntries.length > 0 : workerIds.length > 0;
  const shown = isEntryTab ? shownEntries.length : balanceRows.length;
  const emptyText = () => {
    if (shown === 0 && (isEntryTab ? tabEntries : workerIds).length > 0) {
      return 'Nothing matches these filters.';
    }
    if (view === 'given') return `No cash given in ${monthName}.`;
    if (view === 'received') return `No settlements in ${monthName}.`;
    return `No worker held petty cash in ${monthName}.`;
  };

  return (
    <div className="people-section petty-cash">
      <section className="panel people-panel">
        <div className="payroll-header">
          <MonthNavigator
            id="petty-cash-month"
            value={month}
            onChange={setMonth}
          />
          {view === 'balances' && (
            <div
              aria-label="Report shows"
              className="segmented report-toggle push-right"
              role="radiogroup"
            >
              {[
                { value: false, label: 'Full report' },
                { value: true, label: 'In hand only' },
              ].map((option) => (
                <button
                  aria-checked={inHandOnly === option.value}
                  className={inHandOnly === option.value ? 'active' : undefined}
                  key={option.label}
                  onClick={() => setInHandOnly(option.value)}
                  role="radio"
                  title={
                    option.value
                      ? "Only each worker's name and the cash they hold"
                      : 'Carried, given, settled and in hand'
                  }
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <button
            className={`button button-secondary${view === 'balances' ? '' : ' push-right'}`}
            disabled={!hasReport}
            onClick={() => setPreview(reportJob())}
            type="button"
          >
            🖨 Preview
          </button>
          <button
            className="button button-secondary"
            disabled={!hasReport}
            onClick={() => onPrint(reportJob())}
            type="button"
          >
            ⤓ Save as PDF
          </button>
          {view === 'given' && (
            <button
              className="button button-primary"
              disabled={employees.length === 0}
              onClick={() => openNew('given')}
              type="button"
            >
              ↑ Give cash
            </button>
          )}
          {view === 'received' && (
            <button
              className="button button-primary"
              disabled={employees.length === 0}
              onClick={() => openNew('received')}
              type="button"
            >
              ↓ Record settlement
            </button>
          )}
        </div>

        <div
          aria-label={`Petty cash totals for ${monthName}`}
          className="payroll-totals petty-cash-totals"
        >
          <div>
            <span>Carried from {previousName}</span>
            <strong>{formatCurrency(totals.carried)}</strong>
            <small>In hand when {monthName} began</small>
          </div>
          <div>
            <span>Given in {monthName}</span>
            <strong>{formatCurrency(totals.given)}</strong>
            <small>Cash handed to workers</small>
          </div>
          <div className="total-paid">
            <span>Settled in {monthName}</span>
            <strong>{formatCurrency(totals.received)}</strong>
            <small>Vouchers and cash returned</small>
          </div>
          <div className="total-unpaid">
            <span>
              {current ? 'In hand now' : `In hand end of ${monthName}`}
            </span>
            <strong>{formatCurrency(totals.inHand)}</strong>
            <small>
              {plural(holding, 'worker')} holding cash
              {current ? '' : ' · carried forward'}
            </small>
          </div>
        </div>

        {closed && (
          <p className="closed-note petty-cash-closed">
            {monthName} is closed, so its entries can&apos;t be changed. What
            each worker held at its end was carried into the next month. Reopen
            it in Settings → Month closing to correct it.
          </p>
        )}

        <FilterBar
          searchId="petty-cash-search"
          searchLabel="Search petty cash"
          searchPlaceholder={
            isEntryTab ? 'Search name, Iqama or note' : 'Search name or Iqama'
          }
          search={filters.search}
          onSearchChange={(search) => set({ search })}
          chips={chips}
          shown={shown}
          total={isEntryTab ? tabEntries.length : workerIds.length}
          noun={isEntryTab ? 'entries' : 'workers'}
          onClearAll={() => setFilters(NO_FILTERS)}
        >
          {isEntryTab && (
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
            counts={
              isEntryTab ? countBy(tabEntries, (entry) => entry.employeeId) : {}
            }
            selected={filters.workers}
            onChange={(v) => set({ workers: v })}
          />
          <MultiSelectFilter
            id="petty-cash-project"
            label="Project"
            allLabel="All projects"
            options={projects}
            labels={selfLabels(projects)}
            counts={
              isEntryTab
                ? countBy(
                    tabEntries,
                    (entry) => byId.get(entry.employeeId)?.projectName ?? '',
                  )
                : countBy(workerIds, (id) => byId.get(id)?.projectName ?? '')
            }
            selected={filters.projects}
            onChange={(v) => set({ projects: v })}
          />
          {!isEntryTab && (
            <MultiSelectFilter
              id="petty-cash-status"
              label="Status"
              allLabel="Any status"
              options={STATUS_OPTIONS}
              labels={STATUS_LABELS}
              counts={countBy(workerIds, (id) =>
                statusOf(monthBalances.get(id)!.inHand),
              )}
              selected={filters.statuses as Status[]}
              onChange={(v) => set({ statuses: v })}
            />
          )}
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

        {!isEntryTab && balanceRows.length > 0 && (
          <div className="table-scroll">
            <table className="expense-table payroll-table simple-table">
              <thead>
                <tr>
                  <th>WORKER</th>
                  <th className="amount-cell">
                    CARRIED FROM {previousName.toUpperCase()}
                  </th>
                  <th className="amount-cell">GIVEN</th>
                  <th className="amount-cell">SETTLED AMOUNT</th>
                  <th className="amount-cell">
                    {current ? 'IN HAND NOW' : 'IN HAND AT MONTH END'}
                  </th>
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
                    <td className="amount-cell">{formatAmount(row.carried)}</td>
                    <td className="amount-cell">{formatAmount(row.given)}</td>
                    <td className="amount-cell">
                      {formatAmount(row.received)}
                    </td>
                    <td className="amount-cell">
                      <span
                        className={`pill ${
                          {
                            holding: 'pill-orange',
                            owed: 'pill-red',
                            settled: 'pill-green',
                          }[statusOf(row.inHand)]
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
                        {current && (
                          <button
                            aria-label={`Settle amount for ${row.employee?.name}`}
                            className="button button-secondary button-small"
                            onClick={() => openNew('received', row.id)}
                            type="button"
                          >
                            Settle
                          </button>
                        )}
                        <button
                          aria-label={`Statement for ${row.employee?.name}`}
                          className="button button-secondary button-small"
                          onClick={() => setPreview(reportJob(row.id))}
                          type="button"
                        >
                          Statement
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
                    {formatCurrency(sum(balanceRows.map((row) => row.carried)))}
                  </th>
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

        {isEntryTab && shownEntries.length > 0 && (
          <div className="table-scroll">
            <table className="expense-table payroll-table simple-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>WORKER</th>
                  <th className="amount-cell">
                    {view === 'given' ? 'GIVEN' : 'SETTLED AMOUNT'}
                  </th>
                  <th className="amount-cell">BALANCE AFTER</th>
                  <th>
                    {view === 'given'
                      ? 'DESCRIPTION, REMARKS & DOCUMENTS'
                      : 'DESCRIPTION, REMARKS & VOUCHERS'}
                  </th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownEntries.map((entry) => {
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
                      <td className={`amount-cell petty-amount-${entry.kind}`}>
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
                        {!isDateClosed(entry.date) && (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>
                    Total · {shownEntries.length}{' '}
                    {shownEntries.length === 1 ? 'entry' : 'entries'}
                  </th>
                  <th className="amount-cell">
                    {formatCurrency(sum(shownEntries.map((e) => e.amount)))}
                  </th>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {shown === 0 && (
          <div className="empty-state empty-action">
            <p>
              {entries.length === 0
                ? 'No petty cash yet. Give cash to a worker to start.'
                : emptyText()}
            </p>
          </div>
        )}
      </section>

      {dialog && (
        <PettyCashDialog
          entry={dialog.entry}
          kind={dialog.kind}
          defaultEmployeeId={dialog.employeeId}
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
