import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, scanRepo } from '../scripts/check-secrets.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role, ref: 'abcdefghijklmnopqrst' })}.${'x'.repeat(30)}`;

test('repository contains no secrets', async () => {
  assert.deepEqual(await scanRepo(), []);
});

test('scanner flags a service-role JWT but allows the public anon JWT', () => {
  assert.equal(scanText('docs/a.md', `key=${jwt('service_role')}`).length, 1);
  assert.deepEqual(scanText('docs/a.md', `key=${jwt('anon')}`), []);
});

test('scanner flags other credential shapes', () => {
  const cases = [
    `sb_secret_${'a'.repeat(24)}`,
    '-----BEGIN ' + 'PRIVATE KEY-----',
    `ghp_${'A'.repeat(36)}`,
    'postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres',
  ];
  for (const text of cases) assert.ok(scanText('x.txt', text).length >= 1, text.slice(0, 20));
  assert.deepEqual(scanText('x.txt', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'), []);
});

test('scanner flags "service role" mentions in frontend code only', () => {
  assert.equal(scanText('assets/js/x.js', 'const k = SERVICE_ROLE_KEY').length, 1);
  assert.equal(scanText('index.html', 'service_role').length, 1);
  assert.deepEqual(scanText('docs/SECURITY.md', 'Never expose the service_role key'), []);
});
