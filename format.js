/** Format a number as Nigerian Naira, e.g. 1500 -> "₦1,500". Returns '' for invalid input. */
export function formatNaira(amount) {
  if (amount === null || amount === undefined || amount === '') return '';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/**
 * Normalise a Nigerian MOBILE number to +234XXXXXXXXXX, or return null if invalid.
 * Accepts 08012345678, 8012345678, 2348012345678, +234 801 234 5678, +234-801-234-5678.
 * The same rules will be enforced again in the database (never trust the browser alone).
 */
export function normalizeNigerianPhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('234') && digits.length === 13) {
    // already international
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = `234${digits.slice(1)}`;
  } else if (digits.length === 10 && /^[789]/.test(digits)) {
    digits = `234${digits}`;
  } else {
    return null;
  }
  return /^234[789][01]\d{8}$/.test(digits) ? `+${digits}` : null;
}
