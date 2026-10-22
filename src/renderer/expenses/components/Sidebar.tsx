import moonLogo from '../../../../assets/moon-logo.png';
import {
  PETTY_CASH_SECTIONS,
  PettyCashSection,
  Section,
  SubPage,
  VOUCHER_PAGES,
  VoucherPage,
  formatCurrency,
} from '../model';

const NAVIGATION: {
  heading: string;
  items: { label: Section; icon: string }[];
}[] = [
  {
    heading: 'FINANCE',
    items: [
      { label: 'Overview', icon: '◫' },
      { label: 'Transactions', icon: '↕' },
      { label: 'Budgets', icon: '▥' },
      { label: 'Petty Cash', icon: '◈' },
      { label: 'Vouchers', icon: '🧾' },
      { label: 'Reports', icon: '▤' },
    ],
  },
  {
    heading: 'PEOPLE',
    items: [
      { label: 'Employees', icon: '☺' },
      { label: 'Attendance', icon: '✓' },
      { label: 'Payroll', icon: '¤' },
      { label: 'Documents', icon: '🗂' },
    ],
  },
  {
    heading: 'SYSTEM',
    items: [
      { label: 'Settings', icon: '⚙' },
      { label: 'Backup', icon: '⛁' },
    ],
  },
];

/** A section's pages, listed under it while it is open. */
function subPages<T extends string>(
  pages: SubPage<T>[],
  current: T,
  onSelect: (page: T) => void,
) {
  return pages.map((page) => (
    <button
      aria-current={current === page.id ? 'page' : undefined}
      className={`nav-item nav-subitem${current === page.id ? ' active' : ''}`}
      key={page.id}
      onClick={() => onSelect(page.id)}
      type="button"
    >
      {page.label}
    </button>
  ));
}

export default function Sidebar({
  section,
  onSelect,
  pettyCashSection,
  onSelectPettyCash,
  voucherPage,
  onSelectVoucherPage,
  budget,
  transactionCount,
  unpaidPayslipCount,
  expiringIqamaCount,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  /** The open Petty Cash page; its pages are listed under Petty Cash. */
  pettyCashSection: PettyCashSection;
  onSelectPettyCash: (page: PettyCashSection) => void;
  /** The open Vouchers page; its pages are listed under Vouchers. */
  voucherPage: VoucherPage;
  onSelectVoucherPage: (page: VoucherPage) => void;
  budget: number;
  transactionCount: number;
  unpaidPayslipCount: number;
  /** Employees whose Iqama expires soon or has expired. */
  expiringIqamaCount: number;
}) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <img
          alt="Moon Trading Contracting and Cleaning"
          className="brand-logo"
          src={moonLogo}
        />
      </div>
      <nav aria-label="Main navigation">
        {NAVIGATION.map((group) => (
          <div className="nav-group" key={group.heading}>
            <div className="workspace-label">{group.heading}</div>
            {group.items.map((item) => [
              <button
                aria-current={section === item.label ? 'page' : undefined}
                className={`nav-item${section === item.label ? ' active' : ''}`}
                key={item.label}
                onClick={() => onSelect(item.label)}
                type="button"
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
                {item.label === 'Transactions' && (
                  <span className="nav-count">{transactionCount}</span>
                )}
                {item.label === 'Employees' && expiringIqamaCount > 0 && (
                  <span
                    className="nav-count nav-count-alert"
                    title="Iqamas expiring within 30 days or expired"
                  >
                    {expiringIqamaCount}
                  </span>
                )}
                {item.label === 'Payroll' && unpaidPayslipCount > 0 && (
                  <span className="nav-count" title="Unpaid payslips">
                    {unpaidPayslipCount}
                  </span>
                )}
              </button>,
              item.label === 'Petty Cash' &&
                section === 'Petty Cash' &&
                subPages(
                  PETTY_CASH_SECTIONS,
                  pettyCashSection,
                  onSelectPettyCash,
                ),
              item.label === 'Vouchers' &&
                section === 'Vouchers' &&
                subPages(VOUCHER_PAGES, voucherPage, onSelectVoucherPage),
            ])}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="budget-widget">
          <div className="budget-widget-title">
            <span>Budget available this month</span>
            <span aria-hidden="true">↗</span>
          </div>
          <strong>{formatCurrency(budget)}</strong>
          <span className="budget-widget-caption">
            Includes previous remaining budget
          </span>
        </div>
      </div>
    </aside>
  );
}
