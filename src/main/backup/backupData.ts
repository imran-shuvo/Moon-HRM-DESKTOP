import { DEFAULT_PAYROLL_SETTINGS } from '../../shared/payroll';
import { BackupCounts, PayrollSettings } from '../../shared/types';
import { Database } from '../db/database';
import {
  BackupData,
  BackupPayrollSettings,
  countRecords,
} from './backupFormat';

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
                nickname, salary, role, work_hours_per_day, hourly_rate,
                termination_date
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
                paid_date, note, created_at, updated_at, vacation_days,
                weekend_overtime_hours, weekend_overtime_rate
         FROM payslips ORDER BY month, created_at, id`,
      );
      const documents = await client.query(
        `SELECT id, title, category, project_name, camp_name, document_date,
                employee_id, note, file_name, mime_type, size_bytes, content,
                created_at, updated_at
         FROM documents ORDER BY document_date, created_at, id`,
      );
      const pettyCash = await client.query(
        `SELECT id, employee_id, transaction_date, kind, amount, note,
                created_at, updated_at, remarks
         FROM petty_cash_transactions
         ORDER BY transaction_date, created_at, id`,
      );
      const pettyCashAttachments = await client.query(
        `SELECT id, transaction_id, file_name, mime_type, size_bytes, content,
                created_at
         FROM petty_cash_attachments ORDER BY created_at, id`,
      );
      const vouchers = await client.query(
        `SELECT id, ref_no, voucher_date, employee_id, receipts, sections,
                created_by, verified_by, approved_by, created_at, updated_at
         FROM petty_cash_vouchers ORDER BY voucher_date, created_at, id`,
      );
      const settings = await client.query(
        `SELECT overtime_multiplier, weekend_overtime_multiplier,
                salary_days, paid_days_off, leave_paid, vacation_paid
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
          terminationDate: row.termination_date,
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
          weekendOvertimeHours: row.weekend_overtime_hours,
          weekendOvertimeRate: row.weekend_overtime_rate,
        })),
        payrollSettings: settings.rows[0]
          ? {
              overtimeMultiplier: settings.rows[0].overtime_multiplier,
              weekendOvertimeMultiplier:
                settings.rows[0].weekend_overtime_multiplier,
              salaryDays: settings.rows[0].salary_days,
              paidDaysOff: settings.rows[0].paid_days_off,
              leavePaid: settings.rows[0].leave_paid,
              vacationPaid: settings.rows[0].vacation_paid,
            }
          : undefined,
        documents: documents.rows.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          projectName: row.project_name,
          campName: row.camp_name,
          documentDate: row.document_date,
          employeeId: row.employee_id,
          note: row.note,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          contentBase64: (row.content as Buffer).toString('base64'),
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
        pettyCash: pettyCash.rows.map((row) => ({
          id: row.id,
          employeeId: row.employee_id,
          transactionDate: row.transaction_date,
          kind: row.kind,
          amount: row.amount,
          note: row.note,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
          remarks: row.remarks,
        })),
        pettyCashAttachments: pettyCashAttachments.rows.map((row) => ({
          id: row.id,
          transactionId: row.transaction_id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          contentBase64: (row.content as Buffer).toString('base64'),
          createdAt: iso(row.created_at),
        })),
        pettyCashVouchers: vouchers.rows.map((row) => ({
          id: row.id,
          refNo: row.ref_no,
          voucherDate: row.voucher_date,
          employeeId: row.employee_id,
          receipts: row.receipts,
          sections: row.sections,
          createdBy: row.created_by,
          verifiedBy: row.verified_by,
          approvedBy: row.approved_by,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        })),
      };
    },
    { isolation: 'REPEATABLE READ' },
  );
}

/**
 * Settings from a backup. Older backups used a flat overtime rate and fine,
 * which the company policy replaced: they restore with the policy rates,
 * keeping their paid days off and leave / vacation choices.
 */
