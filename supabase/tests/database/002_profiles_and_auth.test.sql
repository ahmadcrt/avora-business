-- pgTAP tests for Phase 2: profiles, roles, RLS and privilege escalation.
-- Run with:  supabase test db
begin;
select plan(45);

-- Impersonate a signed-in API user (must be called as the owner, before switching role).
create function pg_temp.login_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end;
$$;

-- ===== Phone helper: same cases as tests/lib.test.mjs ==================================
select is(
  (select array_agg(private.normalize_ng_phone(x) order by ord)
     from unnest(array['08012345678', '8012345678', '2348012345678', '+234 801 234 5678', '+234-801-234-5678', '0901 234 5678'])
          with ordinality as t(x, ord)),
  array['+2348012345678', '+2348012345678', '+2348012345678', '+2348012345678', '+2348012345678', '+2349012345678'],
  'normalize_ng_phone accepts common Nigerian formats'
);
select ok(
  (select bool_and(private.normalize_ng_phone(x) is null)
     from unnest(array['0801234567', '080123456789', '+1 202 555 0100', 'abcdefghijk', '', '02012345678']) as t(x)),
  'normalize_ng_phone rejects invalid numbers'
);

-- ===== Accounts (as owner) ============================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ada@example.test',   '{"full_name":"Ada Okafor","phone":"0801 234 5678"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bola@example.test',  '{"full_name":"Bola Adeyemi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'evil@example.test',  '{"role":"admin","full_name":"  Evil  Co ","phone":"bad"}'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@example.test', '{"full_name":"Site Admin"}');

select is((select role::text from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'merchant', 'signup creates a merchant profile');
select is((select phone from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), '+2348012345678', 'signup normalises the phone number');
select is((select role::text from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 'merchant', 'a role sent in signup metadata is ignored');
select is((select full_name from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 'Evil  Co', 'signup trims the name');
select is((select phone from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), null, 'an invalid phone at signup becomes NULL, not an error');

-- The owner can create an admin (the only way an admin comes to exist).
select lives_ok(
  $$update public.profiles set role = 'admin' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'the database owner can promote an admin'
);
select is((select role::text from public.profiles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 'admin', 'admin role is set');

-- ===== Anonymous visitor ================================================================
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$insert into public.profiles (id) values (gen_random_uuid())$$, '42501', null, 'anon cannot insert profiles');
select throws_ok($$select private.is_admin()$$, '42501', null, 'anon cannot call private.is_admin()');
reset role;

-- ===== Merchant A =========================================================================
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is((select count(*)::int from public.profiles), 1, 'merchant sees exactly one profile');
select is((select id::text from public.profiles), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'merchant sees their own profile');
select is((select count(*)::int from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'merchant cannot see another merchant');
select is((select private.is_admin()), false, 'merchant is not an admin');

select lives_ok($$update public.profiles set full_name = '  Ada  Obi ' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, 'merchant can update their name');
select is((select full_name from public.profiles), 'Ada  Obi', 'name is cleaned on update');
select lives_ok($$update public.profiles set phone = '08031234567' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, 'merchant can update their phone');
select is((select phone from public.profiles), '+2348031234567', 'phone is normalised on update');
select throws_ok($$update public.profiles set phone = '12345' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '22023', null, 'invalid phone is rejected');
select throws_ok($$update public.profiles set full_name = 'x' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '22023', null, 'too-short name is rejected');

select throws_ok($$update public.profiles set role = 'admin' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'merchant cannot promote themselves');
select throws_ok($$update public.profiles set id = gen_random_uuid() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'merchant cannot change their id');
select throws_ok($$update public.profiles set created_at = now() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'merchant cannot change created_at');
select lives_ok($$update public.profiles set full_name = 'Hacked Name' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$, 'updating someone else matches no rows (no error)');
select throws_ok($$delete from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'merchant cannot delete profiles');
select throws_ok($$insert into public.profiles (id) values (gen_random_uuid())$$, '42501', null, 'merchant cannot insert profiles');
reset role;

select is((select full_name from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'Bola Adeyemi', 'merchant A did not change merchant B');

-- ===== Admin ==============================================================================
select pg_temp.login_as('dddddddd-dddd-dddd-dddd-dddddddddddd');

select is((select private.is_admin()), true, 'admin is recognised by the database');
select ok((select count(*)::int from public.profiles) >= 4, 'admin can read all profiles');
select lives_ok($$update public.profiles set full_name = 'Changed By Admin' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, 'admin update of another profile matches no rows (no error)');
select throws_ok($$update public.profiles set role = 'merchant' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$, '42501', null, 'admin cannot change roles through the API');
select throws_ok($$delete from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$, '42501', null, 'admin cannot delete profiles');
reset role;

select is((select full_name from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'Ada  Obi', 'admin did not edit merchant A');

-- ===== Structure and privileges =========================================================
select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), true, 'RLS is enabled on profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon has no SELECT on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated has no INSERT on profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated has no DELETE on profiles');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'), 'authenticated cannot update the role column');
select ok(has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'), 'authenticated can update full_name');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname <> all (array['is_admin', 'normalize_ng_phone', 'clean_full_name'])
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'authenticated can execute only the reviewed private functions (is_admin and two pure helpers)'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'anon can execute no private function'
);
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind in ('r', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT'))),
  0, 'API roles can read no table in the private schema'
);

-- ===== Cascade =====================================================================
delete from auth.users where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select is((select count(*)::int from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'), 0, 'deleting an account removes its profile');

select * from finish();
rollback;
