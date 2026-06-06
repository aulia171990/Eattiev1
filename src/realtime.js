// ═══════════════════════════════════════════════════════
// realtime.js — Realtime Manager (Singleton)
// Fixes: duplicate subscriptions, memory leaks, reconnect
// ═══════════════════════════════════════════════════════
import { sb } from './supabase.js';

/** Single channel instance — prevents duplicate subscriptions */
let _channel = null;
let _isSubscribed = false;
const _handlers = new Map(); // table → Set of handler functions

/**
 * Register a handler for a specific table change.
 * Multiple handlers can be registered for the same table.
 *
 * @param {string}   table   - Supabase table name
 * @param {Function} handler - async function to call on change
 */
export function onTableChange(table, handler) {
  if (!_handlers.has(table)) _handlers.set(table, new Set());
  _handlers.get(table).add(handler);
}

/**
 * Start the realtime subscription.
 * Safe to call multiple times — will not create duplicate channels.
 */
export function startRealtime() {
  if (_isSubscribed || _channel) {
    console.debug('[Realtime] Already subscribed, skipping.');
    return;
  }

  const tables = ['penjualan', 'produksi', 'pembelian', 'bahan', 'produk'];

  _channel = sb.channel('eattie-global-v2');

  tables.forEach(table => {
    _channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      async (payload) => {
        console.debug(`[Realtime] Change on ${table}:`, payload.eventType);
        const handlers = _handlers.get(table);
        if (!handlers) return;
        for (const handler of handlers) {
          try {
            await handler(payload);
          } catch (err) {
            console.error(`[Realtime] Handler error for ${table}:`, err);
          }
        }
      }
    );
  });

  _channel.subscribe(status => {
    console.debug('[Realtime] Status:', status);
    if (status === 'SUBSCRIBED') {
      _isSubscribed = true;
      updateSyncDot('online');
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      _isSubscribed = false;
      updateSyncDot('offline');
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        console.debug('[Realtime] Attempting reconnect...');
        stopRealtime();
        startRealtime();
      }, 3000);
    } else {
      updateSyncDot('syncing');
    }
  });
}

/**
 * Stop and cleanup the realtime subscription.
 * Call on logout to prevent memory leaks.
 */
export function stopRealtime() {
  if (_channel) {
    sb.removeChannel(_channel);
    _channel = null;
    _isSubscribed = false;
    console.debug('[Realtime] Channel removed.');
  }
}

/**
 * Clear all registered handlers.
 * Call on logout.
 */
export function clearRealtimeHandlers() {
  _handlers.clear();
}

/** Update the sync status dot in topbar */
function updateSyncDot(state) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.className = 'sync-dot' +
    (state === 'offline'  ? ' offline'  : '') +
    (state === 'syncing'  ? ' syncing'  : '');
}

// Online/offline browser events
window.addEventListener('online',  () => { updateSyncDot('syncing'); startRealtime(); });
window.addEventListener('offline', () => updateSyncDot('offline'));
