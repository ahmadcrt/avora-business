import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, normalize } from 'node:path';
import { root, read, listFiles } from './helpers.mjs';

const pages = ['login', 'register', 'forgot-password', 'reset-password', 'confirm', 'dashboard', 'settings'].map((p) => `merchant/${p}.html`);
const exists = (rel) => access(join(root, rel)).then(() => true, () => false);

test('merchant pages exist and are noindex with a strict CSP', async () => {
  for (const page of [...pages, 'merchant/index.html']) {
    assert.ok(await exists(page), `${page} missing`);
    const html = await read(page);
    assert.match(html, /<meta name="robots" content="noindex/, page);
  }
  for (const page of pages) {
    const html = await read(page);
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    assert.ok(csp, `${page}: CSP meta missing`);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/, `${page}: weak CSP`);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self' __SUPABASE_URL__/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
  }
});

test('merchant pages have no inline scripts, inline styles or event-handler attributes', async () => {
  for (const page of pages) {
    const html = await read(page);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1, `${page}: expected exactly one script`);
    assert.match(scripts[0][1], /type="module"/);
    assert.match(scripts[0][1], /src="\.\.\/assets\/js\/merchant\/[a-z-]+\.js"/);
    assert.equal(scripts[0][2].trim(), '', `${page}: inline script content`);
    assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=|javascript:/i, `${page}: inline style or handler`);
  }
});

test('merchant pages use relative paths and every referenced file exists', async () => {
  for (const page of pages) {
    const html = await read(page);
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^(https?:|#|mailto:)/.test(ref)) continue;
      assert.ok(!ref.startsWith('/'), `${page}: absolute path ${ref}`);
      assert.ok(await exists(normalize(join(dirname(page), ref.split('#')[0].split('?')[0]))), `${page}: missing ${ref}`);
    }
  }
});

test('every form control has a label, correct autocomplete and an error slot', async () => {
  for (const page of pages) {
    const html = await read(page);
    for (const m of html.matchAll(/<input\b([^>]*)>/g)) {
      const attrs = m[1];
      const id = attrs.match(/\bid="([^"]+)"/)?.[1];
      assert.ok(id, `${page}: input without id`);
      assert.match(html, new RegExp(`<label for="${id}">`), `${page}: no label for ${id}`);
      assert.match(html, new RegExp(`data-error-for="${id}"`), `${page}: no error slot for ${id}`);
      const type = attrs.match(/\btype="([^"]+)"/)?.[1];
      if (type === 'password') assert.match(attrs, /autocomplete="(current|new)-password"/, `${page}: ${id}`);
      if (type === 'email') assert.match(attrs, /autocomplete="email"/, `${page}: ${id}`);
    }
    assert.match(html, /<main id="main"/, page);
    assert.match(html, /class="skip-link"/, page);
  }
});

test('registration and login never send or accept a role from the browser', async () => {
  const register = await read('assets/js/merchant/register.js');
  assert.doesNotMatch(register, /role/i);
  assert.match(register, /data: \{ full_name:/);
  for (const html of await Promise.all(pages.map(read))) assert.doesNotMatch(html, /name="role"/);
});

test('auth JavaScript avoids dangerous APIs and never touches secrets', async () => {
  const files = [
    ...(await listFiles('assets/js/merchant', (p) => p.endsWith('.js'))),
    ...(await listFiles('assets/js/core', (p) => p.endsWith('.js'))),
    ...(await listFiles('assets/js/lib', (p) => p.endsWith('.js'))),
  ];
  for (const f of files) {
    const js = (await read(f)).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/, `${f}: dangerous API`);
    assert.doesNotMatch(js, /service[_-]?role|SERVICE_ROLE|sb_secret/i, `${f}: secret reference`);
    if (f !== 'assets/js/core/supabase.js') assert.doesNotMatch(js, /localStorage|sessionStorage/, `${f}: direct browser storage`);
    assert.doesNotMatch(js, /console\.(log|debug|info)\(/, `${f}: console logging`);
  }
});

test('passwords are never written to storage, URLs or logs', async () => {
  for (const f of await listFiles('assets/js/merchant', (p) => p.endsWith('.js'))) {
    const js = await read(f);
    assert.doesNotMatch(js, /(?:localStorage|sessionStorage|console\.\w+|location\.(?:href|search|hash)\s*=)[^;\n]*password/i, f);
  }
});

test('build ships the merchant pages, injects the Supabase URL into the CSP, leaves no placeholders', async () => {
  const out = await mkdtemp(join(tmpdir(), 'avora-auth-'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const key = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon' })}.${'s'.repeat(30)}`;
  const run = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
    env: { PATH: process.env.PATH, AVORA_OUT_DIR: out, AVORA_BASE_PATH: '/avora-business/', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ANON_KEY: key }, encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  for (const page of pages) {
    const html = await readFile(join(out, page), 'utf8');
    assert.match(html, /connect-src 'self' https:\/\/abcdefghijklmnopqrst\.supabase\.co;/, page);
    assert.doesNotMatch(html, /__[A-Z_]+__/, `${page}: placeholder left`);
  }
  await access(join(out, 'assets/js/merchant/login.js'));
  await access(join(out, 'assets/css/auth.css'));
});

test('login only redirects through safeNext (no open redirect)', async () => {
  const login = await read('assets/js/merchant/login.js');
  assert.match(login, /go\(safeNext\(params\.get\('next'\)\)\)/);
  for (const f of await listFiles('assets/js/merchant', (p) => p.endsWith('.js'))) {
    const js = await read(f);
    assert.doesNotMatch(js, /(?:location\.(?:href|replace|assign)|go)\(\s*params\.get\(/, `${f}: redirects to a raw query value`);
  }
});
