import { client, ensureConfigured } from './common.js';
import { applyErrors, hideMessage, setBusy, showMessage, wirePasswordToggles } from '../lib/form.js';
import { validateRegistration } from '../lib/validate.js';
import { normalizeNigerianPhone } from '../lib/format.js';
import { friendlyAuthError } from '../core/auth-flow.js';

const form = document.getElementById('register-form');
const alert = document.getElementById('alert');
wirePasswordToggles();

if (ensureConfigured()) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(alert);
    const values = {
      fullName: form.elements.fullName.value,
      phone: form.elements.phone.value,
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
    };
    if (applyErrors(form, validateRegistration(values))) return;

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true, 'Creating account');
    try {
      await client.auth.signUp({
        email: values.email,
        password: values.password,
        data: { full_name: values.fullName.trim(), phone: normalizeNigerianPhone(values.phone) },
        redirectTo: new URL('confirm.html', window.location.href).href,
      });
      // The same message is shown whether or not the email already has an account.
      document.getElementById('sent-to').textContent = values.email;
      form.hidden = true;
      document.getElementById('success').hidden = false;
    } catch (err) {
      showMessage(alert, 'danger', friendlyAuthError(err));
    } finally {
      setBusy(button, false);
    }
  });
}
