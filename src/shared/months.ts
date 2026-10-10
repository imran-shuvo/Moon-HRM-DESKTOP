import { AppError } from './errors';

/**
 * Books are kept by calendar month. A month closes automatically when it
 * ends: its expenses and budget payments become read-only, and its remaining
 * budget is carried into the next month. A closed month can be reopened for
 * corrections and closed again.
 */

/** 'YYYY-MM' for a date in local time; defaults to the current month. */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The month before `month` ('YYYY-MM'). */
export function previousMonthKey(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthKey(new Date(year, monthNumber - 2, 1));
}

/** e.g. '2026-09' → 'September 2026'. */
export function formatMonthName(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

export function isMonthClosed(
  month: string,
  reopenedMonths: string[],
  currentMonth = monthKey(),
): boolean {
  return month < currentMonth && !reopenedMonths.includes(month);
}

/** Throws if any of the YYYY-MM-DD dates falls in a closed month. */
export function assertMonthsOpen(
  dates: string[],
  reopenedMonths: string[],
  currentMonth = monthKey(),
): void {
  const closed = dates
    .map((date) => date.slice(0, 7))
    .find((month) => isMonthClosed(month, reopenedMonths, currentMonth));
  if (closed) {
    throw new AppError(
      'MONTH_CLOSED',
      `${formatMonthName(closed)} is closed. Reopen it in Settings → Month closing to make changes.`,
    );
  }
}
