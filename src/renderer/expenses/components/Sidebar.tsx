import { Section } from '../model';

const NAVIGATION: { label: Section; icon: string }[] = [
  { label: 'Overview', icon: '◫' },
  { label: 'Transactions', icon: '↕' },
  { label: 'Budgets', icon: '▥' },
  { label: 'Reports', icon: '▤' },
  { label: 'Settings', icon: '⚙' },
];

export default function Sidebar({
  section,
  onSelect,
  budget,
  spent,
  transactionCount,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  budget: number;
  spent: number;
  transactionCount: number;
}) {
  const budgetUsage = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const available = budget - spent;

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">
          m<span>.</span>
        </div>
        <div className="brand-copy">
          <strong>moon</strong>
          <span>CONTRACTING &amp; CLEANING</span>
        </div>
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
            <span>Available balance</span>
            <span aria-hidden="true">↗</span>
          </div>
          <strong>
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 2,
            }).format(available)}
          </strong>
          <div className="budget-widget-progress">
            <span style={{ width: `${budgetUsage}%` }} />
          </div>
          <span className="budget-widget-caption">
            {budgetUsage.toFixed(0)}% of received funds used
          </span>
        </div>
        <div className="user-profile">
          <div className="profile-avatar">AM</div>
          <div className="profile-copy">
            <strong>Alex Morgan</strong>
            <span>Finance manager</span>
          </div>
          <span className="profile-menu">···</span>
        </div>
      </div>
    </aside>
  );
}
