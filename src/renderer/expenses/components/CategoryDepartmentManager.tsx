import { FormEvent, useState } from 'react';
import { errorMessage } from '../../data/FinanceApiContext';
import ConfirmDialog from './ConfirmDialog';
import { BudgetTransaction, Expense } from '../model';

export type ListKind = 'category' | 'department' | 'payee' | 'budgetPayer';

export type ListHandlers = {
  onAdd: (value: string) => Promise<void>;
  onRename: (oldValue: string, newValue: string) => Promise<void>;
  onDelete: (value: string) => Promise<void>;
};

const LIST_TEXT: Record<
  ListKind,
  { label: string; title: string; description: string; maxLength: number }
> = {
  category: {
    label: 'Category',
    title: 'Categories',
    description: 'Add, rename, or remove options used by transactions.',
    maxLength: 40,
  },
  department: {
    label: 'Department',
    title: 'Departments',
    description: 'Add, rename, or remove options used by transactions.',
    maxLength: 40,
  },
  payee: {
    label: 'Paid to',
    title: 'Paid to (expenses)',
    description: 'Vendors and recipients offered when adding an expense.',
    maxLength: 100,
  },
  budgetPayer: {
    label: 'Payee',
    title: 'Payees (budgets)',
    description: 'People or companies a budget payment is received from.',
    maxLength: 100,
  },
};

function ListEditor({
  kind,
  items,
  usageCount,
  onAdd,
  onRename,
  onDelete,
}: ListHandlers & {
  kind: ListKind;
  items: string[];
  usageCount: (value: string) => number;
}) {
  const { label, title, description, maxLength } = LIST_TEXT[kind];
  // The database keeps at least one category and department; payee lists may be emptied.
  const keepOne = kind === 'category' || kind === 'department';
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState('');
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    | { action: 'rename'; from: string; to: string }
    | { action: 'delete'; value: string }
  >();

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
    if (value === editing) {
      setEditing('');
      setError('');
      return;
    }
    setError('');
    setPending({ action: 'rename', from: editing, to: value });
  }

  function deleteItem(value: string) {
    if (keepOne && items.length <= 1) {
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
    setError('');
    setPending({ action: 'delete', value });
  }

  function cancelPending() {
    setPending(undefined);
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.action === 'rename') {
      run(
        () => onRename(pending.from, pending.to),
        () => setEditing(''),
      );
    } else {
      run(() => onDelete(pending.value));
    }
    setPending(undefined);
  }

  const renameUsage =
    pending?.action === 'rename' ? usageCount(pending.from) : 0;

  return (
    <section className="panel list-manager">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <form className="manager-add-form" onSubmit={submitNew}>
        <label className="visually-hidden" htmlFor={`${kind}-new`}>
          New {label.toLowerCase()} name
        </label>
        <input
          id={`${kind}-new`}
          maxLength={maxLength}
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
                  maxLength={maxLength}
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
      {pending?.action === 'rename' && (
        <ConfirmDialog
          id={`${kind}-rename-confirm`}
          eyebrow={`RENAME ${label.toUpperCase()}`}
          title={`Rename "${pending.from}"?`}
          confirmLabel="Rename"
          danger={false}
          busy={busy}
          onCancel={cancelPending}
          onConfirm={confirmPending}
        >
          &ldquo;{pending.from}&rdquo; will be renamed to &ldquo;{pending.to}
          &rdquo;.
          {renameUsage > 0 &&
            ` ${renameUsage} transaction${renameUsage === 1 ? '' : 's'} using it will be updated.`}
        </ConfirmDialog>
      )}
      {pending?.action === 'delete' && (
        <ConfirmDialog
          id={`${kind}-delete-confirm`}
          eyebrow={`DELETE ${label.toUpperCase()}`}
          title={`Delete "${pending.value}"?`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onCancel={cancelPending}
          onConfirm={confirmPending}
        >
          &ldquo;{pending.value}&rdquo; will be permanently removed from the{' '}
          {title.toLowerCase()} list.
        </ConfirmDialog>
      )}
    </section>
  );
}

export default function CategoryDepartmentManager({
  lists,
  expenses,
  payments,
  handlers,
}: {
  lists: Record<ListKind, string[]>;
  expenses: Expense[];
  payments: BudgetTransaction[];
  handlers: Record<ListKind, ListHandlers>;
}) {
  const usage: Record<ListKind, (value: string) => number> = {
    category: (value) => expenses.filter((e) => e.category === value).length,
    department: (value) =>
      expenses.filter((e) => e.department === value).length,
    payee: (value) => expenses.filter((e) => e.payee === value).length,
    budgetPayer: (value) =>
      payments.filter((payment) => payment.paidBy === value).length,
  };
  const kinds: ListKind[] = ['category', 'department', 'payee', 'budgetPayer'];

  return (
    <section className="management-grid" aria-label="Manage lists">
      {kinds.map((kind) => (
        <ListEditor
          key={kind}
          kind={kind}
          items={lists[kind]}
          usageCount={usage[kind]}
          onAdd={handlers[kind].onAdd}
          onRename={handlers[kind].onRename}
          onDelete={handlers[kind].onDelete}
        />
      ))}
    </section>
  );
}
