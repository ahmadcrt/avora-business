# Security model

## What may be public
The Supabase project URL and the public anon (or "publishable") key are designed to be public. They are safe **only because every table is protected by Row Level Security and explicit grants**. Because GitHub Pages on the free plan needs a public repository, assume all code and SQL policies are readable by anyone. Security must never rely on hidden URLs or hidden code.

## What must never be in the frontend, the repository or GitHub
- Supabase `service_role` key or `sb_secret_...` keys
- Database password or connection strings with passwords
- SMTP or email-provider API keys
- GitHub personal access tokens
- Private keys and `.env` files

Where they live instead: Supabase secrets (for Edge Functions) or your own machine's password manager.

## Safeguards in this repository
- `.gitignore` excludes `.env*` (except `.env.example`) and key files.
- `scripts/build.mjs` refuses to build if the injected key is a service-role JWT or a secret key.
- `scripts/check-secrets.mjs` scans the repository (also runs in CI and before every deploy).
- A test fails if any workflow uses a GitHub secret other than the automatic `GITHUB_TOKEN`.
- Recommended: enable **GitHub secret scanning and push protection** (free for public repositories).

## Database baseline (migration `20261104120000_baseline_security.sql`)
- Default privileges for `anon` and `authenticated` on new tables, sequences and functions are removed.
- New functions are not executable by `PUBLIC` by default.
- `private` schema holds internal helpers and is not usable by API roles.
- `public` schema is readable by API roles only for objects explicitly granted, and nobody but the owner can create objects in it.
- `public.api_health()` is the only function exposed, and returns no data.

## Rules for every future migration
1. New table: `enable row level security`, then explicit grants (column-level where needed), then explicit policies.
2. `SECURITY DEFINER` functions: `set search_path = ''`, fully qualified names, explicit `grant execute`.
3. No `using (true)` policies without a written reason.
4. Add the table or function to the allow-list in `supabase/tests/database/001_baseline_security.test.sql` only after review, and add tests for each role (anonymous, merchant A, merchant B, admin).

These rules are enforced by `tests/migrations.test.mjs` (static) and the pgTAP tests (runtime).

## Reporting a problem
Contact the project owner privately. Do not open a public issue for a security problem.

## Phase 2 additions
- `public.profiles`: RLS on, `anon` has no access, `authenticated` can read rows allowed by policy and update only `full_name` and `phone` (column-level grant). A trigger blocks changes to `id`, `role` and `created_at` unless the caller is the database owner.
- The signup trigger hard-codes the `merchant` role. Nothing the browser sends can create an admin.
- `private.is_admin()` is `SECURITY DEFINER` with an empty `search_path`, executable only by `authenticated`.
- Merchant pages: strict CSP, no inline code, no `innerHTML`, redirects only to an allow-list of pages, generic messages that never reveal whether an email has an account.
- Tests: 56 Node tests (client behaviour, guard, validation, page safety, build) and 45 pgTAP assertions for Phase 2 (anonymous, merchant A, merchant B, admin, escalation attempts, cascade, privilege audit).
