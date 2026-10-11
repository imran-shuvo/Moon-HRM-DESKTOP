import { FormEvent, useState } from 'react';
import { EmployeeInput } from '../../../shared/types';
import { errorMessage } from '../../data/FinanceApiContext';
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  Employee,
  EmployeeRole,
} from '../model';

const FIELDS: {
  key: Exclude<keyof EmployeeInput, 'role'>;
  label: string;
  maxLength: number;
  required?: boolean;
  type?: 'date' | 'tel' | 'number';
}[] = [
  { key: 'name', label: 'Name', maxLength: 100, required: true },
  { key: 'nickname', label: 'Nickname', maxLength: 60 },
  { key: 'iqamaNo', label: 'Iqama no.', maxLength: 30, required: true },
  { key: 'designation', label: 'Designation', maxLength: 60 },
  { key: 'projectName', label: 'Project name', maxLength: 120 },
  { key: 'phoneNo', label: 'Phone no.', maxLength: 30, type: 'tel' },
  { key: 'insuranceNo', label: 'Insurance no.', maxLength: 60 },
  { key: 'salary', label: 'Salary (SAR)', maxLength: 15, type: 'number' },
  {
    key: 'iqamaExpiry',
    label: 'Iqama expiry date',
    maxLength: 10,
    type: 'date',
  },
  { key: 'campName', label: 'Camp name', maxLength: 120 },
];

export default function EmployeeDialog({
  employee,
  onClose,
  onSubmit,
  onDelete,
}: {
  employee: Employee | undefined;
  onClose: () => void;
  onSubmit: (input: EmployeeInput) => Promise<void>;
  onDelete: (employee: Employee) => void;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: keyof EmployeeInput) =>
      String(form.get(key) ?? '').trim();
    const salary = value('salary');
    if (salary && !(Number(salary) >= 0)) {
      setError('Enter a salary of zero or more, or leave it empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        name: value('name'),
        nickname: value('nickname'),
        role: value('role') as EmployeeRole,
        salary: salary ? Number(salary) : null,
        iqamaNo: value('iqamaNo'),
        designation: value('designation'),
        projectName: value('projectName'),
        phoneNo: value('phoneNo'),
        insuranceNo: value('insuranceNo'),
        iqamaExpiry: value('iqamaExpiry'),
        campName: value('campName'),
      });
    } catch (submitError) {
      setError(
        errorMessage(
          submitError,
          'Could not save the employee. Please try again.',
        ),
      );
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="employee-dialog-title"
        aria-modal="true"
        className="expense-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">
              {employee ? 'EDIT EMPLOYEE' : 'NEW EMPLOYEE'}
            </p>
            <h2 id="employee-dialog-title">
              {employee ? employee.name : 'Add an employee'}
            </h2>
            <p>Employees can be chosen as Paid to and as a budget payee.</p>
          </div>
          <button
            aria-label="Close dialog"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field" htmlFor="employee-role">
              Role
              <select
                defaultValue={employee?.role ?? ''}
                id="employee-role"
                name="role"
                required
              >
                <option disabled value="">
                  Choose a role
                </option>
                {EMPLOYEE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {EMPLOYEE_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            {FIELDS.map((field) => (
              <label
                className="form-field"
                htmlFor={`employee-${field.key}`}
                key={field.key}
              >
                {field.label}
                <input
                  defaultValue={employee?.[field.key] ?? ''}
                  id={`employee-${field.key}`}
                  maxLength={field.maxLength}
                  min={field.type === 'number' ? 0 : undefined}
                  name={field.key}
                  required={field.required}
                  step={field.type === 'number' ? 0.01 : undefined}
                  type={field.type ?? 'text'}
                />
              </label>
            ))}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            {employee && (
              <button
                className="button button-secondary delete-action employee-delete"
                disabled={saving}
                onClick={() => onDelete(employee)}
                type="button"
              >
                Delete employee
              </button>
            )}
            <button
              className="button button-secondary"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={saving}
              type="submit"
            >
              {employee ? 'Save changes' : 'Save employee'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
