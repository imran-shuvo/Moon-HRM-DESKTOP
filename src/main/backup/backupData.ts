import { DEFAULT_PAYROLL_SETTINGS } from '../../shared/payroll';
import { BackupCounts } from '../../shared/types';
import { Database } from '../db/database';
import { BackupData, countRecords } from './backupFormat';

/** Reads every table in one consistent snapshot. */
export function readBackupData(db: Database): Promise<BackupData> {
  return db.transaction(
    async (client) => {
      const iso = (value: Date) => value.toISOString();
      // A client runs one query at a time, so these are sequential.
      type ListRow = { name: string; sort_order: number; created_at: Date };
      const categories = await client.query<ListRow>(
        'SELECT name, sort_order, created_at FROM categories ORDER BY sort_order, name',
      );
      const departments = await client.query<ListRow>(
        'SELECT name, sort_order, created_at FROM departments ORDER BY sort_order, name',
      );
      const expenses = await client.query(
        `SELECT id, expense_date, payee, particulars, category, department,
                payment_method, project_name, invoice_no, site_name, vat_no,
                amount_excluding_vat, vat, created_at, updated_at
         FROM expenses ORDER BY expense_date, created_at`,
      );
      const attachments = await client.query(
        `SELECT id, expense_id, file_name, mime_type, size_bytes, content,
                created_at
         FROM expense_attachments ORDER BY created_at, id`,
      );
      const receipts = await client.query(
        `SELECT id, received_date, amount, paid_by, payment_method, note,
                created_at, updated_at
         FROM budget_receipts ORDER BY received_date, created_at`,
      );
      const employees = await client.query(
        `SELECT id, name, iqama_no, designation, project_name, phone_no,
                insurance_no, iqama_expiry, camp_name, created_at, updated_at,
                nickname, salary, role, work_hours_per_day, hourly_rate
         FROM employees ORDER BY created_at, id`,
      );
      const attendance = await client.query(
        `SELECT employee_id, work_date, status, hours, note, created_at,
                updated_at
         FROM attendance ORDER BY work_date, employee_id`,
      );
      const advances = await client.query(
        `SELECT id, employee_id, advance_date, amount, note, created_at,
                updated_at
         FROM salary_advances ORDER BY advance_date, created_at, id`,
      );
      const payslips = await client.query(
        `SELECT id, employee_id, month, employee_name, iqama_no, role,
                designation, project_name, camp_name, working_days,
                present_days, absent_days, leave_days, holiday_days,
                hours_worked, basic_salary, hourly_rate, basic_pay,
                overtime_hours, overtime_rate, allowance, absence_deduction,
                absence_fine, advance_deduction, other_deduction, status,
                paid_date, note, created_at, updated_at, vacation_days
         FROM payslips ORDER BY month, created_at, id`,
      );
      const settings = await client.query(
        `SELECT overtime_base_rate, overtime_multiplier, absence_fine,
                absence_fine_free_days, leave_paid, vacation_paid
         FROM payroll_settings WHERE id = 1`,
      );
      const listItem = (row: ListRow) => ({
        name: row.name,
        sortOrder: row.sort_order,
        createdAt: iso(row.created_at),
      });
      return {
        categories: categories.rows.map(listItem),
        departments: departments.rows.map(listItem),
        expenses: expenses.rows.map((row) => ({
          id: row.id,
          expenseDate: row.expense_date,
          payee: row.payee,
          particulars: row.particulars,
          category: row.category,
          department: row.department,
          paymentMethod: row.payment_method,
          projectName: row.project_name,
          invoiceNo: row.invoice_no,
          siteName: row.site_name,
          vatNo: row.vat_no,
          amountExcludingVat: row.amount_excluding_vat,
          vat: row.vat,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
        attachments: attachments.rows.map((row) => ({
          id: row.id,
          expenseId: row.expense_id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          contentBase64: (row.content as Buffer).toString('base64'),
          createdAt: iso(row.created_at),
        })),
        budgetReceipts: receipts.rows.map((row) => ({
          id: row.id,
          receivedDate: row.received_date,
          amount: row.amount,
          paidBy: row.paid_by,
          paymentMethod: row.payment_method,
          note: row.note,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
        employees: employees.rows.map((row) => ({
          id: row.id,
          name: row.name,
          iqamaNo: row.iqama_no,
          designation: row.designation,
          projectName: row.project_name,
          phoneNo: row.phone_no,
          insuranceNo: row.insurance_no,
          iqamaExpiry: row.iqama_expiry,
          campName: row.camp_name,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
          nickname: row.nickname,
          salary: row.salary,
          role: row.role,
          workHoursPerDay: row.work_hours_per_day,
          hourlyRate: row.hourly_rate,
        })),
        // Same key order as parseBackup builds, so the checksum matches.
        attendance: attendance.rows.map((row) => ({
          employeeId: row.employee_id,
          workDate: row.work_date,
          status: row.status,
          hours: row.hours,
          note: row.note,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
        salaryAdvances: advances.rows.map((row) => ({
          id: row.id,
          employeeId: row.employee_id,
          advanceDate: row.advance_date,
          amount: row.amount,
          note: row.note,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
        payslips: payslips.rows.map((row) => ({
          id: row.id,
          employeeId: row.employee_id,
          month: row.month,
          employeeName: row.employee_name,
          iqamaNo: row.iqama_no,
          role: row.role,
          designation: row.designation,
          projectName: row.project_name,
          campName: row.camp_name,
          workingDays: row.working_days,
          presentDays: row.present_days,
          absentDays: row.absent_days,
          leaveDays: row.leave_days,
          holidayDays: row.holiday_days,
          hoursWorked: row.hours_worked,
          basicSalary: row.basic_salary,
          hourlyRate: row.hourly_rate,
          basicPay: row.basic_pay,
          overtimeHours: row.overtime_hours,
          overtimeRate: row.overtime_rate,
          allowance: row.allowance,
          absenceDeduction: row.absence_deduction,
          absenceFine: row.absence_fine,
          advanceDeduction: row.advance_deduction,
          otherDeduction: row.other_deduction,
          status: row.status,
          paidDate: row.paid_date,
          note: row.note,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
          vacationDays: row.vacation_days,
        })),
        payrollSettings: settings.rows[0]
          ? {
              overtimeBaseRate: settings.rows[0].overtime_base_rate,
              overtimeMultiplier: settings.rows[0].overtime_multiplier,
              absenceFine: settings.rows[0].absence_fine,
              absenceFineFreeDays: settings.rows[0].absence_fine_free_days,
              leavePaid: settings.rows[0].leave_paid,
              vacationPaid: settings.rows[0].vacation_paid,
            }
          : undefined,
      };
    },
    { isolation: 'REPEATABLE READ' },
  );
}

/**
 * Replaces all data with the backup's contents in a single transaction:
 * either everything is restored, or nothing changes.
 */
export function restoreBackupData(
  db: Database,
  data: BackupData,
): Promise<BackupCounts> {
  return db.transaction(async (client) => {
    await client.query(
      `TRUNCATE expense_attachments, expenses, budget_receipts, categories,
                departments, attendance, salary_advances, payslips,
                employees`,
    );
    const json = (rows: unknown[]) => JSON.stringify(rows);
    const lists = [
      ['categories', data.categories],
      ['departments', data.departments],
    ] as const;
    // eslint-disable-next-line no-restricted-syntax
    for (const [table, items] of lists) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO ${table} (name, sort_order, created_at)
         SELECT name, "sortOrder", "createdAt"
         FROM jsonb_to_recordset($1::jsonb)
           AS x(name text, "sortOrder" int, "createdAt" timestamptz)`,
        [json([...items])],
      );
    }
    await client.query(
      `INSERT INTO expenses
         (id, expense_date, payee, particulars, category, department,
          payment_method, project_name, invoice_no, site_name, vat_no,
          amount_excluding_vat, vat, created_at, updated_at)
       SELECT id, "expenseDate", payee, particulars, category, department,
              "paymentMethod", "projectName", "invoiceNo", "siteName", "vatNo",
              "amountExcludingVat", vat, "createdAt", "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "expenseDate" date, payee text, particulars text,
         category text, department text, "paymentMethod" text,
         "projectName" text, "invoiceNo" text, "siteName" text, "vatNo" text,
         "amountExcludingVat" numeric, vat numeric,
         "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.expenses)],
    );
    // Insert receipts one at a time to keep each statement's size bounded.
    // eslint-disable-next-line no-restricted-syntax
    for (const attachment of data.attachments) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO expense_attachments
           (id, expense_id, file_name, mime_type, size_bytes, content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          attachment.id,
          attachment.expenseId,
          attachment.fileName,
          attachment.mimeType,
          attachment.sizeBytes,
          Buffer.from(attachment.contentBase64, 'base64'),
          attachment.createdAt,
        ],
      );
    }
    await client.query(
      `INSERT INTO budget_receipts
         (id, received_date, amount, paid_by, payment_method, note,
          created_at, updated_at)
       SELECT id, "receivedDate", amount, "paidBy", "paymentMethod", note,
              "createdAt", "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "receivedDate" date, amount numeric, "paidBy" text,
         "paymentMethod" text, note text,
         "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.budgetReceipts)],
    );
    // Older backups have no employees.
    await client.query(
      `INSERT INTO employees
         (id, name, iqama_no, designation, project_name, phone_no,
          insurance_no, iqama_expiry, camp_name, created_at, updated_at,
          nickname, salary, role, work_hours_per_day, hourly_rate)
       SELECT id, name, "iqamaNo", designation, "projectName", "phoneNo",
              "insuranceNo", "iqamaExpiry", "campName", "createdAt", "updatedAt",
              coalesce(nickname, ''), salary, coalesce(role, 'company_worker'),
              coalesce("workHoursPerDay", 8), "hourlyRate"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, name text, "iqamaNo" text, designation text,
         "projectName" text, "phoneNo" text, "insuranceNo" text,
         "iqamaExpiry" date, "campName" text,
         "createdAt" timestamptz, "updatedAt" timestamptz,
         nickname text, salary numeric, role text,
         "workHoursPerDay" numeric, "hourlyRate" numeric)`,
      [json(data.employees ?? [])],
    );
    // Older backups have no attendance, advances, payslips or settings.
    await client.query(
      `INSERT INTO attendance
         (employee_id, work_date, status, hours, note, created_at, updated_at)
       SELECT "employeeId", "workDate", status, hours, note, "createdAt",
              "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         "employeeId" uuid, "workDate" date, status text, hours numeric,
         note text, "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.attendance ?? [])],
    );
    await client.query(
      `INSERT INTO salary_advances
         (id, employee_id, advance_date, amount, note, created_at, updated_at)
       SELECT id, "employeeId", "advanceDate", amount, note, "createdAt",
              "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "employeeId" uuid, "advanceDate" date, amount numeric,
         note text, "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.salaryAdvances ?? [])],
    );
    await client.query(
      `INSERT INTO payslips
         (id, employee_id, month, employee_name, iqama_no, role, designation,
          project_name, camp_name, working_days, present_days, absent_days,
          leave_days, holiday_days, hours_worked, basic_salary, hourly_rate,
          basic_pay, overtime_hours, overtime_rate, allowance,
          absence_deduction, absence_fine, advance_deduction, other_deduction,
          status, paid_date, note, created_at, updated_at, vacation_days)
       SELECT id, "employeeId", month, "employeeName", "iqamaNo", role,
              designation, "projectName", "campName", "workingDays",
              "presentDays", "absentDays", "leaveDays", "holidayDays",
              "hoursWorked", "basicSalary", "hourlyRate", "basicPay",
              "overtimeHours", "overtimeRate", allowance, "absenceDeduction",
              "absenceFine", "advanceDeduction", "otherDeduction", status,
              "paidDate", note, "createdAt", "updatedAt",
              coalesce("vacationDays", 0)
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "employeeId" uuid, month text, "employeeName" text,
         "iqamaNo" text, role text, designation text, "projectName" text,
         "campName" text, "workingDays" int, "presentDays" int,
         "absentDays" int, "leaveDays" int, "holidayDays" int,
         "hoursWorked" numeric, "basicSalary" numeric, "hourlyRate" numeric,
         "basicPay" numeric, "overtimeHours" numeric, "overtimeRate" numeric,
         allowance numeric, "absenceDeduction" numeric, "absenceFine" numeric,
         "advanceDeduction" numeric, "otherDeduction" numeric, status text,
         "paidDate" date, note text, "createdAt" timestamptz,
         "updatedAt" timestamptz, "vacationDays" int)`,
      [json(data.payslips ?? [])],
    );
    const settings = {
      ...DEFAULT_PAYROLL_SETTINGS,
      ...data.payrollSettings,
    };
    await client.query(
      `INSERT INTO payroll_settings
         (id, overtime_base_rate, overtime_multiplier, absence_fine,
          absence_fine_free_days, leave_paid, vacation_paid)
       VALUES (1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         overtime_base_rate = EXCLUDED.overtime_base_rate,
         overtime_multiplier = EXCLUDED.overtime_multiplier,
         absence_fine = EXCLUDED.absence_fine,
         absence_fine_free_days = EXCLUDED.absence_fine_free_days,
         leave_paid = EXCLUDED.leave_paid,
         vacation_paid = EXCLUDED.vacation_paid,
         updated_at = now()`,
      [
        settings.overtimeBaseRate,
        settings.overtimeMultiplier,
        settings.absenceFine,
        settings.absenceFineFreeDays,
        settings.leavePaid,
        settings.vacationPaid,
      ],
    );
    return countRecords(data);
  });
}
