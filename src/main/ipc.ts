import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  OpenDialogOptions,
  SaveDialogOptions,
  shell,
} from 'electron';
import fs from 'fs/promises';
import path from 'path';
import log from 'electron-log';
import { AppError } from '../shared/errors';
import IPC from '../shared/ipcChannels';
import { monthKey } from '../shared/months';
import { IpcResult } from '../shared/types';
import {
  calendarMonth,
  pastMonth,
  recordId,
  recordIds,
  validateAttendanceDay,
  validatePaidDate,
  validatePayrollSettings,
  validatePayslipInputs,
  validatePettyCashInput,
  validateVoucherInput,
  validateAttachmentIds,
  validateSalaryAdvanceInput,
  validateSalaryAdvanceInputs,
  validateBudgetTransactionInput,
  validateConnectionSettings,
  validateDocumentInput,
  validateEmployeeInput,
  validateExpenseInput,
  validateLegacyPayload,
  validateUploads,
} from '../shared/validation';
import BackupService from './backup/backupService';
import { BACKUP_EXTENSION, backupFileName } from './backup/backupFormat';
import ConnectionManager from './db/connection';
import { toAppError } from './db/database';
import * as repository from './db/repository';

/**
 * Every handler returns an IpcResult so that only user-safe messages reach
 * the renderer; unexpected errors are logged here with full detail.
 */
function handle<A extends unknown[], R>(
  channel: string,
  handler: (...args: A) => Promise<R> | R,
) {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<R>> => {
    try {
      return { ok: true, data: await handler(...(args as A)) };
    } catch (error) {
      const appError = toAppError(error);
      if (appError.code === 'INTERNAL' || !(error instanceof AppError)) {
        log.error(`IPC ${channel} failed`, error);
      }
      return {
        ok: false,
        error: { code: appError.code, message: appError.message },
      };
    }
  });
}

/** File types the OS would run rather than display; these are only revealed. */
const EXECUTABLE_EXTENSIONS = new Set(
  [
    'app',
    'appimage',
    'bat',
    'cmd',
    'com',
    'command',
    'cpl',
    'deb',
    'dmg',
    'exe',
    'hta',
    'jar',
    'js',
    'jse',
    'lnk',
    'msc',
    'msi',
    'pif',
    'pkg',
    'ps1',
    'reg',
    'rpm',
    'scr',
    'sh',
    'url',
    'vb',
    'vbe',
    'vbs',
    'workflow',
    'ws',
    'wsf',
    'wsh',
  ].map((extension) => `.${extension}`),
);

/** A stored file name without path separators or control characters. */
function safeFileName(name: string) {
  return (
    path
      .basename(name)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f<>:"/\\|?*]/g, '_') || 'file'
  );
}

const BACKUP_FILTERS = [
  { name: 'Moon Finance backup', extensions: [BACKUP_EXTENSION.slice(1)] },
];

