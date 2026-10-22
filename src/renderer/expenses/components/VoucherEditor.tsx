import { FormEvent, KeyboardEvent, useState } from 'react';
import { roundMoney } from '../../../shared/payroll';
import { validateVoucherInput } from '../../../shared/validation';
import { errorMessage } from '../../data/FinanceApiContext';
import {
  Employee,
  PettyCashVoucher,
  PettyCashVoucherInput,
  VoucherSection,
  formatCurrency,
  todayKey,
} from '../model';
import { employeeOptionLabel } from './peopleUi';

type DraftLine = {
  key: string;
  date: string;
  particulars: string;
  supplier: string;
  vatNo: string;
  invoiceNo: string;
  excl: string;
  vat: string;
  amount: string;
};

type DraftSection = { key: string; title: string; lines: DraftLine[] };

type DraftReceipt = {
  key: string;
  date: string;
  receivedFrom: string;
  amount: string;
};

let lastKey = 0;
const newKey = () => {
  lastKey += 1;
  return `voucher-draft-${lastKey}`;
};

const blankLine = (): DraftLine => ({
  key: newKey(),
  date: '',
  particulars: '',
  supplier: '',
  vatNo: '',
  invoiceNo: '',
  excl: '',
  vat: '',
  amount: '',
});

const blankSection = (): DraftSection => ({
  key: newKey(),
  title: '',
  lines: [blankLine()],
});

const blankReceipt = (date = todayKey()): DraftReceipt => ({
  key: newKey(),
  date,
  receivedFrom: '',
  amount: '',
});

const numberText = (value: number | null) =>
  value === null ? '' : String(value);

const toDraft = (section: VoucherSection): DraftSection => ({
  key: newKey(),
  title: section.title,
  lines: section.lines.map((line) => ({
    key: newKey(),
    date: line.date,
    particulars: line.particulars,
    supplier: line.supplier,
    vatNo: line.vatNo,
    invoiceNo: line.invoiceNo,
    excl: numberText(line.amountExclVat),
    vat: numberText(line.vatAmount),
    amount: numberText(line.amount),
  })),
});

/** A number typed in a field; null when it is left blank. */
const parse = (value: string) => (value.trim() === '' ? null : Number(value));

/** Adds up typed amounts, ignoring blanks and anything not a number. */
const total = (values: string[]) =>
  roundMoney(
    values.reduce((sum, value) => sum + (Number(parse(value)) || 0), 0),
  );

/** A line with nothing typed in it is left out when saving. */
const isBlank = (line: DraftLine) =>
  [
    line.date,
    line.particulars,
    line.supplier,
    line.vatNo,
    line.invoiceNo,
    line.excl,
    line.vat,
    line.amount,
  ].every((value) => value.trim() === '');

/** A receipt row only has its date filled in until something is typed. */
const isBlankReceipt = (receipt: DraftReceipt) =>
  !receipt.receivedFrom.trim() && !receipt.amount.trim();

const LINE_FIELDS: {
  field: keyof Omit<DraftLine, 'key'>;
  label: string;
  type?: string;
  className?: string;
}[] = [
  { field: 'date', label: 'Inv date', type: 'date', className: 'col-date' },
  { field: 'particulars', label: 'Particulars', className: 'col-text' },
  { field: 'supplier', label: "Supplier's name", className: 'col-text' },
  { field: 'vatNo', label: 'VAT no.', className: 'col-short' },
  { field: 'invoiceNo', label: 'Invoice no.', className: 'col-short' },
  {
    field: 'excl',
    label: 'Excl. VAT',
    type: 'number',
    className: 'col-amount',
  },
  { field: 'vat', label: 'VAT', type: 'number', className: 'col-amount' },
  {
    field: 'amount',
    label: 'Amount incl. VAT',
    type: 'number',
    className: 'col-amount',
  },
];

/**
 * Creates or edits a voucher: its number, employee and date, each amount
 * the employee received, the bills paid in titled sections, and who
 * created, verified and approved it.
 */
