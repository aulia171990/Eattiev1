// ════════════════════════════════════════════════════════
// ui.js — UI primitives (toast, modal, sync dot, nav)
// No business logic here — pure presentation
// ════════════════════════════════════════════════════════
import { esc } from '../utils/helpers.js';

// ── Toast ─────────────────────────────────────────────
let _toastTimer;
export function showToast(msg, type = 'info', dur = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.textContent = msg; // textContent — XSS safe
  el.className   = `toast show ${type}`;
  _toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// Convenience aliases used throughout codebase
export const toast      = msg => showToast(msg, 'info');
export const toastError = msg => showToast(msg, 'error', 4000);
export const toastOk    = msg => showToast(msg, 'success');

// ── Sync dot ──────────────────────────────────────────
export function setSyncDot(state) {
  const d = document.getElementById('sync-dot');
  if (!d) return;
  d.className = 'sync-dot' + ({
    offline: ' offline',
    syncing: ' syncing',
    error:   ' error',
  }[state] || '');
  d.title = { offline: 'Offline', syncing: 'Menyinkron...', error: 'Sinkronisasi gagal', online: 'Online' }[state] || 'Online';
}

// ── Modal ─────────────────────────────────────────────
export function openModal(id)  { document.getElementById(id)?.classList.add('open');    }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── Nav pages ─────────────────────────────────────────
export function showPage(name, btn, pageHandlers = {}) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  btn?.classList.add('active');
  pageHandlers[name]?.();
}

// ── Role-based DOM cleanup ────────────────────────────
/**
 * Remove unauthorized elements from DOM entirely.
 * More secure than CSS `display:none` — element is not
 * accessible via DevTools either.
 */
export function applyRBAC(currentRole) {
  document.querySelectorAll('.owner-only').forEach(el => {
    if (currentRole !== 'owner') el.remove();
  });
  document.querySelectorAll('.baker-only').forEach(el => {
    if (currentRole !== 'baker' && currentRole !== 'owner') el.remove();
  });
}

// ── XSS-safe table row builder ────────────────────────
/**
 * Safely build a <tr> with escaped cells.
 * @param {string[]} cells - HTML strings (use esc() on user data)
 * @param {string} trClass
 */
export function buildRow(cells, trClass = '') {
  const tr = document.createElement('tr');
  if (trClass) tr.className = trClass;
  cells.forEach(html => {
    const td = document.createElement('td');
    td.innerHTML = html; // caller responsible for escaping user data
    tr.appendChild(td);
  });
  return tr;
}

/**
 * Clear a tbody and append rows safely.
 * @param {string} tableId
 * @param {HTMLElement[]} rows
 * @param {string} emptyMsg
 * @param {number} colSpan
 */
export function renderTable(tableId, rows, emptyMsg = 'Belum ada data', colSpan = 6) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.replaceChildren(); // clears without innerHTML
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.style.cssText = 'text-align:center;padding:16px;color:var(--tm)';
    td.textContent = emptyMsg;
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach(row => tbody.appendChild(row));
  }
}

// ── Badge helper (XSS safe) ───────────────────────────
export function badge(text, cls) {
  const span = document.createElement('span');
  span.className = `badge ${cls}`;
  span.textContent = text; // textContent — safe
  return span.outerHTML;
}

// ── Alert banner (XSS safe) ───────────────────────────
export function alertBanner(msg, danger = false) {
  const d = document.createElement('div');
  d.className = `alert${danger ? ' danger' : ''}`;
  d.textContent = msg; // textContent — safe
  return d.outerHTML;
}
