# Phase 1 report: project foundation

Date: 2026-11-04. Status: **delivered for review. Not yet committed to GitHub** (see "Actions required").

## Completed
- Project structure, README and documentation (`docs/`): architecture, security model, development guide, approved decisions.
- Approved logo assets: all five SVGs in `logos/`.
- Brand tokens (`assets/css/tokens.css`): the five approved colours with exact HEX values, Sora and Inter, type scale, spacing, radius, layout.
- Foundation CSS: base styles (reset, focus ring, reduced motion, skip link) and components (buttons, form fields, cards, badges, alerts, header and footer).
- Pages: placeholder homepage, 404 page, internal `noindex` style guide.
- Helpers (`assets/js/`): public config loader that respects the GitHub Pages base path, safe text and URL helpers, DOM builder that never uses `innerHTML`, Naira formatting, Nigerian mobile number normalisation.
- Zero-dependency build (`scripts/build.mjs`), local preview server, repository secret scanner.
- Supabase: `config.toml`, empty `seed.sql`, baseline security migration, pgTAP security tests (17 assertions).
- GitHub Actions: `ci.yml` (tests plus a temporary Supabase stack) and `deploy.yml` (GitHub Pages). No GitHub secrets used.
- `.gitignore`, `.gitattributes`, `.editorconfig`, `.env.example`, Dependabot for Actions versions.

## Tests actually run
`npm test` in this environment: **26 of 26 passed.** They cover: required files; logo SVG cleanliness; exact brand colours; WCAG AA contrast for 13 colour pairings; relative paths and asset existence; noindex; CSS url() targets; no runtime dependencies; workflow rules (permissions, no secrets other than `GITHUB_TOKEN`); migration lint (naming, RLS on every table, no broad grants, `SECURITY DEFINER` rules, baseline content); build injection and refusal of service-role keys, secret keys, bad URLs and bad base paths; secret scanner behaviour; helper functions.

Extra checks run by hand:
- Deliberately changing a brand colour made the palette test fail, and adding a `.env` file made the secret test fail. Both were reverted.
- `.gitignore` verified with Git: `.env`, `*.pem` and `dist/` are not tracked.
- Built site served locally: homepage, style guide, SVG, CSS and `build-info.json` returned 200, and an unknown path returned the 404 page.

Bugs found and fixed during testing: Naira amounts such as 2500.5 now show two decimals; one comment in `config.js` tripped the secret scanner and was reworded.

## NOT verified (could not be run here)
This environment has no PostgreSQL, Docker, Supabase CLI, browser or internet access. So:
1. **The migration and the 17 pgTAP assertions have never been executed.** They are reviewed and statically linted only. The first CI run is the real test. Likely first-run surprises: the `auth.users` privilege assertions and `supabase/config.toml` (written by hand).
2. **`ci.yml` and `deploy.yml` have never run.** Action versions (`setup-cli@v1`, `setup-node@v4`, `deploy-pages@v4` and so on) are unverified against current releases.
3. **No visual check.** The pages and CSS were not rendered in a browser. Colours and contrast are tested numerically, but layout on mobile and desktop is unseen.
4. **Fonts are missing.** Sora and Inter files are not in the repo, so the fallback system font shows until you add them.
5. **No Supabase JavaScript client yet.** It will be added (vendored, pinned) in Phase 2.
6. The Supabase project URL and key are not configured, so the site cannot talk to your dev project yet.

## Permissions review (baseline migration)
- API roles can use the `public` schema but cannot create objects in it. They have no access to the `private` schema.
- Existing grants on tables, sequences and functions in `public` are revoked from `anon` and `authenticated`. Default privileges for new tables, sequences and functions are revoked, and new functions are not executable by `PUBLIC`.
- The only object exposed is `public.api_health()`, which returns `ok`, a service name and the time.
- Known limit: the default-privilege changes cover objects created by the `postgres` role (SQL editor and migrations). Objects created by other Supabase-internal roles are not covered. The tests check an allow-list of tables and functions, so any drift would be caught in CI.

## Credentials review
- The scanner and tests found no secrets. The repository holds no keys, passwords or tokens. The only public values are placeholders.
- The build refuses service-role JWTs and `sb_secret_` keys. Workflows use no GitHub secrets, and a test enforces that.

## Actions required from you
1. Commit these files to your repository (I have no access to GitHub and have not touched it). Use a branch and pull request so CI runs before merging to `main`.
2. Create the Supabase development project, apply the migration, and add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub repository **variables** (steps in `docs/DEVELOPMENT.md`). Use only the public anon/publishable key.
3. Settings > Pages > Source: **GitHub Actions**. Enable secret scanning and push protection.
4. Add the Sora and Inter font files (see `docs/DEVELOPMENT.md`).
5. Watch the first CI run and send me any failures. I will fix them before Phase 2.
6. Choose a licence when you want one.

## Before launch (reminders)
Remove `noindex` and the blocking `robots.txt`; buy the domain before the pilot; custom SMTP; privacy policy and enquiry consent notice.
