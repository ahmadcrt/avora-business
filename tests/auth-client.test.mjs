import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient, ApiError } from '../assets/js/core/supabase-client.js';
import { parseAuthHash, safeNext, friendlyAuthError } from '../assets/js/core/auth-flow.js';
import { requireRole } from '../assets/js/core/guard.js';
import { validateRegistration, validatePassword, validateEmail, validateFullName, validatePhone } from '../assets/js/lib/validate.js';

const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };

/** Fake fetch: routes is a function (url, init) -> {status, body}. Records calls. */
function fakeFetch(route) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, body } = await route(url, init);
    return { ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) };
  };
  fn.calls = calls;
  return fn;
}
const tokenBody = (extra = {}) => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'u1', email: 'a@b.ng' }, ...extra });
const make = (route, opts = {}) => {
  const storage = opts.storage ?? memoryStorage();
  const fetch = fakeFetch(route);
  let t = opts.now ?? 1_000_000_000_000;
  const client = createClient({ url: URL_, anonKey: 'ANON', storage, fetch, now: () => t });
  return { client, storage, fetch, advance: (ms) => { t += ms; } };
};

test('client refuses to start without config or storage', () => {
  assert.throws(() => createClient({ url: '', anonKey: '', storage: memoryStorage() }), /not configured/);
  assert.throws(() => createClient({ url: URL_, anonKey: 'x' }), /storage/);
});

test('signInWithPassword posts credentials with the anon key and stores the session', async () => {
  const { client, storage, fetch } = make(() => ({ body: tokenBody() }));
  const session = await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'pw-12345678' });
  assert.equal(session.access_token, 'AT');
  const call = fetch.calls[0];
  assert.equal(call.url, `${URL_}/auth/v1/token?grant_type=password`);
  assert.equal(call.init.headers.apikey, 'ANON');
  assert.equal(call.init.headers.Authorization, 'Bearer ANON');
  assert.deepEqual(call.body, { email: 'a@b.ng', password: 'pw-12345678' });
  assert.ok(JSON.parse(storage.getItem('avora.session')).refresh_token);
});

test('signUp sends metadata only (never a role) and the redirect URL; no session when confirmation is required', async () => {
  const { client, storage, fetch } = make(() => ({ body: { id: 'u1', email: 'a@b.ng', identities: [] } }));
  const res = await client.auth.signUp({ email: 'a@b.ng', password: 'pw-12345678', data: { full_name: 'Ada', phone: '+2348012345678' }, redirectTo: 'https://x.test/avora-business/merchant/confirm.html' });
  assert.equal(res.session, null);
  assert.equal(storage.getItem('avora.session'), null);
  assert.match(fetch.calls[0].url, /redirect_to=https%3A%2F%2Fx\.test%2Favora-business%2Fmerchant%2Fconfirm\.html$/);
  assert.deepEqual(Object.keys(fetch.calls[0].body.data).sort(), ['full_name', 'phone']);
});

