// Pure helpers for the sign-in flows (no DOM, no network), so they can be unit tested.

/** Parse the URL fragment Supabase appends to email links. */
export function parseAuthHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (params.get('error') || params.get('error_code')) {
    return { error: { code: params.get('error_code') || params.get('error'), description: params.get('error_description') || '' } };
  }
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return {
    type: params.get('type') || '',
    session: {
      access_token,
      refresh_token,
      expires_in: params.get('expires_in') ? Number(params.get('expires_in')) : undefined,
      expires_at: params.get('expires_at') ? Number(params.get('expires_at')) : undefined,
    },
  };
}

/** Only ever redirect to a known page name. Anything else falls back, which prevents open redirects. */
export function safeNext(next, allowed = ['dashboard.html', 'settings.html'], fallback = 'dashboard.html') {
  return allowed.includes(next) ? next : fallback;
}

const MESSAGES = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email first. Check your inbox for the link we sent.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many emails requested. Wait a while and try again.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  same_password: 'Choose a password you have not used before.',
  not_authenticated: 'Your session has ended. Log in again.',
  otp_expired: 'That link has expired. Request a new one.',
  signup_disabled: 'Sign-up is not available right now.',
};

/** Turn an error into a message that is safe to show. Never reveals whether an email exists. */
export function friendlyAuthError(err) {
  if (!err) return 'Something went wrong. Try again.';
  if (err.name === 'ApiError') {
    if (err.code === '22023') return err.message; // our own validation text from the database
    if (MESSAGES[err.code]) return MESSAGES[err.code];
    if (err.status === 429) return MESSAGES.over_request_rate_limit;
    if (err.status === 400 || err.status === 401 || err.status === 422) return 'We could not complete that. Check your details and try again.';
    return 'Something went wrong on our side. Try again in a moment.';
  }
  return 'Could not reach the server. Check your connection and try again.';
}

export const LOGIN_REASONS = {
  confirmed: 'Your email is confirmed. Log in to continue.',
  'signed-out': 'You have signed out.',
  role: 'This account cannot use the merchant area.',
  expired: 'Your session expired. Log in again.',
  'no-profile': 'We could not load your account. Log in again.',
};
