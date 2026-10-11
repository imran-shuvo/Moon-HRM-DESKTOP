import { useState } from 'react';

const NEW_OPTION = '__new__';

/**
 * A dropdown of saved names with a last option to type a new one. A new
 * name is added to the saved list when the expense is saved. The chosen or
 * typed value is submitted under `name`.
 */
export default function CreatableSelectField({
  id,
  label,
  name,
  options,
  defaultValue,
  noneLabel,
  newOptionLabel,
  maxLength,
}: {
  id: string;
  label: string;
  name: string;
  options: string[];
  defaultValue: string;
  /** When given, an empty choice with this label is offered first. */
  noneLabel?: string;
  newOptionLabel: string;
  maxLength: number;
}) {
  // An old value missing from the list is still offered, so editing keeps it.
  const choices =
    defaultValue && !options.includes(defaultValue)
      ? [...options, defaultValue]
      : options;
  const [selected, setSelected] = useState(
    defaultValue || (noneLabel !== undefined ? '' : (choices[0] ?? NEW_OPTION)),
  );
  const typingNew = selected === NEW_OPTION;

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={typingNew ? undefined : name}
        onChange={(event) => setSelected(event.currentTarget.value)}
        value={selected}
      >
        {noneLabel !== undefined && <option value="">{noneLabel}</option>}
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
          autoFocus
          maxLength={maxLength}
          name={name}
          placeholder={newOptionLabel}
          required
        />
      )}
    </div>
  );
}
