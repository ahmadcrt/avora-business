# Approved decisions

## Architecture
1. Build-time static generation using GitHub Actions (from Phase 8).
2. GitHub Pages for initial hosting. Custom domain bought **before the pilot and real merchant onboarding**.
3. Supabase free plan for development. Paid-plan evaluation before the pilot.
4. Business URLs: `/business/{slug}/`. Slugs never change after first approval, even if the name changes.
5. One business per merchant for the MVP.
6. Ordinary profile edits publish without reapproval. Business name and category changes need admin review.
7. Email and password authentication.
8. Dashboard enquiry inbox first. Email notifications before the pilot.
9. Custom SMTP before real merchant onboarding.
10. Zero-dependency Node.js build script.
11. English language and Nigerian Naira.
12. Privacy policy and enquiry consent notice before launch.

## Development environment
13. No Docker required. Use the Supabase development project. Automated tests run in GitHub Actions on a temporary local stack inside the runner. Keep everything compatible with future local Docker development.

## Requirements that apply to every phase
- Anonymous enquiries: strong validation, spam protection, rate limiting.
- Admin privileges are enforced in the database, not the frontend.
- Merchants never see another merchant's private data.
- Changes to approved profiles trigger a static rebuild.
- Migrations and RLS tests accompany every database change.
- No private keys or service-role credentials in frontend code or GitHub.
- No paid service is assumed to have been purchased.

## Decisions made during Phase 1 (review these)
- **Fonts:** Sora and Inter are declared, but the font files are not in the repo yet (no internet access when building). Fallback stack is used until they are added.
- **Supabase client library:** not added yet. In Phase 2 it will be vendored (a pinned copy in the repo) rather than loaded from a CDN.
- **Dev site is hidden from search engines:** `noindex` meta tag and a blocking `robots.txt`. Both must be changed at launch.
- **CI does not use any GitHub secrets.** Tests run on a temporary database inside the runner. Deployment injects public values from repository *variables*.
- **Functional colours:** `#B3261E` (danger) and white were added for UI states. They are not brand colours and the brand palette is unchanged.
