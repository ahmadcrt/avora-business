# Phase 2 report: merchant authentication and profiles

Date: 2026-11-05. Status: **delivered for review. Not committed to GitHub.** Phase 3 has not been started.

## Completed
**Database** (`supabase/migrations/20261104130000_profiles_and_auth.sql`)
- `public.app_role` (`merchant`, `admin`) and `public.profiles` (id linked to the account, role, full name, Nigerian mobile, timestamps), RLS enabled.
- Signup trigger creates the profile with the role hard-coded to `merchant`. Invalid optional name or phone become empty instead of blocking signup. Existing accounts get a profile through a one-off backfill.
- Policies: merchants read their own row and update their own row. Admins read all rows through `private.is_admin()`. Nobody can insert or delete through the API.
- Privileges: `anon` none. `authenticated` read plus update on `full_name` and `phone` only (column-level). A second lock (trigger) blocks changes to `id`, `role` and `created_at` unless the caller is the database owner.
- Database-side normalisation and validation of Nigerian mobile numbers and names.

**Frontend** (`/merchant/`): register, log in, forgot password, reset password, email-confirmed page, dashboard shell, account settings (name, phone, password change, log out). Zero-dependency Supabase client, auth helpers, page guard, validators. Strict CSP on every page, no inline code, no `innerHTML`, allow-listed redirects, generic error messages.

**Not built, by design:** business onboarding, listings, admin pages, public links to the merchant area, email notifications.

## Phase 1 files I had to change (and why)
- `scripts/build.mjs`: ship the `merchant/` folder.
- `scripts/check-secrets.mjs`: also scan `merchant/` pages for service-role references.
- `supabase/tests/database/001_baseline_security.test.sql`: allow-list `profiles`, and one assertion changed on purpose (authenticated may now use, but not create in, the `private` schema, so RLS policies can call `private.is_admin()`).
- `supabase/config.toml`: extra local redirect URL.
- `README.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`: Phase 2 additions only.
No brand, logo, CSS-token or other foundation file was changed. New CSS is `assets/css/auth.css` only.

## Tests actually run here
`npm test`: **58 of 58 pass** (Phase 1's 26 plus 32 new). New coverage: client behaviour with a fake server (sign-in, sign-up payload, refresh, concurrent refresh, rejected refresh, network failure, sign-out, query encoding and injection attempts, update, RLS no-match), sign-in helpers, validators, page guard (no session, wrong role, missing profile, expired token), page safety (CSP, inline code, labels, autocomplete, relative paths, dangerous APIs, secrets, passwords never stored or logged), build output, migration content checks, and pgTAP plan counts.

**Deliberate-breakage checks** (each made tests fail, then was reverted): trusting a role from signup data; making `role` updatable; disabling RLS; allowing unsafe URLs; weakening the CSP; redirecting to a raw `next` value (this one was NOT caught at first, so I added a test); introducing `innerHTML`.

**A real bug found by review** (not by a test run): the profiles trigger runs as the caller and calls two helper functions the caller could not execute, which would have broken every profile update. Fixed in the migration, and a regression test and the privilege-audit test now cover it. This shows why the database tests below must be run.

## NOT verified (could not be run here)
1. **The migration and the 45 new pgTAP assertions have never been executed** (no PostgreSQL, Docker or Supabase CLI here). They are reviewed and statically checked only. Your CI run is the real test. Most likely surprises: inserting test users directly into `auth.users`, the way test JWT claims are set, and whether `supabase_auth_admin` needs the extra grants I added.
2. **No end-to-end test against real Supabase Auth** (sign-up email, confirmation link, reset link). The client was tested against a fake server written from Supabase's documented behaviour. Real responses can differ in detail.
3. **No browser run.** Pages and scripts were never executed in a browser. The DOM code (forms, guard wiring) is only checked statically.
4. **No visual check** of the new pages.
5. **Email delivery** depends on your Supabase settings (see `docs/AUTH.md`). The built-in sender is tightly limited.
6. Fonts and the CI `config.toml` caveats from Phase 1 still apply.

## Actions required from you
1. Copy the changed files into your repository (use `avora-business-phase2-changes.zip`; paths are preserved). If you edited any Phase 1 file to get CI green, merge by hand instead of overwriting, especially `build.mjs`, `check-secrets.mjs`, `config.toml` and the 001 test.
2. Commit on a branch, open a pull request, and wait for CI. **The database job is the first real test of Phase 2.** Send me any failure text.
3. After CI is green, apply `20261104130000_profiles_and_auth.sql` to your Supabase **dev** project in the SQL editor.
4. In Supabase: set the Site URL and Redirect URLs, confirm "Confirm email" is on and minimum password length is 8 (`docs/AUTH.md`).
5. Test by hand on the deployed site, at `/merchant/login.html`: register (use your own team email, sparingly, because of the email limit), confirm, log in, edit settings, change password, forgot password, log out. Also try opening `/merchant/dashboard.html` while logged out.
6. Create your first admin with the SQL in `docs/AUTH.md` when you want one.
7. Decide whether to keep the custom client or have me vendor `supabase-js` (see `docs/DECISIONS.md`).

## Before launch (unchanged)
Custom SMTP, privacy policy and consent notice, domain, remove `noindex`.
