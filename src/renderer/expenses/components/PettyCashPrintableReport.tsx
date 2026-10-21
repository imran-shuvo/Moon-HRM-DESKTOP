import { formatMonthName, previousMonthKey } from '../../../shared/months';
import { roundMoney } from '../../../shared/payroll';
import {
  Employee,
  PettyCashKind,
  PettyCashMonthBalance,
  PettyCashSection,
  PettyCashTransaction,
  formatReportAmount,
  formatReportDate,
} from '../model';
import { PETTY_CASH_KIND_LABELS } from './PettyCashDialog';
import ReportBrandHeader from './ReportBrandHeader';

export type PrintablePettyCashData = {
  section: PettyCashSection;
  /** Cash in hand with only each worker's name and amount. */
  summary?: boolean;
  /** 'YYYY-MM' */
  month: string;
  /** Whether `month` is the current one, so "in hand" means today. */
  current: boolean;
  /** One worker's report when it is filtered to them. */
  worker: Employee | undefined;
  /** e.g. "Date: 01-Oct-2026 – 15-Oct-2026 · Project: Mall" */
  filterSummary: string;
  balances: (PettyCashMonthBalance & { id: string; employee?: Employee })[];
  /** The month's entries, oldest first, so the balance reads down the page. */
  entries: PettyCashTransaction[];
  balanceAfter: Map<string, number>;
  employees: Map<string, Employee>;
};

const TITLES: Record<PettyCashSection, string> = {
  given: 'PETTY CASH GIVEN',
  received: 'PETTY CASH SETTLEMENTS',
  balances: 'PETTY CASH IN HAND',
};

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

const amount = (value: number) => (value ? formatReportAmount(value) : '—');

function Remarks({ entry }: { entry: PettyCashTransaction }) {
  return (
    <td className="petty-remarks">
      {entry.note || (!entry.remarks && '—')}
      {entry.remarks && (
        <span className="petty-remarks-text">Remarks: {entry.remarks}</span>
      )}
    </td>
  );
}

function Documents({ entry }: { entry: PettyCashTransaction }) {
  return (
    <td className="petty-documents">
      {entry.attachments.length
        ? entry.attachments.map((file) => file.name).join(', ')
        : '—'}
    </td>
  );
}

