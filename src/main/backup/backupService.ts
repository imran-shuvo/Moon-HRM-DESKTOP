import fs from 'fs/promises';
import path from 'path';
import { AppError } from '../../shared/errors';
import {
  BackupDetails,
  BackupFileInfo,
  BackupKind,
  BackupSettings,
  RestoreResult,
} from '../../shared/types';
import { Database } from '../db/database';
import { LATEST_SCHEMA_VERSION } from '../db/migrations';
import SettingsStore from '../settingsStore';
import { readBackupData, restoreBackupData } from './backupData';
import {
  BACKUP_EXTENSION,
  backupFileName,
  buildBackupDocument,
  parseBackup,
  parseBackupFileName,
  serializeBackup,
} from './backupFormat';

const SCHEDULER_TICK_MS = 15 * 60 * 1000;

type BackupServiceOptions = {
  getDb: () => Database;
  store: SettingsStore;
  appVersion: string;
  defaultDirectory: string;
  log: (message: string, error?: unknown) => void;
};

/** Writes to a temporary file first so a crash never leaves half a backup. */
async function writeFileAtomic(target: string, contents: Buffer) {
  const temporary = `${target}.partial`;
  await fs.writeFile(temporary, contents, { mode: 0o600 });
  await fs.rename(temporary, target);
}

async function readBackupFile(filePath: string) {
  try {
    return await fs.readFile(filePath);
  } catch {
    throw new AppError(
      'BACKUP_INVALID',
      'The backup file could not be opened.',
    );
  }
}

async function uniquePath(directory: string, fileName: string) {
  const base = fileName.slice(0, -BACKUP_EXTENSION.length);
  let candidate = path.join(directory, fileName);
  for (let attempt = 1; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.access(candidate);
      candidate = path.join(directory, `${base}-${attempt}${BACKUP_EXTENSION}`);
    } catch {
      return candidate;
    }
  }
}

export default class BackupService {
  private readonly options: BackupServiceOptions;

  /** Backups and restores run one at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(options: BackupServiceOptions) {
    this.options = options;
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  settings(): BackupSettings {
    return this.options.store.getBackupSettings(this.options.defaultDirectory);
  }

  updateSettings(
    patch: Pick<BackupSettings, 'automaticEnabled' | 'intervalHours' | 'keep'>,
  ): BackupSettings {
    const intervalHours = Math.round(patch.intervalHours);
    const keep = Math.round(patch.keep);
    if (!(intervalHours >= 1 && intervalHours <= 24 * 7)) {
      throw new AppError(
        'VALIDATION',
        'Choose a backup interval between 1 hour and 7 days.',
      );
    }
    if (!(keep >= 1 && keep <= 365)) {
      throw new AppError(
        'VALIDATION',
        'Keep between 1 and 365 automatic backups.',
      );
    }
    return this.options.store.updateBackupSettings(
      this.options.defaultDirectory,
      {
        automaticEnabled: patch.automaticEnabled === true,
        intervalHours,
        keep,
      },
    );
  }

  setDirectory(directory: string): BackupSettings {
    return this.options.store.updateBackupSettings(
      this.options.defaultDirectory,
      {
        directory,
      },
    );
  }

  create(kind: BackupKind, targetPath?: string): Promise<BackupFileInfo> {
    return this.exclusive(() => this.createNow(kind, targetPath));
  }

  private async createNow(
    kind: BackupKind,
    targetPath?: string,
  ): Promise<BackupFileInfo> {
    const createdAt = new Date();
    const data = await readBackupData(this.options.getDb());
    const document = buildBackupDocument(data, {
      schemaVersion: LATEST_SCHEMA_VERSION,
      appVersion: this.options.appVersion,
      kind,
      createdAt,
    });
    const { directory } = this.settings();
    await fs.mkdir(directory, { recursive: true });
    const filePath =
      targetPath ??
      (await uniquePath(directory, backupFileName(kind, createdAt)));
    const contents = serializeBackup(document);
    await writeFileAtomic(filePath, contents);
    // Read the file back and verify it before reporting success.
    parseBackup(await fs.readFile(filePath));

    if (kind === 'automatic') {
      this.options.store.updateBackupSettings(this.options.defaultDirectory, {
        lastAutomaticBackupAt: createdAt.toISOString(),
      });
      await this.prune();
    }
    return {
      fileName: path.basename(filePath),
      path: filePath,
      kind,
      createdAt: createdAt.toISOString(),
      sizeBytes: contents.byteLength,
    };
  }

  async list(): Promise<BackupFileInfo[]> {
    const { directory } = this.settings();
    let names: string[];
    try {
      names = await fs.readdir(directory);
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return [];
      throw error;
    }
    const backups = await Promise.all(
      names.map(async (fileName) => {
        const parsed = parseBackupFileName(fileName);
        if (!parsed) return undefined;
        const filePath = path.join(directory, fileName);
        const stats = await fs.stat(filePath);
        return {
          fileName,
          path: filePath,
          kind: parsed.kind,
          createdAt: parsed.createdAt.toISOString(),
          sizeBytes: stats.size,
        };
      }),
    );
    return backups
      .filter((backup): backup is BackupFileInfo => backup !== undefined)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // eslint-disable-next-line class-methods-use-this
  async inspect(filePath: string): Promise<BackupDetails> {
    const contents = await readBackupFile(filePath);
    const document = parseBackup(contents);
    return {
      fileName: path.basename(filePath),
      path: filePath,
      kind: document.kind,
      createdAt: document.createdAt,
      sizeBytes: contents.byteLength,
      counts: document.counts,
      appVersion: document.appVersion,
      schemaVersion: document.schemaVersion,
    };
  }

  restore(filePath: string): Promise<RestoreResult> {
    return this.exclusive(async () => {
      const document = parseBackup(await readBackupFile(filePath));
      if (document.schemaVersion > LATEST_SCHEMA_VERSION) {
        throw new AppError(
          'BACKUP_INVALID',
          'This backup was made by a newer version of the app. Update the app first.',
        );
      }
      // Never overwrite data without a way back.
      const safetyBackup = await this.createNow('pre-restore');
      const restored = await restoreBackupData(
        this.options.getDb(),
        document.data,
      );
      this.options.log(
        `Restored backup ${filePath}; safety backup at ${safetyBackup.path}`,
      );
      return { restored, safetyBackup };
    });
  }

  /** Deletes the oldest automatic backups beyond the retention count. */
  private async prune() {
    const { keep } = this.settings();
    const automatic = (await this.list()).filter(
      (backup) => backup.kind === 'automatic',
    );
    await Promise.all(
      automatic
        .slice(keep)
        .map((backup) =>
          fs
            .unlink(backup.path)
            .catch((error) =>
              this.options.log(
                `Could not delete old backup ${backup.path}`,
                error,
              ),
            ),
        ),
    );
  }

  async runAutomaticIfDue(): Promise<void> {
    const settings = this.settings();
    if (!settings.automaticEnabled) return;
    const last = settings.lastAutomaticBackupAt
      ? Date.parse(settings.lastAutomaticBackupAt)
      : 0;
    if (Date.now() - last < settings.intervalHours * 60 * 60 * 1000) return;
    try {
      const backup = await this.create('automatic');
      this.options.log(`Automatic backup written to ${backup.path}`);
    } catch (error) {
      this.options.log('Automatic backup failed', error);
    }
  }

  startScheduler() {
    this.stopScheduler();
    this.runAutomaticIfDue();
    this.timer = setInterval(() => this.runAutomaticIfDue(), SCHEDULER_TICK_MS);
  }

  stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
