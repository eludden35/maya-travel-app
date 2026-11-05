/**
 * When a post was written, for its byline (Bead tripplanner-2o5.6):
 * "Today, 4:12 PM", "Yesterday, 9:03 AM", "Nov 1, 9:03 AM", or
 * "Dec 30, 2025" before this year. Times are in the reader's time zone, which
 * only the browser knows; until it does (the server render), the time is
 * spelled out in full, with its zone.
 */

const LOCALE = "en-US";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A Postgres timestamp as a Date. Postgres sends microseconds; JavaScript
 * only promises to parse milliseconds, so the extra digits are dropped first.
 */
export function parsePostTime(createdAt: string): Date {
  return new Date(createdAt.replace(/(\.\d{3})\d+/, "$1"));
}

/** The calendar day `date` falls on in `timeZone`, as days since 1970-01-01. */
export function dayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / MS_PER_DAY;
}

/**
 * `today` is the reader's current `dayNumber` in `timeZone`, or `null` when
 * it isn't known yet.
 */
export function formatPostTime(
  createdAt: string,
  timeZone: string,
  today: number | null,
): string {
  const date = parsePostTime(createdAt);
  if (today === null) {
    return new Intl.DateTimeFormat(LOCALE, {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }

  const time = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const day = dayNumber(date, timeZone);
  // A post can look a moment ahead of a reader whose clock runs slow.
  if (day >= today) {
    return `Today, ${time}`;
  }
  if (day === today - 1) {
    return `Yesterday, ${time}`;
  }

  const sameYear =
    new Date(day * MS_PER_DAY).getUTCFullYear() ===
    new Date(today * MS_PER_DAY).getUTCFullYear();
  const calendarDay = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(date);
  return sameYear ? `${calendarDay}, ${time}` : calendarDay;
}
