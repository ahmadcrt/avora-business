// Minimal Supabase client for AVORA Business: Auth (GoTrue) and PostgREST over fetch.
// Zero dependencies. Everything goes through this file, so it can be replaced by
// @supabase/supabase-js later without touching pages. Uses ONLY the public anon key.
// Never put a privileged key here: the build refuses them and tests scan for them.

const AUTH = '/auth/v1';
const REST = '/rest/v1';
const IDENT = /^[a-z_][a-z0-9_]*$/;
const SELECT_LIST = /^(\*|[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*)$/;

export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function createClient({ url, anonKey, storage, fetch: fetchImpl, now = () => Date.now(), storageKey = 'avora.session' }) {
  if (!url || !anonKey) throw new Error('Supabase is not configured.');
  if (!storage) throw new Error('A storage object is required.');
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const base = url.replace(/\/+$/, '');
  let refreshing = null;

  const readSession = () => {
    try { const raw = storage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  };
  const writeSession = (session) => { try { storage.setItem(storageKey, JSON.stringify(session)); } catch { /* storage unavailable */ } };
  const clearSession = () => { try { storage.removeItem(storageKey); } catch { /* ignore */ } };

  async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
    const res = await doFetch(base + path, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token || anonKey}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (!res.ok) {
      throw new ApiError(
        (data && (data.error_description || data.msg || data.message)) || `Request failed (${res.status})`,
        { status: res.status, code: (data && (data.error_code || data.code)) || null },
      );
    }
    return data;
  }

  function toSession(d) {
    const expiresAt = d.expires_at ?? Math.floor(now() / 1000) + (Number(d.expires_in) || 3600);
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Number(expiresAt), user: d.user ?? null };
  }

  async function refresh(session) {
    try {
      const data = await request(`${AUTH}/token?grant_type=refresh_token`, { method: 'POST', body: { refresh_token: session.refresh_token } });
      const next = toSession(data);
      writeSession(next);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) { clearSession(); return null; }
      throw err;
    }
  }

  async function getSession() {
    const session = readSession();
    if (!session || !session.access_token) return null;
    if (session.expires_at - 60 > now() / 1000) return session;
    if (!refreshing) refreshing = refresh(session).finally(() => { refreshing = null; });
    return refreshing;
  }

  const auth = {
    async signUp({ email, password, data = {}, redirectTo }) {
      const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
      const res = await request(`${AUTH}/signup${query}`, { method: 'POST', body: { email, password, data } });
      if (res && res.access_token) { const session = toSession(res); writeSession(session); return { session }; }
      return { session: null };
    },
    async signInWithPassword({ email, password }) {
      const data = await request(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email, password } });
      const session = toSession(data);
      writeSession(session);
      return session;
    },
    async signOut() {
      const session = readSession();
      try {
        if (session && session.access_token) await request(`${AUTH}/logout`, { method: 'POST', token: session.access_token });
      } catch { /* the local session is cleared regardless */ } finally { clearSession(); }
    },
    async resetPasswordForEmail(email, redirectTo) {
      const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
      await request(`${AUTH}/recover${query}`, { method: 'POST', body: { email } });
    },
    async updateUser({ password }) {
      const session = await getSession();
      if (!session) throw new ApiError('Not signed in.', { status: 401, code: 'not_authenticated' });
      return request(`${AUTH}/user`, { method: 'PUT', token: session.access_token, body: { password } });
    },
    /** Establish a session from tokens delivered in an email link. The token is verified by asking the server for the user. */
    async setSession({ access_token, refresh_token, expires_in, expires_at }) {
      const user = await request(`${AUTH}/user`, { token: access_token });
      const session = toSession({ access_token, refresh_token, expires_in, expires_at, user });
      writeSession(session);
      return session;
    },
  };

  class Query {
    constructor(table) {
      if (!IDENT.test(table)) throw new Error('Invalid table name.');
      this.table = table; this.method = 'GET'; this.columns = '*'; this.values = null; this.filters = [];
    }
    select(columns = '*') {
      if (!SELECT_LIST.test(columns)) throw new Error('Invalid column list.');
      this.columns = columns;
      if (this.method !== 'PATCH') this.method = 'GET'; // after update(), select() chooses the returned columns
      return this;
    }
    update(values) { this.method = 'PATCH'; this.values = values; return this; }
    eq(column, value) {
      if (!IDENT.test(column)) throw new Error('Invalid column name.');
      this.filters.push(`${column}=eq.${encodeURIComponent(String(value))}`); return this;
    }
    /** Resolves to the first matching row, or null when nothing matched (for example when RLS hides it). */
    async maybeSingle() {
      const session = await getSession();
      const params = [...this.filters];
      const headers = {};
      if (this.method === 'GET') { params.unshift(`select=${this.columns}`); params.push('limit=1'); }
      else { headers.Prefer = 'return=representation'; params.push(`select=${this.columns}`); }
      const rows = await request(`${REST}/${this.table}?${params.join('&')}`, {
        method: this.method, token: session?.access_token, headers, body: this.method === 'PATCH' ? this.values : undefined,
      });
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    }
  }

  return {
    auth,
    getSession,
    from: (table) => new Query(table),
    async rpc(fn, args = {}) {
      if (!IDENT.test(fn)) throw new Error('Invalid function name.');
      const session = await getSession();
      return request(`${REST}/rpc/${fn}`, { method: 'POST', token: session?.access_token, body: args });
    },
  };
}
