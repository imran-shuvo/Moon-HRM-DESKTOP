import fs from 'fs';
import path from 'path';
import { BackupSettings, DatabaseConnectionSettings } from '../shared/types';

export type SecretCodec = {
  isAvailable: () => boolean;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
};

type StoredDatabaseSettings = Omit<DatabaseConnectionSettings, 'password'> & {
  password: string;
  passwordEncoding: 'os-keychain' | 'plain';
};

type StoredSettings = {
  database?: StoredDatabaseSettings;
  backup?: Partial<BackupSettings>;
};

export const DEFAULT_BACKUP_SETTINGS = {
  automaticEnabled: true,
  intervalHours: 24,
  keep: 14,
};

/**
 * App settings in a JSON file under the user's app-data folder.
 * The database password is encrypted with the OS keychain when available.
 */
export default class SettingsStore {
  private readonly filePath: string;

  private readonly codec: SecretCodec;

  constructor(filePath: string, codec: SecretCodec) {
    this.filePath = filePath;
    this.codec = codec;
  }

  private read(): StoredSettings {
    try {
      return JSON.parse(
        fs.readFileSync(this.filePath, 'utf8'),
      ) as StoredSettings;
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        // eslint-disable-next-line no-console
        console.error('Settings file is unreadable; using defaults.', error);
      }
      return {};
    }
  }

  private write(settings: StoredSettings) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(temporary, this.filePath);
  }

  getDatabaseSettings(): DatabaseConnectionSettings | undefined {
    const stored = this.read().database;
    if (!stored) return undefined;
    let { password } = stored;
    if (stored.passwordEncoding === 'os-keychain') {
      try {
        password = this.codec.decrypt(Buffer.from(password, 'base64'));
      } catch {
        // eslint-disable-next-line no-console
        console.error('Stored database password could not be decrypted.');
        password = '';
      }
    }
    return {
      host: stored.host,
      port: stored.port,
      database: stored.database,
      user: stored.user,
      ssl: stored.ssl,
      password,
    };
  }

  setDatabaseSettings(settings: DatabaseConnectionSettings) {
    const encrypted = this.codec.isAvailable();
    this.write({
      ...this.read(),
      database: {
        ...settings,
        password: encrypted
          ? this.codec.encrypt(settings.password).toString('base64')
          : settings.password,
        passwordEncoding: encrypted ? 'os-keychain' : 'plain',
      },
    });
  }

  getBackupSettings(defaultDirectory: string): BackupSettings {
    return {
      ...DEFAULT_BACKUP_SETTINGS,
      directory: defaultDirectory,
      ...this.read().backup,
    };
  }

  updateBackupSettings(
    defaultDirectory: string,
    patch: Partial<BackupSettings>,
  ): BackupSettings {
    const settings = this.read();
    const backup = {
      ...this.getBackupSettings(defaultDirectory),
      ...patch,
    };
    this.write({ ...settings, backup });
    return backup;
  }
}
