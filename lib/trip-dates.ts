/**
 * Display helpers for trip dates (Bead tripplanner-718).
 *
 * Trip dates are calendar days with no time zone (Postgres `date`, sent as
 * "yyyy-mm-dd"). `new Date("2026-12-04")` is midnight UTC, so formatting it
 * in the local zone shows Dec 3 anywhere west of UTC. Everything here formats
 * in UTC instead.
 */

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "Dec 4 – 7, 2026", "From Dec 4, 2026", or "Dates TBD". */
export function formatTripDates(
  startDate: string | null,
  endDate: string | null,
): string {
  if (startDate && endDate) {
    return DAY.formatRange(utcDay(startDate), utcDay(endDate));
  }
  if (startDate) {
    return `From ${DAY.format(utcDay(startDate))}`;
  }
  if (endDate) {
    return `Until ${DAY.format(utcDay(endDate))}`;
  }
  return "Dates TBD";
}

/** "3 nights", "1 night" or "Day trip"; `null` unless both dates are set. */
export function formatTripLength(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (!startDate || !endDate) return null;
  const nights = Math.round(
    (utcDay(endDate).getTime() - utcDay(startDate).getTime()) / MS_PER_DAY,
  );
  if (nights <= 0) return "Day trip";
  return nights === 1 ? "1 night" : `${nights} nights`;
}

function utcDay(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}
