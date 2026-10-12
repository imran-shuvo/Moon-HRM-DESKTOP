import { contextBridge, ipcRenderer } from 'electron';
import IPC from '../shared/ipcChannels';
import { FinanceApi, IpcResult } from '../shared/types';

/** Invokes a main-process handler and turns an error result into a throw. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.name = result.error.code;
    throw error;
  }
  return result.data;
}

const financeApi: FinanceApi = {
  database: {
    status: () => invoke(IPC.dbStatus),
    test: (settings) => invoke(IPC.dbTest, settings),
    connect: (settings) => invoke(IPC.dbConnect, settings),
  },
  data: {
    load: () => invoke(IPC.dataLoad),
    importLegacy: (payload) => invoke(IPC.dataImportLegacy, payload),
  },
  expenses: {
    create: (input, files) => invoke(IPC.expenseCreate, input, files),
    update: (id, input, files) => invoke(IPC.expenseUpdate, id, input, files),
    remove: (id) => invoke(IPC.expenseDelete, id),
    attachment: (id) => invoke(IPC.expenseAttachment, id),
    openAttachment: (id) => invoke(IPC.expenseOpenAttachment, id),
  },
  budgets: {
    create: (input) => invoke(IPC.budgetCreate, input),
    update: (id, input) => invoke(IPC.budgetUpdate, id, input),
    remove: (id) => invoke(IPC.budgetDelete, id),
  },
  employees: {
    create: (input) => invoke(IPC.employeeCreate, input),
    update: (id, input) => invoke(IPC.employeeUpdate, id, input),
    remove: (id) => invoke(IPC.employeeDelete, id),
  },
  attendance: {
    list: (month) => invoke(IPC.attendanceList, month),
    saveDay: (date, rows) => invoke(IPC.attendanceSaveDay, date, rows),
  },
  salaryAdvances: {
    create: (inputs) => invoke(IPC.advanceCreate, inputs),
    update: (id, input) => invoke(IPC.advanceUpdate, id, input),
    remove: (id) => invoke(IPC.advanceDelete, id),
  },
  payslips: {
    create: (inputs) => invoke(IPC.payslipCreate, inputs),
    save: (inputs) => invoke(IPC.payslipSave, inputs),
    setPaid: (ids, paidDate) => invoke(IPC.payslipSetPaid, ids, paidDate),
    remove: (id) => invoke(IPC.payslipDelete, id),
  },
  documents: {
    upload: (input, files) => invoke(IPC.documentUpload, input, files),
    update: (id, input) => invoke(IPC.documentUpdate, id, input),
    remove: (id) => invoke(IPC.documentDelete, id),
    open: (id) => invoke(IPC.documentOpen, id),
    saveAs: (id) => invoke(IPC.documentSaveAs, id),
  },
  payroll: {
    updateSettings: (settings) => invoke(IPC.payrollUpdateSettings, settings),
  },
  months: {
    reopen: (month) => invoke(IPC.monthReopen, month),
    close: (month) => invoke(IPC.monthClose, month),
  },
  backup: {
    settings: () => invoke(IPC.backupSettings),
    updateSettings: (settings) => invoke(IPC.backupUpdateSettings, settings),
    chooseDirectory: () => invoke(IPC.backupChooseDirectory),
    openDirectory: () => invoke(IPC.backupOpenDirectory),
    list: () => invoke(IPC.backupList),
    create: () => invoke(IPC.backupCreate),
    saveAs: () => invoke(IPC.backupSaveAs),
    inspect: (path) => invoke(IPC.backupInspect, path),
    chooseFile: () => invoke(IPC.backupChooseFile),
    restore: (path) => invoke(IPC.backupRestore, path),
  },
  reports: {
    savePdf: (fileName, options) =>
      invoke(IPC.reportSavePdf, fileName, options),
  },
};

contextBridge.exposeInMainWorld('financeApi', financeApi);
