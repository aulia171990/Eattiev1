// ════════════════════════════════════════════════════════
// helpers.js — Pure utility functions (no side effects)
// ════════════════════════════════════════════════════════

/**
 * XSS-safe HTML escaper.
 * MUST be used on ALL user-generated content before innerHTML insertion.
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

export const rp  = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
export const fmt = (n, d = 2) =>
  (+(n || 0)).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: d });
export const today = () => new Date().toISOString().slice(0, 10);

export function genId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,5).toUpperCase()}`;
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function $(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`[DOM] #${id} not found`);
  return el;
}
export const $q = id => document.getElementById(id);