/** Cash given or settled in the month, one row per entry. */
function EntriesTable({
  data,
  kind,
}: {
  data: PrintablePettyCashData;
  kind: PettyCashKind;
}) {
  const { worker } = data;
  const columns = worker ? 6 : 8;
  return (
    <table className="moon-report-table moon-report-petty-entries">
      <thead>
        <tr>
          <th className="sl">SL NO</th>
          <th>DATE</th>
          {!worker && <th>WORKER</th>}
          {!worker && <th>PROJECT</th>}
          <th className="amount">
            {kind === 'given' ? 'GIVEN' : 'SETTLED AMOUNT'}
          </th>
          <th className="amount">BALANCE AFTER</th>
          <th>REMARKS</th>
          <th>{kind === 'given' ? 'DOCUMENTS' : 'VOUCHERS'}</th>
        </tr>
      </thead>
      <tbody>
        {data.entries.map((entry, index) => {
          const employee = data.employees.get(entry.employeeId);
          return (
            <tr key={entry.id}>
              <td className="sl">{index + 1}</td>
              <td>{formatReportDate(entry.date)}</td>
              {!worker && <td>{employee?.name ?? '—'}</td>}
              {!worker && <td>{employee?.projectName || '—'}</td>}
              <td className="amount">{formatReportAmount(entry.amount)}</td>
              <td className="amount">
                {formatReportAmount(data.balanceAfter.get(entry.id) ?? 0)}
              </td>
              <Remarks entry={entry} />
              <Documents entry={entry} />
            </tr>
          );
        })}
        {data.entries.length === 0 && (
          <tr>
            <td className="empty" colSpan={columns}>
              {kind === 'given'
                ? 'No cash given matches these filters.'
                : 'No settlements match these filters.'}
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td />
          <th colSpan={worker ? 1 : 3}>
            TOTAL · {data.entries.length}{' '}
            {data.entries.length === 1 ? 'ENTRY' : 'ENTRIES'}
          </th>
          <th className="amount">
            {formatReportAmount(sum(data.entries.map((e) => e.amount)))}
          </th>
          <td colSpan={3} />
        </tr>
      </tfoot>
    </table>
  );
}

/** One worker's month: carried in, each entry, and what they hold after. */
function StatementTable({ data }: { data: PrintablePettyCashData }) {
  const carried = data.balances[0]?.carried ?? 0;
  const given = sum(
    data.entries.filter((e) => e.kind === 'given').map((e) => e.amount),
  );
  const received = sum(
    data.entries.filter((e) => e.kind === 'received').map((e) => e.amount),
  );
  return (
    <table className="moon-report-table moon-report-petty-entries">
      <thead>
        <tr>
          <th className="sl">SL NO</th>
          <th>DATE</th>
          <th>TYPE</th>
          <th className="amount">GIVEN</th>
          <th className="amount">SETTLED AMOUNT</th>
          <th className="amount">BALANCE</th>
          <th>REMARKS</th>
          <th>DOCUMENTS</th>
        </tr>
      </thead>
      <tbody>
        <tr className="petty-carried-row">
          <td className="sl" />
          <td>{formatReportDate(`${data.month}-01`)}</td>
          <td colSpan={3}>
            Carried from {formatMonthName(previousMonthKey(data.month))}
          </td>
          <td className="amount">{formatReportAmount(carried)}</td>
          <td colSpan={2} />
        </tr>
        {data.entries.map((entry, index) => (
          <tr key={entry.id}>
            <td className="sl">{index + 1}</td>
            <td>{formatReportDate(entry.date)}</td>
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
            <Remarks entry={entry} />
            <Documents entry={entry} />
          </tr>
        ))}
        {data.entries.length === 0 && (
          <tr>
            <td className="empty" colSpan={8}>
              No petty cash entries in {formatMonthName(data.month)}.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td />
          <th colSpan={2}>
            TOTAL · {data.entries.length}{' '}
            {data.entries.length === 1 ? 'ENTRY' : 'ENTRIES'}
          </th>
          <th className="amount">{formatReportAmount(given)}</th>
          <th className="amount">{formatReportAmount(received)}</th>
          <th className="amount">
            IN HAND {formatReportAmount(roundMoney(carried + given - received))}
          </th>
          <td colSpan={2} />
        </tr>
      </tfoot>
    </table>
  );
}

function BalancesTable({ data }: { data: PrintablePettyCashData }) {
  const previous = formatMonthName(previousMonthKey(data.month)).toUpperCase();
  const total = (pick: (row: PettyCashMonthBalance) => number) =>
    formatReportAmount(sum(data.balances.map(pick)));
  return (
    <table className="moon-report-table moon-report-petty-balances">
      <thead>
        <tr>
          <th className="sl">SL NO</th>
          <th>NAME</th>
          <th>IQAMA NO.</th>
          <th className="amount">CARRIED FROM {previous}</th>
          <th className="amount">GIVEN</th>
          <th className="amount">SETTLED AMOUNT</th>
          <th className="amount">
            {data.current ? 'IN HAND NOW' : 'IN HAND (CARRIED FORWARD)'}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.balances.map((row, index) => (
          <tr key={row.id}>
            <td className="sl">{index + 1}</td>
            <td>{row.employee?.name ?? 'Unknown'}</td>
            <td>{row.employee?.iqamaNo || '—'}</td>
            <td className="amount">{formatReportAmount(row.carried)}</td>
            <td className="amount">{formatReportAmount(row.given)}</td>
            <td className="amount">{formatReportAmount(row.received)}</td>
            <td className={`amount${row.inHand < 0 ? ' petty-negative' : ''}`}>
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
          <th colSpan={2}>TOTAL</th>
          <th className="amount">{total((row) => row.carried)}</th>
          <th className="amount">{total((row) => row.given)}</th>
          <th className="amount">{total((row) => row.received)}</th>
          <th className="amount">{total((row) => row.inHand)}</th>
        </tr>
      </tfoot>
    </table>
  );
}

/** Only what each worker holds, without the other columns. */
function InHandOnlyTable({ data }: { data: PrintablePettyCashData }) {
  return (
    <table className="moon-report-table moon-report-petty-in-hand">
      <thead>
        <tr>
          <th className="sl">SL NO</th>
          <th>NAME</th>
          <th className="amount">
            {data.current ? 'IN HAND NOW' : 'IN HAND (CARRIED FORWARD)'}
          </th>
        </tr>
      </thead>
      <tbody>
        {data.balances.map((row, index) => (
          <tr key={row.id}>
            <td className="sl">{index + 1}</td>
            <td>{row.employee?.name ?? 'Unknown'}</td>
            <td className={`amount${row.inHand < 0 ? ' petty-negative' : ''}`}>
              {formatReportAmount(row.inHand)}
            </td>
          </tr>
        ))}
        {data.balances.length === 0 && (
          <tr>
            <td className="empty" colSpan={3}>
              No workers match these filters.
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td />
          <th>TOTAL · {data.balances.length} WORKERS</th>
          <th className="amount">
            {formatReportAmount(sum(data.balances.map((row) => row.inHand)))}
          </th>
        </tr>
      </tfoot>
    </table>
  );
}

export default function PettyCashPrintableReport({
  data,
}: {
  data: PrintablePettyCashData;
}) {
  const { worker, section, summary } = data;
  const statement = section === 'balances' && worker && !summary;
  const title = statement ? 'PETTY CASH STATEMENT' : TITLES[section];

  return (
    <article className="standalone-print-report moon-report landscape-report">
      <ReportBrandHeader
        title={`${title} · ${formatMonthName(data.month).toUpperCase()}`}
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

      {section === 'balances' && summary && (
        <section className="moon-report-section">
          <InHandOnlyTable data={data} />
        </section>
      )}
      {section === 'balances' && !summary && (
        <>
          <section className="moon-report-section">
            <h2>1. Cash in hand</h2>
            <BalancesTable data={data} />
          </section>
          {statement && (
            <section className="moon-report-section">
              <h2>2. Transactions in {formatMonthName(data.month)}</h2>
              <StatementTable data={data} />
            </section>
          )}
        </>
      )}
      {section !== 'balances' && (
        <section className="moon-report-section">
          <EntriesTable data={data} kind={section} />
        </section>
      )}
    </article>
  );
}
