import { useMemo, useState } from 'react';
import { BudgetTransaction, formatCurrency } from '../model';
import BudgetPaymentsTable from './BudgetPaymentsTable';

function exportBudgetCsv(payments: BudgetTransaction[]) {
  const rows = [
    ['Date', 'Amount', 'Paid by', 'Payment method', 'Note'],
    ...payments.map((payment) => [
      payment.date,
      payment.amount.toFixed(2),
      payment.paidBy ?? '',
      payment.paymentMethod ?? '',
      payment.note,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','),
    )
    .join('\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'budget-payments.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BudgetManagementPanel({
  payments,
  balance,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
}: {
  payments: BudgetTransaction[];
  balance: number;
  onAddPayment: () => void;
  onEditPayment: (payment: BudgetTransaction) => void;
  onDeletePayment: (payment: BudgetTransaction) => void;
}) {
  const [month, setMonth] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const payers = useMemo(
    () =>
      [
        ...new Set(payments.map((payment) => payment.paidBy || 'Company')),
      ].sort(),
    [payments],
  );
  const filteredPayments = useMemo(
    () =>
      [...payments]
        .filter((payment) => !month || payment.date.slice(0, 7) === month)
        .filter(
          (payment) => !paidBy || (payment.paidBy || 'Company') === paidBy,
        )
        .filter(
          (payment) =>
            !paymentMethod || (payment.paymentMethod || '') === paymentMethod,
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [payments, month, paidBy, paymentMethod],
  );
  const received = filteredPayments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );

  return (
    <>
      <section className="budget-summary panel budget-ledger-summary">
        <div>
          <p className="stat-label">Payments received</p>
          <strong>{formatCurrency(received)}</strong>
          <p className="stat-foot">
            {filteredPayments.length} budget
            {filteredPayments.length === 1 ? '' : 's'} match these filters
          </p>
        </div>
        <div>
          <p className="stat-label">Current budget balance</p>
          <strong className={balance < 0 ? 'stat-overrun' : undefined}>
            {formatCurrency(balance)}
          </strong>
          <p className="stat-foot">
            Current budget less expenses since receipt
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={onAddPayment}
          type="button"
        >
          <span aria-hidden="true">＋</span> Add budget
        </button>
      </section>
      <section className="panel full-panel budget-ledger-panel">
        <div className="panel-heading transaction-heading">
          <div>
            <h2>All budgets received</h2>
            <p>Date, payer, payment method, and amount for each budget.</p>
          </div>
          <div className="transaction-filters">
            <label className="filter-control" htmlFor="budget-month-filter">
              Month
              <input
                aria-label="Filter budgets by month"
                id="budget-month-filter"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.currentTarget.value)}
              />
            </label>
            <label className="filter-control" htmlFor="budget-payer-filter">
              Paid by
              <select
                aria-label="Filter budgets by payer"
                id="budget-payer-filter"
                value={paidBy}
                onChange={(event) => setPaidBy(event.currentTarget.value)}
              >
                <option value="">All payers</option>
                {payers.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="filter-control" htmlFor="budget-method-filter">
              Method
              <select
                aria-label="Filter budgets by payment method"
                id="budget-method-filter"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.currentTarget.value)
                }
              >
                <option value="">Cash or card</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
              </select>
            </label>
            <button
              className="button button-secondary"
              onClick={() => exportBudgetCsv(filteredPayments)}
              type="button"
            >
              ↓ Export budgets
            </button>
          </div>
        </div>
        <BudgetPaymentsTable
          payments={filteredPayments}
          onEdit={onEditPayment}
          onDelete={onDeletePayment}
        />
        {filteredPayments.length === 0 && (
          <p className="empty-state">No budget payments match these filters.</p>
        )}
      </section>
    </>
  );
}
