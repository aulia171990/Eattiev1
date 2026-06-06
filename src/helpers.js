// ═══════════════════════════════════════════════════════
// helpers.js — Safe utilities (XSS-hardened)
// ═══════════════════════════════════════════════════════

/**
 * SECURITY: Escape HTML to prevent XSS.
 * Use on ALL user-generated or database-sourced strings
 * before inserting into innerHTML.
 */
export function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/** Format number as Indonesian Rupiah */
export const rp = n =>
  'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

/** Format number with decimal */
export const fmt = (n, d = 2) =>
  (+(n || 0)).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: d
  });

/** Today's date as YYYY-MM-DD */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Generate collision-resistant ID.
 * Uses timestamp + random suffix for idempotency.
 */
export function genId(prefix) {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
}

/** Debounce: delays fn execution until after wait ms of silence */
export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Safe DOM text setter — never uses innerHTML */
export function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/** Safe DOM query helper */
export function $id(id) {
  return document.getElementById(id);
}

/** Show/hide element */
export function show(id) { const el = $id(id); if (el) el.style.display = 'flex'; }
export function hide(id) { const el = $id(id); if (el) el.style.display = 'none'; }

/**
 * Safe table row builder — uses esc() on all data fields.
 * Pass an array of cell definitions: { text, html, class }
 * Use 'html' ONLY for trusted, hardcoded HTML (badges, buttons).
 * Use 'text' for any user/db data — will be escaped automatically.
 */
export function buildRow(cells) {
  const tds = cells.map(cell => {
    if (cell.html !== undefined) {
      // 'html' is for trusted static markup only (icons, badges with hardcoded strings)
      return `<td class="${cell.class || ''}">${cell.html}</td>`;
    }
    // 'text' always escaped
    return `<td class="${cell.class || ''}">${esc(cell.text ?? '')}</td>`;
  });
  return `<tr>${tds.join('')}</tr>`;
}

/**
 * Safe badge builder
 * @param {string} text - user text, will be escaped
 * @param {string} cls  - CSS class (hardcoded, trusted)
 */
export function badge(text, cls) {
  return `<span class="badge ${cls}">${esc(text)}</span>`;
}

/** Format date to Indonesian locale */
export function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/** Format datetime to Indonesian locale */
export function fmtDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID');
}
