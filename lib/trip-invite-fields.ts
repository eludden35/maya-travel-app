/**
 * Invite-link fields, shared by the organizer's invite panel (client) and the
 * invite Server Actions, pages and route (server), so it stays free of
 * Supabase and `server-only` imports (Bead tripplanner-2o5.1).
 *
 * The database is the authority: `create_trip_invite` in
 * `supabase/migrations/20261103200000_trip_invites.sql` accepts 1 to 30 days
 * and 1 to 50 uses. The choices here are a subset of that, and the defaults
 * are the founder's (test plan §12 Q6).
 */

/** 128 random bits as unpadded base64url, the shape the database makes. */
const INVITE_TOKEN = /^[A-Za-z0-9_-]{22}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN.test(value);
}

export const INVITE_EXPIRY_CHOICES = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "30 days" },
] as const;

export const INVITE_MAX_USES_CHOICES = [1, 5, 10, 25, 50] as const;

export const DEFAULT_INVITE_EXPIRY_DAYS = 7;
export const DEFAULT_INVITE_MAX_USES = 10;

export type InviteSettings = {
  expiresInDays: number;
  maxUses: number;
};

/**
 * Read the organizer's create form. A value that isn't a whole number comes
 * back as NaN, which the write helper refuses before calling the database.
 */
export function readInviteSettings(formData: FormData): InviteSettings {
  return {
    expiresInDays: readWholeNumber(formData, "expires_in_days"),
    maxUses: readWholeNumber(formData, "max_uses"),
  };
}

export type InviteLinkState = "live" | "expired" | "full" | "revoked";

/**
 * Where a link stands, in the order `private.trip_invite_problem()` checks:
 * turned off, then expired, then full.
 */
export function inviteLinkState(
  invite: {
    expires_at: string;
    uses: number;
    max_uses: number;
    revoked_at: string | null;
  },
  now: Date,
): InviteLinkState {
  if (invite.revoked_at !== null) return "revoked";
  if (Date.parse(invite.expires_at) <= now.getTime()) return "expired";
  if (invite.uses >= invite.max_uses) return "full";
  return "live";
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** How long a link was made to last, in whole days. */
export function inviteLifetimeDays(invite: {
  created_at: string;
  expires_at: string;
}): number {
  return Math.round(
    (Date.parse(invite.expires_at) - Date.parse(invite.created_at)) / DAY_MS,
  );
}

/** "in 7 days", "in 5 hours", "in 3 minutes": when a live link stops working. */
export function formatExpiresIn(expiresAt: string, now: Date): string {
  const minutes = Math.max(
    1,
    Math.round((Date.parse(expiresAt) - now.getTime()) / MINUTE_MS),
  );
  if (minutes < 60) return RELATIVE_TIME.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return RELATIVE_TIME.format(hours, "hour");
  return RELATIVE_TIME.format(Math.round(hours / 24), "day");
}

function readWholeNumber(formData: FormData, field: string): number {
  const value = formData.get(field);
  return typeof value === "string" && /^\d{1,3}$/.test(value.trim())
    ? Number(value.trim())
    : Number.NaN;
}
