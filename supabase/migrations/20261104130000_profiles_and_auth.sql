-- =============================================================================
-- AVORA Business: Phase 2, profiles and authentication
--
-- * public.profiles: one row per account (role, name, Nigerian mobile number).
-- * A trigger on auth.users creates the profile. The role is ALWAYS 'merchant'
--   at signup; anything in the signup metadata about roles is ignored.
-- * Merchants can read their own profile and update only full_name and phone.
-- * Role, id and created_at can only be changed by the database owner
--   (admins are created manually in the SQL editor, never through the API).
-- * Admins (private.is_admin()) can read all profiles. They cannot edit them.
-- * Nobody can insert or delete profiles through the API.
-- =============================================================================

-- ---- Role type ----------------------------------------------------------------
create type public.app_role as enum ('merchant', 'admin');

-- ---- Pure helpers (no table access) ---------------------------------------------
-- Same rules as assets/js/lib/format.js normalizeNigerianPhone(). Returns
-- +234XXXXXXXXXX or NULL when the input is not a valid Nigerian mobile number.
create or replace function private.normalize_ng_phone(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text;
begin
  if raw is null then
    return null;
  end if;
  d := regexp_replace(raw, '[[:space:]().-]', '', 'g');
  if left(d, 1) = '+' then
    d := substr(d, 2);
  end if;
  if d !~ '^[0-9]+$' then
    return null;
  end if;
  if d ~ '^234[0-9]{10}$' then
    null; -- already international
  elsif d ~ '^0[0-9]{10}$' then
    d := '234' || substr(d, 2);
  elsif d ~ '^[789][0-9]{9}$' then
    d := '234' || d;
  else
    return null;
  end if;
  if d ~ '^234[789][01][0-9]{8}$' then
    return '+' || d;
  end if;
  return null;
end;
$$;

-- Trim, drop control characters, and return NULL unless 2 to 80 characters remain.
create or replace function private.clean_full_name(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(s.n) between 2 and 80 then s.n else null end
  from (select btrim(regexp_replace(coalesce(raw, ''), '[[:cntrl:]]', '', 'g')) as n) as s;
$$;

revoke all on function private.normalize_ng_phone(text) from public;
revoke all on function private.clean_full_name(text) from public;

-- ---- profiles ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'merchant',
  full_name  text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_chk
    check (full_name is null or (char_length(full_name) between 2 and 80 and full_name !~ '[[:cntrl:]]')),
  constraint profiles_phone_chk
    check (phone is null or phone ~ '^\+234[789][01][0-9]{8}$')
);
alter table public.profiles enable row level security;
comment on table public.profiles is 'One row per account. Private: owner and admins only.';

-- ---- Admin check (used by RLS policies and, later, admin functions) -------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public;

-- RLS policies call private.is_admin(), so the authenticated role needs to be able
-- to resolve the private schema. It still cannot create objects there, and holds no
-- table privileges there. Only reviewed functions are granted EXECUTE (tests check this).
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

-- The profiles trigger runs with the caller's privileges and calls these two PURE helpers
-- (no table access, no side effects), so the authenticated role must be able to execute them.
grant execute on function private.normalize_ng_phone(text) to authenticated;
grant execute on function private.clean_full_name(text) to authenticated;

-- ---- Guard and sanitise every write -------------------------------------------------------
create or replace function private.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cleaned text;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.created_at is distinct from old.created_at then
      -- API roles never get here (column grants stop them first). This is the second lock.
      if current_user not in ('postgres', 'supabase_admin') then
        raise exception 'Account identity and role cannot be changed.' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.full_name is not null then
    cleaned := private.clean_full_name(new.full_name);
    if cleaned is null then
      raise exception 'Enter your full name (2 to 80 characters).' using errcode = '22023';
    end if;
    new.full_name := cleaned;
  end if;

  if new.phone is not null then
    cleaned := private.normalize_ng_phone(new.phone);
    if cleaned is null then
      raise exception 'Enter a valid Nigerian mobile number.' using errcode = '22023';
    end if;
    new.phone := cleaned;
  end if;

  return new;
end;
$$;
revoke all on function private.profiles_before_write() from public;

create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function private.profiles_before_write();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---- Create the profile when an account is created ----------------------------------------
-- SECURITY DEFINER so it works whatever role Supabase Auth uses. Invalid optional
-- values become NULL instead of blocking signup. The role is hard-coded.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    'merchant',
    private.clean_full_name(new.raw_user_meta_data ->> 'full_name'),
    private.normalize_ng_phone(new.raw_user_meta_data ->> 'phone')
  );
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Supabase Auth runs the trigger. Make that explicit where the role exists.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.handle_new_user() to supabase_auth_admin;
  end if;
end;
$$;

-- Accounts created before this migration (for example test users) get a profile too.
insert into public.profiles (id, role, full_name, phone)
select u.id, 'merchant',
       private.clean_full_name(u.raw_user_meta_data ->> 'full_name'),
       private.normalize_ng_phone(u.raw_user_meta_data ->> 'phone')
from auth.users u
on conflict (id) do nothing;

-- ---- Privileges: explicit and minimal -----------------------------------------------------------
-- anon: nothing. authenticated: read rows (filtered by RLS) and update TWO columns.
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ---- Row Level Security policies ----------------------------------------------------------------
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin
  on public.profiles for select to authenticated
  using ((select private.is_admin()));

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
