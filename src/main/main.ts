/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, safeStorage, shell } from 'electron';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import SettingsStore from './settingsStore';
import ConnectionManager from './db/connection';
import BackupService from './backup/backupService';
import registerIpcHandlers from './ipc';

log.transports.file.level = 'info';

let mainWindow: BrowserWindow | null = null;

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

/** The app's former names, newest first; each kept its own app-data folder. */
const FORMER_NAMES = ['Moon Finance', 'Inventory'];

/**
 * Installed builds were called "Moon Finance", and before that "Inventory",
 * and kept their settings in that app-data folder. Copy the newest ones
 * once, so the database connection and backup settings carry over; the old
 * file stays. (A password locked to the old app's keychain entry is asked
 * for again.)
 */
function adoptSettingsFromBeforeRename() {
  if (fs.existsSync(settingsPath)) return;
  const name = FORMER_NAMES.find((former) =>
    fs.existsSync(path.join(app.getPath('appData'), former, 'settings.json')),
  );
  if (!name) return;
  const legacy = path.join(app.getPath('appData'), name, 'settings.json');
  if (legacy === settingsPath) return;
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.copyFileSync(legacy, settingsPath);
    log.info(`Copied settings from the app's former "${name}" folder.`);
  } catch (error) {
    log.error(
      `Could not copy settings from the former "${name}" folder.`,
      error,
    );
  }
}
adoptSettingsFromBeforeRename();

/**
 * Backups go to Documents/Moon HRM Backups, unless the folder from when the
 * app was called Moon Finance exists and the new one does not yet: then
 * backups stay where they already are.
 */
function defaultBackupDirectory() {
  const documents = app.getPath('documents');
  const current = path.join(documents, 'Moon HRM Backups');
  const former = path.join(documents, 'Moon Finance Backups');
  return !fs.existsSync(current) && fs.existsSync(former) ? former : current;
}

const settingsStore = new SettingsStore(settingsPath, {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (value) => safeStorage.encryptString(value),
  decrypt: (value) => safeStorage.decryptString(value),
});

const connection = new ConnectionManager(settingsStore);

const backupService = new BackupService({
  getDb: () => connection.getDb(),
  store: settingsStore,
  appVersion: app.getVersion(),
  defaultDirectory: defaultBackupDirectory(),
  log: (message, error) =>
    error ? log.error(message, error) : log.info(message),
});

connection.onConnected(() => {
  log.info('Connected to PostgreSQL; automatic backups scheduled.');
  backupService.startScheduler();
});

registerIpcHandlers({
  connection,
  backups: backupService,
  getWindow: () => mainWindow,
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open web links in the user's browser; never hand other schemes to the OS.
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    if (/^https?:/.test(edata.url)) shell.openExternal(edata.url);
    return { action: 'deny' };
  });
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  backupService.stopScheduler();
  connection
    .close()
    .then(() => app.quit())
    .catch((error) => {
      log.error('Error closing the database', error);
      app.quit();
    });
});

app
  .whenReady()
  .then(async () => {
    // Connect before the window loads so the UI can show data immediately.
    await connection.connectOnStartup();
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