export default function registerIpcHandlers({
  connection,
  backups,
  getWindow,
}: {
  connection: ConnectionManager;
  backups: BackupService;
  getWindow: () => BrowserWindow | null;
}) {
  const db = () => connection.getDb();
  // Paths the user picked or the app listed; restores are limited to these.
  const knownBackupPaths = new Set<string>();
  const remember = <T extends { path: string }>(backup: T) => {
    knownBackupPaths.add(backup.path);
    return backup;
  };
  const showOpenDialog = (options: OpenDialogOptions) => {
    const window = getWindow();
    return window
      ? dialog.showOpenDialog(window, options)
      : dialog.showOpenDialog(options);
  };

  handle(IPC.dbStatus, () => connection.getStatus());
  handle(IPC.dbTest, (settings: unknown) =>
    connection.test(validateConnectionSettings(settings)),
  );
  handle(IPC.dbConnect, (settings: unknown) =>
    connection.connect(validateConnectionSettings(settings)),
  );

  handle(IPC.dataLoad, () => repository.loadSnapshot(db()));
  handle(IPC.dataImportLegacy, (payload: unknown) =>
    repository.importLegacyData(db(), validateLegacyPayload(payload)),
  );

  handle(IPC.expenseCreate, (input: unknown, files: unknown) =>
    repository.createExpense(
      db(),
      validateExpenseInput(input),
      validateUploads(files),
    ),
  );
  handle(IPC.expenseUpdate, (id: unknown, input: unknown, files: unknown) =>
    repository.updateExpense(
      db(),
      recordId(id),
      validateExpenseInput(input),
      validateUploads(files),
    ),
  );
  handle(IPC.expenseDelete, (id: unknown) =>
    repository.deleteExpense(db(), recordId(id)),
  );
  handle(IPC.expenseAttachment, (id: unknown) =>
    repository.getAttachment(db(), recordId(id)),
  );

  /** Writes a stored file to a temporary folder and opens it safely. */
  async function openStoredFile(
    id: string,
    file: { name: string; data: Uint8Array },
  ) {
    const directory = path.join(app.getPath('temp'), 'moon-finance-files');
    await fs.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${id}-${safeFileName(file.name)}`);
    await fs.writeFile(filePath, file.data);
    // Files come from a shared database: never launch a program.
    if (EXECUTABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      shell.showItemInFolder(filePath);
      return;
    }
    const error = await shell.openPath(filePath);
    if (error)
      throw new AppError('NOT_FOUND', `The file could not be opened: ${error}`);
  }

  handle(IPC.expenseOpenAttachment, async (id: unknown) => {
    const attachmentId = recordId(id);
    const attachment = await repository.getAttachment(db(), attachmentId);
    if (!attachment) {
      throw new AppError('NOT_FOUND', 'That file no longer exists.');
    }
    await openStoredFile(attachmentId, attachment);
  });

  handle(IPC.documentUpload, (input: unknown, files: unknown) =>
    repository.uploadDocuments(
      db(),
      validateDocumentInput(input),
      validateUploads(files),
    ),
  );
  handle(IPC.documentUpdate, (id: unknown, input: unknown) =>
    repository.updateDocument(db(), recordId(id), validateDocumentInput(input)),
  );
  handle(IPC.documentDelete, (id: unknown) =>
    repository.deleteDocument(db(), recordId(id)),
  );
  handle(IPC.documentOpen, async (id: unknown) => {
    const documentId = recordId(id);
    const file = await repository.getDocumentFile(db(), documentId);
    if (!file)
      throw new AppError('NOT_FOUND', 'That document no longer exists.');
    await openStoredFile(documentId, file);
  });
  handle(IPC.documentSaveAs, async (id: unknown) => {
    const file = await repository.getDocumentFile(db(), recordId(id));
    if (!file)
      throw new AppError('NOT_FOUND', 'That document no longer exists.');
    const window = getWindow();
    const options: SaveDialogOptions = {
      title: 'Save a copy of the document',
      defaultPath: path.join(app.getPath('documents'), safeFileName(file.name)),
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return undefined;
    await fs.writeFile(result.filePath, file.data);
    return result.filePath;
  });

  handle(IPC.pettyCashCreate, (input: unknown, files: unknown) =>
    repository.createPettyCash(
      db(),
      validatePettyCashInput(input),
      validateUploads(files),
    ),
  );
  handle(
    IPC.pettyCashUpdate,
    (id: unknown, input: unknown, files: unknown, removeIds: unknown) =>
      repository.updatePettyCash(
        db(),
        recordId(id),
        validatePettyCashInput(input),
        validateUploads(files),
        validateAttachmentIds(removeIds),
      ),
  );
  handle(IPC.pettyCashDelete, (id: unknown) =>
    repository.deletePettyCash(db(), recordId(id)),
  );
  handle(IPC.pettyCashOpenAttachment, async (id: unknown) => {
    const attachmentId = recordId(id);
    const file = await repository.getPettyCashAttachment(db(), attachmentId);
    if (!file) throw new AppError('NOT_FOUND', 'That file no longer exists.');
    await openStoredFile(attachmentId, file);
  });

  handle(IPC.voucherCreate, (input: unknown) =>
    repository.createVoucher(db(), validateVoucherInput(input)),
  );
  handle(IPC.voucherUpdate, (id: unknown, input: unknown) =>
    repository.updateVoucher(db(), recordId(id), validateVoucherInput(input)),
  );
  handle(IPC.voucherDelete, (id: unknown) =>
    repository.deleteVoucher(db(), recordId(id)),
  );

  handle(IPC.budgetCreate, (input: unknown) =>
    repository.createBudgetTransaction(
      db(),
      validateBudgetTransactionInput(input),
    ),
  );
  handle(IPC.budgetUpdate, (id: unknown, input: unknown) =>
    repository.updateBudgetTransaction(
      db(),
      recordId(id),
      validateBudgetTransactionInput(input),
    ),
  );
  handle(IPC.budgetDelete, (id: unknown) =>
    repository.deleteBudgetTransaction(db(), recordId(id)),
  );

  handle(IPC.employeeCreate, (input: unknown) =>
    repository.createEmployee(db(), validateEmployeeInput(input)),
  );
  handle(IPC.employeeUpdate, (id: unknown, input: unknown) =>
    repository.updateEmployee(db(), recordId(id), validateEmployeeInput(input)),
  );
  handle(IPC.employeeDelete, (id: unknown) =>
    repository.deleteEmployee(db(), recordId(id)),
  );

  handle(IPC.attendanceList, (value: unknown) =>
    repository.listAttendance(db(), calendarMonth(value)),
  );
  handle(IPC.attendanceSaveDay, (date: unknown, rows: unknown) => {
    const day = validateAttendanceDay(date, rows);
    return repository.saveAttendanceDay(db(), day.date, day.rows);
  });

  handle(IPC.advanceCreate, (inputs: unknown) =>
    repository.createSalaryAdvances(db(), validateSalaryAdvanceInputs(inputs)),
  );
  handle(IPC.advanceUpdate, (id: unknown, input: unknown) =>
    repository.updateSalaryAdvance(
      db(),
      recordId(id),
      validateSalaryAdvanceInput(input),
    ),
  );
  handle(IPC.advanceDelete, (id: unknown) =>
    repository.deleteSalaryAdvance(db(), recordId(id)),
  );

  handle(IPC.payslipCreate, (inputs: unknown) =>
    repository.savePayslips(db(), validatePayslipInputs(inputs), {
      createOnly: true,
    }),
  );
  handle(IPC.payslipSave, (inputs: unknown) =>
    repository.savePayslips(db(), validatePayslipInputs(inputs)),
  );
  handle(IPC.payslipSetPaid, (ids: unknown, paidDate: unknown) =>
    repository.setPayslipsPaid(
      db(),
      recordIds(ids),
      validatePaidDate(paidDate),
    ),
  );
  handle(IPC.payslipDelete, (id: unknown) =>
    repository.deletePayslip(db(), recordId(id)),
  );
  handle(IPC.payrollUpdateSettings, (settings: unknown) =>
    repository.updatePayrollSettings(db(), validatePayrollSettings(settings)),
  );

  handle(IPC.monthReopen, (value: unknown) =>
    repository.reopenMonth(db(), pastMonth(value, monthKey())),
  );
  handle(IPC.monthClose, (value: unknown) =>
    repository.closeMonth(db(), pastMonth(value, monthKey())),
  );

  handle(IPC.backupSettings, () => backups.settings());
  handle(IPC.backupUpdateSettings, (settings: unknown) => {
    const input = (settings ?? {}) as Record<string, unknown>;
    return backups.updateSettings({
      automaticEnabled: input.automaticEnabled === true,
      intervalHours: Number(input.intervalHours),
      keep: Number(input.keep),
    });
  });
  handle(IPC.backupChooseDirectory, async () => {
    const result = await showOpenDialog({
      title: 'Choose where backups are saved',
      defaultPath: backups.settings().directory,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return backups.setDirectory(result.filePaths[0]);
  });
  handle(IPC.backupOpenDirectory, async () => {
    const error = await shell.openPath(backups.settings().directory);
    if (error)
      throw new AppError('NOT_FOUND', 'The backup folder does not exist yet.');
  });
  handle(IPC.backupList, async () => (await backups.list()).map(remember));
  handle(IPC.backupCreate, async () =>
    remember(await backups.create('manual')),
  );
  handle(IPC.backupSaveAs, async () => {
    const window = getWindow();
    const options: SaveDialogOptions = {
      title: 'Save backup',
      defaultPath: backupFileName('manual', new Date()),
      filters: BACKUP_FILTERS,
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return undefined;
    return remember(await backups.create('manual', result.filePath));
  });
  handle(IPC.backupInspect, (filePath: unknown) => {
    if (typeof filePath !== 'string' || !knownBackupPaths.has(filePath)) {
      throw new AppError('NOT_FOUND', 'Choose the backup file again.');
    }
    return backups.inspect(filePath);
  });
  handle(IPC.backupChooseFile, async () => {
    const result = await showOpenDialog({
      title: 'Choose a backup to restore',
      defaultPath: backups.settings().directory,
      filters: BACKUP_FILTERS,
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return remember(await backups.inspect(result.filePaths[0]));
  });
  handle(IPC.backupRestore, async (filePath: unknown) => {
    if (typeof filePath !== 'string' || !knownBackupPaths.has(filePath)) {
      throw new AppError('NOT_FOUND', 'Choose the backup file again.');
    }
    const result = await backups.restore(filePath);
    remember(result.safetyBackup);
    return result;
  });

  handle(IPC.reportSavePdf, async (fileName: unknown, pdfOptions: unknown) => {
    const landscape =
      typeof pdfOptions === 'object' &&
      pdfOptions !== null &&
      (pdfOptions as { landscape?: unknown }).landscape === true;
    const window = getWindow();
    if (!window) throw new AppError('INTERNAL', 'The app window is not open.');
    const baseName =
      typeof fileName === 'string'
        ? path.basename(fileName).replace(/[^\w.-]+/g, '-')
        : '';
    const options: SaveDialogOptions = {
      title: 'Save report as PDF',
      defaultPath: path.join(
        app.getPath('documents'),
        `${baseName || 'report'}.pdf`,
      ),
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    };
    const result = await dialog.showSaveDialog(window, options);
    if (result.canceled || !result.filePath) return undefined;
    // The renderer has already mounted the printable report; print CSS hides the app.
    // Footer date matches the report's dates, e.g. 10-Oct-2026.
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'short' });
    const reportDate = `${String(now.getDate()).padStart(2, '0')}-${month}-${now.getFullYear()}`;
    const pdf = await window.webContents.printToPDF({
      landscape,
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'custom',
        top: 0.55,
        bottom: 0.75,
        left: 0.65,
        right: 0.65,
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="display:flex;justify-content:space-between;width:100%;padding:0 0.65in;color:#666;font:8.5px Helvetica,Arial,sans-serif;"><span>Report date: ${reportDate}</span><span>Page <span class="pageNumber"></span></span></div>`,
    });
    await fs.writeFile(result.filePath, pdf);
    return result.filePath;
  });
}
