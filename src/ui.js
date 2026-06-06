// ═══════════════════════════════════════════════════════
// ui.js — UI Primitives
// ═══════════════════════════════════════════════════════

/** Toast notification */
export function toast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  // Use textContent — never innerHTML — to prevent XSS
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), dur);
}

/** Open a modal */
export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

/** Close a modal */
export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/** Set sync dot state: 'online' | 'syncing' | 'offline' */
export function setSyncDot(state) {
  const d = document.getElementById('sync-dot');
  if (!d) return;
  d.className = 'sync-dot' +
    (state === 'offline' ? ' offline' : '') +
    (state === 'syncing' ? ' syncing' : '');
}

/**
 * Safe innerHTML setter with XSS note.
 * Only use this with HTML built from trusted helpers (esc, badge, buildRow).
 * NEVER pass raw user input here.
 */
export function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/** Render empty state into a container */
export function renderEmpty(id, msg = 'Belum ada data', colspan = 5) {
  const el = document.getElementById(id);
  if (!el) return;
  // colspan is always a number (safe), msg is always a hardcoded string from caller (safe)
  // but we sanitize msg anyway for defence-in-depth
  const safeCols = parseInt(colspan, 10) || 5;
  const safeMsg  = String(msg).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const tag = el.tagName === 'TBODY' ? 'tr' : 'div';
  // safeCols = parseInt() output (number, no XSS risk)
  // safeMsg  = manually escaped string above (no XSS risk)
  // eslint-disable-next-line no-unsanitized/property
  if (tag === 'tr') {
    el.innerHTML = `<tr><td colspan="${safeCols}" style="text-align:center;padding:16px;color:var(--tm)">${safeMsg}</td></tr>`;
  } else {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--tm)">${safeMsg}</div>`;
  }
}

/**
 * showPage — canonical implementation is in main.js.
 * This re-export exists only as a convenience for modules
 * that need basic tab switching without triggering data loads.
 * For full page switching (with data render), use main.js showPage.
 */
export function showPageBasic(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  if (btn) btn.classList.add('active');
}
