import { client, ensureConfigured } from './common.js';
import { showMessage } from '../lib/form.js';
import { friendlyAuthError, parseAuthHash } from '../core/auth-flow.js';

const alert = document.getElementById('alert');
const status = document.getElementById('status');

async function run() {
  if (!ensureConfigured()) { status.hidden = true; return; }
  const parsed = parseAuthHash(window.location.hash);
  history.replaceState(null, '', window.location.pathname + window.location.search); // remove tokens from the address bar
  if (!parsed || parsed.error || !parsed.session) {
    status.hidden = true;
    showMessage(alert, 'danger', parsed && parsed.error ? 'That confirmation link is invalid or has expired. Log in, or sign up again.' : 'This page is for the link in your confirmation email.');
    document.getElementById('login-link').hidden = false;
    return;
  }
  try {
    await client.auth.setSession(parsed.session);
    status.hidden = true;
    showMessage(alert, 'info', 'Your email is confirmed.');
    document.getElementById('continue-link').hidden = false;
  } catch (err) {
    status.hidden = true;
    showMessage(alert, 'danger', friendlyAuthError(err));
    document.getElementById('login-link').hidden = false;
  }
}
run();
