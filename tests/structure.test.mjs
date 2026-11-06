import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join, dirname, normalize } from 'node:path';
import { root, read, listFiles, contrast } from './helpers.mjs';

const exists = (rel) => access(join(root, rel)).then(() => true, () => false);

test('required project files exist', async () => {
  const required = [
    'index.html', '404.html', 'styleguide.html', 'robots.txt', 'README.md', '.gitignore', '.env.example',
    'package.json', 'assets/css/tokens.css', 'assets/css/base.css', 'assets/css/components.css',
    'assets/css/fonts.css', 'assets/js/core/config.js', 'assets/js/lib/safe.js', 'assets/js/lib/format.js',
    'scripts/build.mjs', 'scripts/check-secrets.mjs', 'supabase/config.toml', 'supabase/seed.sql',
    'supabase/tests/database/001_baseline_security.test.sql', '.github/workflows/ci.yml',
    '.github/workflows/deploy.yml', 'docs/ARCHITECTURE.md', 'docs/SECURITY.md', 'docs/DEVELOPMENT.md',
    'docs/DECISIONS.md', 'docs/PHASE-1-REPORT.md',
    'logos/avora-logo-primary-light-bg.svg', 'logos/avora-logo-dark-bg.svg', 'logos/avora-icon-light-bg.svg',
    'logos/avora-icon-dark-bg.svg', 'logos/avora-app-icon.svg',
  ];
  const missing = [];
  for (const f of required) if (!(await exists(f))) missing.push(f);
  assert.deepEqual(missing, []);
});

test('logo SVGs are clean: valid root, viewBox, no scripts or external references', async () => {
  for (const f of await listFiles('logos', (p) => p.endsWith('.svg'))) {
    const svg = await read(f);
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, f);
    assert.match(svg, /viewBox="/, f);
    assert.doesNotMatch(svg, /<script|onload=|href="http|xlink:href|<image|<foreignObject|<text/i, f);
  }
});

test('brand tokens match the approved palette exactly', async () => {
  const css = await read('assets/css/tokens.css');
  const approved = { ink: '#0F1D2E', amber: '#F0A23B', teal: '#0E7C6B', mist: '#F5F3EE', slate: '#5E6B7A' };
  for (const [name, hex] of Object.entries(approved)) {
    assert.match(css, new RegExp(`--avora-${name}:\\s*${hex};`, 'i'), `${name} must be ${hex}`);
  }
  assert.match(css, /--font-heading:\s*"Sora"/);
  assert.match(css, /--font-body:\s*"Inter"/);
});

test('approved colour pairings meet WCAG AA (4.5:1 for text)', () => {
  const c = { ink: '#0F1D2E', amber: '#F0A23B', teal: '#0E7C6B', mist: '#F5F3EE', slate: '#5E6B7A', white: '#FFFFFF', danger: '#B3261E' };
  const pairs = [
    ['ink on mist', c.ink, c.mist], ['slate on mist', c.slate, c.mist], ['teal on mist', c.teal, c.mist],
    ['ink on white', c.ink, c.white], ['slate on white', c.slate, c.white], ['teal on white', c.teal, c.white],
    ['mist on ink (primary button)', c.mist, c.ink], ['ink on amber (accent button)', c.ink, c.amber],
    ['amber on ink', c.amber, c.ink], ['white on teal', c.white, c.teal], ['white on slate', c.white, c.slate],
    ['danger on white', c.danger, c.white], ['danger on mist', c.danger, c.mist],
  ];
  const failures = pairs.filter(([, fg, bg]) => contrast(fg, bg) < 4.5)
    .map(([n, fg, bg]) => `${n}: ${contrast(fg, bg).toFixed(2)}`);
  assert.deepEqual(failures, []);
});

test('HTML pages use relative paths (GitHub Pages) and every local asset exists', async () => {
  for (const page of ['index.html', 'styleguide.html', '404.html']) {
    const html = await read(page);
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
      if (page === '404.html') { assert.ok(ref.startsWith('__BASE_PATH__'), `${page}: ${ref} must use __BASE_PATH__`); continue; }
      assert.ok(!ref.startsWith('/'), `${page}: absolute path "${ref}" breaks the /avora-business/ prefix`);
      if (ref === './') continue;
      assert.ok(await exists(normalize(join(dirname(page), ref))), `${page}: missing ${ref}`);
    }
  }
});

test('index.html is noindex during development', async () => {
  assert.match(await read('index.html'), /<meta name="robots" content="noindex/);
  assert.match(await read('robots.txt'), /Disallow: \//);
});

test('CSS url() references resolve to real files', async () => {
  for (const f of await listFiles('assets/css', (p) => p.endsWith('.css'))) {
    const css = (await read(f)).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (/^(data:|https?:)/.test(m[1])) continue;
      assert.ok(await exists(normalize(join(dirname(f), m[1]))), `${f}: missing ${m[1]}`);
    }
  }
});

test('no external runtime dependencies: package.json has none', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});

test('workflows: least privilege, no secrets other than GITHUB_TOKEN, pinned by major version', async () => {
  for (const f of await listFiles('.github/workflows', (p) => p.endsWith('.yml'))) {
    const yml = await read(f);
    assert.match(yml, /^permissions:/m, `${f} must declare top-level permissions`);
    for (const m of yml.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)/g)) assert.equal(m[1], 'GITHUB_TOKEN', `${f} uses secrets.${m[1]}`);
    for (const m of yml.matchAll(/uses:\s*([^\s@]+)@([^\s]+)/g)) assert.ok(m[2], `${f}: ${m[1]} must be versioned`);
    assert.doesNotMatch(yml, /pull_request_target/, `${f} must not use pull_request_target`);
  }
});
