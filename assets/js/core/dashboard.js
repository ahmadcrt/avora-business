import { client, ensureConfigured, go, wireLogout } from './common.js';
import { requireRole } from '../core/guard.js';
import { showMessage } from '../lib/form.js';

const alert = document.getElementById('alert');

async function run() {
  if (!ensureConfigured()) return;
  wireLogout();
  const result = await requireRole(client, 'merchant', { redirect: go, next: 'dashboard.html' });
  if (!result) return;
  const { session, profile } = result;
  document.getElementById('welcome-name').textContent = profile.full_name || 'there';
  document.getElementById('account-email').textContent = session.user.email || '';
  document.getElementById('account-phone').textContent = profile.phone || 'Not set';
  document.getElementById('content').hidden = false;
}
run().catch(() => showMessage(alert, 'danger', 'We could not load your account. Refresh the page and try again.'));
