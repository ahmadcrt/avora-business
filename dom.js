import { isSafeHttpUrl } from './safe.js';

/**
 * Create an element without ever using innerHTML.
 * Children that are strings become text nodes, so user content cannot inject markup.
 * Only a small allow-list of attributes is accepted.
 */
const ALLOWED_ATTRS = new Set([
  'class', 'id', 'type', 'name', 'value', 'placeholder', 'for', 'role', 'title',
  'alt', 'src', 'href', 'target', 'rel', 'disabled', 'hidden', 'required',
  'autocomplete', 'inputmode', 'maxlength', 'minlength', 'rows',
]);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs ?? {})) {
    if (val === false || val == null) continue;
    if (key.startsWith('on')) throw new Error('Inline event handlers are not allowed. Use addEventListener.');
    const isAria = key.startsWith('aria-') || key.startsWith('data-');
    if (!isAria && !ALLOWED_ATTRS.has(key)) throw new Error(`Attribute not allowed: ${key}`);
    if ((key === 'href' || key === 'src') && !isRelativeOrSafe(val)) continue;
    node.setAttribute(key, val === true ? '' : String(val));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function isRelativeOrSafe(value) {
  const text = String(value);
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return isSafeHttpUrl(text);
  return !text.startsWith('//');
}
