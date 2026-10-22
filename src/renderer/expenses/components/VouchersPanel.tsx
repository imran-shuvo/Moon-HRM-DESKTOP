import { useEffect, useMemo, useState } from 'react';
import { roundMoney } from '../../../shared/payroll';
import { errorMessage, useFinanceApi } from '../../data/FinanceApiContext';
import {
  Employee,
  PettyCashVoucher,
  PettyCashVoucherInput,
  VoucherPage,
  distinctValues,
  employeeNames,
  fileTimestamp,
  formatAmount,
  formatCurrency,
  formatReportDate,
  inDateRange,
  matchesAny,
  nextVoucherRefNo,
  plural,
  todayKey,
  voucherTotals,
} from '../model';
import ConfirmDialog from './ConfirmDialog';
import ExportPreviewDialog from './ExportPreviewDialog';
import FilterBar, {
  DateRangeFilter,
  dateChip,
  multiChips,
  searchChip,
  summarizeChips,
  useSessionState,
} from './FilterBar';
import MultiSelectFilter, { countBy } from './MultiSelectFilter';
import VoucherEditor from './VoucherEditor';
import VoucherPrintableReport, {
  VoucherListPrintableReport,
} from './VoucherPrintableReport';
import { Avatar } from './peopleUi';
import { PrintJob } from './printJob';

type Filters = {
  search: string;
  from: string;
  to: string;
  employees: string[];
};

const NO_FILTERS: Filters = { search: '', from: '', to: '', employees: [] };

/** On the voucher list page: the list, one voucher, or editing one. */
type Mode =
  | { kind: 'list' }
  | { kind: 'view'; id: string }
  | { kind: 'edit'; id: string };

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

const slug = (value: string) =>
  value
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

/** Who has signed a voucher off, e.g. "Approved · Gobi Krishnan". */
function signOff(voucher: PettyCashVoucher) {
  if (voucher.approvedBy) {
    return { label: `Approved · ${voucher.approvedBy}`, pill: 'pill-green' };
  }
  if (voucher.verifiedBy) {
    return { label: `Verified · ${voucher.verifiedBy}`, pill: 'pill-blue' };
  }
  return { label: 'Not verified', pill: 'pill-orange' };
}

/**
 * Petty cash vouchers: the voucher list (open one to see, print, edit or
 * delete it) and the page for creating a voucher.
 */
