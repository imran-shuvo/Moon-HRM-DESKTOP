/**
 * @jest-environment node
 */
import { gzipSync } from 'zlib';
import {
  BackupData,
  buildBackupDocument,
  backupFileName,
  parseBackup,
  parseBackupFileName,
  serializeBackup,
} from '../main/backup/backupFormat';

const createdAt = '2026-10-01T08:00:00.000Z';

function sampleData(): BackupData {
  return {
    categories: [{ name: 'Materials', sortOrder: 1, createdAt }],
    departments: [{ name: 'Operations', sortOrder: 1, createdAt }],
    expenses: [
      {
        id: '0c1d1a4e-8f3b-4d8e-9b55-1a2b3c4d5e6f',
        expenseDate: '2026-10-01',
        payee: 'Pacific Building Supply',
        particulars: 'Lumber',
        category: 'Materials',
        department: 'Operations',
        paymentMethod: 'Cash',
        projectName: '',
        invoiceNo: 'INV-1',
        siteName: '',
        vatNo: '',
        amountExcludingVat: 100,
        vat: 15,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    attachments: [
      {
        id: '9f8e7d6c-5b4a-4321-8765-0fedcba98765',
        expenseId: '0c1d1a4e-8f3b-4d8e-9b55-1a2b3c4d5e6f',
        fileName: 'receipt.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        contentBase64: Buffer.from([1, 2, 3]).toString('base64'),
        createdAt,
      },
    ],
    budgetReceipts: [
      {
        id: '11111111-2222-4333-8444-555555555555',
        receivedDate: '2026-10-01',
        amount: 5000,
        paidBy: 'Owner',
        paymentMethod: 'Card',
        note: '',
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
}

const meta = {
  schemaVersion: 1,
  appVersion: '1.0.0',
  kind: 'manual' as const,
  createdAt: new Date(createdAt),
};

function gzipJson(value: unknown) {
  return gzipSync(Buffer.from(JSON.stringify(value)));
}

describe('backup file format', () => {
  it('round-trips data and counts records', () => {
    const file = serializeBackup(buildBackupDocument(sampleData(), meta));
    const parsed = parseBackup(file);

    expect(parsed.data).toEqual(sampleData());
    expect(parsed.counts).toEqual({
      expenses: 1,
      attachments: 1,
      budgetTransactions: 1,
      categories: 1,
      departments: 1,
      employees: 0,
      attendance: 0,
      salaryAdvances: 0,
      payslips: 0,
      documents: 0,
      pettyCash: 0,
      pettyCashAttachments: 0,
      pettyCashVouchers: 0,
    });
  });

  it('keeps petty cash and its files, and checks what they belong to', () => {
    const employeeId = '33333333-3333-4333-8333-333333333333';
    const entryId = '44444444-4444-4444-8444-444444444444';
    const withPettyCash: BackupData = {
      ...sampleData(),
      employees: [
        {
          id: employeeId,
          name: 'Rahim Uddin',
          iqamaNo: '2412345678',
          designation: '',
          projectName: 'Mall',
          phoneNo: '',
          insuranceNo: '',
          iqamaExpiry: null,
          campName: '',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      pettyCash: [
        {
          id: entryId,
          employeeId,
          transactionDate: '2026-10-02',
          kind: 'received',
          amount: 250,
          note: 'Returned cash',
          createdAt,
          updatedAt: createdAt,
          remarks: 'Counted twice',
        },
      ],
      pettyCashAttachments: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          transactionId: entryId,
          fileName: 'slip.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 3,
          contentBase64: Buffer.from([1, 2, 3]).toString('base64'),
          createdAt,
        },
      ],
    };
    const parsed = parseBackup(
      serializeBackup(buildBackupDocument(withPettyCash, meta)),
    );
    expect(parsed.data).toEqual(withPettyCash);
    expect(parsed.counts).toEqual(
      expect.objectContaining({ pettyCash: 1, pettyCashAttachments: 1 }),
    );

    const noEmployee = { ...withPettyCash, employees: [] };
    expect(() =>
      parseBackup(serializeBackup(buildBackupDocument(noEmployee, meta))),
    ).toThrow(/petty cash entry belongs to a missing employee/);

    const noEntry = { ...withPettyCash, pettyCash: [] };
    expect(() =>
      parseBackup(serializeBackup(buildBackupDocument(noEntry, meta))),
    ).toThrow(/petty cash file belongs to a missing entry/);

    const badKind = {
      ...withPettyCash,
      pettyCash: [{ ...withPettyCash.pettyCash![0], kind: 'spent' }],
    } as unknown as BackupData;
    expect(() =>
      parseBackup(serializeBackup(buildBackupDocument(badKind, meta))),
    ).toThrow(/Petty cash entries record #1 is malformed/);
  });

  it('keeps petty cash vouchers and refuses malformed ones', () => {
    const employeeId = '33333333-3333-4333-8333-333333333333';
    const voucher = {
      id: '66666666-6666-4666-8666-666666666666',
      refNo: 'MOON/PCV/2026 - KEPAYAT',
      voucherDate: '2026-10-15',
      employeeId,
      receipts: [{ date: '2026-10-01', receivedFrom: 'Imran', amount: 1000 }],
      sections: [
        {
          title: 'Tower 2',
          lines: [
            {
              date: '2026-10-13',
              particulars: 'Iqbal Abul Kalam',
              supplier: 'Carpenter (advance) tower 2',
              vatNo: '',
              invoiceNo: '',
              amountExclVat: null,
              vatAmount: null,
              amount: 300,
            },
          ],
        },
      ],
      createdBy: 'Kepayat',
      verifiedBy: '',
      approvedBy: 'Gobi Krishnan',
      createdAt,
      updatedAt: createdAt,
    };
    const withVouchers: BackupData = {
      ...sampleData(),
      employees: [
        {
          id: employeeId,
          name: 'Kepayat',
          iqamaNo: '2412345678',
          designation: '',
          projectName: 'Mall',
          phoneNo: '',
          insuranceNo: '',
          iqamaExpiry: null,
          campName: '',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      pettyCashVouchers: [voucher],
    };
    const parsed = parseBackup(
      serializeBackup(buildBackupDocument(withVouchers, meta)),
    );
    expect(parsed.data).toEqual(withVouchers);
    expect(parsed.counts).toEqual(
      expect.objectContaining({ pettyCashVouchers: 1 }),
    );

    const noEmployee = { ...withVouchers, employees: [] };
    expect(() =>
      parseBackup(serializeBackup(buildBackupDocument(noEmployee, meta))),
    ).toThrow(/a voucher belongs to a missing employee/);

    const noLines = {
      ...withVouchers,
      pettyCashVouchers: [
        { ...voucher, sections: [{ title: 'Tower 2', lines: [] }] },
      ],
    };
    expect(() =>
      parseBackup(serializeBackup(buildBackupDocument(noLines, meta))),
    ).toThrow(/Petty cash vouchers record #1 is malformed/);
  });

  it('restores vouchers backed up before they had an employee', () => {
    const { employeeId, receipts, ...rest } = {
      id: '66666666-6666-4666-8666-666666666666',
      refNo: 'MOON/PCV/2026-001',
      voucherDate: '2026-10-21',
      employeeId: null,
      receipts: [],
      sections: [
        {
          title: '',
          lines: [
            {
              date: '',
              particulars: 'Petrol',
              supplier: '',
              vatNo: '',
              invoiceNo: '',
              amountExclVat: null,
              vatAmount: null,
              amount: 136,
            },
          ],
        },
      ],
      createdBy: '',
      verifiedBy: '',
      approvedBy: '',
      createdAt,
      updatedAt: createdAt,
    };
    const old = {
      ...sampleData(),
      pettyCashVouchers: [
        {
          ...rest,
          project: 'Mall',
          departments: ['Civil'],
          receivedNote: 'imran',
          receivedAmount: 3434,
        },
      ],
    } as unknown as BackupData;
    const parsed = parseBackup(serializeBackup(buildBackupDocument(old, meta)));
    expect(parsed.data.pettyCashVouchers).toEqual([
      {
        ...rest,
        employeeId,
        receipts: [{ date: '2026-10-21', receivedFrom: 'imran', amount: 3434 }],
      },
    ]);
    expect(receipts).toEqual([]);
  });

  it('keeps attendance, advances, payslips and payroll settings', () => {
    const employeeId = '33333333-3333-4333-8333-333333333333';
    const withPayroll: BackupData = {
      ...sampleData(),
      employees: [
        {
          id: employeeId,
          name: 'Karim',
          iqamaNo: '2400000001',
          role: 'company_worker',
          designation: '',
          projectName: 'Mall',
          phoneNo: '',
          insuranceNo: '',
          iqamaExpiry: null,
          campName: 'Camp A',
          createdAt,
          updatedAt: createdAt,
          nickname: '',
          salary: 1500,
          workHoursPerDay: 10,
          hourlyRate: null,
        },
      ],
      attendance: [
        {
          employeeId,
          workDate: '2026-10-01',
          status: 'present',
          hours: 12,
          note: '',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      salaryAdvances: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          employeeId,
          advanceDate: '2026-10-05',
          amount: 300,
          note: 'Eid',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      payslips: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          employeeId,
          month: '2026-10',
          employeeName: 'Karim',
          iqamaNo: '2400000001',
          role: 'company_worker',
          designation: '',
          projectName: 'Mall',
          campName: 'Camp A',
          workingDays: 27,
          presentDays: 26,
          absentDays: 1,
          leaveDays: 0,
          holidayDays: 0,
          hoursWorked: 262,
          basicSalary: 1500,
          hourlyRate: 0,
          basicPay: 1500,
          overtimeHours: 2,
          overtimeRate: 30,
          allowance: 0,
          absenceDeduction: 55.56,
          absenceFine: 0,
          advanceDeduction: 300,
          otherDeduction: 0,
          status: 'paid',
          paidDate: '2026-11-01',
          note: '',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      payrollSettings: {
        overtimeBaseRate: 20,
        overtimeMultiplier: 1.5,
        absenceFine: 25,
        absenceFineFreeDays: 2,
      },
    };
    const parsed = parseBackup(
      serializeBackup(buildBackupDocument(withPayroll, meta)),
    );
    expect(parsed.data).toEqual(withPayroll);
    expect(parsed.counts).toEqual(
      expect.objectContaining({
        attendance: 1,
        salaryAdvances: 1,
        payslips: 1,
      }),
    );

    // Payroll records must belong to an employee in the same backup.
    const orphan = { ...withPayroll, employees: [] };
    const document = buildBackupDocument(orphan, meta);
    expect(() => parseBackup(serializeBackup(document))).toThrow(
      /belongs to a missing employee/,
    );
  });

  it('keeps employees, and still reads backups made before them', () => {
    const withEmployees = {
      ...sampleData(),
      employees: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Rahim Uddin',
          iqamaNo: '2412345678',
          role: 'staff',
          designation: 'Driver',
          projectName: 'Mall',
          phoneNo: '',
          insuranceNo: '',
          iqamaExpiry: '2027-01-31',
          campName: 'Camp A',
          createdAt,
          updatedAt: createdAt,
        },
      ],
    };
    const parsed = parseBackup(
      serializeBackup(buildBackupDocument(withEmployees, meta)),
    );
    expect(parsed.data.employees).toEqual(withEmployees.employees);
    expect(parsed.counts.employees).toBe(1);

    const old = parseBackup(
      serializeBackup(buildBackupDocument(sampleData(), meta)),
    );
    expect(old.data.employees).toBeUndefined();
    expect(old.counts.employees).toBe(0);
  });

  it('still reads backups with the old payee lists', () => {
    const withLists = {
      ...sampleData(),
      payees: [{ name: 'Pacific Building Supply', sortOrder: 1, createdAt }],
      budgetPayers: [{ name: 'Owner', sortOrder: 1, createdAt }],
    };
    const parsed = parseBackup(
      serializeBackup(buildBackupDocument(withLists, meta)),
    );
    expect(parsed.data.payees).toEqual(withLists.payees);
    expect(parsed.data.budgetPayers).toEqual(withLists.budgetPayers);

    // sampleData() has no payee lists, like a backup from an older version.
    const old = parseBackup(
      serializeBackup(buildBackupDocument(sampleData(), meta)),
    );
    expect(old.data.payees).toBeUndefined();
  });

  it('rejects a file whose contents were changed', () => {
    const document = buildBackupDocument(sampleData(), meta);
    document.data.budgetReceipts[0].amount = 9_999_999;

    expect(() => parseBackup(gzipJson(document))).toThrow(/checksum/);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup(Buffer.from('hello'))).toThrow(/damaged/);
    expect(() => parseBackup(gzipJson({ format: 'other' }))).toThrow(
      /not a backup made by this app/,
    );
  });

  it('rejects backups from a newer app version', () => {
    const document = {
      ...buildBackupDocument(sampleData(), meta),
      formatVersion: 99,
    };
    expect(() => parseBackup(gzipJson(document))).toThrow(/newer version/);
  });

  it('rejects backups that would break foreign keys', () => {
    const data = sampleData();
    data.attachments[0].expenseId = '00000000-0000-4000-8000-000000000000';
    expect(() =>
      parseBackup(serializeBackup(buildBackupDocument(data, meta))),
    ).toThrow(/missing expense/);
  });

  it('names backup files so they can be listed by kind and time', () => {
    const date = new Date(2026, 9, 9, 14, 30, 5);
    const name = backupFileName('automatic', date);

    expect(name).toBe('moon-finance_automatic_2026-10-09_143005.mfbackup');
    expect(parseBackupFileName(name)).toEqual({
      kind: 'automatic',
      createdAt: date,
    });
    expect(parseBackupFileName('notes.txt')).toBeUndefined();
  });
});
