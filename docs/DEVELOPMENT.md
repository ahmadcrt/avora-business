# Development guide

## Requirements
Node.js 20+ (22 recommended) and Git. No Docker required.

## Commands
```bash
npm test                              # all Node tests (no dependencies to install)
npm run check:secrets                 # secret scan
AVORA_BASE_PATH=/ npm run build       # build to dist/ for local preview
npm run dev                           # serve dist/ at http://127.0.0.1:8080/
```
To preview with your Supabase dev project, copy `.env.example` to `.env`, fill in the **public** values, then export them in your shell (the build reads environment variables).

## One-time setup you must do
1. **Supabase development project:** create it in the Supabase dashboard (free plan). Note the Project URL and the anon/publishable key (Settings > API). Do **not** copy the service-role key anywhere in this repository.
2. **Apply the baseline migration:** in the dashboard SQL editor, run `supabase/migrations/20261104120000_baseline_security.sql`. (Later, when you are ready, the Supabase CLI can do this with `supabase link` and `supabase db push`.)
3. **GitHub repository variables:** Settings > Secrets and variables > Actions > **Variables** tab: add `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the public values.
4. **GitHub Pages:** Settings > Pages > Build and deployment > Source: **GitHub Actions**.
5. **GitHub security:** Settings > Code security: enable secret scanning and push protection.
6. **Fonts:** download Sora and Inter (open-source, SIL OFL, for example from Google Fonts), save variable woff2 files as `assets/fonts/Sora-Variable.woff2` and `assets/fonts/Inter-Variable.woff2`, and add the matching `url(...)` source lines in `assets/css/fonts.css`.

## Continuous integration
- `ci.yml` on every pull request and push to `main`: Node tests, secret scan, test build, then a throwaway Supabase stack inside the runner that applies all migrations and runs `supabase test db`.
- `deploy.yml` on push to `main`: runs tests, builds with `AVORA_BASE_PATH=/avora-business/`, publishes to GitHub Pages.
- No GitHub secrets are used. Production migrations are applied manually.

## Local Docker development (optional, later)
The project is compatible with it: install Docker and the Supabase CLI, then `supabase start` and `supabase test db`. Nothing in the project requires it today.

## Conventions
- Relative paths in HTML. Never start a path with `/` except via the build-time base path.
- Never use `innerHTML` with user content. Use `assets/js/lib/dom.js` (`el()`).
- Migrations are forward-only. Never edit one that has been applied.
