import moonLogo from '../../../../assets/moon-logo.png';
import { formatCurrency, Section } from '../model';

const NAVIGATION: { label: Section; icon: string }[] = [
  { label: 'Overview', icon: '◫' },
  { label: 'Transactions', icon: '↕' },
  { label: 'Budgets', icon: '▥' },
  { label: 'Reports', icon: '▤' },
  { label: 'Settings', icon: '⚙' },
  { label: 'Backup', icon: '⛁' },
];

export default function Sidebar({
  section,
  onSelect,
  budget,
  transactionCount,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  budget: number;
  transactionCount: number;
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
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {NAVIGATION.map((item) => (
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
          </button>
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
