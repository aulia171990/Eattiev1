// ════════════════════════════════════════════════════════
// offline.js — Offline queue system (IndexedDB)
// Queues failed writes, auto-syncs when back online
// ════════════════════════════════════════════════════════
import { handleError } from './error.js';

const DB_NAME = 'eattie_offline';
const DB_VER  = 1;
const STORE   = 'queue';
let _db = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('status', 'status');
      }
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbRun(mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, mode);
    const st  = tx.objectStore(STORE);
    const req = fn(st);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

/**
 * Enqueue a write operation for offline retry.
 * @param {object} op - { table, action: 'insert'|'update'|'delete', payload, id }
 */
export async function enqueue(op) {
  const item = {
    id:        op.id || `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    table:     op.table,
    action:    op.action,
    payload:   op.payload,
    status:    'pending',
    attempts:  0,
    createdAt: Date.now(),
  };
  await dbRun('readwrite', st => st.put(item));
  console.log('[OfflineQueue] Enqueued:', item.id, op.table, op.action);
}

/**
 * Flush all pending operations when back online.
 * @param {object} sb - Supabase client
 */
export async function flushQueue(sb) {
  const db  = await openDB();
  const all = await new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('status').getAll('pending');
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });

  if (!all.length) return;
  console.log(`[OfflineQueue] Flushing ${all.length} pending ops`);
  updateSyncIndicator('syncing');

  let failed = 0;
  for (const item of all) {
    try {
      let error;
      if (item.action === 'insert') {
        ({ error } = await sb.from(item.table).insert(item.payload));
      } else if (item.action === 'upsert') {
        ({ error } = await sb.from(item.table).upsert(item.payload, { onConflict: 'id' }));
      } else if (item.action === 'delete') {
        ({ error } = await sb.from(item.table).delete().eq('id', item.payload.id));
      }
      if (error) throw error;

      // Mark as flushed
      item.status = 'flushed';
      await dbRun('readwrite', st => st.put(item));
    } catch (err) {
      item.attempts++;
      item.status = item.attempts >= 3 ? 'failed' : 'pending';
      await dbRun('readwrite', st => st.put(item));
      failed++;
      handleError(err, `OfflineQueue.flush[${item.table}]`, { silent: true });
    }
  }

  updateSyncIndicator(failed === 0 ? 'online' : 'error');
  if (failed > 0) console.warn(`[OfflineQueue] ${failed} ops failed after retry`);
  else console.log('[OfflineQueue] All ops flushed successfully');
}

export async function getPendingCount() {
  const db = await openDB();
  return new Promise(res => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('status').count(IDBKeyRange.only('pending'));
    req.onsuccess = () => res(req.result);
    req.onerror   = () => res(0);
  });
}

function updateSyncIndicator(state) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.className = 'sync-dot' + (state === 'offline' ? ' offline' : state === 'syncing' ? ' syncing' : state === 'error' ? ' error' : '');
}

/** Setup online/offline listeners. Call once in main.js. */
export function setupOfflineSync(sb) {
  window.addEventListener('online',  () => { updateSyncIndicator('online');  flushQueue(sb); });
  window.addEventListener('offline', () => { updateSyncIndicator('offline'); });
  // Initial check
  if (!navigator.onLine) updateSyncIndicator('offline');
}
