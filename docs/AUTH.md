# Authentication and profiles (Phase 2)

## How it works
- **Accounts:** Supabase Auth with email and password. Email confirmation is required.
- **Profiles:** one row per account in `public.profiles` (role, full name, Nigerian mobile). A database trigger creates it at signup with the role **always `merchant`**. Role data in the signup request is ignored.
- **Browser client:** `assets/js/core/supabase-client.js` is a small zero-dependency client for Supabase Auth and PostgREST, using only the public anon key. All access goes through it, so `@supabase/supabase-js` can replace it later without changing pages.
- **Sessions:** stored in the browser (`localStorage`, in memory if unavailable) and refreshed automatically. Every merchant page has a strict Content-Security-Policy (no inline scripts or styles) to limit cross-site scripting risk.
- **Email links:** confirmation and password-reset links return to `merchant/confirm.html` and `merchant/reset-password.html` with tokens in the URL fragment. The pages read them, create the session, and remove them from the address bar immediately.

## Pages (`/merchant/`)
`register`, `login`, `forgot-password`, `reset-password`, `confirm`, `dashboard` (shell), `settings` (name, phone, password). Dashboard and settings require a signed-in merchant. All pages are `noindex`.

## What the database enforces
| Who | Can do |
|---|---|
| Anonymous | Nothing on `profiles` |
| Merchant | Read own profile. Update own `full_name` and `phone` only. Cannot insert, delete, or change `id`, `role`, `created_at` |
| Admin | Read all profiles. Cannot edit or delete through the API |
| Database owner (SQL editor) | Can change roles. This is the only way to create an admin |

Phone numbers are normalised to `+234XXXXXXXXXX` and names trimmed in the database, whatever the browser sent.

## Supabase dashboard settings to check (development project, then production later)
1. **Authentication > URL Configuration:** Site URL `https://ahmadcrt.github.io/avora-business/`. Redirect URLs: `https://ahmadcrt.github.io/avora-business/merchant/confirm.html` and `https://ahmadcrt.github.io/avora-business/merchant/reset-password.html` (or `https://ahmadcrt.github.io/avora-business/**`).
2. **Authentication > Providers > Email:** enable email provider, **Confirm email ON**, minimum password length **8**.
3. **Authentication > Rate Limits:** keep the defaults.
4. **Email delivery:** the built-in Supabase email sender is for testing only. It is capped at a very low number of emails per hour (sources differ, as low as 2 per hour, and it can change) and delivers only to members of your Supabase team. To test sign-up, use your own team email address sparingly, or create test users in **Authentication > Users > Add user** (tick auto confirm). Custom SMTP is required before real merchant onboarding (approved decision).

## Creating an admin (manual, by you)
In the Supabase SQL editor, after the person has signed up and confirmed their email:
```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'person@example.com');
```
The SQL editor runs as the database owner, which is the only role allowed to change a role. Turn on two-factor authentication for admin accounts when the admin area is built (Phase 7).

## Known limits
- The email-link flow uses Supabase's default (implicit) token delivery in the URL fragment. PKCE is a possible later hardening.
- Account deletion and email change are not built yet.
- No CAPTCHA. Supabase's own auth rate limits apply. Add Turnstile if sign-up abuse appears.
