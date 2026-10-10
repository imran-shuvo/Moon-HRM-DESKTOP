/**
 * @jest-environment node
 */
import { toAppError } from '../main/db/database';

function pgError(code: string, detail: string) {
  return Object.assign(new Error('pg'), { code, detail });
}

describe('database errors', () => {
  it('explains a transaction that refers to a removed type', () => {
    const error = toAppError(
      pgError(
        '23503',
        'Key (category)=(Travel) is not present in table "categories".',
      ),
    );
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toMatch(/no longer exists/);
  });

  it('refuses to delete a type that transactions still use', () => {
    const error = toAppError(
      pgError(
        '23503',
        'Key (name)=(Travel) is still referenced from table "expenses".',
      ),
    );
    expect(error.code).toBe('IN_USE');
  });

  it('hides unexpected errors from the user', () => {
    expect(toAppError(new Error('syntax error at "SELEC"')).message).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
