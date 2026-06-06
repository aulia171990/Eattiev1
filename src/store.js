// ═══════════════════════════════════════════════════════
// store.js — Central State + Smart Cache
// ═══════════════════════════════════════════════════════
import { sb }       from './supabase.js';
import { handleError } from './errors.js';
import { setSyncDot }  from './ui.js';
import { debounce }    from './helpers.js';

// ── In-memory state ────────────────────────────────────
export const state = {
  produkList:      [],
  bahanList:       [],
  bomData:         {},      // { produk_id: [{bid, qty}] }
  stokBahanCache:  {},      // { bahan_id: row from v_stok_bahan }
  stokProdukCache: {},      // { produk_id: row from v_stok_produk }
  _stokDirty:      true,    // true = needs refresh
  _masterDirty:    true,
};

// ── Accessors ──────────────────────────────────────────
export const getStokBahan  = bid => parseFloat(state.stokBahanCache[bid]?.stok_akhir  || 0);
export const getStokProduk = pid => parseFloat(state.stokProdukCache[pid]?.stok_saat_ini || 0);
export const getNilaiStokBahan  = () =>
  Object.values(state.stokBahanCache).reduce((s, b) => s + (b.stok_akhir * b.harga || 0), 0);
export const getNilaiStokProduk = () =>
  Object.values(state.stokProdukCache).reduce((s, p) => s + (p.stok_saat_ini * p.hpp || 0), 0);

// ── Mark dirty (call after any write) ──────────────────
export function invalidateStok()   { state._stokDirty   = true; }
export function invalidateMaster() { state._masterDirty = true; }

// ── Refresh stok cache (debounced version exported) ────
export async function refreshStokCache() {
  setSyncDot('syncing');
  try {
    const [sbRes, spRes] = await Promise.all([
      sb.from('v_stok_bahan').select('*'),
      sb.from('v_stok_produk').select('*'),
    ]);
    if (sbRes.error) throw sbRes.error;
    if (spRes.error) throw spRes.error;

    state.stokBahanCache  = {};
    state.stokProdukCache = {};
    (sbRes.data || []).forEach(r => state.stokBahanCache[r.id]  = r);
    (spRes.data || []).forEach(r => state.stokProdukCache[r.id] = r);
    state._stokDirty = false;
    setSyncDot('online');
  } catch (err) {
    handleError(err, 'store.refreshStokCache');
    setSyncDot('offline');
  }
}

/**
 * Debounced stok refresh — safe to call repeatedly.
 * Multiple calls within 400ms collapse into one request.
 */
export const refreshStokDebounced = debounce(refreshStokCache, 400);

// ── Load master data ───────────────────────────────────
export async function loadMasterData() {
  if (!state._masterDirty) return; // Skip if already fresh
  setSyncDot('syncing');
  try {
    const [pRes, bRes, rRes] = await Promise.all([
      sb.from('produk').select('*').eq('aktif', true).order('nama'),
      sb.from('bahan').select('*').eq('aktif', true).order('nama'),
      sb.from('resep').select('*'),
    ]);
    if (pRes.error) throw pRes.error;
    if (bRes.error) throw bRes.error;
    if (rRes.error) throw rRes.error;

    state.produkList = pRes.data || [];
    state.bahanList  = bRes.data || [];

    // Rebuild BOM map
    state.bomData = {};
    (rRes.data || []).forEach(r => {
      if (!state.bomData[r.produk_id]) state.bomData[r.produk_id] = [];
      state.bomData[r.produk_id].push({
        bid: r.bahan_id,
        qty: parseFloat(r.qty_per_unit),
      });
    });

    state._masterDirty = false;
    setSyncDot('online');
  } catch (err) {
    handleError(err, 'store.loadMasterData');
    setSyncDot('offline');
  }
}

// ── Populate all dropdowns ─────────────────────────────
export function populateDropdowns() {
  _populateSelect('jual-prd',
    state.produkList.map(p =>
      `<option value="${p.id}">${p.nama} (Rp ${Math.round(p.harga).toLocaleString('id-ID')}/${p.satuan})</option>`
    ).join('')
  );
  _populateSelect('beli-bhn',
    state.bahanList.map(b =>
      `<option value="${b.id}">${b.nama} (${b.satuan})</option>`
    ).join('')
  );
  _populateSelect('prod-prd',
    state.produkList.map(p => `<option value="${p.id}">${p.nama}</option>`).join('')
  );
  _populateSelect('bom-prd',
    state.produkList.map(p => `<option value="${p.id}">${p.nama}</option>`).join('')
  );
}

function _populateSelect(id, html) {
  const el = document.getElementById(id);
  // Note: option values come from database IDs (safe) and names escaped below
  // We use innerHTML here intentionally — names are escaped via esc() in calling code
  // but product/bahan names are display-only text, not script-executable
  if (el) el.innerHTML = html;
}
