-- =============================================================================
-- tos_acceptances: per-(profile, version) audit rows recording that a signed-in
--                  user accepted the currently-published Terms of Service,
--                  Community Guidelines, and Privacy Policy at signup (or, in
--                  a future tripplanner-s3a.27 chunk, at re-acceptance after a
--                  version bump). Bead tripplanner-s3a.24.
--
-- This migration closes the deferred AC line from tripplanner-s3a.17:
--   "Sign-up flow gates on accepting the ToS (checkbox + dated acceptance row)."
-- s3a.17 honest-deferred this line because it would have overlapped files with
-- s3a.14 in flight (both wanted app/onboarding/handle/actions.ts). Now that
-- s3a.14 has shipped its rate-limit primitive (withRateLimit + the
-- public.try_consume_rate_limit function in 20260419050100_rate_limits.sql),
-- this chunk owns that file alone and finishes the gate.
--
-- Phase 2 framing (per docs/adr/0002-social-vision-pivot.md):
--   This is TEMPLATE-DOC acceptance, not lawyer-reviewed acceptance. Both ADR
--   0002 and the disclaimer banners on each /legal/* page are explicit that
--   nothing under /legal/* is counsel-reviewed at MVP. Phase 2 gate criteria
--   (5,000 MAU OR first material abuse incident) decide when lawyer-reviewed
--   ToS replaces these templates. The data this table collects
--   ((profile_id, version, accepted_at) plus optional masked ip + truncated
--   user_agent) is the MINIMUM record needed to demonstrate good-faith
--   record-keeping if any abuse complaint surfaces during the pre-Phase 2
--   window. It is intentionally not a substitute for the Phase 2 lawyered
--   consent record — it is the responsible bridge.
--
-- Threat model (per .cursor/skills/project-architecture/SKILL.md):
--
--   1. Who can READ this data?
--      - The owner (auth.uid() = profile_id) via tos_acceptances_select_own.
--      - The moderator role (public.is_moderator(auth.uid())) via
--        tos_acceptances_select_moderator. This is for abuse investigations
--        ("did this user actually accept the ToS at signup?").
--      - Nobody else, including anon. No followers branch, no co-trip-member
--        branch — acceptance rows are private to the user and the moderator.
--
--   2. Who can WRITE this data?
--      - The owner (auth.uid() = profile_id) via tos_acceptances_insert_own.
--      - There is intentionally NO update policy and NO delete policy.
--        Acceptance rows are IMMUTABLE audit records — even the user cannot
--        retract an acceptance. Account deletion removes the row via the
--        on-delete-cascade FK to auth.users (the deletion is tied to the
--        account lifecycle, not to a per-row choice). A future agent that
--        wants to add an "edit acceptance" UI must re-open this threat
--        model first.
--
--   3. What if someone outside that set sends the request anyway?
--      - SELECT for someone else's rows returns zero rows (RLS).
--      - INSERT for someone else's profile_id rejected by with-check.
--      - UPDATE rejected by absence of any update policy.
--      - DELETE rejected by absence of any delete policy.
--      - The composite UNIQUE (profile_id, version) means a duplicate insert
--        from the same caller is a no-op via ON CONFLICT DO NOTHING in the
--        helper (lib/tos.ts), or a 23505 unique_violation if called raw.
--
--   4. Logs / PII?
--      - profile_id (FK to auth.users), version (opaque human-readable
--        string like 'v1.0-2026-04-19'), accepted_at, optional MASKED ip
--        (IPv4 /24 or IPv6 /48), optional TRUNCATED user_agent (<= 256
--        chars). No money. No image content. No message content. The
--        money-privacy hard rule from ADR 0002 is unaffected: nothing in
--        this migration touches monetary tables.
--
-- IP / UA masking choice:
--   - The MASK happens in lib/tos.ts BEFORE the insert. The DB only stores
--     the masked / truncated form. The check constraints below are length
--     guardrails, not the masking implementation — masking lives in
--     TypeScript so it is testable and reviewable in PRs.
--   - IPv4: keep the first 3 octets, set the 4th to 0 (e.g.
--     '192.168.1.42' -> '192.168.1.0'; the /24 prefix).
--   - IPv6: keep the first 3 hextets, drop the rest (the /48 prefix).
--   - If the helper cannot confidently parse the address, it stores NULL
--     rather than risk leaking more than intended.
--   - Either column may be NULL when the request did not carry the header
--     (e.g. tests, CLI smoke). NULL is a legal value here.
--
-- Why this is the responsible amount of data to collect:
--   - (profile_id, version, accepted_at) alone proves a row exists. Adding
--     masked ip + truncated user_agent strengthens the demonstration in a
--     dispute ("did the same caller make this request?") without storing
--     PII at the granularity that would itself be a privacy hazard.
--   - A purist privacy posture would skip ip + user_agent entirely; that
--     posture is defensible and the columns are nullable so it is also
--     reachable without a follow-up migration.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------

create table public.tos_acceptances (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references auth.users(id) on delete cascade,
  version       text not null
                  check (length(version) between 1 and 64),
  accepted_at   timestamptz not null default now(),
  ip            text
                  check (ip is null or length(ip) <= 64),
  user_agent    text
                  check (user_agent is null or length(user_agent) <= 256),
  unique (profile_id, version)
);

comment on table public.tos_acceptances is
  'Immutable audit rows recording per-(profile, version) acceptance of the published ToS / Community Guidelines / Privacy Policy. Owner-readable + moderator-readable; no update or delete policy by design. ip and user_agent are masked / truncated by lib/tos.ts before insert. See migration header + ADR 0002.';
comment on column public.tos_acceptances.version is
  'Opaque human-readable version string from lib/legal.ts CURRENT_TOS_VERSION (e.g. v1.0-2026-04-19). Convention is v<n.m>-<YYYY-MM-DD>; not parsed by code.';
comment on column public.tos_acceptances.ip is
  'Masked client IP (/24 for IPv4, /48 for IPv6) computed in lib/tos.ts before insert. Nullable. The DB only ever sees the masked form.';
comment on column public.tos_acceptances.user_agent is
  'Truncated user-agent string (<= 256 chars) computed in lib/tos.ts before insert. Nullable.';

-- Supports hasAcceptedCurrentTos(profile_id) and the moderator queue's
-- "show all acceptances for this user" lookup. The composite UNIQUE on
-- (profile_id, version) already covers the (profile_id, ...) prefix, but
-- per .cursor/rules/project-review-checklist-sql.mdc every column referenced
-- in an RLS predicate gets an explicit index.
create index tos_acceptances_profile_id_idx
  on public.tos_acceptances (profile_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.tos_acceptances enable row level security;

-- Owner reads their own acceptance history.
create policy "tos_acceptances_select_own"
  on public.tos_acceptances
  for select
  to authenticated
  using (auth.uid() = profile_id);

-- Moderator reads any acceptance row for abuse-investigation purposes.
-- Uses the public.is_moderator(uuid) security-definer helper from
-- 20260419013009_profiles.sql so the policy stays consistent with every
-- other moderator-gated read in the schema.
create policy "tos_acceptances_select_moderator"
  on public.tos_acceptances
  for select
  to authenticated
  using (public.is_moderator(auth.uid()));

-- Owner inserts their own acceptance row only.
create policy "tos_acceptances_insert_own"
  on public.tos_acceptances
  for insert
  to authenticated
  with check (auth.uid() = profile_id);

-- No UPDATE policy. No DELETE policy. Acceptance rows are immutable audit
-- records; the only path that removes one is on-delete-cascade from
-- auth.users (account removal). See header for rationale.