export function restoredPayrollSettings(
  saved: BackupPayrollSettings | undefined,
): PayrollSettings {
  const defaults = DEFAULT_PAYROLL_SETTINGS;
  if (!saved) return defaults;
  const policy = saved.salaryDays !== undefined;
  return {
    overtimeMultiplier: policy
      ? saved.overtimeMultiplier
      : defaults.overtimeMultiplier,
    weekendOvertimeMultiplier:
      saved.weekendOvertimeMultiplier ?? defaults.weekendOvertimeMultiplier,
    salaryDays: saved.salaryDays ?? defaults.salaryDays,
    paidDaysOff:
      saved.paidDaysOff ?? saved.absenceFineFreeDays ?? defaults.paidDaysOff,
    leavePaid: saved.leavePaid ?? defaults.leavePaid,
    vacationPaid: saved.vacationPaid ?? defaults.vacationPaid,
  };
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
                documents, petty_cash_attachments, petty_cash_transactions,
                petty_cash_vouchers, employees`,
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
          nickname, salary, role, work_hours_per_day, hourly_rate,
          termination_date)
       SELECT id, name, "iqamaNo", designation, "projectName", "phoneNo",
              "insuranceNo", "iqamaExpiry", "campName", "createdAt", "updatedAt",
              coalesce(nickname, ''), salary, coalesce(role, 'company_worker'),
              coalesce("workHoursPerDay", 10), "hourlyRate",
              "terminationDate"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, name text, "iqamaNo" text, designation text,
         "projectName" text, "phoneNo" text, "insuranceNo" text,
         "iqamaExpiry" date, "campName" text,
         "createdAt" timestamptz, "updatedAt" timestamptz,
         nickname text, salary numeric, role text,
         "workHoursPerDay" numeric, "hourlyRate" numeric,
         "terminationDate" date)`,
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
          status, paid_date, note, created_at, updated_at, vacation_days,
          weekend_overtime_hours, weekend_overtime_rate)
       SELECT id, "employeeId", month, "employeeName", "iqamaNo", role,
              designation, "projectName", "campName", "workingDays",
              "presentDays", "absentDays", "leaveDays", "holidayDays",
              "hoursWorked", "basicSalary", "hourlyRate", "basicPay",
              "overtimeHours", "overtimeRate", allowance, "absenceDeduction",
              "absenceFine", "advanceDeduction", "otherDeduction", status,
              "paidDate", note, "createdAt", "updatedAt",
              coalesce("vacationDays", 0),
              coalesce("weekendOvertimeHours", 0),
              coalesce("weekendOvertimeRate", 0)
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
         "updatedAt" timestamptz, "vacationDays" int,
         "weekendOvertimeHours" numeric, "weekendOvertimeRate" numeric)`,
      [json(data.payslips ?? [])],
    );
    const settings = restoredPayrollSettings(data.payrollSettings);
    await client.query(
      `INSERT INTO payroll_settings
         (id, overtime_multiplier, weekend_overtime_multiplier, salary_days,
          paid_days_off, leave_paid, vacation_paid)
       VALUES (1, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         overtime_multiplier = EXCLUDED.overtime_multiplier,
         weekend_overtime_multiplier = EXCLUDED.weekend_overtime_multiplier,
         salary_days = EXCLUDED.salary_days,
         paid_days_off = EXCLUDED.paid_days_off,
         leave_paid = EXCLUDED.leave_paid,
         vacation_paid = EXCLUDED.vacation_paid,
         updated_at = now()`,
      [
        settings.overtimeMultiplier,
        settings.weekendOvertimeMultiplier,
        settings.salaryDays,
        settings.paidDaysOff,
        settings.leavePaid,
        settings.vacationPaid,
      ],
    );
    // Documents one at a time to keep each statement's size bounded.
    // eslint-disable-next-line no-restricted-syntax
    for (const document of data.documents ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO documents
           (id, title, category, project_name, camp_name, document_date,
            employee_id, note, file_name, mime_type, size_bytes, content,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          document.id,
          document.title,
          document.category,
          document.projectName,
          document.campName,
          document.documentDate,
          document.employeeId,
          document.note,
          document.fileName,
          document.mimeType,
          document.sizeBytes,
          Buffer.from(document.contentBase64, 'base64'),
          document.createdAt,
          document.updatedAt,
        ],
      );
    }
    // Older backups have no petty cash.
    await client.query(
      `INSERT INTO petty_cash_transactions
         (id, employee_id, transaction_date, kind, amount, note, created_at,
          updated_at, remarks)
       SELECT id, "employeeId", "transactionDate", kind, amount, note,
              "createdAt", "updatedAt", coalesce(remarks, '')
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "employeeId" uuid, "transactionDate" date, kind text,
         amount numeric, note text, "createdAt" timestamptz,
         "updatedAt" timestamptz, remarks text)`,
      [json(data.pettyCash ?? [])],
    );
    // eslint-disable-next-line no-restricted-syntax
    for (const attachment of data.pettyCashAttachments ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO petty_cash_attachments
           (id, transaction_id, file_name, mime_type, size_bytes, content,
            created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          attachment.id,
          attachment.transactionId,
          attachment.fileName,
          attachment.mimeType,
          attachment.sizeBytes,
          Buffer.from(attachment.contentBase64, 'base64'),
          attachment.createdAt,
        ],
      );
    }
    // Older backups have no vouchers.
    await client.query(
      `INSERT INTO petty_cash_vouchers
         (id, ref_no, voucher_date, employee_id, receipts, sections,
          created_by, verified_by, approved_by, created_at, updated_at)
       SELECT id, "refNo", "voucherDate", "employeeId", receipts, sections,
              "createdBy", "verifiedBy", "approvedBy", "createdAt", "updatedAt"
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id uuid, "refNo" text, "voucherDate" date, "employeeId" uuid,
         receipts jsonb, sections jsonb, "createdBy" text, "verifiedBy" text,
         "approvedBy" text, "createdAt" timestamptz, "updatedAt" timestamptz)`,
      [json(data.pettyCashVouchers ?? [])],
    );
    return countRecords(data);
  });
}
