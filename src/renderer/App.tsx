import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles.scss';
import {
  AttachmentUpload,
  BudgetTransactionInput,
  DatabaseStatus,
  ExpenseInput,
  FinanceApi,
  FinanceSnapshot,
} from '../shared/types';
import {
  Budget,
  BudgetTransaction,
  Expense,
  Section,
  formatCurrency,
  calculateBudgetForPeriod,
  getExpenseTotal,
  getMonthDateRange,
  getMonthlyExpenseSummaries,
  monthToDate,
  plural,
} from './expenses/model';
import { FinanceApiProvider, errorMessage } from './data/FinanceApiContext';
import {
  hasLegacyData,
  markLegacyDataImported,
  readLegacyPayload,
} from './data/legacyStorage';
import ExpenseDialog from './expenses/components/ExpenseDialog';
import ExpenseDetailsDialog from './expenses/components/ExpenseDetailsDialog';
import Sidebar from './expenses/components/Sidebar';
import TransactionPanel from './expenses/components/TransactionPanel';
import ReportPanel from './expenses/components/ReportPanel';
import OverviewPanel from './expenses/components/OverviewPanel';
import BudgetManagementPanel from './expenses/components/BudgetManagementPanel';
import BudgetPaymentDialog from './expenses/components/BudgetPaymentDialog';
import BudgetPrintableReport, {
  PrintableBudgetReportData,
} from './expenses/components/BudgetPrintableReport';
import CategoryDepartmentManager from './expenses/components/CategoryDepartmentManager';
import ReportExportPanel, {
  PrintableReport,
  PrintableReportData,
} from './expenses/components/ReportExportPanel';
import BackupPanel from './expenses/components/BackupPanel';
import DatabaseConnectionForm from './expenses/components/DatabaseConnectionForm';

const EMPTY_SNAPSHOT: FinanceSnapshot = {
  expenses: [],
  budgetTransactions: [],
  categories: [],
  departments: [],
};

/** Reload from the database when the window regains focus, at most this often. */
const FOCUS_REFRESH_MS = 30_000;

type LoadState =
  | 'checking'
  | 'needs-connection'
  | 'loading'
  | 'ready'
  | 'error';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

async function toUploads(files: File[]): Promise<AttachmentUpload[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((existing) => existing.id === item.id)
    ? items.map((existing) => (existing.id === item.id ? item : existing))
    : [item, ...items];
}

const CATEGORY_COLORS = [
  '#7368e8',
  '#34a881',
  '#f2a84a',
  '#e77777',
  '#6f9de8',
  '#b07ad9',
  '#4fb8c4',
  '#d9a23f',
];

const TITLES: Record<Section, { title: string; subtitle: string }> = {
  Overview: {
    title: 'Overview',
    subtitle: "Here's what's happening with your company finances.",
  },
  Transactions: {
    title: 'Transactions',
    subtitle: 'Every expense, accounted for and easy to find.',
  },
  Budgets: {
    title: 'Budgets',
    subtitle: 'Review every budget received by the company.',
  },
  Reports: {
    title: 'Reports',
    subtitle: 'Review spending by day, week, month, or year.',
  },
  Settings: {
    title: 'Settings',
    subtitle: 'Export reports and manage categories and departments.',
  },
  Backup: {
    title: 'Backup & restore',
    subtitle: 'Protect company data and recover it when needed.',
  },
};

