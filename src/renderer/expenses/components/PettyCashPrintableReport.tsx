import { roundMoney } from '../../../shared/payroll';
import {
  Employee,
  PettyCashBalance,
  PettyCashTransaction,
  formatReportAmount,
  formatReportDate,
} from '../model';
import { PETTY_CASH_KIND_LABELS } from './PettyCashDialog';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintablePettyCashData = {
  /** One worker's statement when the report is filtered to them. */
  worker: Employee | undefined;
  /** e.g. "Date: 01-Oct-2026 – 31-Oct-2026 · Project: Mall" */
  filterSummary: string;
  balances: (PettyCashBalance & { id: string; employee?: Employee })[];
  /** Oldest first, so the balance reads down the page. */
  entries: PettyCashTransaction[];
  balanceAfter: Map<string, number>;
  employees: Map<string, Employee>;
  /** Whether a date range is set (balances still cover every date). */
  dated: boolean;
};

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

const amount = (value: number) => (value ? formatReportAmount(value) : '—');

export default function PettyCashPrintableReport({
  data,
}: {
  data: PrintablePettyCashData;
}) {
  const given = sum(
    data.entries.filter((e) => e.kind === 'given').map((e) => e.amount),
  );
  const received = sum(
    data.entries.filter((e) => e.kind === 'received').map((e) => e.amount),
  );
  const { worker } = data;

  return (
    <article className="standalone-print-report moon-report landscape-report">
      <ReportBrandHeader
        title={worker ? 'PETTY CASH STATEMENT' : 'PETTY CASH REPORT'}
      />
      {worker && (
        <p className="moon-report-worker">
          <strong>{worker.name}</strong>
          {[
            worker.iqamaNo && `Iqama no. ${worker.iqamaNo}`,
            worker.designation,
            worker.projectName,
          ]
            .filter(Boolean)
            .map((item) => ` · ${item}`)}
        </p>
      )}
      {data.filterSummary && (
        <p className="moon-report-filters">{data.filterSummary}</p>
      )}

      <section className="moon-report-section">
        <h2>1. Cash in hand</h2>
        {data.dated && (
          <p className="moon-report-filters">
            Balances are as of today and include every date.
          </p>
        )}
        <table className="moon-report-table moon-report-petty-balances">
          <thead>
            <tr>
              <th className="sl">SL NO</th>
              <th>NAME</th>
              <th>IQAMA NO.</th>
              <th>PROJECT</th>
              <th className="amount">GIVEN</th>
              <th className="amount">SETTLED AMOUNT</th>
              <th className="amount">IN HAND</th>
            </tr>
          </thead>
          <tbody>
            {data.balances.map((row, index) => (
              <tr key={row.id}>
                <td className="sl">{index + 1}</td>
                <td>{row.employee?.name ?? 'Unknown'}</td>
                <td>{row.employee?.iqamaNo || '—'}</td>
                <td>{row.employee?.projectName || '—'}</td>
                <td className="amount">{formatReportAmount(row.given)}</td>
                <td className="amount">{formatReportAmount(row.received)}</td>
                <td
                  className={`amount${row.inHand < 0 ? ' petty-negative' : ''}`}
                >
                  {formatReportAmount(row.inHand)}
                </td>
              </tr>
            ))}
            {data.balances.length === 0 && (
              <tr>
                <td className="empty" colSpan={7}>
                  No workers match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <th colSpan={3}>TOTAL</th>
              <th className="amount">
                {formatReportAmount(sum(data.balances.map((row) => row.given)))}
              </th>
              <th className="amount">
                {formatReportAmount(
                  sum(data.balances.map((row) => row.received)),
                )}
              </th>
              <th className="amount">
                {formatReportAmount(
                  sum(data.balances.map((row) => row.inHand)),
                )}
              </th>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="moon-report-section">
        <h2>2. Transactions</h2>
        <table className="moon-report-table moon-report-petty-entries">
          <thead>
            <tr>
              <th className="sl">SL NO</th>
              <th>DATE</th>
              {!worker && <th>WORKER</th>}
              <th>TYPE</th>
              <th className="amount">GIVEN</th>
              <th className="amount">SETTLED AMOUNT</th>
              <th className="amount">BALANCE</th>
              <th>DESCRIPTION &amp; REMARKS</th>
              <th>DOCUMENTS</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry, index) => (
              <tr key={entry.id}>
                <td className="sl">{index + 1}</td>
                <td>{formatReportDate(entry.date)}</td>
                {!worker && (
                  <td>{data.employees.get(entry.employeeId)?.name ?? '—'}</td>
                )}
                <td>{PETTY_CASH_KIND_LABELS[entry.kind]}</td>
                <td className="amount">
                  {amount(entry.kind === 'given' ? entry.amount : 0)}
                </td>
                <td className="amount">
                  {amount(entry.kind === 'received' ? entry.amount : 0)}
                </td>
                <td className="amount">
                  {formatReportAmount(data.balanceAfter.get(entry.id) ?? 0)}
                </td>
                <td className="petty-remarks">
                  {entry.note || (!entry.remarks && '—')}
                  {entry.remarks && (
                    <span className="petty-remarks-text">
                      Remarks: {entry.remarks}
                    </span>
                  )}
                </td>
                <td className="petty-documents">
                  {entry.attachments.length
                    ? entry.attachments.map((file) => file.name).join(', ')
                    : '—'}
                </td>
              </tr>
            ))}
            {data.entries.length === 0 && (
              <tr>
                <td className="empty" colSpan={worker ? 8 : 9}>
                  No petty cash entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <th colSpan={worker ? 2 : 3}>
                TOTAL · {data.entries.length}{' '}
                {data.entries.length === 1 ? 'ENTRY' : 'ENTRIES'}
              </th>
              <th className="amount">{formatReportAmount(given)}</th>
              <th className="amount">{formatReportAmount(received)}</th>
              <th className="amount">
                NET {formatReportAmount(roundMoney(given - received))}
              </th>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </section>
    </article>
  );
}
