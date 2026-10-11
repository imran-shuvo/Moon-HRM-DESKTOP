/**
 * A required dropdown of names (employees, managed in the Employees section).
 * The chosen value is submitted under `name`.
 */
export default function ListSelectField({
  id,
  label,
  name,
  options,
  defaultValue,
  emptyLabel,
  className,
}: {
  id: string;
  label: string;
  name: string;
  options: string[];
  defaultValue: string;
  /** Shown when nothing is chosen yet. */
  emptyLabel: string;
  className: string;
}) {
  // An old value missing from the list is still offered, so editing keeps it.
  const choices =
    defaultValue && !options.includes(defaultValue)
      ? [...options, defaultValue]
      : options;

  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={defaultValue} required>
        <option disabled value="">
          {choices.length ? emptyLabel : 'Add employees first'}
        </option>
        {choices.map((choice) => (
          <option key={choice}>{choice}</option>
        ))}
      </select>
    </div>
  );
}
