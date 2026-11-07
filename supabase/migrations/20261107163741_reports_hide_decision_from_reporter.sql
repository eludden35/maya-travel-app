-- tripplanner-2o5.14: a reporter could read the moderator's decision note and
-- identity on their own report through the REST API
-- (GET /rest/v1/reports?select=decision_note,decided_by), because
-- 20261105201232_trip_posts_and_reports.sql granted SELECT on the whole table.
--
-- Column-level SELECT instead: every column but decided_by and decision_note.
-- The row policy is unchanged (a reporter reads their own reports, a
-- moderator reads all). Moderators read decisions through list_reports(),
-- which is security definer and unaffected by these grants.

revoke select on table public.reports from authenticated;

grant select (
  id,
  reporter_id,
  target_type,
  target_id,
  trip_id,
  target_author_id,
  reported_text,
  reason,
  note,
  status,
  decided_at,
  created_at
) on table public.reports to authenticated;

comment on column public.reports.decision_note is
  'The moderator''s note for the record. Not granted to authenticated: read it through list_reports().';
comment on column public.reports.decided_by is
  'The moderator who decided. Not granted to authenticated, so a reporter never learns who the moderators are.';
