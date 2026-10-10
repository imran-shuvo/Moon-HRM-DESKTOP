import { Pool, PoolConfig, QueryResultRow, types } from 'pg';
import { AppError } from '../../shared/errors';

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
};

const DATE_OID = 1082;
const NUMERIC_OID = 1700;

/**
 * Per-pool type parsers (instead of mutating pg's global defaults):
 * - DATE stays as 'YYYY-MM-DD' so no timezone shifting happens in JS.
 * - NUMERIC becomes a JS number. Amounts are NUMERIC(14,2), which is well
 *   within the range a double represents exactly to the cent.
 */
const typeParsers = {
  getTypeParser(oid: number, format?: 'text' | 'binary') {
    if (oid === DATE_OID) return (value: string) => value;
    if (oid === NUMERIC_OID) return (value: string) => Number(value);
    return types.getTypeParser(oid, format);
  },
};

export class Database implements Queryable {
  private readonly pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool({
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      ...config,
      types: typeParsers,
    });
    // An idle client losing its connection must not crash the main process.
    this.pool.on('error', (error) => {
      // eslint-disable-next-line no-console
      console.error('PostgreSQL pool error', error);
    });
  }

  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) {
    return this.pool.query<R>(text, params);
  }

  /** Runs `work` in a transaction; rolls back on any error. */
  async transaction<T>(
    work: (client: Queryable) => Promise<T>,
    { isolation }: { isolation?: 'REPEATABLE READ' | 'SERIALIZABLE' } = {},
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(
        isolation ? `BEGIN ISOLATION LEVEL ${isolation}` : 'BEGIN',
      );
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async serverVersion(): Promise<string> {
    const { rows } = await this.pool.query<{ server_version: string }>(
      'SHOW server_version',
    );
    return rows[0].server_version;
  }

  close() {
    return this.pool.end();
  }
}

type PgError = Error & { code?: string; detail?: string };

/** Turns driver/server errors into messages a finance user can act on. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const pgError = error as PgError;
  switch (pgError?.code) {
    case '23505':
      return new AppError('CONFLICT', 'That name already exists.');
    case '23503': // foreign_key_violation
      // Saving a transaction whose type/department was removed meanwhile.
      if (pgError.detail?.includes('is not present in table')) {
        return new AppError(
          'VALIDATION',
          'The chosen type or department no longer exists. Refresh and choose another.',
        );
      }
      return new AppError(
        'IN_USE',
        'This item is still used by existing transactions. Edit those transactions first.',
      );
    case '23001': // restrict_violation (ON DELETE RESTRICT)
      return new AppError(
        'IN_USE',
        'This item is still used by existing transactions. Edit those transactions first.',
      );
    case '23514':
    case '22003':
      return new AppError('VALIDATION', 'One of the values is out of range.');
    case '28P01':
    case '28000':
      return new AppError(
        'CONNECTION_FAILED',
        'The database rejected the user name or password.',
      );
    case '3D000':
      return new AppError(
        'CONNECTION_FAILED',
        'That database does not exist on the server. Create it first.',
      );
    case 'ECONNREFUSED':
      return new AppError(
        'CONNECTION_FAILED',
        'Could not reach the database server. Check the host and port, and that PostgreSQL is running.',
      );
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new AppError(
        'CONNECTION_FAILED',
        'The database host name could not be found.',
      );
    case '57P01':
    case 'ECONNRESET':
      return new AppError(
        'CONNECTION_FAILED',
        'The connection to the database was lost. Please try again.',
      );
    default:
      break;
  }
  if (pgError?.message?.includes('timeout')) {
    return new AppError(
      'CONNECTION_FAILED',
      'Timed out connecting to the database server.',
    );
  }
  if (pgError?.message?.includes('SSL')) {
    return new AppError('CONNECTION_FAILED', pgError.message);
  }
  return new AppError('INTERNAL', 'Something went wrong. Please try again.');
}
