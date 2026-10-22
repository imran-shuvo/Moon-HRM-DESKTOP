import {
  Employee,
  PettyCashVoucher,
  formatReportAmount,
  formatReportDate,
  voucherSectionTotal,
  voucherTotals,
} from '../model';
import ReportBrandHeader from './ReportBrandHeader';

const amount = (value: number | null) =>
  value === null ? '' : formatReportAmount(value);

const sum = (values: (number | null)[]) =>
  values.reduce<number>(
    (total, value) => total + Math.round((value ?? 0) * 100),
    0,
  ) / 100;

/** A column total, left blank when no line has that amount. */
const columnTotal = (values: (number | null)[]) =>
  values.some((value) => value !== null) ? formatReportAmount(sum(values)) : '';

/** One employee's petty cash voucher, with the company report header. */
export default function VoucherPrintableReport({
  voucher,
  employee,
}: {
  voucher: PettyCashVoucher;
  employee: Employee | undefined;
}) {
  const totals = voucherTotals(voucher);
  const lines = voucher.sections.flatMap((section) => section.lines);
  const name = employee?.name ?? 'the employee';
  let number = 0;

  return (
    <article className="standalone-print-report moon-report landscape-report voucher-report">
      <ReportBrandHeader title="PETTY CASH VOUCHER" />

      <table className="moon-report-table voucher-details">
        <thead>
          <tr>
            <th>VOUCHER NO.</th>
            <th>NAME OF EMPLOYEE</th>
            <th>DATE</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="voucher-detail-strong">{voucher.refNo}</td>
            <td>
              <span className="voucher-detail-strong">
                {employee?.name ?? '—'}
              </span>
              {employee &&
                [
                  employee.iqamaNo && `Iqama no. ${employee.iqamaNo}`,
                  employee.designation,
                  employee.projectName,
                ]
                  .filter(Boolean)
                  .map((item) => ` · ${item}`)}
            </td>
            <td className="voucher-detail-strong">
              {formatReportDate(voucher.date)}
            </td>
          </tr>
        </tbody>
      </table>

      <section className="moon-report-section">
        <h2>1. Cash received</h2>
        <table className="moon-report-table voucher-receipts">
          <thead>
            <tr>
              <th className="sl">SL NO</th>
              <th>DATE</th>
              <th>RECEIVED FROM</th>
              <th className="amount">AMOUNT (SAR)</th>
            </tr>
          </thead>
          <tbody>
            {voucher.receipts.map((receipt, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={index}>
                <td className="sl">{index + 1}</td>
                <td>{formatReportDate(receipt.date)}</td>
                <td>{receipt.receivedFrom}</td>
                <td className="amount">{formatReportAmount(receipt.amount)}</td>
              </tr>
            ))}
            {voucher.receipts.length === 0 && (
              <tr>
                <td className="empty" colSpan={4}>
                  No cash received on this voucher.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <th colSpan={2}>TOTAL RECEIVED</th>
              <th className="amount">{formatReportAmount(totals.received)}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="moon-report-section">
        <h2>2. Expenses</h2>
        <table className="moon-report-table voucher-table">
          <thead>
            <tr>
              <th className="sl">SL NO</th>
              <th>INV DATE</th>
              <th>PARTICULARS</th>
              <th>SUPPLIER&apos;S NAME</th>
              <th>VAT NO.</th>
              <th>INVOICE NO.</th>
              <th className="amount" title="Amount excluding VAT">
                EXCL. VAT
              </th>
              <th className="amount">VAT</th>
              <th className="amount" title="Amount including VAT">
                INCL. VAT
              </th>
            </tr>
          </thead>
          {voucher.sections.map((section, index) => (
            <tbody
              className="voucher-section"
              // eslint-disable-next-line react/no-array-index-key
              key={index}
            >
              <tr className="voucher-section-title">
                <td colSpan={9}>
                  <span className="voucher-section-number">
                    SECTION {index + 1}
                  </span>
                  <span className="voucher-section-name">
                    {section.title || 'Expenses'}
                  </span>
                  <span className="voucher-section-count">
                    {section.lines.length}{' '}
                    {section.lines.length === 1 ? 'line' : 'lines'}
                  </span>
                </td>
              </tr>
              {section.lines.map((line) => {
                number += 1;
                return (
                  <tr key={number}>
                    <td className="sl">{number}</td>
                    <td>{line.date ? formatReportDate(line.date) : '—'}</td>
                    <td>{line.particulars}</td>
                    <td>{line.supplier}</td>
                    <td>{line.vatNo}</td>
                    <td>{line.invoiceNo}</td>
                    <td className="amount">{amount(line.amountExclVat)}</td>
                    <td className="amount">{amount(line.vatAmount)}</td>
                    <td className="amount">
                      {formatReportAmount(line.amount)}
                    </td>
                  </tr>
                );
              })}
              <tr className="voucher-section-subtotal">
                <td colSpan={6}>
                  Subtotal · {section.title || `Section ${index + 1}`}
                </td>
                <td className="amount">
                  {columnTotal(section.lines.map((line) => line.amountExclVat))}
                </td>
                <td className="amount">
                  {columnTotal(section.lines.map((line) => line.vatAmount))}
                </td>
                <td className="amount">
                  {formatReportAmount(voucherSectionTotal(section))}
                </td>
              </tr>
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td />
              <th colSpan={5}>
                TOTAL SPENT · {totals.lines}{' '}
                {totals.lines === 1 ? 'LINE' : 'LINES'}
              </th>
              <th className="amount">
                {columnTotal(lines.map((line) => line.amountExclVat))}
              </th>
              <th className="amount">
                {columnTotal(lines.map((line) => line.vatAmount))}
              </th>
              <th className="amount">{formatReportAmount(totals.spent)}</th>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* The summary and sign-off always print on the same page. */}
      <div className="voucher-closing">
        <section className="moon-report-section voucher-summary-section">
          <h2>3. Summary</h2>
          <div className="voucher-summary">
            <div className="voucher-summary-tile">
              <span>Total received</span>
              <strong>{formatReportAmount(totals.received)}</strong>
              <small>
                {voucher.receipts.length}{' '}
                {voucher.receipts.length === 1 ? 'amount' : 'amounts'} received
              </small>
            </div>
            <div className="voucher-summary-tile">
              <span>Total spent</span>
              <strong>{formatReportAmount(totals.spent)}</strong>
              <small>
                {totals.lines} {totals.lines === 1 ? 'line' : 'lines'} in{' '}
                {voucher.sections.length}{' '}
                {voucher.sections.length === 1 ? 'section' : 'sections'}
              </small>
            </div>
            <div
              className={`voucher-summary-tile voucher-summary-balance${totals.balance < 0 ? ' negative' : ''}`}
            >
              <span>
                {totals.balance < 0
                  ? `Balance owed to ${name}`
                  : `Balance with ${name}`}
              </span>
              <strong>{formatReportAmount(Math.abs(totals.balance))}</strong>
              <small>Total received − total spent</small>
            </div>
          </div>
        </section>

        <footer className="voucher-signoff">
          {[
            ['Created by', voucher.createdBy],
            ['Verified by', voucher.verifiedBy],
            ['Approved by', voucher.approvedBy],
          ].map(([label, signer]) => (
            <div key={label}>
              <span className="voucher-signature" />
              <strong>{label}</strong>
              <span>{signer || ' '}</span>
            </div>
          ))}
        </footer>
      </div>
    </article>
  );
}

/** A list of vouchers with what each received, spent and has left. */
export function VoucherListPrintableReport({
  vouchers,
  employees,
  filterSummary,
}: {
  vouchers: PettyCashVoucher[];
  employees: Map<string, Employee>;
  filterSummary: string;
}) {
  const rows = vouchers.map((voucher) => ({
    voucher,
    ...voucherTotals(voucher),
  }));
  const total = (pick: (row: (typeof rows)[number]) => number) =>
    formatReportAmount(sum(rows.map(pick)));
  return (
    <article className="standalone-print-report moon-report landscape-report">
      <ReportBrandHeader title="PETTY CASH VOUCHERS" />
      {filterSummary && <p className="moon-report-filters">{filterSummary}</p>}
      <section className="moon-report-section">
        <table className="moon-report-table moon-report-vouchers">
          <thead>
            <tr>
              <th className="sl">SL NO</th>
              <th>DATE</th>
              <th>VOUCHER NO.</th>
              <th>EMPLOYEE</th>
              <th className="amount">RECEIVED</th>
              <th className="amount">SPENT</th>
              <th className="amount">BALANCE</th>
              <th>APPROVED BY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.voucher.id}>
                <td className="sl">{index + 1}</td>
                <td>{formatReportDate(row.voucher.date)}</td>
                <td>{row.voucher.refNo}</td>
                <td>
                  {(row.voucher.employeeId &&
                    employees.get(row.voucher.employeeId)?.name) ||
                    '—'}
                </td>
                <td className="amount">{formatReportAmount(row.received)}</td>
                <td className="amount">{formatReportAmount(row.spent)}</td>
                <td
                  className={`amount${row.balance < 0 ? ' petty-negative' : ''}`}
                >
                  {formatReportAmount(row.balance)}
                </td>
                <td>{row.voucher.approvedBy || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="empty" colSpan={8}>
                  No vouchers match these filters.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <th colSpan={3}>
                TOTAL · {rows.length}{' '}
                {rows.length === 1 ? 'VOUCHER' : 'VOUCHERS'}
              </th>
              <th className="amount">{total((row) => row.received)}</th>
              <th className="amount">{total((row) => row.spent)}</th>
              <th className="amount">{total((row) => row.balance)}</th>
              <td />
            </tr>
          </tfoot>
        </table>
      </section>
    </article>
  );
}
