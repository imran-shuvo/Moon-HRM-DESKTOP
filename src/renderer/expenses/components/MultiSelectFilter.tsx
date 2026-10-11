import { useEffect, useRef, useState } from 'react';

/** Long lists get a search box. */
const SEARCH_FROM = 7;

/**
 * A filter dropdown where several options can be ticked. Nothing ticked
 * means no filtering ("All …").
 */
export default function MultiSelectFilter<T extends string>({
  id,
  label,
  allLabel,
  options,
  labels,
  counts,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  options: readonly T[];
  labels: Record<T, string>;
  /** How many records each option matches, shown beside it. */
  counts: Partial<Record<T, number>>;
  selected: T[];
  onChange: (selected: T[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState('');

  // Close when clicking anywhere else or pressing Escape, like a native dropdown.
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        ref.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.open = false;
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = options.filter(
    (option) => !needle || labels[option].toLowerCase().includes(needle),
  );
  let summary = allLabel;
  if (selected.length > 0 && selected.length <= 2) {
    summary = selected.map((option) => labels[option]).join(', ');
  } else if (selected.length > 2) {
    summary = `${selected.length} selected`;
  }
  // Keep the options' order whatever order they were ticked in.
  const ordered = (values: T[]) =>
    options.filter((option) => values.includes(option));

  return (
    <div className="filter-control">
      <span id={`${id}-label`}>{label}</span>
      <details className="multi-select" ref={ref}>
        <summary
          aria-describedby={`${id}-label`}
          className={selected.length ? 'has-selection' : undefined}
          title={selected.map((option) => labels[option]).join(', ')}
        >
          <span className="multi-select-summary">{summary}</span>
          {selected.length > 0 && (
            <span aria-hidden="true" className="multi-select-badge">
              {selected.length}
            </span>
          )}
        </summary>
        <fieldset className="multi-select-menu">
          <legend className="visually-hidden">{label}</legend>
          {options.length >= SEARCH_FROM && (
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              className="multi-select-search"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
            />
          )}
          {options.length > 1 && (
            <div className="multi-select-actions">
              <button
                className="text-button"
                disabled={visible.every((option) => selected.includes(option))}
                onClick={() => onChange(ordered([...selected, ...visible]))}
                type="button"
              >
                Select {needle ? 'matches' : 'all'}
              </button>
              <button
                className="text-button"
                disabled={selected.length === 0}
                onClick={() => onChange([])}
                type="button"
              >
                Clear
              </button>
            </div>
          )}
          <div className="multi-select-options">
            {visible.map((option) => (
              <label
                htmlFor={`${id}-${option || 'none'}`}
                key={option || 'none'}
              >
                <input
                  aria-label={labels[option]}
                  checked={selected.includes(option)}
                  id={`${id}-${option || 'none'}`}
                  onChange={(event) =>
                    onChange(
                      event.currentTarget.checked
                        ? ordered([...selected, option])
                        : selected.filter((item) => item !== option),
                    )
                  }
                  type="checkbox"
                />
                <span className="multi-select-option">{labels[option]}</span>
                {counts[option] !== undefined && (
                  <span aria-hidden="true" className="multi-select-count">
                    {counts[option]}
                  </span>
                )}
              </label>
            ))}
            {visible.length === 0 && (
              <p className="multi-select-empty">
                {options.length ? 'No matches' : 'Nothing to choose yet'}
              </p>
            )}
          </div>
        </fieldset>
      </details>
    </div>
  );
}

/** How many of `items` have each value, for MultiSelectFilter counts. */
export function countBy<T, K extends string>(
  items: T[],
  pick: (item: T) => K,
): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  items.forEach((item) => {
    const key = pick(item);
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return counts;
}
