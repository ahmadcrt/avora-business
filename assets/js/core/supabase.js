// Browser wiring: the single shared client. Null when Supabase is not configured.
import { config, isSupabaseConfigured } from './config.js';
import { createClient } from './supabase-client.js';

function pickStorage() {
  try {
    const probe = '__avora_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map(); // private browsing: the session lasts until the tab closes
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  }
}

export const client = isSupabaseConfigured
  ? createClient({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, storage: pickStorage() })
  : null;