test('errors become ApiError with status and code', async () => {
  const { client } = make(() => ({ status: 400, body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }));
  await assert.rejects(client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' }), (e) => e instanceof ApiError && e.status === 400 && e.code === 'invalid_credentials');
});

test('getSession returns a fresh session without a network call', async () => {
  const { client, fetch } = make(() => ({ body: tokenBody() }));
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  const before = fetch.calls.length;
  assert.equal((await client.getSession()).access_token, 'AT');
  assert.equal(fetch.calls.length, before);
});

test('an expired session is refreshed once even for concurrent callers', async () => {
  const { client, advance, fetch } = make((url) => (url.includes('grant_type=refresh_token') ? { body: tokenBody({ access_token: 'AT2', refresh_token: 'RT2' }) } : { body: tokenBody() }));
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  advance(3_600_000);
  const [a, b] = await Promise.all([client.getSession(), client.getSession()]);
  assert.equal(a.access_token, 'AT2');
  assert.equal(b.access_token, 'AT2');
  assert.equal(fetch.calls.filter((c) => c.url.includes('refresh_token')).length, 1);
});

test('a rejected refresh token clears the session; a network failure keeps it', async () => {
  let mode = 'reject';
  const { client, advance, storage } = make((url) => {
    if (!url.includes('grant_type=refresh_token')) return { body: tokenBody() };
    if (mode === 'reject') return { status: 400, body: { error_code: 'refresh_token_not_found' } };
    throw new TypeError('network down');
  });
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  advance(3_600_000);
  mode = 'network';
  await assert.rejects(client.getSession(), TypeError);
  assert.ok(storage.getItem('avora.session'));
  mode = 'reject';
  assert.equal(await client.getSession(), null);
  assert.equal(storage.getItem('avora.session'), null);
});

test('signOut clears the local session even if the server call fails', async () => {
  let fail = false;
  const { client, storage } = make((url) => { if (fail) throw new TypeError('offline'); return { body: tokenBody() }; });
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  fail = true;
  await client.auth.signOut();
  assert.equal(storage.getItem('avora.session'), null);
});

test('PostgREST queries: filters are URL-encoded, columns validated, user token used', async () => {
  const { client, fetch } = make((url) => (url.includes('/rest/v1/') ? { body: [{ id: 'u1', role: 'merchant' }] } : { body: tokenBody() }));
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  const row = await client.from('profiles').select('id,role').eq('id', 'u1&role=eq.admin').maybeSingle();
  assert.equal(row.role, 'merchant');
  const call = fetch.calls.at(-1);
  assert.equal(call.url, `${URL_}/rest/v1/profiles?select=id,role&id=eq.u1%26role%3Deq.admin&limit=1`);
  assert.equal(call.init.headers.Authorization, 'Bearer AT');
  assert.throws(() => client.from('profiles; drop'), /Invalid table/);
  assert.throws(() => client.from('profiles').select('id,role) union'), /Invalid column list/);
  assert.throws(() => client.from('profiles').eq('role=eq.admin&x', 1), /Invalid column name/);
});

test('update sends PATCH with return=representation and keeps the chosen columns', async () => {
  const { client, fetch } = make((url) => (url.includes('/rest/v1/') ? { body: [{ full_name: 'Ada Obi', phone: '+2348012345678' }] } : { body: tokenBody() }));
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  const saved = await client.from('profiles').update({ full_name: 'Ada Obi' }).eq('id', 'u1').select('full_name,phone').maybeSingle();
  assert.equal(saved.phone, '+2348012345678');
  const call = fetch.calls.at(-1);
  assert.equal(call.init.method, 'PATCH');
  assert.equal(call.init.headers.Prefer, 'return=representation');
  assert.deepEqual(call.body, { full_name: 'Ada Obi' });
  assert.match(call.url, /select=full_name,phone/);
});

test('an update that matches no row (RLS) resolves to null', async () => {
  const { client } = make((url) => (url.includes('/rest/v1/') ? { body: [] } : { body: tokenBody() }));
  await client.auth.signInWithPassword({ email: 'a@b.ng', password: 'x' });
  assert.equal(await client.from('profiles').update({ full_name: 'X Y' }).eq('id', 'other').maybeSingle(), null);
});

test('anonymous queries use the anon key as the bearer token', async () => {
  const { client, fetch } = make(() => ({ body: [] }));
  await client.rpc('api_health');
  assert.equal(fetch.calls[0].init.headers.Authorization, 'Bearer ANON');
  await assert.rejects(client.auth.updateUser({ password: 'new-password-1' }), (e) => e.status === 401);
});

test('parseAuthHash reads sessions and errors from email links', () => {
  const ok = parseAuthHash('#access_token=AT&refresh_token=RT&expires_in=3600&type=recovery');
  assert.equal(ok.type, 'recovery');
  assert.equal(ok.session.access_token, 'AT');
  assert.equal(parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Link+expired').error.code, 'otp_expired');
  assert.equal(parseAuthHash(''), null);
  assert.equal(parseAuthHash('#access_token=only'), null);
});

test('safeNext only allows known pages (no open redirects)', () => {
  assert.equal(safeNext('settings.html'), 'settings.html');
  for (const bad of ['https://evil.test', '//evil.test', 'javascript:alert(1)', '../admin/x.html', '', null, undefined]) assert.equal(safeNext(bad), 'dashboard.html', String(bad));
});

test('friendlyAuthError gives safe messages and no account-existence hints', () => {
  const api = (status, code, message = 'raw server text') => Object.assign(new ApiError(message, { status, code }));
  assert.equal(friendlyAuthError(api(400, 'invalid_credentials')), 'Email or password is incorrect.');
  assert.match(friendlyAuthError(api(400, 'email_not_confirmed')), /Confirm your email/);
  assert.match(friendlyAuthError(api(429, null)), /Too many/);
  assert.equal(friendlyAuthError(api(400, '22023', 'Enter a valid Nigerian mobile number.')), 'Enter a valid Nigerian mobile number.');
  assert.doesNotMatch(friendlyAuthError(api(422, 'user_already_exists', 'User already registered')), /already/i);
  assert.doesNotMatch(friendlyAuthError(api(500, null, 'SQL error at line 4')), /SQL/);
  assert.match(friendlyAuthError(new TypeError('Failed to fetch')), /connection/);
});

test('validators', () => {
  assert.equal(validateEmail('ada@example.ng'), '');
  for (const bad of ['', 'ada', 'ada@', 'a b@c.d', 'x'.repeat(250) + '@a.bc']) assert.notEqual(validateEmail(bad), '', bad);
  assert.equal(validatePassword('longenough1'), '');
  assert.notEqual(validatePassword('short'), '');
  assert.notEqual(validatePassword('ada@example.ng', 'ADA@example.ng'), '');
  assert.notEqual(validatePassword('x'.repeat(73)), '');
  assert.equal(validateFullName('Ada Okafor'), '');
  assert.notEqual(validateFullName('A'), '');
  assert.notEqual(validateFullName('x'.repeat(81)), '');
  assert.equal(validatePhone('0801 234 5678'), '');
  assert.notEqual(validatePhone('123'), '');
  assert.deepEqual(Object.keys(validateRegistration({ fullName: '', phone: '', email: '', password: '' })).sort(), ['email', 'fullName', 'password', 'phone']);
  assert.deepEqual(validateRegistration({ fullName: 'Ada Okafor', phone: '08012345678', email: 'a@b.ng', password: 'longenough1' }), {});
});

// ---- guard ----
function guardClient({ session, profile, profileError }) {
  const signOuts = [];
  return {
    signOuts,
    getSession: async () => session,
    auth: { signOut: async () => { signOuts.push(1); } },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => { if (profileError) throw profileError; return profile; } }),
  };
}
const redirects = () => { const r = []; const fn = (u) => r.push(u); fn.r = r; return fn; };

