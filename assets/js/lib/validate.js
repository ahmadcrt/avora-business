import { normalizeNigerianPhone } from './format.js';

// Each validator returns '' when valid, or a short message. The database validates again.

export function validateFullName(value) {
  const name = String(value ?? '').trim();
  if (name.length < 2) return 'Enter your full name.';
  if (name.length > 80) return 'Use 80 characters or fewer.';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Remove special characters from the name.';
  return '';
}

export function validatePhone(value) {
  return normalizeNigerianPhone(String(value ?? '')) ? '' : 'Enter a valid Nigerian mobile number, for example 08012345678.';
}

export function validateEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  return '';
}

export function validatePassword(value, email = '') {
  const password = String(value ?? '');
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 72) return 'Use 72 characters or fewer.';
  if (email && password.toLowerCase() === String(email).trim().toLowerCase()) return 'Your password cannot be your email address.';
  return '';
}

export function validateRegistration({ fullName, phone, email, password }) {
  const errors = {
    fullName: validateFullName(fullName),
    phone: validatePhone(phone),
    email: validateEmail(email),
    password: validatePassword(password, email),
  };
  for (const key of Object.keys(errors)) if (!errors[key]) delete errors[key];
  return errors;
}
