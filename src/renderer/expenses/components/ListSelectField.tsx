import { useState } from 'react';

const NEW_OPTION = '__new__';

/**
 * A dropdown of saved names (managed in Settings) with a last option to type
 * a new one. A new name is added to the saved list when the form is saved.
 * The chosen or typed value is submitted under `name`.
 */
export default function ListSelectField({
  id,
  label,
  name,
  options,
  defaultValue,
  newOptionLabel,
  placeholder,
  maxLength,
  className,
}: {
  id: string;
  label: string;
  name: string;
  options: string[];
  defaultValue: string;
  newOptionLabel: string;
  placeholder: string;
  maxLength: number;
  className: string;
}) {
  // An old value missing from the list is still offered, so editing keeps it.
  const choices =
    defaultValue && !options.includes(defaultValue)
      ? [...options, defaultValue]
      : options;
  const [selected, setSelected] = useState(
    defaultValue || choices[0] || NEW_OPTION,
  );
  const typingNew = selected === NEW_OPTION;

  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={typingNew ? undefined : name}
        onChange={(event) => setSelected(event.currentTarget.value)}
        value={selected}
      >
        {choices.map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
        <option value={NEW_OPTION}>＋ {newOptionLabel}</option>
      </select>
      {typingNew && (
        <input
          aria-label={newOptionLabel}
          // Focus is expected right after choosing "new" from the dropdown.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={choices.length > 0}
          maxLength={maxLength}
          name={name}
          placeholder={placeholder}
          required
        />
      )}
    </div>
  );
}
