import test from 'node:test';
import assert from 'node:assert/strict';
import { read, listFiles } from './helpers.mjs';

const files = await listFiles('supabase/tests/database', (p) => p.endsWith('.test.sql'));

test('every pgTAP file declares a plan equal to its number of assertions and rolls back', async () => {
  assert.ok(files.length >= 2);
  for (const f of files) {
    const sql = await read(f);
    const planned = Number(sql.match(/select plan\((\d+)\)/)?.[1]);
    const asserts = (sql.match(/^select (?:ok|is|isnt|throws_ok|lives_ok|has_schema)\(/gm) || []).length;
    assert.equal(planned, asserts, `${f}: plan(${planned}) vs ${asserts} assertions`);
    assert.match(sql, /select \* from finish\(\);\s*rollback;/, `${f}: must finish and roll back`);
  }
});

test('profiles migration: RLS, minimal grants, guarded role, forced merchant role at signup', async () => {
  const sql = (await read('supabase/migrations/20261104130000_profiles_and_auth.sql')).replace(/--.*$/gm, '');
  assert.match(sql, /alter table public\.profiles enable row level security/i);
  assert.match(sql, /grant select on public\.profiles to authenticated/i);
  assert.match(sql, /grant update \(full_name, phone\) on public\.profiles to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*\b(insert|delete|all)\b[^;]*on public\.profiles/i);
  assert.doesNotMatch(sql, /to anon/i);
  assert.match(sql, /values\s*\(\s*new\.id,\s*'merchant'/i, 'signup trigger must hard-code the merchant role');
  assert.doesNotMatch(sql, /raw_user_meta_data\s*->>?\s*'role'/i, 'role must never be read from user metadata');
  assert.match(sql, /current_user not in \('postgres', 'supabase_admin'\)/);
  const policies = [...sql.matchAll(/create policy (\w+)\s+on public\.profiles for (\w+) to (\w+)/gi)].map((m) => m.slice(1, 4).join(' '));
  assert.deepEqual(policies.sort(), ['profiles_select_admin select authenticated', 'profiles_select_own select authenticated', 'profiles_update_own update authenticated']);
});

test('SQL and JS phone normalisation use the same accepted and rejected examples', async () => {
  const sql = await read('supabase/tests/database/002_profiles_and_auth.test.sql');
  const js = await read('tests/lib.test.mjs');
  for (const sample of ['08012345678', '8012345678', '2348012345678', '+234 801 234 5678', '+234-801-234-5678', '0901 234 5678', '0801234567', '080123456789', '+1 202 555 0100', '02012345678']) {
    assert.ok(sql.includes(`'${sample}'`), `SQL test lacks ${sample}`);
    assert.ok(js.includes(`'${sample}'`), `JS test lacks ${sample}`);
  }
});

test('profiles trigger helpers are executable by authenticated (the trigger runs as the caller)', async () => {
  const sql = (await read('supabase/migrations/20261104130000_profiles_and_auth.sql')).replace(/--.*$/gm, '');
  assert.match(sql, /grant execute on function private\.normalize_ng_phone\(text\) to authenticated/i);
  assert.match(sql, /grant execute on function private\.clean_full_name\(text\) to authenticated/i);
  assert.match(sql, /grant execute on function private\.is_admin\(\) to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function private\.(handle_new_user|profiles_before_write)[^;]*authenticated/i);
});
