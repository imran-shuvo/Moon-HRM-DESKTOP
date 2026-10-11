import { useState } from 'react';
import { formatMonthName, monthKey } from '../../../shared/months';
import { roundMoney } from '../../../shared/payroll';
import {
  Employee,
  PayrollSettings,
  Payslip,
  SalaryAdvance,
  formatCurrency,
  plural,
} from '../model';
import CreatePayslipsDialog from './CreatePayslipsDialog';
import ExportPreviewDialog from './ExportPreviewDialog';
import { useSessionState } from './FilterBar';
import PayrollAdvances from './PayrollAdvances';
import PayrollPayslips, {
  NO_PAYSLIP_FILTERS,
  PayslipFilters,
} from './PayrollPayslips';
import PayrollSettingsPanel from './PayrollSettingsPanel';
import PayslipDialog from './PayslipDialog';
import { MonthNavigator } from './peopleUi';
import { PrintJob } from './printJob';

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

/**
 * Payroll for one month: payslips (create, edit, pay, print) and salary
 * advances. Settings open in a dialog.
 */
export default function PayrollPanel({
  employees,
  payslips,
  salaryAdvances,
  payrollSettings,
  onPayslipsSaved,
  onPayslipRemoved,
  onAdvancesSaved,
  onAdvanceRemoved,
  onSettingsSaved,
  onPrint,
}: {
  employees: Employee[];
  payslips: Payslip[];
  salaryAdvances: SalaryAdvance[];
  payrollSettings: PayrollSettings;
  onPayslipsSaved: (payslips: Payslip[]) => void;
  onPayslipRemoved: (id: string) => void;
  onAdvancesSaved: (advances: SalaryAdvance[]) => void;
  onAdvanceRemoved: (id: string) => void;
  onSettingsSaved: (settings: PayrollSettings) => void;
  onPrint: (job: PrintJob) => void;
}) {
  const [tab, setTab] = useState<'payslips' | 'advances'>('payslips');
  const [month, setMonth] = useState(monthKey());
  const [filters, setFilters] = useSessionState<PayslipFilters>(
    'payslips',
    NO_PAYSLIP_FILTERS,
  );
  const [openId, setOpenId] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preview, setPreview] = useState<PrintJob>();
  const [message, setMessage] = useState('');
  const open = payslips.find((payslip) => payslip.id === openId);
  const monthPayslips = payslips.filter((payslip) => payslip.month === month);
  const paid = monthPayslips.filter((payslip) => payslip.status === 'paid');
  const unpaid = monthPayslips.filter((payslip) => payslip.status === 'unpaid');

  return (
    <div className="people-section payroll-simple">
      <section className="panel people-panel">
        <div className="payroll-header">
          <div
            aria-label="Payroll view"
            className="segmented segmented-large"
            role="tablist"
          >
            <button
              aria-selected={tab === 'payslips'}
              className={tab === 'payslips' ? 'active' : undefined}
              onClick={() => setTab('payslips')}
              role="tab"
              type="button"
            >
              Payslips
            </button>
            <button
              aria-selected={tab === 'advances'}
              className={tab === 'advances' ? 'active' : undefined}
              onClick={() => setTab('advances')}
              role="tab"
              type="button"
            >
              Advances
            </button>
          </div>
          {tab === 'payslips' && (
            <MonthNavigator
              id="payroll-month"
              value={month}
              onChange={setMonth}
            />
          )}
          <button
            className="button button-secondary push-right"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            ⚙ Payroll settings
          </button>
        </div>

        {tab === 'payslips' && (
          <div
            className="payroll-totals"
            aria-label={`Totals for ${formatMonthName(month)}`}
          >
            <div>
              <span>Net pay</span>
              <strong>
                {formatCurrency(sum(monthPayslips.map((p) => p.netPay)))}
              </strong>
              <small>{plural(monthPayslips.length, 'payslip')}</small>
            </div>
            <div className="total-paid">
              <span>Paid</span>
              <strong>{formatCurrency(sum(paid.map((p) => p.netPay)))}</strong>
              <small>{plural(paid.length, 'payslip')}</small>
            </div>
            <div className="total-unpaid">
              <span>Unpaid</span>
              <strong>
                {formatCurrency(sum(unpaid.map((p) => p.netPay)))}
              </strong>
              <small>{plural(unpaid.length, 'payslip')}</small>
            </div>
          </div>
        )}

        {message && (
          <div className="app-message ok panel-message" role="status">
            <span>{message}</span>
            <button
              aria-label="Dismiss message"
              className="dialog-close"
              onClick={() => setMessage('')}
              type="button"
            >
              ×
            </button>
          </div>
        )}

        {tab === 'payslips' && (
          <PayrollPayslips
            month={month}
            employees={employees}
            payslips={payslips}
            filters={filters}
            onFiltersChange={setFilters}
            onOpen={(payslip) => setOpenId(payslip.id)}
            onSaved={onPayslipsSaved}
            onPreview={setPreview}
            onCreate={() => setCreating(true)}
          />
        )}
        {tab === 'advances' && (
          <PayrollAdvances
            employees={employees}
            advances={salaryAdvances}
            payslips={payslips}
            onSaved={onAdvancesSaved}
            onRemoved={onAdvanceRemoved}
          />
        )}
      </section>

      {creating && (
        <CreatePayslipsDialog
          month={month}
          employees={employees}
          payslips={payslips}
          advances={salaryAdvances}
          settings={payrollSettings}
          onClose={() => setCreating(false)}
          onCreated={(saved, who) => {
            onPayslipsSaved(saved);
            setCreating(false);
            setMessage(
              `${plural(saved.length, 'payslip')} created for ${who} (${formatMonthName(month)}). Click a name to check or edit it.`,
            );
          }}
        />
      )}
      {open && (
        <PayslipDialog
          key={open.id}
          payslip={open}
          employee={employees.find(
            (employee) => employee.id === open.employeeId,
          )}
          settings={payrollSettings}
          advances={salaryAdvances}
          payslips={payslips}
          onClose={() => setOpenId(undefined)}
          onSaved={onPayslipsSaved}
          onRemoved={(id) => {
            onPayslipRemoved(id);
            setOpenId(undefined);
          }}
          onPrint={setPreview}
        />
      )}
      {settingsOpen && (
        <div className="dialog-backdrop">
          <section
            aria-label="Payroll settings"
            aria-modal="true"
            className="expense-dialog settings-dialog"
            role="dialog"
          >
            <button
              aria-label="Close dialog"
              className="dialog-close dialog-close-corner"
              onClick={() => setSettingsOpen(false)}
              type="button"
            >
              ×
            </button>
            <PayrollSettingsPanel
              settings={payrollSettings}
              onSaved={(settings) => {
                onSettingsSaved(settings);
                setSettingsOpen(false);
                setMessage(
                  'Payroll settings saved. They apply to payslips created or recalculated from now on.',
                );
              }}
            />
          </section>
        </div>
      )}
      {preview && (
        <ExportPreviewDialog
          title="Print preview"
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
    </div>
  );
}
