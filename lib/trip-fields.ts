/**
 * Trip form fields, shared by the trip forms (client) and the trip Server
 * Actions (server), so it stays free of Supabase and `server-only` imports
 * (Bead tripplanner-718).
 *
 * The database is the authority: `create_trip` and `update_trip` in
 * `supabase/migrations/20261102180000_trip_lifecycle.sql` validate and answer
 * with a status. The limits here mirror that so a form can say so up front.
 */

import { CURRENCIES, type CurrencyCode } from "@/lib/money";

export const TRIP_NAME_MAX = 120;
export const TRIP_DESCRIPTION_MAX = 2000;

/** The date range the database accepts and every client can display. */
export const TRIP_DATE_MIN = "1900-01-01";
export const TRIP_DATE_MAX = "2999-12-31";

/**
 * Currencies a trip can be kept in, in picker order. `CURRENCIES` in
 * `lib/money.ts` is the one list, checked against
 * `private.is_supported_currency()` by `lib/money.test.ts`.
 */
export const TRIP_CURRENCIES = (Object.keys(CURRENCIES) as CurrencyCode[]).map(
  (code) => ({ code, name: CURRENCIES[code].name }),
);

export const DEFAULT_TRIP_CURRENCY = "USD" satisfies CurrencyCode;

/** The details a trip's organizer can edit after creating it. */
export type TripDetails = {
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
};

/**
 * Read a submitted trip form: trim every field and turn blanks into `null`.
 * Lengths, date order and the currency are left to the RPC.
 */
export function readTripDetails(formData: FormData): TripDetails {
  return {
    name: readText(formData, "name"),
    description: readText(formData, "description") || null,
    startDate: readText(formData, "start_date") || null,
    endDate: readText(formData, "end_date") || null,
  };
}

export function readTripCurrency(formData: FormData): string {
  return readText(formData, "currency");
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day written as yyyy-mm-dd, the shape Postgres `date` takes. */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}
