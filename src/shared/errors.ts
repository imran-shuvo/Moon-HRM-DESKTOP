export type AppErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IN_USE'
  | 'MONTH_CLOSED'
  | 'NOT_CONNECTED'
  | 'CONNECTION_FAILED'
  | 'BACKUP_INVALID'
  | 'INTERNAL';

/**
 * An error whose message is safe and useful to show to the user.
 * Anything else that reaches the IPC boundary is reported as INTERNAL.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
