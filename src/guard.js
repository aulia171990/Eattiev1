// ═══════════════════════════════════════════════════════
// guard.js — Submit Guard & Rate Limiter
// ═══════════════════════════════════════════════════════
import { toast } from './ui.js';

/** Track in-flight operations */
const _activeOps = new Set();

/**
 * guardedSubmit — wraps an async operation with:
 *   1. Duplicate prevention (same opKey blocks concurrent calls)
 *   2. Button disabled state during execution
 *   3. Loading text on button
 *   4. Automatic re-enable on completion or error
 *
 * @param {string}   opKey     - unique key for this operation
 * @param {Function} fn        - async function to execute
 * @param {object}   opts
 * @param {string}   opts.btnId       - ID of button to disable
 * @param {string}   opts.loadingText - text to show while loading
 */
export async function guardedSubmit(opKey, fn, opts = {}) {
  if (_activeOps.has(opKey)) {
    toast('⏳ Sedang diproses, mohon tunggu...');
    return;
  }

  const btn = opts.btnId ? document.getElementById(opts.btnId) : null;
  const originalText = btn?.textContent || '';

  _activeOps.add(opKey);
  if (btn) {
    btn.disabled = true;
    btn.textContent = opts.loadingText || '⏳ Menyimpan...';
  }

  try {
    return await fn();
  } finally {
    _activeOps.delete(opKey);
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

/**
 * cooldown — prevents a function from being called more than
 * once per `ms` milliseconds. Returns null if still in cooldown.
 *
 * Usage: const coolClick = cooldown(handleClick, 2000);
 */
export function cooldown(fn, ms = 2000) {
  let lastCall = 0;
  return (...args) => {
    const now = Date.now();
    if (now - lastCall < ms) {
      toast('⏳ Terlalu cepat, coba lagi sebentar.');
      return null;
    }
    lastCall = now;
    return fn(...args);
  };
}

/**
 * requireOnline — blocks execution if browser is offline.
 * Returns true if online, false + toast if offline.
 */
export function requireOnline() {
  if (!navigator.onLine) {
    toast('📶 Tidak ada koneksi internet. Operasi dibatalkan.');
    return false;
  }
  return true;
}

/**
 * requireRole — client-side role check guard.
 * NOTE: This is UX only. Real enforcement is done by Supabase RLS.
 *
 * @param {string} currentRole
 * @param {...string} allowedRoles
 */
export function requireRole(currentRole, ...allowedRoles) {
  if (!allowedRoles.includes(currentRole)) {
    toast(`🚫 Akses ditolak. Hanya ${allowedRoles.join('/')} yang bisa melakukan ini.`);
    return false;
  }
  return true;
}