test('guard: no session redirects to login with a next page', async () => {
  const redirect = redirects();
  assert.equal(await requireRole(guardClient({ session: null }), 'merchant', { redirect, next: 'settings.html' }), null);
  assert.deepEqual(redirect.r, ['login.html?next=settings.html']);
});

test('guard: merchant passes, wrong role is redirected without signing out', async () => {
  const session = { user: { id: 'u1' } };
  const ok = await requireRole(guardClient({ session, profile: { id: 'u1', role: 'merchant' } }), 'merchant', { redirect: redirects() });
  assert.equal(ok.profile.role, 'merchant');
  const redirect = redirects();
  const client = guardClient({ session, profile: { id: 'u1', role: 'admin' } });
  assert.equal(await requireRole(client, 'merchant', { redirect }), null);
  assert.deepEqual(redirect.r, ['login.html?reason=role']);
  assert.equal(client.signOuts.length, 0);
});

test('guard: missing profile or rejected token signs out and redirects', async () => {
  const session = { user: { id: 'u1' } };
  let redirect = redirects();
  let client = guardClient({ session, profile: null });
  assert.equal(await requireRole(client, 'merchant', { redirect }), null);
  assert.deepEqual(redirect.r, ['login.html?reason=no-profile']);
  assert.equal(client.signOuts.length, 1);
  redirect = redirects();
  client = guardClient({ session, profileError: new ApiError('JWT expired', { status: 401 }) });
  assert.equal(await requireRole(client, 'merchant', { redirect }), null);
  assert.deepEqual(redirect.r, ['login.html?reason=expired']);
  await assert.rejects(requireRole(guardClient({ session, profileError: new TypeError('offline') }), 'merchant', { redirect: redirects() }), TypeError);
});
