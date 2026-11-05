// Small DOM helpers for forms. All text is set with textContent, never innerHTML.

export function clearFieldErrors(form) {
  for (const el of form.querySelectorAll('[data-error-for]')) { el.textContent = ''; el.hidden = true; }
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
}

export function setFieldError(form, name, message) {
  const input = form.elements[name];
  const out = form.querySelector(`[data-error-for="${name}"]`);
  if (input) input.setAttribute('aria-invalid', 'true');
  if (out) { out.textContent = message; out.hidden = false; }
}

export function applyErrors(form, errors) {
  clearFieldErrors(form);
  const names = Object.keys(errors);
  for (const name of names) setFieldError(form, name, errors[name]);
  if (names.length && form.elements[names[0]]) form.elements[names[0]].focus();
  return names.length > 0;
}

export function showMessage(el, kind, text) {
  el.className = `alert alert-${kind}`;
  el.textContent = text;
  el.hidden = false;
}

export function hideMessage(el) { el.hidden = true; el.textContent = ''; }

export function setBusy(button, busy, busyLabel = 'Please wait') {
  if (busy) { button.dataset.label = button.textContent; button.textContent = busyLabel; }
  else if (button.dataset.label) { button.textContent = button.dataset.label; }
  button.disabled = busy;
}

export function wirePasswordToggles(root = document) {
  for (const btn of root.querySelectorAll('[data-toggle-password]')) {
    btn.addEventListener('click', () => {
      const input = root.querySelector(`#${btn.dataset.togglePassword}`);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
    });
  }
}
