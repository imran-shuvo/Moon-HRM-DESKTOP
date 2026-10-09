import { LegacyImportPayload } from '../../shared/types';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_DEPARTMENTS,
  Expense,
} from '../expenses/model';

/**
 * Before the PostgreSQL database, the app kept everything in this device's
 * browser storage: records in localStorage and receipt files in IndexedDB.
 * This module reads that data once so it can be imported into the database.
 */

const LEGACY_STORAGE_KEY = 'moon-expenses-v1';
const MIGRATED_STORAGE_KEY = 'moon-expenses-v1-imported';
const DATABASE_NAME = 'moon-expense-attachments';
const STORE_NAME = 'attachments';

type LegacyData = {
  expenses?: Expense[];
  budgetTransactions?: LegacyImportPayload['budgetTransactions'];
  categories?: string[];
  departments?: string[];
};

function readLegacyRecords(): LegacyData | undefined {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return undefined;
    const data = JSON.parse(saved) as LegacyData;
    return Array.isArray(data.expenses) ? data : undefined;
  } catch {
    return undefined;
  }
}

export function hasLegacyData(): boolean {
  const data = readLegacyRecords();
  return Boolean(
    data &&
      ((data.expenses?.length ?? 0) > 0 ||
        (data.budgetTransactions?.length ?? 0) > 0),
  );
}

function loadLegacyAttachment(id: string): Promise<Blob | undefined> {
  if (!('indexedDB' in window)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const database = request.result;
      const get = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(id);
      get.onsuccess = () => {
        database.close();
        resolve(get.result?.file as Blob | undefined);
      };
      get.onerror = () => {
        database.close();
        resolve(undefined);
      };
    };
  });
}

export async function readLegacyPayload(): Promise<LegacyImportPayload> {
  const data = readLegacyRecords() ?? {};
  const expenses = await Promise.all(
    (data.expenses ?? []).map(async (expense) => {
      const attachmentFiles = await Promise.all(
        (expense.attachments ?? []).map(async (attachment) => {
          const blob = await loadLegacyAttachment(attachment.id);
          return blob
            ? {
                name: attachment.name,
                type: attachment.type || blob.type,
                data: new Uint8Array(await blob.arrayBuffer()),
              }
            : undefined;
        }),
      );
      // Receipt references are replaced by the file contents themselves.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { attachments, ...rest } = expense;
      return {
        ...rest,
        attachmentFiles: attachmentFiles.filter(
          (file): file is NonNullable<typeof file> => file !== undefined,
        ),
      };
    }),
  );
  return {
    expenses,
    budgetTransactions: data.budgetTransactions ?? [],
    categories: data.categories?.length ? data.categories : DEFAULT_CATEGORIES,
    departments: data.departments?.length
      ? data.departments
      : DEFAULT_DEPARTMENTS,
  };
}

/** Keeps the old data under a new key (never deleted) so it is not offered again. */
export function markLegacyDataImported() {
  const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (saved) {
    localStorage.setItem(MIGRATED_STORAGE_KEY, saved);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}
