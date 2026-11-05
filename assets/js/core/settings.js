import { client, ensureConfigured, go, wireLogout } from './common.js';
import { requireRole } from '../core/guard.js';
import { applyErrors, hideMessage, setBusy, showMessage, wirePasswordToggles } from '../lib/form.js';
import { validateFullName, validatePassword, validatePhone } from '../lib/validate.js';
import { normalizeNigerianPhone } from '../lib/format.js';
import { friendlyAuthError } from '../core/auth-flow.js';

const alert = document.getElementById('alert');
const profileForm = document.getElementById('profile-form');
const passwordForm = document.getElementById('password-form');
wirePasswordToggles();

async function run() {
  if (!ensureConfigured()) return;
  wireLogout();
  const result = await requireRole(client, 'merchant', { redirect: go, next: 'settings.html' });
  if (!result) return;
  const { session, profile } = result;

  profileForm.elements.fullName.value = profile.full_name || '';
  profileForm.elements.phone.value = profile.phone || '';
  document.getElementById('account-email').textContent = session.user.email || '';
  document.getElementById('content').hidden = false;

  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(alert);
    const fullName = profileForm.elements.fullName.value;
    const phone = profileForm.elements.phone.value;
    const errors = {};
    if (validateFullName(fullName)) errors.fullName = validateFullName(fullName);
    if (validatePhone(phone)) errors.phone = validatePhone(phone);
    if (applyErrors(profileForm, errors)) return;
    const button = profileForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving');
    try {
      const saved = await client.from('profiles')
        .update({ full_name: fullName.trim(), phone: normalizeNigerianPhone(phone) })
        .eq('id', session.user.id)
        .select('full_name,phone')
        .maybeSingle();
      if (!saved) throw new Error('not saved');
      profileForm.elements.fullName.value = saved.full_name || '';
      profileForm.elements.phone.value = saved.phone || '';
      showMessage(alert, 'info', 'Your details have been saved.');
    } catch (err) {
      showMessage(alert, 'danger', err && err.code === '22023' ? err.message : 'We could not save your details. Try again.');
    } finally {
      setBusy(button, false);
    }
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(alert);
    const password = passwordForm.elements.password.value;
    const problem = validatePassword(password, session.user.email);
    if (applyErrors(passwordForm, problem ? { password: problem } : {})) return;
    const button = passwordForm.querySelector('button[type="submit"]');
    setBusy(button, true, 'Saving');
    try {
      await client.auth.updateUser({ password });
      passwordForm.reset();
      showMessage(alert, 'info', 'Your password has been changed.');
    } catch (err) {
      showMessage(alert, 'danger', friendlyAuthError(err));
    } finally {
      setBusy(button, false);
    }
  });
}
run().catch(() => showMessage(alert, 'danger', 'We could not load your account. Refresh the page and try again.'));
