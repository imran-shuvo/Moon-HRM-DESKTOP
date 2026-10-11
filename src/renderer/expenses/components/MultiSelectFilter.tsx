import { useEffect, useRef } from 'react';

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
  selected,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (selected: T[]) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Close when clicking anywhere else, like a native dropdown.
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        ref.current.open = false;
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  let summary = allLabel;
  if (selected.length === 1) summary = labels[selected[0]];
  else if (selected.length > 1) summary = `${selected.length} selected`;

  return (
    <div className="filter-control">
      <span id={`${id}-label`}>{label}</span>
      <details className="multi-select" ref={ref}>
        <summary aria-describedby={`${id}-label`}>{summary}</summary>
        <fieldset className="multi-select-menu">
          <legend className="visually-hidden">{label}</legend>
          {options.map((option) => (
            <label key={option}>
              <input
                checked={selected.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.currentTarget.checked
                      ? options.filter(
                          (item) => item === option || selected.includes(item),
                        )
                      : selected.filter((item) => item !== option),
                  )
                }
                type="checkbox"
              />
              {labels[option]}
            </label>
          ))}
        </fieldset>
      </details>
    </div>
  );
}
