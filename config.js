// Runtime configuration. The placeholders below are replaced at build time by
// scripts/build.mjs. Only PUBLIC values are ever injected: the Supabase project
// URL and the public anon/publishable key. Privileged or secret keys must
// never be placed here (the build script refuses them).
const raw = {
  basePath: '__BASE_PATH__',
  environment: '__AVORA_ENV__',
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
};

const isSet = (value) => typeof value === 'string' && value !== '' && !value.startsWith('__');

export const config = Object.freeze({
  basePath: isSet(raw.basePath) ? raw.basePath : '/',
  environment: isSet(raw.environment) ? raw.environment : 'development',
  supabaseUrl: isSet(raw.supabaseUrl) ? raw.supabaseUrl : '',
  supabaseAnonKey: isSet(raw.supabaseAnonKey) ? raw.supabaseAnonKey : '',
});

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** Build a site URL that respects the GitHub Pages base path. */
export function siteUrl(path = '') {
  const base = config.basePath.endsWith('/') ? config.basePath : `${config.basePath}/`;
  return base + String(path).replace(/^\/+/, '');
}
