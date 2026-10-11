import { ReactNode, useEffect, useRef, useState } from 'react';
import { formatReportDate, toDateKey, todayKey } from '../model';

/* Remembering filters while the app is open */

/**
 * State kept in sessionStorage, so a page's filters survive moving between
 * pages but start fresh the next time the app opens (a forgotten filter
 * then never hides records).
 */
export function useSessionState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((current: T) => T)) => void] {
  const storageKey = `moon-finance:filters:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored ? { ...initial, ...JSON.parse(stored) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Remembering filters is a convenience only.
    }
  }, [storageKey, value]);
  return [value, setValue];
}

/* Active filter chips */

export type ActiveFilter = { key: string; label: string; onRemove: () => void };

/** One chip per ticked value, e.g. "Project: Mall". */
export function multiChips<T extends string>(
  name: string,
  selected: T[],
  labels: Record<T, string>,
  onChange: (next: T[]) => void,
): ActiveFilter[] {
  return selected.map((value) => ({
    key: `${name}:${value}`,
    label: `${name}: ${labels[value] ?? value}`,
    onRemove: () => onChange(selected.filter((item) => item !== value)),
  }));
}

/** Printed filter description, e.g. "Role: Staff, Outsource camp worker". */
export function summarizeChips(chips: ActiveFilter[]) {
  const groups = new Map<string, string[]>();
  chips.forEach(({ label }) => {
    const split = label.indexOf(': ');
    const name = label.slice(0, split);
    groups.set(name, [...(groups.get(name) ?? []), label.slice(split + 2)]);
  });
  return [...groups.entries()]
    .map(([name, values]) => `${name}: ${values.join(', ')}`)
    .join(' · ');
}

export function searchChip(
  search: string,
  onChange: (value: string) => void,
): ActiveFilter[] {
  return search.trim()
    ? [
        {
          key: 'search',
          label: `Search: “${search.trim()}”`,
          onRemove: () => onChange(''),
        },
      ]
    : [];
}

/* Date ranges with presets */

type Range = { from: string; to: string };

function shift(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Presets relative to today. Weeks run Monday to Sunday, as in Reports. */
export function datePresets(today = todayKey()) {
  const [year, month, day] = today.split('-').map(Number);
  const now = new Date(year, month - 1, day);
  const monday = shift(now, -((now.getDay() + 6) % 7));
  const monthStart = (offset: number) =>
    toDateKey(new Date(year, month - 1 + offset, 1));
  const monthEnd = (offset: number) =>
    toDateKey(new Date(year, month + offset, 0));
  return [
    { id: 'today', label: 'Today', from: today, to: today },
    {
      id: 'yesterday',
      label: 'Yesterday',
      from: toDateKey(shift(now, -1)),
      to: toDateKey(shift(now, -1)),
    },
    {
      id: 'this-week',
      label: 'This week',
      from: toDateKey(monday),
      to: toDateKey(shift(monday, 6)),
    },
    {
      id: 'last-week',
      label: 'Last week',
      from: toDateKey(shift(monday, -7)),
      to: toDateKey(shift(monday, -1)),
    },
    {
      id: 'this-month',
      label: 'This month',
      from: monthStart(0),
      to: monthEnd(0),
    },
    {
      id: 'last-month',
      label: 'Last month',
      from: monthStart(-1),
      to: monthEnd(-1),
    },
    {
      id: 'last-3-months',
      label: 'Last 3 months',
      from: monthStart(-2),
      to: monthEnd(0),
    },
    {
      id: 'this-year',
      label: 'This year',
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    },
    {
      id: 'last-year',
      label: 'Last year',
      from: `${year - 1}-01-01`,
      to: `${year - 1}-12-31`,
    },
  ];
}

/** e.g. "This month", "01-Oct-2026 to 15-Oct-2026", "From 01-Oct-2026". */
export function describeRange({ from, to }: Range) {
  if (!from && !to) return 'All dates';
  const preset = datePresets().find(
    (item) => item.from === from && item.to === to,
  );
  if (preset) return preset.label;
  if (from && to) return `${formatReportDate(from)} to ${formatReportDate(to)}`;
  if (from) return `From ${formatReportDate(from)}`;
  return `Up to ${formatReportDate(to)}`;
}

export function dateChip(
  range: Range,
  onChange: (range: Range) => void,
): ActiveFilter[] {
  return range.from || range.to
    ? [
        {
          key: 'date',
          label: `Date: ${describeRange(range)}`,
          onRemove: () => onChange({ from: '', to: '' }),
        },
      ]
    : [];
}

/** A dropdown of date presets plus a custom From / To range. */
export function DateRangeFilter({
  id,
  label,
  fromLabel,
  toLabel,
  value,
  onChange,
}: {
  id: string;
  label: string;
  /** Accessible names of the custom range inputs. */
  fromLabel: string;
  toLabel: string;
  value: Range;
  onChange: (range: Range) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const invalid = Boolean(value.from && value.to && value.from > value.to);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        ref.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const choose = (range: Range) => {
    onChange(range);
    if (ref.current) ref.current.open = false;
  };
  const active = value.from || value.to;

  return (
    <div className="filter-control">
      <span id={`${id}-label`}>{label}</span>
      <details className="multi-select date-range" ref={ref}>
        <summary
          aria-describedby={`${id}-label`}
          className={`${active ? 'has-selection' : ''}${invalid ? ' invalid' : ''}`}
        >
          <span aria-hidden="true">▦</span>
          <span className="multi-select-summary">{describeRange(value)}</span>
        </summary>
        <div className="multi-select-menu date-range-menu">
          <div className="date-presets">
            <button
              className={!active ? 'selected' : undefined}
              onClick={() => choose({ from: '', to: '' })}
              type="button"
            >
              All dates
            </button>
            {datePresets().map((preset) => (
              <button
                className={
                  preset.from === value.from && preset.to === value.to
                    ? 'selected'
                    : undefined
                }
                key={preset.id}
                onClick={() => choose({ from: preset.from, to: preset.to })}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="date-custom">
            <strong>Custom range</strong>
            <label htmlFor={`${id}-from`}>
              From
              <input
                aria-label={fromLabel}
                id={`${id}-from`}
                onChange={(event) =>
                  onChange({ ...value, from: event.currentTarget.value })
                }
                type="date"
                value={value.from}
              />
            </label>
            <label htmlFor={`${id}-to`}>
              To
              <input
                aria-label={toLabel}
                id={`${id}-to`}
                min={value.from || undefined}
                onChange={(event) =>
                  onChange({ ...value, to: event.currentTarget.value })
                }
                type="date"
                value={value.to}
              />
            </label>
            {invalid && (
              <p className="form-error">From must be on or before To.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * The standard filter layout: search and filters, then a line with the
 * number of results and a removable chip for each active filter.
 */
export default function FilterBar({
  searchId,
  searchLabel,
  searchPlaceholder,
  search,
  onSearchChange,
  children,
  chips,
  shown,
  total,
  noun,
  onClearAll,
}: {
  searchId: string;
  searchLabel: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  /** The filter dropdowns. */
  children: ReactNode;
  chips: ActiveFilter[];
  shown: number;
  total: number;
  /** Plural noun for the count, e.g. "expenses". */
  noun: string;
  onClearAll: () => void;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-controls">
        <label className="search-box filter-search" htmlFor={searchId}>
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={searchLabel}
            id={searchId}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={search}
          />
          {search && (
            <button
              aria-label="Clear search"
              className="search-clear"
              onClick={() => onSearchChange('')}
              type="button"
            >
              ×
            </button>
          )}
        </label>
        {children}
      </div>
      <div className="filter-bar-summary" aria-live="polite">
        <span className="result-count">
          {chips.length ? (
            <>
              Showing <b>{shown}</b> of {total} {noun}
            </>
          ) : (
            <>
              All <b>{total}</b> {noun}
            </>
          )}
        </span>
        {chips.map((chip) => (
          <button
            aria-label={`Remove filter ${chip.label}`}
            className="filter-chip"
            key={chip.key}
            onClick={chip.onRemove}
            type="button"
          >
            {chip.label}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        {chips.length > 0 && (
          <button
            className="text-button clear-all"
            onClick={onClearAll}
            type="button"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