export default function App({ api }: { api: FinanceApi }) {
  const [loadState, setLoadState] = useState<LoadState>('checking');
  const [loadError, setLoadError] = useState('');
  const [dbStatus, setDbStatus] = useState<DatabaseStatus>();
  const [data, setData] = useState<FinanceSnapshot>(EMPTY_SNAPSHOT);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date>();
  const [legacyAvailable, setLegacyAvailable] = useState(false);
  const [importing, setImporting] = useState(false);
  const [appMessage, setAppMessage] = useState<{
    kind: 'ok' | 'error';
    text: string;
  }>();
  const { expenses, budgetTransactions, categories, departments } = data;
  const [section, setSection] = useState<Section>('Overview');
  const [printReport, setPrintReport] = useState<PrintableReportData>();
  const [printBudgetReport, setPrintBudgetReport] =
    useState<PrintableBudgetReportData>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense>();
  const [selectedExpense, setSelectedExpense] = useState<Expense>();
  const [expenseToDelete, setExpenseToDelete] = useState<Expense>();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<BudgetTransaction>();
  const [paymentToDelete, setPaymentToDelete] = useState<BudgetTransaction>();
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [transactionMonth, setTransactionMonth] = useState('');
  const [transactionPayee, setTransactionPayee] = useState('');
  const loadingRef = useRef(false);

  const loadData = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (!silent) setLoadState('loading');
      try {
        const snapshot = await api.data.load();
        setData(snapshot);
        setLastLoadedAt(new Date());
        setLegacyAvailable(
          snapshot.expenses.length === 0 &&
            snapshot.budgetTransactions.length === 0 &&
            hasLegacyData(),
        );
        setLoadState('ready');
      } catch (error) {
        if (silent) {
          setAppMessage({
            kind: 'error',
            text: errorMessage(
              error,
              'Could not refresh data from the database.',
            ),
          });
        } else {
          setLoadError(
            errorMessage(error, 'Could not load data from the database.'),
          );
          setLoadState('error');
        }
      } finally {
        loadingRef.current = false;
      }
    },
    [api],
  );

  useEffect(() => {
    let active = true;
    async function checkConnection() {
      try {
        const status = await api.database.status();
        if (!active) return;
        setDbStatus(status);
        if (status.connected) loadData();
        else setLoadState('needs-connection');
      } catch (error) {
        if (!active) return;
        setLoadError(
          errorMessage(error, 'Could not check the database connection.'),
        );
        setLoadState('error');
      }
    }
    checkConnection();
    return () => {
      active = false;
    };
  }, [api, loadData]);

  // Pick up changes made by other users of the same database.
  useEffect(() => {
    if (loadState !== 'ready') return undefined;
    const onFocus = () => {
      if (
        !lastLoadedAt ||
        Date.now() - lastLoadedAt.getTime() > FOCUS_REFRESH_MS
      ) {
        loadData({ silent: true });
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadState, lastLoadedAt, loadData]);

  const handleConnected = useCallback(
    (status: DatabaseStatus) => {
      setDbStatus(status);
      loadData();
    },
    [loadData],
  );

  const importLegacyData = useCallback(async () => {
    setImporting(true);
    setAppMessage(undefined);
    try {
      const result = await api.data.importLegacy(await readLegacyPayload());
      markLegacyDataImported();
      setAppMessage({
        kind: 'ok',
        text: `Imported ${plural(result.expenses, 'expense')}, ${plural(result.budgetTransactions, 'budget payment')} and ${plural(result.attachments, 'receipt file')} into the database.`,
      });
      await loadData({ silent: true });
    } catch (error) {
      setAppMessage({
        kind: 'error',
        text: errorMessage(error, 'The device data could not be imported.'),
      });
    } finally {
      setImporting(false);
    }
  }, [api, loadData]);

  const openExpenseDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const showTransactions = useCallback(() => {
    setSection('Transactions');
  }, []);

  const preparePdfExport = useCallback((report: PrintableReportData) => {
    setPrintReport(report);
  }, []);

  const prepareBudgetPdfExport = useCallback(
    (report: PrintableBudgetReportData) => {
      setPrintBudgetReport(report);
    },
    [],
  );

  // Once the printable report is mounted, the main process saves it as a PDF.
  useEffect(() => {
    const fileName = printBudgetReport?.fileName ?? printReport?.fileName;
    if (!fileName) return undefined;

    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        const savedPath = await api.reports.savePdf(fileName);
        if (active && savedPath) {
          setAppMessage({ kind: 'ok', text: `PDF saved: ${savedPath}` });
        }
      } catch (error) {
        if (active) {
          setAppMessage({
            kind: 'error',
            text: errorMessage(error, 'The PDF could not be saved.'),
          });
        }
      } finally {
        if (active) {
          setPrintReport(undefined);
          setPrintBudgetReport(undefined);
        }
      }
    }, 100);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [api, printReport, printBudgetReport]);

  const monthExpenses = useMemo(() => monthToDate(expenses), [expenses]);
  const { start: currentMonthStart, end: currentMonthEnd } =
    getMonthDateRange();
  const { totalBudget, remainingBudget: remaining } = calculateBudgetForPeriod(
    expenses,
    budgetTransactions,
    currentMonthStart,
    currentMonthEnd,
  );
  const currentMonthExpenses = monthExpenses.reduce(
    (total, expense) => total + getExpenseTotal(expense),
    0,
  );
  const monthlyExpenseSummaries = getMonthlyExpenseSummaries(expenses);
  const transactionEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...expenses]
      .filter(
        (expense) =>
          !transactionMonth || expense.date.slice(0, 7) === transactionMonth,
      )
      .filter(
        (expense) => !transactionPayee || expense.payee === transactionPayee,
      )
      .filter((expense) =>
        [
          expense.date,
          expense.payee,
          expense.invoiceNo,
          expense.particulars,
          expense.description,
          expense.projectName,
          expense.siteName,
          expense.vatNo,
          expense.type,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, search, transactionMonth, transactionPayee]);

  const saveExpense = useCallback(
    async (input: ExpenseInput, files: File[]) => {
      const uploads = await toUploads(files);
      const saved = editingExpense
        ? await api.expenses.update(editingExpense.id, input, uploads)
        : await api.expenses.create(input, uploads);
      setData((current) => ({
        ...current,
        expenses: upsert(current.expenses, saved),
      }));
      setEditingExpense(undefined);
      setDialogOpen(false);
    },
    [api, editingExpense],
  );

  const confirmDeleteBudgetPayment = useCallback(async () => {
    if (!paymentToDelete) return;
    setDeleting(true);
    try {
      await api.budgets.remove(paymentToDelete.id);
      setData((current) => ({
        ...current,
        budgetTransactions: current.budgetTransactions.filter(
          (item) => item.id !== paymentToDelete.id,
        ),
      }));
      setPaymentToDelete(undefined);
    } catch (error) {
      setAppMessage({
        kind: 'error',
        text: errorMessage(error, 'The payment could not be deleted.'),
      });
      setPaymentToDelete(undefined);
    } finally {
      setDeleting(false);
    }
  }, [api, paymentToDelete]);

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

  const closeExpenseDetails = useCallback(() => {
    setSelectedExpense(undefined);
  }, []);

  const editExpense = useCallback((expense: Expense) => {
    setSelectedExpense(undefined);
    setEditingExpense(expense);
    setDialogOpen(true);
  }, []);

  const deleteExpense = useCallback((expense: Expense) => {
    setSelectedExpense(undefined);
    setExpenseToDelete(expense);
  }, []);

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

  const saveBudgetPayment = useCallback(
    async (input: BudgetTransactionInput) => {
      const saved = editingPayment
        ? await api.budgets.update(editingPayment.id, input)
        : await api.budgets.create(input);
      setData((current) => ({
        ...current,
        budgetTransactions: upsert(current.budgetTransactions, saved),
      }));
      setEditingPayment(undefined);
      setPaymentDialogOpen(false);
    },
    [api, editingPayment],
  );

  const confirmDeleteExpense = useCallback(async () => {
    if (!expenseToDelete) return;
    setDeleting(true);
    try {
      // Receipt files are removed with the expense in the same transaction.
      await api.expenses.remove(expenseToDelete.id);
      setData((current) => ({
        ...current,
        expenses: current.expenses.filter(
          (item) => item.id !== expenseToDelete.id,
        ),
      }));
      setExpenseToDelete(undefined);
    } catch (error) {
      setAppMessage({
        kind: 'error',
        text: errorMessage(error, 'The expense could not be deleted.'),
      });
      setExpenseToDelete(undefined);
    } finally {
      setDeleting(false);
    }
  }, [api, expenseToDelete]);

  const closeDeleteConfirmation = useCallback(() => {
    setExpenseToDelete(undefined);
  }, []);

  const addCategory = useCallback(
    async (value: string) => {
      await api.categories.add(value);
      setData((current) => ({
        ...current,
        categories: [...current.categories, value],
      }));
    },
    [api],
  );

  const deleteCategory = useCallback(
    async (value: string) => {
      await api.categories.remove(value);
      setData((current) => ({
        ...current,
        categories: current.categories.filter((item) => item !== value),
      }));
    },
    [api],
  );

  const addDepartment = useCallback(
    async (value: string) => {
      await api.departments.add(value);
      setData((current) => ({
        ...current,
        departments: [...current.departments, value],
      }));
    },
    [api],
  );

  const deleteDepartment = useCallback(
    async (value: string) => {
      await api.departments.remove(value);
      setData((current) => ({
        ...current,
        departments: current.departments.filter((item) => item !== value),
      }));
    },
    [api],
  );

  // The database cascades renames to expenses; mirror that locally.
  const renameCategory = useCallback(
    async (previous: string, next: string) => {
      await api.categories.rename(previous, next);
      setData((current) => ({
        ...current,
        categories: current.categories.map((item) =>
          item === previous ? next : item,
        ),
        expenses: current.expenses.map((expense) =>
          expense.category === previous
            ? { ...expense, category: next, type: next }
            : expense,
        ),
      }));
    },
    [api],
  );

  const renameDepartment = useCallback(
    async (previous: string, next: string) => {
      await api.departments.rename(previous, next);
      setData((current) => ({
        ...current,
        departments: current.departments.map((item) =>
          item === previous ? next : item,
        ),
        expenses: current.expenses.map((expense) =>
          expense.department === previous
            ? { ...expense, department: next }
            : expense,
        ),
      }));
    },
    [api],
  );

  if (loadState !== 'ready') {
    return (
      <FinanceApiProvider value={api}>
        <main className="startup-screen">
          <section className="panel startup-card">
            <div className="brand-lockup">
              <div className="brand-mark">
                m<span>.</span>
              </div>
              <div className="brand-copy">
                <strong>moon</strong>
                <span>CONTRACTING &amp; CLEANING</span>
              </div>
            </div>
            {(loadState === 'checking' || loadState === 'loading') && (
              <p className="startup-status" role="status">
                {loadState === 'checking'
                  ? 'Connecting to the database…'
                  : 'Loading company data…'}
              </p>
            )}
            {loadState === 'needs-connection' && (
              <>
                <h1>Connect to the company database</h1>
                <p className="page-subtitle">
                  Expenses and budgets are stored in PostgreSQL. Enter the
                  server details from your administrator. Tables are created
                  automatically the first time.
                </p>
                {dbStatus?.error && (
                  <p className="form-error" role="alert">
                    {dbStatus.error}
                  </p>
                )}
                <DatabaseConnectionForm
                  status={dbStatus}
                  onCancel={undefined}
                  onConnected={handleConnected}
                />
              </>
            )}
            {loadState === 'error' && (
              <>
                <h1>The database is not available</h1>
                <p className="form-error" role="alert">
                  {loadError}
                </p>
                <div className="dialog-actions">
                  {dbStatus?.source !== 'env' && (
                    <button
                      className="button button-secondary"
                      onClick={() => setLoadState('needs-connection')}
                      type="button"
                    >
                      Change connection
                    </button>
                  )}
                  <button
                    className="button button-primary"
                    onClick={() => loadData()}
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              </>
            )}
          </section>
        </main>
      </FinanceApiProvider>
    );
  }

  const page = TITLES[section];
  const categoryBudgets: Budget[] = categories.map((category, index) => ({
    category,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }));
  const budgetStatus =
    remaining >= 0
      ? `${formatCurrency(remaining)} remains after this month's expenses`
      : `${formatCurrency(Math.abs(remaining))} more spent than this month's available budget`;
  const pageTitle = section === 'Overview' ? greeting() : page.title;

  return (
    <FinanceApiProvider value={api}>
      <div className="app-shell">
        <Sidebar
          budget={totalBudget}
          onSelect={setSection}
          section={section}
          transactionCount={expenses.length}
        />
        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumb">
              Moon Trading Contracting &amp; Cleaning <span>/</span> Finance
            </div>
            <div className="topbar-right">
              <span className="period-label">Reporting period</span>
              <span className="period-pill">
                This month <span aria-hidden="true">⌄</span>
              </span>
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
                <h1>{pageTitle}</h1>
                <p className="page-subtitle">{page.subtitle}</p>
              </div>
              {section === 'Transactions' && (
                <div className="heading-actions">
                  <button
                    className="button button-primary"
                    onClick={openExpenseDialog}
                    type="button"
                  >
                    <span aria-hidden="true">＋</span> Add expense
                  </button>
                </div>
              )}
            </section>

            {appMessage && (
              <div
                className={`app-message ${appMessage.kind}`}
                role={appMessage.kind === 'error' ? 'alert' : 'status'}
              >
                <span>{appMessage.text}</span>
                <button
                  aria-label="Dismiss message"
                  className="dialog-close"
                  onClick={() => setAppMessage(undefined)}
                  type="button"
                >
                  ×
                </button>
              </div>
            )}

            {legacyAvailable && (
              <div className="app-message info" role="status">
                <span>
                  Expense data saved on this computer by the previous version of
                  the app was found. Import it into the database so it is backed
                  up and shared.
                </span>
                <button
                  className="button button-primary"
                  disabled={importing}
                  onClick={importLegacyData}
                  type="button"
                >
                  {importing ? 'Importing…' : 'Import device data'}
                </button>
              </div>
            )}

            {section === 'Overview' && (
              <OverviewPanel
                monthExpenses={monthExpenses}
                monthlyExpenseSummaries={monthlyExpenseSummaries}
                budgets={categoryBudgets}
                totalExpenses={currentMonthExpenses}
                expenseCount={monthExpenses.length}
                totalBudget={totalBudget}
                remaining={remaining}
                budgetStatus={budgetStatus}
                recentExpenses={[...expenses]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 5)}
                onShowTransactions={showTransactions}
              />
            )}

            {section === 'Transactions' && (
              <TransactionPanel
                expenses={transactionEntries}
                month={transactionMonth}
                payee={transactionPayee}
                search={search}
                payees={[
                  ...new Set(expenses.map((expense) => expense.payee)),
                ].sort()}
                onMonthChange={setTransactionMonth}
                onPayeeChange={setTransactionPayee}
                onSearchChange={setSearch}
                onSelect={setSelectedExpense}
              />
            )}

            {section === 'Budgets' && (
              <BudgetManagementPanel
                payments={budgetTransactions}
                onAddPayment={openBudgetPaymentDialog}
                onEditPayment={openEditBudgetPayment}
                onDeletePayment={requestDeleteBudgetPayment}
                onExportPdf={prepareBudgetPdfExport}
              />
            )}

            {section === 'Reports' && (
              <ReportPanel
                expenses={expenses}
                payments={budgetTransactions}
                onSelect={setSelectedExpense}
                onExportPdf={preparePdfExport}
              />
            )}
            {section === 'Settings' && (
              <>
                <ReportExportPanel
                  expenses={expenses}
                  payments={budgetTransactions}
                  onExportPdf={preparePdfExport}
                />
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
              </>
            )}
            {section === 'Backup' && (
              <BackupPanel
                status={dbStatus}
                onStatusChange={handleConnected}
                onRestored={() => loadData({ silent: true })}
              />
            )}
            <footer className="page-footer">
              Saved in PostgreSQL
              {dbStatus?.settings?.database
                ? ` (${dbStatus.settings.database})`
                : ''}{' '}
              <span>·</span> Last updated{' '}
              {lastLoadedAt?.toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
              <span>·</span>
              <button
                className="text-button"
                onClick={() => loadData({ silent: true })}
                type="button"
              >
                Refresh
              </button>
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
            onSubmit={saveBudgetPayment}
          />
        )}
        {selectedExpense && (
          <ExpenseDetailsDialog
            expense={selectedExpense}
            onClose={closeExpenseDetails}
            onEdit={editExpense}
            onDelete={deleteExpense}
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
                    The transaction for {expenseToDelete.payee} and its receipt
                    files will be permanently removed from the database.
                  </p>
                </div>
              </div>
              <div className="dialog-actions">
                <button
                  className="button button-secondary"
                  disabled={deleting}
                  onClick={closeDeleteConfirmation}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button button-danger"
                  disabled={deleting}
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
                  disabled={deleting}
                  onClick={closePaymentDeleteConfirmation}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="button button-danger"
                  disabled={deleting}
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
      {printReport && <PrintableReport data={printReport} />}
      {printBudgetReport && <BudgetPrintableReport data={printBudgetReport} />}
    </FinanceApiProvider>
  );
}
