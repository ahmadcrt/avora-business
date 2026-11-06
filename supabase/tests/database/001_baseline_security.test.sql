-- pgTAP tests for the baseline security migration.
-- Run with:  supabase test db   (GitHub Actions does this on every pull request)
begin;
select plan(17);

-- Schemas -------------------------------------------------------------------
select has_schema('private', 'private schema exists');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use private schema');
-- Phase 2: authenticated needs USAGE so RLS policies can call private.is_admin(). It must still
-- be unable to create objects there (function and table exposure is audited in 002_*.test.sql).
select ok(has_schema_privilege('authenticated', 'private', 'USAGE') and not has_schema_privilege('authenticated', 'private', 'CREATE'), 'authenticated may use, but not create in, the private schema');
select ok(has_schema_privilege('anon', 'public', 'USAGE'), 'anon can use public schema (API needs it)');
select ok(not has_schema_privilege('anon', 'public', 'CREATE'), 'anon cannot create objects in public');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'authenticated cannot create objects in public');

-- Deny by default: no table in public may be reachable by API roles unless this
-- allow-list says so. Later phases add their reviewed tables to the list.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm', 'p', 'f')
      and c.relname <> all (array[/* reviewed tables are added here in later phases */ '__none__', 'profiles'])
      and (   has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
           or has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))),
  0,
  'anon/authenticated hold no unreviewed table grants in public'
);

-- Same for functions: only reviewed functions are executable by API roles.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> all (array[/* reviewed functions are added here */ 'api_health'])
      and (   has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0,
  'anon/authenticated can execute no unreviewed functions in public'
);

-- Every table in public has RLS enabled.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every table in public has row level security enabled'
);

-- Default privileges: a table created now must NOT be accessible to API roles.
create table public._baseline_probe (id int);
select ok(not has_table_privilege('anon', 'public._baseline_probe', 'SELECT'), 'new tables are not readable by anon by default');
select ok(not has_table_privilege('authenticated', 'public._baseline_probe', 'SELECT'), 'new tables are not readable by authenticated by default');
select ok(not has_table_privilege('authenticated', 'public._baseline_probe', 'INSERT'), 'new tables are not writable by authenticated by default');

-- New functions are not executable by default.
create function public._baseline_fn() returns int language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public._baseline_fn()', 'EXECUTE'), 'new functions are not executable by anon by default');

-- Auth internals are not readable with API roles.
select ok(not has_table_privilege('anon', 'auth.users', 'SELECT'), 'anon cannot read auth.users');
select ok(not has_table_privilege('authenticated', 'auth.users', 'SELECT'), 'authenticated cannot read auth.users');

-- Health check works for anon.
set local role anon;
select is((public.api_health() ->> 'ok'), 'true', 'anon can call api_health()');
reset role;

-- updated_at helper works.
create table public._baseline_touch (id int, updated_at timestamptz default '2000-01-01');
create trigger touch before update on public._baseline_touch
  for each row execute function private.set_updated_at();
insert into public._baseline_touch (id) values (1);
update public._baseline_touch set id = 2;
select ok((select updated_at > '2001-01-01' from public._baseline_touch), 'set_updated_at() refreshes updated_at');

select * from finish();
rollback;
