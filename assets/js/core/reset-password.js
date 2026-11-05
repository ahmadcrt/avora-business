import { client, ensureConfigured, go } from './common.js';
import { applyErrors, hideMessage, setBusy, showMessage, wirePasswordToggles } from '../lib/form.js';
import { validatePassword } from '../lib/validate.js';
import { friendlyAuthError, parseAuthHash } from '../core/auth-flow.js';

const form = document.getElementById('reset-form');
const alert = document.getElementById('alert');
const status = document.getElementById('status');
wirePasswordToggles();

function invalid() {
  status.hidden = true;
  showMessage(alert, 'danger', 'This reset link is invalid or has expired. Request a new one.');
  document.getElementById('request-link').hidden = false;
}

async function run() {
  if (!ensureConfigured()) { status.hidden = true; return; }
  const parsed = parseAuthHash(window.location.hash);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  if (!parsed || parsed.error || !parsed.session || parsed.type !== 'recovery') return invalid();
  try {
    await client.auth.setSession(parsed.session);
  } catch {
    return invalid();
  }
  status.hidden = true;
  form.hidden = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(alert);
    const password = form.elements.password.value;
    const problem = validatePassword(password);
    if (applyErrors(form, problem ? { password: problem } : {})) return;
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving');
    try {
      await client.auth.updateUser({ password });
      form.hidden = true;
      showMessage(alert, 'info', 'Your password has been updated.');
      document.getElementById('continue-link').hidden = false;
    } catch (err) {
      showMessage(alert, 'danger', friendlyAuthError(err));
      setBusy(button, false);
    }
  });
}
run().catch(() => go('login.html?reason=expired'));
