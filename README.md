# AVORA Business

AVORA Business is the first product of **AVORA Technologies**. It helps businesses in Nigeria establish an online presence, show their products and services, be found by customers and manage enquiries.

**Status: Phase 2 (merchant authentication and profiles).** See `docs/PHASE-1-REPORT.md`, `docs/PHASE-2-REPORT.md` and `docs/AUTH.md`.

## Stack
HTML5, CSS3 and vanilla JavaScript (ES modules, no bundler), Supabase (PostgreSQL, Auth, Storage), GitHub Actions, GitHub Pages. No runtime dependencies.

## Quick start
Requires Node.js 20 or newer. No Docker needed.

```bash
npm test                                   # unit, structure, migration lint, secret scan
AVORA_BASE_PATH=/ npm run build            # build to dist/
npm run dev                                # preview at http://127.0.0.1:8080/
```

Full setup (Supabase dev project, GitHub Pages, fonts): `docs/DEVELOPMENT.md`.

## Repository map
| Path | Purpose |
|---|---|
| `index.html`, `404.html`, `styleguide.html` | Foundation pages (the style guide is internal and `noindex`) |
| `assets/css/` | Brand tokens, base styles and components |
| `merchant/` | Merchant pages: register, log in, password reset, dashboard shell, settings |
| `assets/js/core/` | Public config, minimal Supabase client, auth helpers, page guard |
| `assets/js/merchant/` | One script per merchant page |
| `assets/js/lib/` | Pure helpers: safe text and URLs, Naira and Nigerian phone formatting |
| `logos/` | Approved AVORA logo SVGs (5 variations) |
| `scripts/` | Zero-dependency build, dev server and secret scan |
| `supabase/migrations/` | Forward-only SQL migrations |
| `supabase/tests/database/` | pgTAP security tests |
| `.github/workflows/` | `ci.yml` (tests) and `deploy.yml` (GitHub Pages) |
| `docs/` | Architecture, security model, development guide, decisions, phase reports |
| `tests/` | Node test suite (`node --test`) |

## Security in one paragraph
Only public values (Supabase project URL and the public anon key) ever reach the frontend or this repository. Service-role keys, database passwords and other secrets must never be committed or placed in GitHub. The database denies access by default and Row Level Security protects every table. Details in `docs/SECURITY.md`.

## Brand
AVORA Technologies Brand Identity v1.0: Midnight Ink `#0F1D2E`, Signal Amber `#F0A23B`, Avora Teal `#0E7C6B`, Mist `#F5F3EE`, Slate `#5E6B7A`. Headings in Sora, body and UI in Inter.

## Licence
No licence has been chosen. Until one is added, all rights are reserved by the owner.
