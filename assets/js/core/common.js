import { client } from '../core/supabase.js';
import { showMessage } from '../lib/form.js';

export { client };

export const go = (url) => window.location.replace(url);

/** Show a clear message and stop when Supabase has not been configured at build time. */
export function ensureConfigured() {
  if (client) return true;
  const alert = document.getElementById('alert');
  if (alert) showMessage(alert, 'warning', 'This site is not connected to its database yet. Please try again later.');
  for (const el of document.querySelectorAll('form button[type="submit"]')) el.disabled = true;
  return false;
}

export function wireLogout() {
  const btn = document.getElementById('logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await client.auth.signOut();
    go('login.html?reason=signed-out');
  });
}
