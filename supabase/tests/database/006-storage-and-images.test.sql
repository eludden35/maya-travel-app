-- Finding 6 (P1): clients could upload straight into images-pending and
-- insert their own pending_review rows, skipping the server-side EXIF strip.
-- The buckets had no size or type limits, and anon could list the approved
-- bucket.
begin;
select plan(7);

select tests.create_user('alice');
set local role service_role;
insert into storage.objects (bucket_id, name)
values ('images-approved', 'already-approved.jpg');
reset role;

select tests.authenticate_as('alice');
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name) values ('images-pending', %L) $$,
    tests.id('alice')::text || '/raw.jpg'
  ),
  '42501', null,
  'a client cannot upload straight into images-pending'
);
select throws_ok(
  format(
    $$ insert into public.images (uploader_id, state, intended_use, pending_path, bytes, mime_type)
       values (%L, 'pending_review', 'post', %L, 100, 'image/jpeg') $$,
    tests.id('alice'), tests.id('alice')::text || '/raw.jpg'
  ),
  '42501', null,
  'a client cannot insert its own images row'
);

reset role;
select tests.authenticate_as_anon();
select is(
  (select count(*)::int from storage.objects where bucket_id = 'images-approved'),
  0,
  'anon cannot list the approved bucket'
);

reset role;
select tests.clear_auth();
select is(
  (select file_size_limit from storage.buckets where id = 'images-pending'),
  10485760::bigint,
  'images-pending caps uploads at 10 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'images-approved'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'images-approved only accepts jpeg, png and webp'
);
select throws_ok(
  format(
    $$ insert into public.images (uploader_id, state, intended_use, pending_path, bytes, mime_type)
       values (%L, 'pending_review', 'post', 'someone-else/raw.jpg', 100, 'image/jpeg') $$,
    tests.id('alice')
  ),
  '23514', null,
  'pending_path must sit in the uploader''s own folder'
);
select ok(
  not has_table_privilege('authenticated', 'public.images', 'insert'),
  'authenticated has no insert privilege on images'
);

select * from finish();
rollback;
