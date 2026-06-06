// ════════════════════════════════════════════════════════
// error.js — Centralized error handler
// ════════════════════════════════════════════════════════
import { showToast } from '../modules/ui.js';

const USER_MESSAGES = {
  '23505': 'Data sudah ada (duplikat). Operasi dibatalkan.',
  '23503': 'Data terkait tidak ditemukan.',
  '42501': 'Akses ditolak. Role Anda tidak memiliki izin.',
  'PGRST116': 'Data tidak ditemukan.',
  'AUTH_INVALID': 'Email atau password salah.',
  'NETWORK': 'Tidak ada koneksi internet. Coba lagi.',
  'DEFAULT': 'Terjadi kesalahan. Silakan coba lagi.',
};

/**
 * Central error handler.
 * @param {Error|object} err - Error from Supabase or JS
 * @param {string} context  - Where the error happened (for console)
 * @param {object} options
 * @param {boolean} options.silent - Don't show toast
 * @param {boolean} options.rethrow - Re-throw after handling
 */
export function handleError(err, context = 'Unknown', options = {}) {
  const code = err?.code || err?.error_description || 'DEFAULT';
  const raw  = err?.message || String(err);
  const userMsg = USER_MESSAGES[code] || USER_MESSAGES['DEFAULT'];

  // Always log full details for debugging
  console.error(`[Error][${context}] code=${code}`, raw, err);

  if (!options.silent) showToast(`❌ ${userMsg}`, 'error');
  if (options.rethrow) throw err;
}

/**
 * Wrap an async function with automatic error handling.
 * Usage: const safeFn = withErrorHandler(myAsyncFn, 'myContext');
 */
export function withErrorHandler(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      handleError(err, context);
    }
  };
}

/**
 * Global unhandled promise rejection catcher.
 * Call once in main.js.
 */
export function setupGlobalErrorHandler() {
  window.addEventListener('unhandledrejection', e => {
    handleError(e.reason, 'UnhandledPromise', { silent: false });
    e.preventDefault();
  });
  window.addEventListener('error', e => {
    console.error('[GlobalError]', e.message, e.filename, e.lineno);
  });
}
