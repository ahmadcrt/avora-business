// Validation for the public values injected into the frontend at build time.
// The key rule: refuse anything that looks like a privileged credential.

export function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function validateSupabaseUrl(url) {
  if (!url) return [];
  const ok =
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url) ||
    /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);
  return ok ? [] : [`SUPABASE_URL is not a recognised Supabase project URL: ${url}`];
}

export function validatePublicKey(key) {
  if (!key) return [];
  const problems = [];
  if (/^sb_secret_/.test(key)) problems.push('SUPABASE_ANON_KEY is a secret key (sb_secret_...). Refusing to build.');
  const payload = key.includes('.') ? decodeJwtPayload(key) : null;
  if (payload && payload.role && payload.role !== 'anon') {
    problems.push(`SUPABASE_ANON_KEY is a JWT with role "${payload.role}", not "anon". Refusing to build.`);
  }
  if (key.includes('.') && !payload) problems.push('SUPABASE_ANON_KEY looks like a JWT but cannot be decoded.');
  if (!/^[A-Za-z0-9._-]+$/.test(key)) problems.push('SUPABASE_ANON_KEY contains unexpected characters.');
  return problems;
}

export function validateBasePath(basePath) {
  return /^\/([a-z0-9._-]+\/)*$/i.test(basePath) ? [] : [`AVORA_BASE_PATH must start and end with "/": ${basePath}`];
}
