// ═══════════════════════════════════════════════════════
// errors.js — Centralized Error Handler
// ═══════════════════════════════════════════════════════
import { toast } from './ui.js';

/** Map Supabase/network error codes to user-friendly messages */
const ERROR_MAP = {
  '23505':        '❌ Data duplikat — sudah ada di database.',
  '23503':        '❌ Data terkait tidak ditemukan.',
  '42501':        '🚫 Akses ditolak. Hubungi owner.',
  'PGRST301':     '🔐 Sesi habis. Silakan login ulang.',
  'PGRST116':     '❌ Data tidak ditemukan.',
  'NetworkError': '📶 Tidak ada koneksi internet.',
  'FetchError':   '📶 Gagal terhubung ke server.',
};

/**
 * Main error handler — call this in every catch block.
 * @param {Error|object} err   - error object
 * @param {string} context     - where the error happened (for logging)
 * @param {boolean} rethrow    - if true, re-throws after handling
 */
export function handleError(err, context = '', rethrow = false) {
  // Extract message from Supabase error shape or standard Error
  const code    = err?.code || err?.error_description || '';
  const message = err?.message || err?.error || String(err);

  // Map to user-friendly message
  const userMsg = ERROR_MAP[code]
    || (message.includes('NetworkError') ? ERROR_MAP['NetworkError'] : null)
    || (message.includes('fetch')        ? ERROR_MAP['FetchError']   : null)
    || `❌ ${message}`;

  // Show to user
  toast(userMsg, 3500);

  // Always log full error for debugging
  console.error(`[Eattie Error] ${context}:`, err);

  // Optional: send to Supabase error log table
  // logErrorToServer(context, code, message);

  if (rethrow) throw err;
}

/**
 * Async wrapper — wraps any async function with automatic error handling.
 * Usage: const safeLogin = withErrorHandling(doLogin, 'auth.login');
 */
export function withErrorHandling(fn, context = '') {
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
 * Register once in main.js.
 */
export function registerGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', event => {
    handleError(event.reason, 'unhandledRejection');
    event.preventDefault(); // Prevent browser default error logging
  });

  window.addEventListener('error', event => {
    console.error('[Eattie Global Error]', event.error);
  });
}
