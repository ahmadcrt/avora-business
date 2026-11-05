import { client, ensureConfigured, go } from './common.js';
import { applyErrors, hideMessage, setBusy, showMessage, wirePasswordToggles } from '../lib/form.js';
import { validateEmail } from '../lib/validate.js';
import { friendlyAuthError, LOGIN_REASONS, safeNext } from '../core/auth-flow.js';

const form = document.getElementById('login-form');
const alert = document.getElementById('alert');
const params = new URLSearchParams(window.location.search);
wirePasswordToggles();

const reason = params.get('reason');
if (reason && Object.hasOwn(LOGIN_REASONS, reason)) showMessage(alert, 'info', LOGIN_REASONS[reason]);

if (ensureConfigured()) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(alert);
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const errors = {};
    if (validateEmail(email)) errors.email = validateEmail(email);
    if (!password) errors.password = 'Enter your password.';
    if (applyErrors(form, errors)) return;

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Logging in');
    try {
      await client.auth.signInWithPassword({ email, password });
      go(safeNext(params.get('next')));
    } catch (err) {
      showMessage(alert, 'danger', friendlyAuthError(err));
      setBusy(button, false);
    }
  });
}
