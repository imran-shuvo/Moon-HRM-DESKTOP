import { PoolConfig } from 'pg';
import { AppError } from '../../shared/errors';
import { DatabaseConnectionSettings, DatabaseStatus } from '../../shared/types';
import SettingsStore from '../settingsStore';
import { Database, toAppError } from './database';
import { migrate } from './migrations';

function toPoolConfig(settings: DatabaseConnectionSettings): PoolConfig {
  return {
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    ssl: settings.ssl ? { rejectUnauthorized: true } : undefined,
    application_name: 'Moon Finance',
  };
}

function withoutPassword(
  settings: DatabaseConnectionSettings,
): DatabaseStatus['settings'] {
  return {
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    ssl: settings.ssl,
  };
}

/** Owns the single live connection pool and its status. */
export default class ConnectionManager {
  private db: Database | undefined;

  private status: DatabaseStatus = { connected: false, source: 'none' };

  private readonly store: SettingsStore;

  private connectedListener: ((db: Database) => void) | undefined;

  constructor(store: SettingsStore) {
    this.store = store;
  }

  /** Called every time a (new) connection becomes active. */
  onConnected(listener: (db: Database) => void) {
    this.connectedListener = listener;
  }

  getStatus(): DatabaseStatus {
    return this.status;
  }

  getDb(): Database {
    if (!this.db) {
      throw new AppError(
        'NOT_CONNECTED',
        'The app is not connected to the database.',
      );
    }
    return this.db;
  }

  /** Connects with DATABASE_URL if set, otherwise with saved settings. */
  async connectOnStartup(): Promise<DatabaseStatus> {
    const url = process.env.DATABASE_URL;
    if (url) {
      return this.open({ connectionString: url }, 'env', undefined);
    }
    const saved = this.store.getDatabaseSettings();
    if (!saved) return this.status;
    return this.open(toPoolConfig(saved), 'settings', withoutPassword(saved));
  }

  // eslint-disable-next-line class-methods-use-this
  async test(settings: DatabaseConnectionSettings): Promise<string> {
    const probe = new Database({ ...toPoolConfig(settings), max: 1 });
    try {
      return await probe.serverVersion();
    } catch (error) {
      throw toAppError(error);
    } finally {
      await probe.close().catch(() => undefined);
    }
  }

  /** Connects with new settings and saves them only if that succeeds. */
  async connect(settings: DatabaseConnectionSettings): Promise<DatabaseStatus> {
    if (this.status.source === 'env') {
      throw new AppError(
        'VALIDATION',
        'The connection is set by the DATABASE_URL environment variable.',
      );
    }
    const status = await this.open(
      toPoolConfig(settings),
      'settings',
      withoutPassword(settings),
    );
    if (!status.connected) {
      throw new AppError(
        'CONNECTION_FAILED',
        status.error ?? 'Connection failed.',
      );
    }
    this.store.setDatabaseSettings(settings);
    return status;
  }

  private async open(
    config: PoolConfig,
    source: DatabaseStatus['source'],
    settings: DatabaseStatus['settings'],
  ): Promise<DatabaseStatus> {
    const next = new Database(config);
    try {
      const serverVersion = await next.serverVersion();
      await migrate(next);
      const previous = this.db;
      this.db = next;
      this.status = { connected: true, source, settings, serverVersion };
      await previous?.close().catch(() => undefined);
      this.connectedListener?.(next);
    } catch (error) {
      await next.close().catch(() => undefined);
      // eslint-disable-next-line no-console
      console.error('Database connection failed', error);
      const appError = toAppError(error);
      // Keep an existing working connection if switching servers failed.
      this.status = this.db
        ? { ...this.status, error: appError.message }
        : { connected: false, source, settings, error: appError.message };
      if (this.db) throw appError;
    }
    return this.status;
  }

  async close() {
    await this.db?.close().catch(() => undefined);
    this.db = undefined;
  }
}
