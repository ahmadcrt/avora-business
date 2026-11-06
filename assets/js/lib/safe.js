// Pure helpers for safely handling user-supplied text. No DOM access.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use inside HTML. Prefer textContent; use this only when unavoidable. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** True only for absolute http(s) URLs. Rejects javascript:, data:, vbscript: and malformed input. */
export function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
