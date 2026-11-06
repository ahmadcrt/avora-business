# Architecture (approved, v1.0)

## Overview
Static front end on GitHub Pages plus Supabase for data, auth and storage. Public business pages are generated as static HTML at build time for SEO and link previews. Everything interactive is client-side JavaScript talking to Supabase with the public anon key, protected by Row Level Security.

## Rendering
- **Static, generated (Phase 8):** homepage, `/business/{slug}/`, category and location pages, sitemap.
- **Client-rendered:** search (`search.html?...`, noindex), merchant dashboard, admin dashboard.
- A rebuild runs when public data changes: a database counter (`site_state.version`) is bumped by triggers, a scheduled GitHub Action compares it with the deployed `build-info.json`, and a faster webhook path is added before the pilot.

## Folder map
See `README.md`. Planned additions by phase: `merchant/` and `admin/` pages, `assets/js/{public,merchant,admin}/`, `templates/`, `scripts/build-static.mjs`, `supabase/functions/`.

## Data model (planned, from Phase 2 onwards)
`profiles`, `categories`, `states`, `cities`, `businesses` (status: draft, pending, approved, rejected, suspended), `business_change_requests`, `business_images`, `listings`, `enquiries`, `enquiry_rate_events`, `reports`, `audit_log`, `site_state`.

## Access model
- **Anonymous:** column-level read of approved public data only. Enquiries only through `submit_enquiry()`.
- **Merchant:** only rows tied to the business they own. Cannot change status, owner, slug or approval fields. Name and category changes on an approved business go through a change request.
- **Admin:** privileged functions that check `is_admin()` inside the database and write an audit log.

## Deployment
GitHub Actions builds into `dist/` and publishes to GitHub Pages at `/avora-business/`. All paths respect the base path (`AVORA_BASE_PATH`), so a custom domain later needs no code change.

## Phases
1. Foundation (this phase). 2. Auth and profiles. 3. Business onboarding, media, change requests. 4. Listings. 5. Public pages and enquiries. 6. Enquiry inbox. 7. Admin. 8. Static generator, SEO, rebuild pipeline. 9. Pilot readiness (domain, SMTP, notifications, legal pages, plan decision).
