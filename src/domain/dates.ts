/**
 * Local-date handling.
 *
 * Fault F12: the v2.0 schema used `intention_date DATE DEFAULT CURRENT_DATE`,
 * which resolves to the SERVER's date. Supabase runs UTC, so an 8pm check-in
 * in most of Asia lands on the next UTC day and silently attaches to
 * tomorrow's intentions.
 *
 * Here, a "day" is defined by the user's IANA timezone AND a configurable
 * boundary hour that defaults to 04:00 — a late night should not split a day
 * down the middle.
 */

import type { Instant, LocalDate } from './types';

// Re-exported so callers working with dates do not need two imports.
export type { Instant, LocalDate } from './types';

export function nowInstant(): Instant {
  return new Date().toISOString();
}

export function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Format a Date as YYYY-MM-DD in the given IANA timezone. */
export function formatInZone(d: Date, timezone: string): LocalDate {
  try {
    // en-CA yields YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * The user's local date for an instant, honouring the day boundary.
 * With boundaryHour = 4, 02:00 local Tuesday still belongs to Monday.
 */
export function toLocalDate(at: Date, timezone: string, boundaryHour: number): LocalDate {
  const shifted = new Date(at.getTime() - boundaryHour * 3_600_000);
  return formatInZone(shifted, timezone);
}

export function today(timezone: string, boundaryHour: number): LocalDate {
  return toLocalDate(new Date(), timezone, boundaryHour);
}

/** Parse YYYY-MM-DD into a UTC-noon Date, which is safe for date arithmetic. */
export function parseLocalDate(d: LocalDate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1, 12, 0, 0));
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const dt = parseLocalDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86_400_000);
}

/** Inclusive range of local dates. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 5000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** 0 = Sunday .. 6 = Saturday */
export function weekdayIndex(d: LocalDate): number {
  return parseLocalDate(d).getUTCDay();
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayName(d: LocalDate): string {
  return WEEKDAY_NAMES[weekdayIndex(d)] ?? '';
}

export function hoursSince(instant: Instant | null): number {
  if (!instant) return Infinity;
  return (Date.now() - new Date(instant).getTime()) / 3_600_000;
}

export function isPast(instant: Instant | null): boolean {
  if (!instant) return false;
  return new Date(instant).getTime() <= Date.now();
}

/* ---------------------------------------------------------------- */
/* Display                                                           */
/* ---------------------------------------------------------------- */

export function formatDateHuman(d: LocalDate, todayDate: LocalDate): string {
  const diff = daysBetween(d, todayDate);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  const dt = parseLocalDate(d);
  const sameYear = dt.getUTCFullYear() === parseLocalDate(todayDate).getUTCFullYear();
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(dt);
}

export function formatInstantHuman(i: Instant): string {
  const d = new Date(i);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** For <input type="datetime-local"> round-tripping. */
export function toDatetimeLocalValue(i: Instant | null): string {
  if (!i) return '';
  const d = new Date(i);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(v: string): Instant | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
