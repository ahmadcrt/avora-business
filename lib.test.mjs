import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isSafeHttpUrl } from '../assets/js/lib/safe.js';
import { formatNaira, normalizeNigerianPhone } from '../assets/js/lib/format.js';

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('isSafeHttpUrl allows only http(s)', () => {
  assert.ok(isSafeHttpUrl('https://example.ng/path'));
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com', 'not a url', '']) assert.ok(!isSafeHttpUrl(bad), bad);
});

test('formatNaira', () => {
  assert.match(formatNaira(1500), /^₦1,500$/);
  assert.match(formatNaira(2500.5), /^₦2,500\.50$/);
  assert.equal(formatNaira('abc'), '');
  assert.equal(formatNaira(null), '');
});

test('normalizeNigerianPhone accepts common formats and rejects invalid ones', () => {
  for (const ok of ['08012345678', '8012345678', '2348012345678', '+234 801 234 5678', '+234-801-234-5678', '0901 234 5678'])
    assert.match(normalizeNigerianPhone(ok), /^\+234[789][01]\d{8}$/, ok);
  assert.equal(normalizeNigerianPhone('08012345678'), '+2348012345678');
  for (const bad of ['0801234567', '080123456789', '+1 202 555 0100', 'abcdefghijk', '', null, '02012345678'])
    assert.equal(normalizeNigerianPhone(bad), null, String(bad));
});
