// ═══════════════════════════════════════════════════════
// main.js — App Entry Point & Router
// ═══════════════════════════════════════════════════════
import { showPageBasic, closeModal } from './ui.js';
import { onTableChange, startRealtime } from './realtime.js';
import { loadMasterData, refreshStokCache, populateDropdowns } from './store.js';
import { renderDash }    from './dashboard.js';
import { renderLaporan, loadAuditLog, resetAuditFilters } from './reports.js';
import {
  renderStokBahan, renderStokProduk, renderResep,
  loadBOM, addBOMRow, simpanBOM, renderBOMSummary,
  editBahan, simpanBahan, resetFormBahan
} from './inventory.js';
import {
  loadProduksi, cekBOM, tambahProduksi,
  editProduksi, hitungHPPEdit, recalcBOM, saveEditProduksi
} from './production.js';
import { hitungJual, loadPenjualan, tambahJual, resetFilterJual } from './sales.js';
import { loadPembelian, tambahBeli } from './purchase.js';
import {
  renderMasterProduk, editProdukMaster,
  simpanProduk, resetFormProduk, loadUsers
} from './master.js';
import {
  doLogin, doLogout, doRegister,
  checkGate, checkGateOnLoad,
  showLogin, showRegister, extendSession,
  registerOnLoginCallback,   // ← Fix: inject callback, break circular dep
  currentRole
} from './auth.js';


import { registerGlobalErrorHandlers } from './errors.js';
// This is the fix for auth.js ↔ main.js circular dependency.
// auth.js calls this function after successful login instead of
// directly importing initApp from main.js.
registerOnLoginCallback(initApp);

// ── Register global error handlers ────────────────────
registerGlobalErrorHandlers();

// ── Start gate check ──────────────────────────────────
checkGateOnLoad();

// ── Expose to HTML onclick handlers ───────────────────
// NOTE: showPage is defined in this file (not imported), so it must be
// added to window separately before the Object.assign block.
window.showPage = showPage;

Object.assign(window, {
  // Auth
  checkGate, checkGateOnLoad, doLogin, doLogout, doRegister,
  showLogin, showRegister, extendSession,
  // Nav
  showPage,
  // Sales
  hitungJual, loadPenjualan, tambahJual, resetFilterJual,
  // Purchase
  loadPembelian, tambahBeli,
  // Production
  cekBOM, tambahProduksi, editProduksi,
  hitungHPPEdit, recalcBOM, saveEditProduksi,
  // Inventory
  renderStokBahan, renderStokProduk,
  editBahan, simpanBahan, resetFormBahan,
  addBOMRow, simpanBOM, loadBOM,
  // Master
  simpanProduk, resetFormProduk, editProdukMaster,
  // Reports
  renderLaporan, loadAuditLog, resetAuditFilters,
  // UI
  closeModal,
});

// ── Page render map ────────────────────────────────────
const PAGE_RENDERERS = {
  dashboard:     async () => renderDash(),
  penjualan:     async () => { hitungJual(); await loadPenjualan(); },
  pembelian:     async () => loadPembelian(),
  produksi:      async () => { cekBOM(); await loadProduksi(); },
  'stok-bahan':  async () => renderStokBahan(),
  'stok-produk': async () => renderStokProduk(),
  resep:         async () => renderResep(),
  master:        async () => { renderMasterProduk(); await loadUsers(); },
  laporan:       async () => renderLaporan(),
  audit:         async () => loadAuditLog(),
};

export function showPage(name, btn) {
  showPageBasic(name, btn);     // basic DOM switch
  PAGE_RENDERERS[name]?.();     // data render (async, fire-and-forget)
}

// ── App initialisation (called after login) ───────────
export async function initApp() {
  // 1. Load master data + stok
  await loadMasterData();
  await refreshStokCache();
  populateDropdowns();

  // 2. Register realtime handlers
  _registerRealtimeHandlers();

  // 3. Start realtime subscription (singleton — safe to call multiple times)
  startRealtime();

  // 4. Render dashboard
  await renderDash();
}

// ── Realtime handler registration ─────────────────────
function _registerRealtimeHandlers() {
  // Penjualan change → refresh stok + dash + sales list
  onTableChange('penjualan', async () => {
    await refreshStokCache();
    renderDash();
    if (_isActive('page-penjualan')) await loadPenjualan();
  });

  // Produksi change → refresh stok + dash + prod list
  onTableChange('produksi', async () => {
    await refreshStokCache();
    renderDash();
    if (_isActive('page-produksi')) await loadProduksi();
    if (_isActive('page-stok-bahan'))  renderStokBahan();
    if (_isActive('page-stok-produk')) renderStokProduk();
  });

  // Pembelian change → refresh stok + dash + beli list
  onTableChange('pembelian', async () => {
    await refreshStokCache();
    renderDash();
    if (_isActive('page-pembelian'))   await loadPembelian();
    if (_isActive('page-stok-bahan'))  renderStokBahan();
  });

  // Bahan change → reload master + stok
  onTableChange('bahan', async () => {
    await loadMasterData();
    await refreshStokCache();
    populateDropdowns();
    renderDash();
    if (_isActive('page-stok-bahan')) renderStokBahan();
  });

  // Produk change → reload master
  onTableChange('produk', async () => {
    await loadMasterData();
    populateDropdowns();
    renderDash();
    if (_isActive('page-master')) renderMasterProduk();
  });
}

/** Check if a page is currently visible */
function _isActive(pageId) {
  return document.getElementById(pageId)?.classList.contains('active') ?? false;
}
