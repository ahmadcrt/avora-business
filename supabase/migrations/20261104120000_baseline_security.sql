-- =============================================================================
-- AVORA Business: baseline security (Phase 1)
--
-- Principle: deny by default. Supabase grants broad default privileges on new
-- objects in the public schema to the anon and authenticated roles. This
-- migration removes them, so every future table and function must be granted
-- explicitly, and every table must have Row Level Security enabled.
--
-- Rules for all later migrations:
--   1. Every new table in public: ENABLE ROW LEVEL SECURITY, then explicit GRANTs
--      (column-level where private columns exist) and explicit policies.
--   2. SECURITY DEFINER functions: SET search_path = '' and fully qualified names.
--   3. New functions are not executable by anyone until explicitly granted.
--   4. Internal helpers live in the private schema (not exposed by the API).
-- =============================================================================

-- ---- Schemas ----------------------------------------------------------------
create schema if not exists private;
comment on schema private is
  'Internal helper functions. Not exposed through the API. No role other than the owner can use it until explicitly granted.';
revoke all on schema private from public, anon, authenticated;

-- The public schema: usable (so the API can see granted objects) but not writable by API roles.
revoke all on schema public from public;
revoke all on schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- ---- Remove existing broad grants (idempotent; no-op on a fresh project) ----
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ---- Secure defaults for objects created from now on by this role ------------
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that.
alter default privileges for role postgres revoke execute on functions from public;

-- ---- Internal helper: keep updated_at current -------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;

-- ---- Public health check (safe: returns no data) ----------------------------
-- Lets the frontend, CI and uptime checks confirm the API is reachable with the
-- anon key. Returns static information only.
create or replace function public.api_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'service', 'avora-business', 'time', now());
$$;
revoke all on function public.api_health() from public;
grant execute on function public.api_health() to anon, authenticated;
