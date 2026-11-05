import { client, ensureConfigured } from './common.js';
import { applyErrors, hideMessage, setBusy, showMessage } from '../lib/form.js';
import { validateEmail } from '../lib/validate.js';
import { friendlyAuthError } from '../core/auth-flow.js';

const form = document.getElementById('forgot-form');
const alert = document.getElementById('alert');

if (ensureConfigured()) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(alert);
    const email = form.elements.email.value.trim();
    if (applyErrors(form, validateEmail(email) ? { email: validateEmail(email) } : {})) return;

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Sending');
    try {
      await client.auth.resetPasswordForEmail(email, new URL('reset-password.html', window.location.href).href);
      // Same answer whether or not the account exists, so emails cannot be probed.
      showMessage(alert, 'info', 'If an account exists for that email, we have sent a link to reset the password.');
    } catch (err) {
      // Show rate-limit problems, but never anything about whether the account exists.
      showMessage(alert, err && err.status === 429 ? 'danger' : 'info',
        err && err.status === 429 ? friendlyAuthError(err) : 'If an account exists for that email, we have sent a link to reset the password.');
    } finally {
      setBusy(button, false);
    }
  });
}
