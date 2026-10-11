/** Stored in employees.role; the database allows only these values. */
export const EMPLOYEE_ROLES = [
  'company_worker',
  'outsource_worker',
  'staff',
  'outsource_camp_worker',
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  company_worker: 'Company worker',
  outsource_worker: 'Outsource worker',
  staff: 'Staff',
  outsource_camp_worker: 'Outsource camp worker',
};

export function isEmployeeRole(value: unknown): value is EmployeeRole {
  return EMPLOYEE_ROLES.includes(value as EmployeeRole);
}