export default function VoucherEditor({
  voucher,
  defaultRefNo,
  employees,
  names,
  senders,
  onCancel,
  onSubmit,
}: {
  /** The voucher being edited; undefined for a new one. */
  voucher: PettyCashVoucher | undefined;
  defaultRefNo: string;
  employees: Employee[];
  /** Suggestions for created, verified and approved by. */
  names: string[];
  /** Suggestions for who the cash was received from. */
  senders: string[];
  onCancel: () => void;
  onSubmit: (input: PettyCashVoucherInput) => Promise<void>;
}) {
  const [fields, setFields] = useState({
    refNo: voucher?.refNo ?? defaultRefNo,
    date: voucher?.date ?? todayKey(),
    employeeId: voucher?.employeeId ?? '',
    createdBy: voucher?.createdBy ?? '',
    verifiedBy: voucher?.verifiedBy ?? '',
    approvedBy: voucher?.approvedBy ?? '',
  });
  const [receipts, setReceipts] = useState<DraftReceipt[]>(
    voucher?.receipts.length
      ? voucher.receipts.map((receipt) => ({
          key: newKey(),
          date: receipt.date,
          receivedFrom: receipt.receivedFrom,
          amount: String(receipt.amount),
        }))
      : [blankReceipt()],
  );
  const [sections, setSections] = useState<DraftSection[]>(
    voucher?.sections.length ? voucher.sections.map(toDraft) : [blankSection()],
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setField = (change: Partial<typeof fields>) =>
    setFields((current) => ({ ...current, ...change }));

  const updateReceipt = (key: string, change: Partial<DraftReceipt>) =>
    setReceipts((current) =>
      current.map((receipt) =>
        receipt.key === key ? { ...receipt, ...change } : receipt,
      ),
    );

  const removeReceipt = (key: string) =>
    setReceipts((current) => {
      const rest = current.filter((receipt) => receipt.key !== key);
      return rest.length ? rest : [blankReceipt(fields.date)];
    });

  const updateSection = (
    key: string,
    change: (section: DraftSection) => DraftSection,
  ) =>
    setSections((current) =>
      current.map((section) =>
        section.key === key ? change(section) : section,
      ),
    );

  const updateLine = (
    sectionKey: string,
    lineKey: string,
    change: Partial<DraftLine>,
  ) =>
    updateSection(sectionKey, (section) => ({
      ...section,
      lines: section.lines.map((line) => {
        if (line.key !== lineKey) return line;
        const next = { ...line, ...change };
        // Typing the amount excluding VAT (and VAT) works out the total.
        if ('excl' in change || 'vat' in change) {
          const excl = parse(next.excl);
          const vat = parse(next.vat);
          if (excl !== null && !Number.isNaN(excl)) {
            next.amount = String(
              roundMoney(excl + (vat !== null && !Number.isNaN(vat) ? vat : 0)),
            );
          }
        }
        return next;
      }),
    }));

  const removeLine = (sectionKey: string, lineKey: string) =>
    updateSection(sectionKey, (section) => {
      const lines = section.lines.filter((line) => line.key !== lineKey);
      return { ...section, lines: lines.length ? lines : [blankLine()] };
    });

  const input = (): PettyCashVoucherInput => ({
    refNo: fields.refNo,
    date: fields.date,
    employeeId: fields.employeeId,
    receipts: receipts
      .filter((receipt) => !isBlankReceipt(receipt))
      .map((receipt) => ({
        date: receipt.date,
        receivedFrom: receipt.receivedFrom,
        amount: parse(receipt.amount) ?? Number.NaN,
      })),
    sections: sections
      .map((section) => ({
        title: section.title,
        lines: section.lines
          .filter((line) => !isBlank(line))
          .map((line) => ({
            date: line.date,
            particulars: line.particulars,
            supplier: line.supplier,
            vatNo: line.vatNo,
            invoiceNo: line.invoiceNo,
            amountExclVat: parse(line.excl),
            vatAmount: parse(line.vat),
            amount: parse(line.amount) ?? Number.NaN,
          })),
      }))
      .filter((section) => section.title.trim() || section.lines.length),
    createdBy: fields.createdBy,
    verifiedBy: fields.verifiedBy,
    approvedBy: fields.approvedBy,
  });

  const received = total(receipts.map((receipt) => receipt.amount));
  const sectionTotal = (section: DraftSection) =>
    total(section.lines.map((line) => line.amount));
  const spent = roundMoney(
    sections.reduce((sum, section) => sum + sectionTotal(section), 0),
  );
  const balance = roundMoney(received - spent);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let checked: PettyCashVoucherInput;
    try {
      checked = validateVoucherInput(input());
    } catch (validationError) {
      setError(errorMessage(validationError, 'Check the voucher.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit(checked);
    } catch (submitError) {
      setError(errorMessage(submitError, 'The voucher could not be saved.'));
      setSaving(false);
    }
  }

  // Enter moves on instead of saving a half-written voucher.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === 'Enter' &&
      (event.target as HTMLElement).tagName === 'INPUT'
    ) {
      event.preventDefault();
    }
  };

  return (
    // Enter is caught for the whole form; the form itself is not a control.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      aria-label={voucher ? 'Edit voucher' : 'New voucher'}
      className="voucher-editor"
      onKeyDown={onKeyDown}
      onSubmit={handleSubmit}
    >
      <div className="voucher-editor-heading">
        <div>
          <p className="eyebrow">{voucher ? 'EDIT VOUCHER' : 'NEW VOUCHER'}</p>
          <h2>{voucher ? voucher.refNo : 'New petty cash voucher'}</h2>
        </div>
      </div>

      <fieldset className="voucher-fields" disabled={saving}>
        <div className="voucher-card">
          <h3>Voucher details</h3>
          <div className="form-grid form-grid-3">
            <label className="form-field" htmlFor="voucher-ref">
              Voucher no.
              <input
                id="voucher-ref"
                maxLength={80}
                onChange={(event) =>
                  setField({ refNo: event.currentTarget.value })
                }
                required
                value={fields.refNo}
              />
            </label>
            <label className="form-field" htmlFor="voucher-employee">
              Name of employee
              <select
                id="voucher-employee"
                onChange={(event) =>
                  setField({ employeeId: event.currentTarget.value })
                }
                value={fields.employeeId}
              >
                <option value="">Choose an employee</option>
                {[...employees]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employeeOptionLabel(employee)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field" htmlFor="voucher-date">
              Date
              <input
                id="voucher-date"
                onChange={(event) =>
                  setField({ date: event.currentTarget.value })
                }
                required
                type="date"
                value={fields.date}
              />
            </label>
          </div>
        </div>

        <div className="voucher-card">
          <div className="voucher-card-heading">
            <h3>Amount received</h3>
            <span className="voucher-card-total">
              Total received <b>{formatCurrency(received)}</b>
            </span>
          </div>
          <div className="table-scroll">
            <table className="voucher-lines voucher-receipt-lines">
              <thead>
                <tr>
                  <th className="col-sl">#</th>
                  <th className="col-date">Date</th>
                  <th>Received from</th>
                  <th className="col-amount">Amount (SAR)</th>
                  <th>
                    <span className="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt, index) => {
                  const where = `Amount received ${index + 1}`;
                  return (
                    <tr key={receipt.key}>
                      <td className="col-sl">{index + 1}</td>
                      <td className="col-date">
                        <input
                          aria-label={`${where} date`}
                          onChange={(event) =>
                            updateReceipt(receipt.key, {
                              date: event.currentTarget.value,
                            })
                          }
                          type="date"
                          value={receipt.date}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${where} received from`}
                          list="voucher-sender-options"
                          maxLength={120}
                          onChange={(event) =>
                            updateReceipt(receipt.key, {
                              receivedFrom: event.currentTarget.value,
                            })
                          }
                          placeholder="e.g. Imran"
                          value={receipt.receivedFrom}
                        />
                      </td>
                      <td className="col-amount">
                        <input
                          aria-label={`${where} amount`}
                          min={0}
                          onChange={(event) =>
                            updateReceipt(receipt.key, {
                              amount: event.currentTarget.value,
                            })
                          }
                          step={0.01}
                          type="number"
                          value={receipt.amount}
                        />
                      </td>
                      <td>
                        <button
                          aria-label={`Remove ${where.toLowerCase()}`}
                          className="text-button danger-text"
                          onClick={() => removeReceipt(receipt.key)}
                          type="button"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total received</td>
                  <td className="col-amount">{formatCurrency(received)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <datalist id="voucher-sender-options">
            {senders.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </datalist>
          <button
            className="button button-secondary button-small"
            onClick={() =>
              setReceipts((current) => [...current, blankReceipt(fields.date)])
            }
            type="button"
          >
            + Add amount received
          </button>
        </div>

        <h3 className="voucher-sections-heading">Sections</h3>
        {sections.map((section, sectionIndex) => (
          <section
            aria-label={`Section ${sectionIndex + 1}`}
            className="voucher-section-editor"
            key={section.key}
          >
            <div className="voucher-section-heading">
              <label className="form-field" htmlFor={`${section.key}-title`}>
                Section {sectionIndex + 1} title
                <input
                  id={`${section.key}-title`}
                  maxLength={120}
                  onChange={(event) => {
                    const title = event.currentTarget.value;
                    updateSection(section.key, (current) => ({
                      ...current,
                      title,
                    }));
                  }}
                  placeholder="e.g. Riyadh Avenue Mall, Materials & other expenses"
                  value={section.title}
                />
              </label>
              <span className="voucher-section-total">
                {formatCurrency(sectionTotal(section))}
              </span>
              <button
                className="button button-secondary button-small danger-text"
                disabled={sections.length === 1}
                onClick={() =>
                  setSections((current) =>
                    current.filter((item) => item.key !== section.key),
                  )
                }
                type="button"
              >
                Remove section
              </button>
            </div>
            <div className="table-scroll">
              <table className="voucher-lines">
                <thead>
                  <tr>
                    <th className="col-sl">#</th>
                    {LINE_FIELDS.map((column) => (
                      <th className={column.className} key={column.field}>
                        {column.label}
                      </th>
                    ))}
                    <th>
                      <span className="visually-hidden">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line, lineIndex) => {
                    const where = `Section ${sectionIndex + 1} line ${lineIndex + 1}`;
                    return (
                      <tr key={line.key}>
                        <td className="col-sl">{lineIndex + 1}</td>
                        {LINE_FIELDS.map((column) => (
                          <td className={column.className} key={column.field}>
                            <input
                              aria-label={`${where} ${column.label.toLowerCase()}`}
                              min={column.type === 'number' ? 0 : undefined}
                              onChange={(event) =>
                                updateLine(section.key, line.key, {
                                  [column.field]: event.currentTarget.value,
                                })
                              }
                              step={column.type === 'number' ? 0.01 : undefined}
                              type={column.type ?? 'text'}
                              value={line[column.field]}
                            />
                          </td>
                        ))}
                        <td>
                          <button
                            aria-label={`Remove ${where.toLowerCase()}`}
                            className="text-button danger-text"
                            onClick={() => removeLine(section.key, line.key)}
                            type="button"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              className="button button-secondary button-small"
              onClick={() =>
                updateSection(section.key, (current) => ({
                  ...current,
                  lines: [...current.lines, blankLine()],
                }))
              }
              type="button"
            >
              + Add line
            </button>
          </section>
        ))}
        <button
          className="button button-secondary"
          onClick={() => setSections((current) => [...current, blankSection()])}
          type="button"
        >
          + Add section
        </button>

        <div className="voucher-card">
          <h3>Sign-off</h3>
          <div className="form-grid form-grid-3">
            {(
              [
                ['createdBy', 'Created by'],
                ['verifiedBy', 'Verified by'],
                ['approvedBy', 'Approved by'],
              ] as const
            ).map(([field, label]) => (
              <label
                className="form-field"
                htmlFor={`voucher-${field}`}
                key={field}
              >
                {label}
                <input
                  id={`voucher-${field}`}
                  list="voucher-name-options"
                  maxLength={80}
                  onChange={(event) =>
                    setField({ [field]: event.currentTarget.value })
                  }
                  value={fields[field]}
                />
              </label>
            ))}
            <datalist id="voucher-name-options">
              {names.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </datalist>
          </div>
        </div>
      </fieldset>

      <div
        aria-label="Voucher totals"
        className="voucher-editor-totals"
        role="status"
      >
        <span>
          Received <b>{formatCurrency(received)}</b>
        </span>
        <span>
          Spent <b>{formatCurrency(spent)}</b>
        </span>
        <span className={balance < 0 ? 'voucher-negative' : undefined}>
          Balance <b>{formatCurrency(balance)}</b>
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="button button-primary"
          disabled={saving}
          type="submit"
        >
          {saving ? 'Saving…' : 'Save voucher'}
        </button>
      </div>
    </form>
  );
}