export default function VouchersPanel({
  page,
  visit,
  onPageChange,
  vouchers,
  employees,
  onSaved,
  onRemoved,
  onPrint,
}: {
  page: VoucherPage;
  /** Changes each time a voucher page is chosen in the sidebar. */
  visit: number;
  onPageChange: (page: VoucherPage) => void;
  vouchers: PettyCashVoucher[];
  employees: Employee[];
  onSaved: (voucher: PettyCashVoucher) => void;
  onRemoved: (id: string) => void;
  /** Saves the report as a PDF. */
  onPrint: (job: PrintJob) => void;
}) {
  const api = useFinanceApi();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [filters, setFilters] = useSessionState('vouchers', NO_FILTERS);
  const set = (change: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const [preview, setPreview] = useState<PrintJob>();
  const [toDelete, setToDelete] = useState<PettyCashVoucher>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();

  // Choosing Voucher list in the sidebar goes back to the list.
  useEffect(() => setMode({ kind: 'list' }), [visit]);

  const byId = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );
  const employeeOf = (voucher: PettyCashVoucher) =>
    voucher.employeeId ? byId.get(voucher.employeeId) : undefined;

  const employeeIds = distinctValues(
    vouchers.map((voucher) => voucher.employeeId ?? ''),
  ).sort((a, b) =>
    (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? ''),
  );
  const employeeLabels = Object.fromEntries(
    employeeIds.map((id) => [id, byId.get(id)?.name ?? 'Unknown']),
  );

  const needle = filters.search.trim().toLowerCase();
  const shown = vouchers
    .filter((voucher) => {
      const employee = employeeOf(voucher);
      return (
        inDateRange(voucher.date, filters.from, filters.to) &&
        matchesAny(filters.employees, voucher.employeeId ?? '') &&
        (!needle ||
          [
            voucher.refNo,
            employee?.name ?? '',
            employee?.iqamaNo ?? '',
            voucher.createdBy,
            voucher.verifiedBy,
            voucher.approvedBy,
            ...voucher.receipts.map((receipt) => receipt.receivedFrom),
            ...voucher.sections.flatMap((section) => [
              section.title,
              ...section.lines.flatMap((line) => [
                line.particulars,
                line.supplier,
                line.invoiceNo,
              ]),
            ]),
          ].some((value) => value.toLowerCase().includes(needle)))
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const rows = shown.map((voucher) => ({
    voucher,
    ...voucherTotals(voucher),
  }));

  const chips = [
    ...searchChip(filters.search, (search) => set({ search })),
    ...dateChip(filters, (range) => set(range)),
    ...multiChips('Employee', filters.employees, employeeLabels, (v) =>
      set({ employees: v }),
    ),
  ];

  const voucherJob = (voucher: PettyCashVoucher): PrintJob => ({
    fileName: `petty-cash-voucher_${slug(voucher.refNo) || voucher.date}_${fileTimestamp(new Date())}`,
    landscape: true,
    content: (
      <VoucherPrintableReport
        voucher={voucher}
        employee={employeeOf(voucher)}
      />
    ),
  });
  const listJob = (): PrintJob => ({
    fileName: `petty-cash-vouchers_${fileTimestamp(new Date())}`,
    landscape: true,
    content: (
      <VoucherListPrintableReport
        vouchers={[...shown].reverse()}
        employees={byId}
        filterSummary={summarizeChips(chips)}
      />
    ),
  });

  const save = async (input: PettyCashVoucherInput) => {
    const editing = page === 'vouchers' && mode.kind === 'edit' ? mode.id : '';
    const saved = editing
      ? await api.vouchers.update(editing, input)
      : await api.vouchers.create(input);
    onSaved(saved);
    // Show the saved voucher on the voucher list page.
    setMode({ kind: 'view', id: saved.id });
    onPageChange('vouchers');
    setMessage({
      kind: 'ok',
      text: editing
        ? `Voucher ${saved.refNo} updated.`
        : `Voucher ${saved.refNo} created.`,
    });
  };

  const remove = async (voucher: PettyCashVoucher) => {
    setBusy(true);
    try {
      await api.vouchers.remove(voucher.id);
      onRemoved(voucher.id);
      setMode({ kind: 'list' });
      setMessage({ kind: 'ok', text: `Voucher ${voucher.refNo} deleted.` });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: errorMessage(error, 'The voucher could not be deleted.'),
      });
    } finally {
      setBusy(false);
      setToDelete(undefined);
    }
  };

  const messageBar = message && (
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
  );

  const editor = (voucher: PettyCashVoucher | undefined) => (
    <VoucherEditor
      key={voucher?.id ?? `new-${visit}`}
      voucher={voucher}
      defaultRefNo={nextVoucherRefNo(vouchers, todayKey())}
      employees={employees}
      names={employeeNames(employees)}
      senders={distinctValues([
        ...vouchers.flatMap((item) =>
          item.receipts.map((receipt) => receipt.receivedFrom),
        ),
        ...employeeNames(employees),
      ])}
      onCancel={() => {
        if (voucher) setMode({ kind: 'view', id: voucher.id });
        else onPageChange('vouchers');
      }}
      onSubmit={save}
    />
  );

  const selected =
    mode.kind === 'list'
      ? undefined
      : vouchers.find((voucher) => voucher.id === mode.id);

  let body;
  if (page === 'new-voucher') {
    body = editor(undefined);
  } else if (mode.kind === 'edit' && selected) {
    body = editor(selected);
  } else if (mode.kind === 'view' && selected) {
    const totals = voucherTotals(selected);
    const employee = employeeOf(selected);
    body = (
      <>
        <div className="payroll-header">
          <button
            className="button button-secondary"
            onClick={() => setMode({ kind: 'list' })}
            type="button"
          >
            ← Voucher list
          </button>
          <button
            className="button button-secondary push-right"
            onClick={() => setPreview(voucherJob(selected))}
            type="button"
          >
            🖨 Preview
          </button>
          <button
            className="button button-secondary"
            onClick={() => onPrint(voucherJob(selected))}
            type="button"
          >
            ⤓ Save as PDF
          </button>
          <button
            className="button button-secondary"
            onClick={() => setMode({ kind: 'edit', id: selected.id })}
            type="button"
          >
            Edit
          </button>
          <button
            className="button button-secondary danger-text"
            onClick={() => setToDelete(selected)}
            type="button"
          >
            Delete
          </button>
        </div>
        <div
          aria-label={`Totals for voucher ${selected.refNo}`}
          className="payroll-totals petty-cash-totals"
        >
          <div>
            <span>Employee</span>
            <strong className="voucher-signoff-status">
              {employee?.name ?? 'No employee chosen'}
            </strong>
            <small>{formatReportDate(selected.date)}</small>
          </div>
          <div>
            <span>Received</span>
            <strong>{formatCurrency(totals.received)}</strong>
            <small>{plural(selected.receipts.length, 'amount')} received</small>
          </div>
          <div>
            <span>Spent</span>
            <strong>{formatCurrency(totals.spent)}</strong>
            <small>
              {plural(totals.lines, 'line')} in{' '}
              {plural(selected.sections.length, 'section')}
            </small>
          </div>
          <div className={totals.balance < 0 ? 'total-unpaid' : 'total-paid'}>
            <span>Balance</span>
            <strong>{formatCurrency(totals.balance)}</strong>
            <small>{signOff(selected).label}</small>
          </div>
        </div>
        {messageBar}
        <div
          aria-label={`Voucher ${selected.refNo}`}
          className="export-preview-content voucher-sheet"
          role="document"
        >
          <VoucherPrintableReport voucher={selected} employee={employee} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="payroll-header">
          <button
            className="button button-secondary push-right"
            disabled={shown.length === 0}
            onClick={() => setPreview(listJob())}
            type="button"
          >
            🖨 Preview list
          </button>
          <button
            className="button button-secondary"
            disabled={shown.length === 0}
            onClick={() => onPrint(listJob())}
            type="button"
          >
            ⤓ Save list as PDF
          </button>
          <button
            className="button button-primary"
            onClick={() => onPageChange('new-voucher')}
            type="button"
          >
            + Create voucher
          </button>
        </div>

        <FilterBar
          searchId="voucher-search"
          searchLabel="Search vouchers"
          searchPlaceholder="Search voucher no., employee, bill or name"
          search={filters.search}
          onSearchChange={(search) => set({ search })}
          chips={chips}
          shown={shown.length}
          total={vouchers.length}
          noun="vouchers"
          onClearAll={() => setFilters(NO_FILTERS)}
        >
          <DateRangeFilter
            id="voucher-dates"
            label="Date"
            fromLabel="Vouchers from date"
            toLabel="Vouchers to date"
            value={filters}
            onChange={(range) => set(range)}
          />
          <MultiSelectFilter
            id="voucher-employee"
            label="Employee"
            allLabel="All employees"
            options={employeeIds}
            labels={employeeLabels}
            counts={countBy(vouchers, (voucher) => voucher.employeeId ?? '')}
            selected={filters.employees}
            onChange={(v) => set({ employees: v })}
          />
        </FilterBar>

        {messageBar}

        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="expense-table payroll-table simple-table voucher-list">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>VOUCHER NO.</th>
                  <th>EMPLOYEE</th>
                  <th className="amount-cell">RECEIVED</th>
                  <th className="amount-cell">SPENT</th>
                  <th className="amount-cell">BALANCE</th>
                  <th>SIGN-OFF</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ voucher, lines, received, spent, balance }) => {
                  const status = signOff(voucher);
                  const employee = employeeOf(voucher);
                  return (
                    <tr
                      className="clickable-row"
                      key={voucher.id}
                      onClick={() => setMode({ kind: 'view', id: voucher.id })}
                    >
                      <td className="date-cell">
                        {formatReportDate(voucher.date)}
                      </td>
                      <td>
                        <button
                          className="link-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMode({ kind: 'view', id: voucher.id });
                          }}
                          type="button"
                        >
                          {voucher.refNo}
                        </button>
                        <span className="voucher-list-detail">
                          {plural(voucher.sections.length, 'section')} ·{' '}
                          {plural(lines, 'line')}
                        </span>
                      </td>
                      <td>
                        {employee ? (
                          <div className="person-cell">
                            <Avatar name={employee.name} />
                            <div>
                              <strong>{employee.name}</strong>
                              <span>
                                {employee.projectName || employee.iqamaNo}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="muted-cell">—</span>
                        )}
                      </td>
                      <td className="amount-cell">{formatAmount(received)}</td>
                      <td className="amount-cell">{formatAmount(spent)}</td>
                      <td
                        className={`amount-cell${balance < 0 ? ' voucher-negative' : ''}`}
                      >
                        {formatAmount(balance)}
                      </td>
                      <td>
                        <span className={`pill ${status.pill}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Edit voucher ${voucher.refNo}`}
                            className="button button-secondary button-small"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMode({ kind: 'edit', id: voucher.id });
                            }}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            aria-label={`Delete voucher ${voucher.refNo}`}
                            className="button button-secondary button-small danger-text"
                            onClick={(event) => {
                              event.stopPropagation();
                              setToDelete(voucher);
                            }}
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
                  <th colSpan={3}>Total · {plural(rows.length, 'voucher')}</th>
                  <th className="amount-cell">
                    {formatCurrency(sum(rows.map((row) => row.received)))}
                  </th>
                  <th className="amount-cell">
                    {formatCurrency(sum(rows.map((row) => row.spent)))}
                  </th>
                  <th className="amount-cell">
                    {formatCurrency(sum(rows.map((row) => row.balance)))}
                  </th>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="empty-state empty-action">
            <p>
              {vouchers.length === 0
                ? 'No vouchers yet. Create one to record the bills paid from petty cash.'
                : 'Nothing matches these filters.'}
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="people-section petty-cash">
      <section className="panel people-panel">{body}</section>

      {preview && (
        <ExportPreviewDialog
          title="Voucher preview"
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
          id="delete-voucher"
          eyebrow="DELETE VOUCHER"
          title={`Delete voucher ${toDelete.refNo}?`}
          confirmLabel="Delete voucher"
          danger
          busy={busy}
          onCancel={() => setToDelete(undefined)}
          onConfirm={() => remove(toDelete)}
        >
          The voucher dated {formatReportDate(toDelete.date)} and its{' '}
          {plural(voucherTotals(toDelete).lines, 'line')} will be removed.
        </ConfirmDialog>
      )}
    </div>
  );
}
