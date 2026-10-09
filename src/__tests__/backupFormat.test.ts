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
    });
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
