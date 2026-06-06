// ════════════════════════════════════════════════════════
// guard.js — Submit guard / rate limiter
// Prevents double-click, button spam, duplicate requests
// ════════════════════════════════════════════════════════

const _activeGuards = new Set();

/**
 * Wrap an async action with submit guard.
 * Disables button, shows loading state, prevents re-entry.
 *
 * @param {string}   guardKey  - Unique key per action (e.g. 'tambah-jual')
 * @param {Function} fn        - Async function to execute
 * @param {object}   options
 * @param {string}   options.btnId     - Button element ID to disable
 * @param {string}   options.loadingText - Text shown while loading
 * @param {number}   options.cooldown  - ms after success before re-enable (default 500)
 */
export async function guardedSubmit(guardKey, fn, options = {}) {
  // Prevent concurrent execution of same action
  if (_activeGuards.has(guardKey)) {
    console.warn(`[Guard] "${guardKey}" already in progress — blocked`);
    return;
  }

  const btn = options.btnId ? document.getElementById(options.btnId) : null;
  const originalText = btn?.textContent || '';
  const cooldown = options.cooldown ?? 500;

  _activeGuards.add(guardKey);
  if (btn) {
    btn.disabled = true;
    btn.textContent = options.loadingText || '⏳ Memproses...';
  }

  try {
    await fn();
  } finally {
    setTimeout(() => {
      _activeGuards.delete(guardKey);
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }, cooldown);
  }
}

/**
 * Simple rate limiter — allows at most `max` calls per `windowMs`.
 * Returns true if allowed, false if rate-limited.
 */
const _rateCounts = new Map();

export function rateLimit(key, max = 5, windowMs = 10000) {
  const now = Date.now();
  const entry = _rateCounts.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count++;
  _rateCounts.set(key, entry);

  if (entry.count > max) {
    console.warn(`[RateLimit] "${key}" exceeded ${max} calls / ${windowMs}ms`);
    return false;
  }
  return true;
}
