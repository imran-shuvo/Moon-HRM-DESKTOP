import { FormEvent, useState } from 'react';
import { errorMessage } from '../../data/FinanceApiContext';
import { Expense } from '../model';

type ListKind = 'category' | 'department';

function ListEditor({
  kind,
  items,
  expenses,
  onAdd,
  onRename,
  onDelete,
}: {
  kind: ListKind;
  items: string[];
  expenses: Expense[];
  onAdd: (value: string) => Promise<void>;
  onRename: (oldValue: string, newValue: string) => Promise<void>;
  onDelete: (value: string) => Promise<void>;
}) {
  const label = kind === 'category' ? 'Category' : 'Department';
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState('');
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, onSuccess?: () => void) {
    setBusy(true);
    try {
      await action();
      setError('');
      onSuccess?.();
    } catch (actionError) {
      setError(errorMessage(actionError, 'The change could not be saved.'));
    } finally {
      setBusy(false);
    }
  }

  function submitNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newValue.trim();
    if (!value) return;
    if (items.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setError(`${label} already exists.`);
      return;
    }
    run(
      () => onAdd(value),
      () => setNewValue(''),
    );
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = editValue.trim();
    if (!value) {
      setError(`${label} name cannot be empty.`);
      return;
    }
    if (
      value.toLowerCase() !== editing.toLowerCase() &&
      items.some((item) => item.toLowerCase() === value.toLowerCase())
    ) {
      setError(`${label} already exists.`);
      return;
    }
    run(
      () => onRename(editing, value),
      () => setEditing(''),
    );
  }

  function usageCount(value: string) {
    return expenses.filter((expense) =>
      kind === 'category'
        ? expense.category === value
        : expense.department === value,
    ).length;
  }

  function deleteItem(value: string) {
    if (items.length <= 1) {
      setError(`Keep at least one ${label.toLowerCase()} available.`);
      return;
    }
    const usage = usageCount(value);
    if (usage > 0) {
      setError(
        `Cannot delete "${value}" while ${usage} transaction${usage === 1 ? '' : 's'} use it. Edit those transactions first.`,
      );
      return;
    }
    run(() => onDelete(value));
  }

  return (
    <section className="panel list-manager">
      <div className="panel-heading">
        <div>
          <h2>{label}s</h2>
          <p>Add, rename, or remove options used by transactions.</p>
        </div>
      </div>
      <form className="manager-add-form" onSubmit={submitNew}>
        <label className="visually-hidden" htmlFor={`${kind}-new`}>
          New {label.toLowerCase()} name
        </label>
        <input
          id={`${kind}-new`}
          maxLength={40}
          onChange={(event) => setNewValue(event.currentTarget.value)}
          placeholder={`Add ${label.toLowerCase()}`}
          value={newValue}
        />
        <button className="button button-primary" disabled={busy} type="submit">
          Add
        </button>
      </form>
      {error && (
        <p className="form-error manager-error" role="alert">
          {error}
        </p>
      )}
      <ul className="managed-list">
        {items.map((item) => (
          <li key={item}>
            {editing === item ? (
              <form className="manager-edit-form" onSubmit={submitEdit}>
                <label className="visually-hidden" htmlFor={`${kind}-edit`}>
                  Rename {item}
                </label>
                <input
                  id={`${kind}-edit`}
                  maxLength={40}
                  onChange={(event) => setEditValue(event.currentTarget.value)}
                  value={editValue}
                />
                <button className="table-action" disabled={busy} type="submit">
                  Save
                </button>
                <button
                  className="table-action"
                  onClick={() => {
                    setEditing('');
                    setError('');
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span>{item}</span>
                <span className="manager-actions">
                  <button
                    className="table-action"
                    onClick={() => {
                      setEditing(item);
                      setEditValue(item);
                      setError('');
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    aria-label={`Delete ${item}`}
                    className="table-action delete-action"
                    disabled={busy}
                    onClick={() => deleteItem(item)}
                    type="button"
                  >
                    Delete
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CategoryDepartmentManager({
  categories,
  departments,
  expenses,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddDepartment,
  onRenameDepartment,
  onDeleteDepartment,
}: {
  categories: string[];
  departments: string[];
  expenses: Expense[];
  onAddCategory: (value: string) => Promise<void>;
  onRenameCategory: (oldValue: string, newValue: string) => Promise<void>;
  onDeleteCategory: (value: string) => Promise<void>;
  onAddDepartment: (value: string) => Promise<void>;
  onRenameDepartment: (oldValue: string, newValue: string) => Promise<void>;
  onDeleteDepartment: (value: string) => Promise<void>;
}) {
  return (
    <section
      className="management-grid"
      aria-label="Manage categories and departments"
    >
      <ListEditor
        kind="category"
        items={categories}
        expenses={expenses}
        onAdd={onAddCategory}
        onRename={onRenameCategory}
        onDelete={onDeleteCategory}
      />
      <ListEditor
        kind="department"
        items={departments}
        expenses={expenses}
        onAdd={onAddDepartment}
        onRename={onRenameDepartment}
        onDelete={onDeleteDepartment}
      />
    </section>
  );
}
