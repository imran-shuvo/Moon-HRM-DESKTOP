import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles.scss';
import {
  Budget,
  BudgetLedgerEntry,
  Expense,
  BudgetTransaction,
  Section,
  DEFAULT_CATEGORIES,
  DEFAULT_DEPARTMENTS,
  createSampleExpenses,
  createBudgetLedger,
  formatCurrency,
  monthToDate,
  todayKey,
} from './expenses/model';
import ExpenseDialog from './expenses/components/ExpenseDialog';
import Sidebar from './expenses/components/Sidebar';
import TransactionPanel from './expenses/components/TransactionPanel';
import ReportPanel from './expenses/components/ReportPanel';
import OverviewPanel from './expenses/components/OverviewPanel';
import BudgetManagementPanel from './expenses/components/BudgetManagementPanel';
import BudgetPaymentDialog from './expenses/components/BudgetPaymentDialog';
import CategoryDepartmentManager from './expenses/components/CategoryDepartmentManager';

const STORAGE_KEY = 'moon-expenses-v1';
function createExpenseId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const DEFAULT_BUDGETS: Budget[] = [
  { category: 'Materials', limit: 15000, color: '#7368e8' },
  { category: 'Payroll', limit: 12000, color: '#34a881' },
  { category: 'Equipment', limit: 9000, color: '#f2a84a' },
  { category: 'Travel', limit: 7000, color: '#e77777' },
  { category: 'Other', limit: 5000, color: '#6f9de8' },
];

const TITLES: Record<Section, { title: string; subtitle: string }> = {
  Overview: {
    title: 'Good morning, Alex',
    subtitle: "Here's what's happening with your company finances.",
  },
  Transactions: {
    title: 'Transactions',
    subtitle: 'Every expense, accounted for and easy to find.',
  },
  Budgets: {
    title: 'Budgets',
    subtitle: 'Track company payments, expenses, and your available balance.',
  },
  Reports: {
    title: 'Reports',
    subtitle: 'Review spending by day, week, month, or year.',
  },
  Settings: {
    title: 'Categories & departments',
    subtitle: 'Manage the options available on each transaction.',
  },
};

function readSavedData(): {
  expenses: Expense[];
  budgetTransactions: BudgetTransaction[];
  categories: string[];
  departments: string[];
} {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as {
        expenses?: Expense[];
        budgetTransactions?: BudgetTransaction[];
        categories?: string[];
        departments?: string[];
      };
      if (Array.isArray(data.expenses)) {
        return {
          expenses: data.expenses,
          budgetTransactions: Array.isArray(data.budgetTransactions)
            ? data.budgetTransactions
            : [],
          categories:
            Array.isArray(data.categories) && data.categories.length > 0
              ? data.categories
              : DEFAULT_CATEGORIES,
          departments:
            Array.isArray(data.departments) && data.departments.length > 0
              ? data.departments
              : DEFAULT_DEPARTMENTS,
        };
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Unable to read saved expense data.', error);
  }
  return {
    expenses: createSampleExpenses(),
    budgetTransactions: [],
    categories: DEFAULT_CATEGORIES,
    departments: DEFAULT_DEPARTMENTS,
  };
}

