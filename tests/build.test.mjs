import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { root } from './helpers.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256' })}.${b64({ role })}.${'s'.repeat(30)}`;

function build(env) {
  return mkdtemp(join(tmpdir(), 'avora-')).then((out) => ({
    out,
    run: spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
      env: { PATH: process.env.PATH, AVORA_OUT_DIR: out, ...env }, encoding: 'utf8',
    }),
  }));
}

test('build injects public config and base path, leaving no placeholders', async () => {
  const { out, run } = await build({
    AVORA_BASE_PATH: '/avora-business/', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ANON_KEY: jwt('anon'),
  });
  assert.equal(run.status, 0, run.stderr);
  const cfg = await readFile(join(out, 'assets/js/core/config.js'), 'utf8');
  assert.match(cfg, /abcdefghijklmnopqrst\.supabase\.co/);
  const notFound = await readFile(join(out, '404.html'), 'utf8');
  assert.match(notFound, /href="\/avora-business\/assets\/css\/base\.css"/);
  for (const f of ['index.html', '404.html', 'assets/js/core/config.js', 'build-info.json']) {
    const text = await readFile(join(out, f), 'utf8');
    assert.doesNotMatch(text.replace(/const raw[\s\S]*?};/, ''), /__[A-Z_]+__/, `${f} still has placeholders`);
  }
  await access(join(out, 'logos/avora-logo-primary-light-bg.svg'));
});

test('build works without Supabase configured (development default)', async () => {
  const { run } = await build({});
  assert.equal(run.status, 0, run.stderr);
});

test('build refuses service-role JWTs, secret keys, bad URLs and bad base paths', async () => {
  const cases = [
    { SUPABASE_ANON_KEY: jwt('service_role') },
    { SUPABASE_ANON_KEY: `sb_secret_${'a'.repeat(30)}` },
    { SUPABASE_URL: 'https://evil.example.com' },
    { AVORA_BASE_PATH: 'avora-business' },
  ];
  for (const env of cases) {
    const { run } = await build(env);
    assert.equal(run.status, 1, JSON.stringify(env).slice(0, 40));
    assert.match(run.stderr, /Build refused/);
  }
});
