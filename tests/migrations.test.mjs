import test from 'node:test';
import assert from 'node:assert/strict';
import { read, listFiles } from './helpers.mjs';

const files = await listFiles('supabase/migrations', (p) => p.endsWith('.sql'));

test('migration files are named <14-digit timestamp>_<snake_case>.sql, unique and ordered', () => {
  const names = files.map((f) => f.split('/').pop());
  assert.ok(names.length >= 1);
  for (const n of names) assert.match(n, /^\d{14}_[a-z0-9_]+\.sql$/, n);
  assert.deepEqual([...names].sort(), names);
  assert.equal(new Set(names.map((n) => n.slice(0, 14))).size, names.length, 'duplicate timestamps');
});

test('every table created in public enables RLS in the same migration', async () => {
  for (const f of files) {
    const sql = (await read(f)).replace(/--.*$/gm, '');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      const re = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:public\\.)?${m[1]}\\s+enable\\s+row\\s+level\\s+security`, 'i');
      assert.match(sql, re, `${f}: table ${m[1]} has no ENABLE ROW LEVEL SECURITY`);
    }
  }
});

test('migrations never disable RLS or grant broad access to anon/authenticated', async () => {
  for (const f of files) {
    const sql = (await read(f)).replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /disable\s+row\s+level\s+security/i, f);
    assert.doesNotMatch(sql, /grant\s+all[^;]*to\s+[^;]*\b(anon|authenticated|public)\b/i, `${f}: GRANT ALL to an API role`);
    assert.doesNotMatch(sql, /grant\s+[^;]*on\s+all\s+(tables|functions|sequences)[^;]*to\s+[^;]*\b(anon|authenticated|public)\b/i, f);
    assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i, `${f}: policy USING (true) needs explicit review`);
  }
});

test('SECURITY DEFINER functions set an empty search_path', async () => {
  for (const f of files) {
    const sql = (await read(f)).replace(/--.*$/gm, '');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function[\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi)) {
      if (/security\s+definer/i.test(m[0])) assert.match(m[0], /set\s+search_path\s*=\s*''/i, `${f}: SECURITY DEFINER without search_path`);
    }
  }
});

test('baseline migration removes default API grants and function execute from PUBLIC', async () => {
  const sql = await read('supabase/migrations/20261104120000_baseline_security.sql');
  assert.match(sql, /alter default privileges for role postgres in schema public revoke all on tables\s+from anon, authenticated/i);
  assert.match(sql, /alter default privileges for role postgres revoke execute on functions from public/i);
  assert.match(sql, /revoke all on schema private from public, anon, authenticated/i);
});

test('database test plan count matches the number of assertions', async () => {
  const sql = await read('supabase/tests/database/001_baseline_security.test.sql');
  const planned = Number(sql.match(/select plan\((\d+)\)/)[1]);
  const asserts = (sql.match(/^select (?:ok|is|has_schema)\(/gm) || []).length;
  assert.equal(planned, asserts);
});