function exportCsv(
  expenses: Expense[],
  reportTitle: string,
  remainingById?: Record<string, number>,
) {
  const rows = [
    [
      'Date',
      'Payee',
      'Description',
      'Category',
      'Department',
      'Payment method',
      'Amount',
      ...(remainingById ? ['Remaining budget'] : []),
    ],
    ...expenses.map((expense) => [
      expense.date,
      expense.payee,
      expense.description,
      expense.category,
      expense.department,
      expense.paymentMethod,
      expense.amount.toFixed(2),
      ...(remainingById ? [(remainingById[expense.id] ?? 0).toFixed(2)] : []),
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
  link.download = `${reportTitle.toLowerCase().replaceAll(' ', '-')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function App() {
  const [savedData] = useState(readSavedData);
  const [expenses, setExpenses] = useState<Expense[]>(savedData.expenses);
  const [budgetTransactions, setBudgetTransactions] = useState<
    BudgetTransaction[]
  >(savedData.budgetTransactions);
  const [categories, setCategories] = useState(savedData.categories);
  const [departments, setDepartments] = useState(savedData.departments);
  const [section, setSection] = useState<Section>('Overview');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense>();
  const [expenseToDelete, setExpenseToDelete] = useState<Expense>();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<BudgetTransaction>();
  const [paymentToDelete, setPaymentToDelete] = useState<BudgetTransaction>();
  const [search, setSearch] = useState('');
  const [transactionMonth, setTransactionMonth] = useState('');
  const [transactionPayee, setTransactionPayee] = useState('');
  const [transactionDepartment, setTransactionDepartment] = useState('');
  const [storageError, setStorageError] = useState('');

  const openExpenseDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const showTransactions = useCallback(() => {
    setSection('Transactions');
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          expenses,
          budgetTransactions,
          categories,
          departments,
        }),
      );
      setStorageError('');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Unable to save expense data on this device.', error);
      setStorageError('Changes could not be saved on this device.');
    }
  }, [expenses, budgetTransactions, categories, departments]);

  const monthExpenses = useMemo(() => monthToDate(expenses), [expenses]);
  const todayExpenses = useMemo(
    () => expenses.filter((expense) => expense.date === todayKey()),
    [expenses],
  );
  const spent = monthExpenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  );
  const ledger = useMemo(
    () => createBudgetLedger(expenses, budgetTransactions),
    [expenses, budgetTransactions],
  );
  const allExpenses = expenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  );
  const remaining = ledger.at(-1)?.balance ?? 0;
  const latestPayment = [...ledger]
    .reverse()
    .find((entry) => entry.kind === 'payment');
  const currentBudgetAmount = latestPayment?.amount ?? 0;
  const currentBudgetSpent = latestPayment
    ? currentBudgetAmount - remaining
    : allExpenses;
  const transactionEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...ledger]
      .filter(
        (entry) =>
          !transactionMonth || entry.date.slice(0, 7) === transactionMonth,
      )
      .filter((entry) => {
        if (!transactionPayee) return true;
        return (
          (entry.payment?.paidBy || 'Company') === transactionPayee ||
          entry.expense?.payee === transactionPayee
        );
      })
      .filter((entry) => {
        if (!transactionDepartment) return true;
        return entry.expense?.department === transactionDepartment;
      })
      .filter((entry) => {
        const searchable = [
          entry.payment?.paidBy,
          entry.payment?.paymentMethod,
          entry.payment?.note,
          entry.expense?.payee,
          entry.expense?.description,
          entry.expense?.category,
          entry.expense?.department,
          entry.expense?.paymentMethod,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    ledger,
    search,
    transactionMonth,
    transactionPayee,
    transactionDepartment,
  ]);
  const saveExpense = useCallback(
    (expense: Omit<Expense, 'id'>) => {
      setExpenses((current) => [
        editingExpense
          ? {
              ...expense,
              id: editingExpense.id,
              createdAt: editingExpense.createdAt ?? Date.now(),
            }
          : { ...expense, id: createExpenseId(), createdAt: Date.now() },
        ...(editingExpense
          ? current.filter((item) => item.id !== editingExpense.id)
          : current),
      ]);
      setEditingExpense(undefined);
      setDialogOpen(false);
    },
    [editingExpense],
  );

  const editBudgetPayment = useCallback((entry: BudgetLedgerEntry) => {
    if (entry.payment) {
      setEditingPayment(entry.payment);
      setPaymentDialogOpen(true);
    }
  }, []);

  const deleteBudgetPayment = useCallback((entry: BudgetLedgerEntry) => {
    if (entry.payment) setPaymentToDelete(entry.payment);
  }, []);

  const confirmDeleteBudgetPayment = useCallback(() => {
    if (paymentToDelete) {
      setBudgetTransactions((current) =>
        current.filter((item) => item.id !== paymentToDelete.id),
      );
      setPaymentToDelete(undefined);
    }
  }, [paymentToDelete]);

  const closeBudgetPaymentDialog = useCallback(() => {
    setPaymentDialogOpen(false);
    setEditingPayment(undefined);
  }, []);

  const closePaymentDeleteConfirmation = useCallback(() => {
    setPaymentToDelete(undefined);
  }, []);

  const openBudgetPaymentDialog = useCallback(() => {
    setEditingPayment(undefined);
    setPaymentDialogOpen(true);
  }, []);

  const closeExpenseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingExpense(undefined);
  }, []);

  const editExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  }, []);

  const deleteExpense = useCallback((expense: Expense) => {
    setExpenseToDelete(expense);
  }, []);

  const editBudgetEntry = useCallback(
    (entry: BudgetLedgerEntry) => {
      if (entry.payment) editBudgetPayment(entry);
    },
    [editBudgetPayment],
  );

  const openEditBudgetPayment = useCallback((payment: BudgetTransaction) => {
    setEditingPayment(payment);
    setPaymentDialogOpen(true);
  }, []);

  const requestDeleteBudgetPayment = useCallback(
    (payment: BudgetTransaction) => {
      setPaymentToDelete(payment);
    },
    [],
  );

  const deleteBudgetEntry = useCallback(
    (entry: BudgetLedgerEntry) => {
      if (entry.payment) deleteBudgetPayment(entry);
    },
    [deleteBudgetPayment],
  );

  const editExpenseEntry = useCallback(
    (entry: BudgetLedgerEntry) => {
      if (entry.expense) editExpense(entry.expense);
    },
    [editExpense],
  );

  const deleteExpenseEntry = useCallback(
    (entry: BudgetLedgerEntry) => {
      if (entry.expense) deleteExpense(entry.expense);
    },
    [deleteExpense],
  );

  const saveBudgetPaymentDirect = useCallback(
    (payment: Omit<BudgetTransaction, 'id'>) => {
      setBudgetTransactions((current) => [
        editingPayment
          ? {
              ...payment,
              id: editingPayment.id,
              createdAt: editingPayment.createdAt ?? Date.now(),
            }
          : { ...payment, id: createExpenseId(), createdAt: Date.now() },
        ...(editingPayment
          ? current.filter((item) => item.id !== editingPayment.id)
          : current),
      ]);
      setEditingPayment(undefined);
      setPaymentDialogOpen(false);
    },
    [editingPayment],
  );

  const confirmDeleteExpense = useCallback(() => {
    if (expenseToDelete) {
      setExpenses((current) =>
        current.filter((item) => item.id !== expenseToDelete.id),
      );
      setExpenseToDelete(undefined);
    }
  }, [expenseToDelete]);

  const closeDeleteConfirmation = useCallback(() => {
    setExpenseToDelete(undefined);
  }, []);

  const addCategory = useCallback((value: string) => {
    setCategories((current) => [...current, value]);
  }, []);

  const deleteCategory = useCallback((value: string) => {
    setCategories((current) => current.filter((item) => item !== value));
  }, []);

  const addDepartment = useCallback((value: string) => {
    setDepartments((current) => [...current, value]);
  }, []);

  const deleteDepartment = useCallback((value: string) => {
    setDepartments((current) => current.filter((item) => item !== value));
  }, []);

  const renameCategory = useCallback((previous: string, next: string) => {
    setCategories((current) =>
      current.map((item) => (item === previous ? next : item)),
    );
    setExpenses((current) =>
      current.map((expense) =>
        expense.category === previous
          ? { ...expense, category: next }
          : expense,
      ),
    );
  }, []);

  const renameDepartment = useCallback((previous: string, next: string) => {
    setDepartments((current) =>
      current.map((item) => (item === previous ? next : item)),
    );
    setExpenses((current) =>
      current.map((expense) =>
        expense.department === previous
          ? { ...expense, department: next }
          : expense,
      ),
    );
  }, []);

  const page = TITLES[section];
  const todayTotal = todayExpenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  );
  const categoryBudgets = categories.map((category) => {
    const existing = DEFAULT_BUDGETS.find(
      (budget) => budget.category === category,
    );
    return (
      existing ?? {
        category,
        limit: 0,
        color: '#7d8da8',
      }
    );
  });
  const budgetStatus =
    remaining >= 0
      ? `${formatCurrency(remaining)} available from company payments`
      : `${formatCurrency(Math.abs(remaining))} more spent than received`;

  return (
    <div className="app-shell">
      <Sidebar
        budget={currentBudgetAmount}
        onSelect={setSection}
        section={section}
        spent={currentBudgetSpent}
        transactionCount={expenses.length}
      />
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Moon Contracting &amp; Cleaning <span>/</span> Finance
          </div>
          <div className="topbar-right">
            <span className="period-label">Reporting period</span>
            <span className="period-pill">
              This month <span aria-hidden="true">⌄</span>
            </span>
            <div className="avatar" aria-label="Alex Morgan">
              AM
            </div>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                {section === 'Overview'
                  ? new Date()
                      .toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                      .toUpperCase()
                  : 'FINANCE OVERVIEW'}
              </p>
              <h1>{page.title}</h1>
              <p className="page-subtitle">{page.subtitle}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button button-primary"
                onClick={openExpenseDialog}
                type="button"
              >
                <span aria-hidden="true">＋</span> Add expense
              </button>
            </div>
          </section>

          {section === 'Overview' && (
            <OverviewPanel
              monthExpenses={monthExpenses}
              todayExpenses={todayExpenses}
              budgets={categoryBudgets}
              spent={spent}
              remaining={remaining}
              budgetStatus={budgetStatus}
              todayTotal={todayTotal}
              recentExpenses={[...expenses]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 5)}
              onShowTransactions={showTransactions}
            />
          )}

          {section === 'Transactions' && (
            <TransactionPanel
              entries={transactionEntries}
              month={transactionMonth}
              payee={transactionPayee}
              department={transactionDepartment}
              search={search}
              departments={departments}
              payees={[
                ...new Set([
                  ...expenses.map((expense) => expense.payee),
                  ...budgetTransactions.map(
                    (payment) => payment.paidBy || 'Company',
                  ),
                ]),
              ].sort()}
              onMonthChange={setTransactionMonth}
              onPayeeChange={setTransactionPayee}
              onDepartmentChange={setTransactionDepartment}
              onSearchChange={setSearch}
              onEditPayment={editBudgetEntry}
              onDeletePayment={deleteBudgetEntry}
              onEditExpense={editExpenseEntry}
              onDeleteExpense={deleteExpenseEntry}
            />
          )}

          {section === 'Budgets' && (
            <BudgetManagementPanel
              payments={budgetTransactions}
              balance={remaining}
              onAddPayment={openBudgetPaymentDialog}
              onEditPayment={openEditBudgetPayment}
              onDeletePayment={requestDeleteBudgetPayment}
            />
          )}

          {section === 'Reports' && (
            <ReportPanel
              expenses={expenses}
              payments={budgetTransactions}
              onEdit={editExpense}
              onDelete={deleteExpense}
              onExport={exportCsv}
            />
          )}
          {section === 'Settings' && (
            <CategoryDepartmentManager
              categories={categories}
              departments={departments}
              expenses={expenses}
              onAddCategory={addCategory}
              onRenameCategory={renameCategory}
              onDeleteCategory={deleteCategory}
              onAddDepartment={addDepartment}
              onRenameDepartment={renameDepartment}
              onDeleteDepartment={deleteDepartment}
            />
          )}
          <footer className="page-footer">
            {storageError ? (
              <span className="storage-error" role="alert">
                {storageError}
              </span>
            ) : (
              <>
                Your data is saved on this device <span>·</span> Updated just
                now
              </>
            )}
          </footer>
        </div>
      </main>
      {dialogOpen && (
        <ExpenseDialog
          onClose={closeExpenseDialog}
          onSubmit={saveExpense}
          categories={categories}
          departments={departments}
          expense={editingExpense}
        />
      )}
      {paymentDialogOpen && (
        <BudgetPaymentDialog
          payment={editingPayment}
          onClose={closeBudgetPaymentDialog}
          onSubmit={saveBudgetPaymentDirect}
        />
      )}
      {expenseToDelete && (
        <div className="dialog-backdrop">
          <section
            aria-labelledby="delete-expense-title"
            aria-modal="true"
            className="expense-dialog confirmation-dialog"
            role="alertdialog"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">DELETE TRANSACTION</p>
                <h2 id="delete-expense-title">Delete this expense?</h2>
                <p>
                  The transaction for {expenseToDelete.payee} will be
                  permanently removed from this device.
                </p>
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="button button-secondary"
                onClick={closeDeleteConfirmation}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                onClick={confirmDeleteExpense}
                type="button"
              >
                Delete expense
              </button>
            </div>
          </section>
        </div>
      )}
      {paymentToDelete && (
        <div className="dialog-backdrop">
          <section
            aria-labelledby="delete-budget-payment-title"
            aria-modal="true"
            className="expense-dialog confirmation-dialog"
            role="alertdialog"
          >
            <div className="dialog-heading">
              <div>
                <p className="eyebrow">DELETE COMPANY PAYMENT</p>
                <h2 id="delete-budget-payment-title">Delete this payment?</h2>
                <p>
                  {formatCurrency(paymentToDelete.amount)} received on{' '}
                  {paymentToDelete.date} will be removed and balances will be
                  recalculated.
                </p>
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="button button-secondary"
                onClick={closePaymentDeleteConfirmation}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                onClick={confirmDeleteBudgetPayment}
                type="button"
              >
                Delete payment
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
