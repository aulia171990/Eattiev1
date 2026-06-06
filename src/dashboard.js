// ═══════════════════════════════════════════════════════
// dashboard.js — Dashboard Module
// XSS-safe rendering, debounced refresh
// ═══════════════════════════════════════════════════════
import { sb }          from './supabase.js';
import { esc, rp, fmt, debounce } from './helpers.js';
import { setHTML, renderEmpty }   from './ui.js';
import { handleError }            from './errors.js';
import {
  state, getStokBahan, getStokProduk,
  getNilaiStokBahan, getNilaiStokProduk
} from './store.js';

// ── Debounced render — prevents dashboard storm ────────
export const renderDash = debounce(_renderDash, 400);

async function _renderDash() {
  try {
    await Promise.all([
      renderKPI(),
      renderAlerts(),
      renderRecentSales(),
      renderBahanKritis(),
      renderStokProdukDash(),
    ]);
  } catch (err) {
    handleError(err, 'dashboard.renderDash');
  }
}

// ── KPI Cards ──────────────────────────────────────────
async function renderKPI() {
  const [jRes, hRes] = await Promise.all([
    sb.from('penjualan').select('total.sum()'),
    sb.from('produksi').select('hpp.sum()'),
  ]);

  const totJ  = parseFloat(jRes.data?.[0]?.sum || 0);
  const totH  = parseFloat(hRes.data?.[0]?.sum || 0);
  const laba  = totJ - totH;
  const totSP = getNilaiStokProduk();

  // KPI values are numbers — no XSS risk, but use rp() for formatting
  setHTML('dash-kpi', `
    <div class="kpi g">
      <div class="kpi-label">Total Pendapatan</div>
      <div class="kpi-value g">${rp(totJ)}</div>
    </div>
    <div class="kpi r">
      <div class="kpi-label">Total HPP</div>
      <div class="kpi-value r">${rp(totH)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Laba Kotor</div>
      <div class="kpi-value">${rp(laba)}</div>
    </div>
    <div class="kpi o">
      <div class="kpi-label">Nilai Stok (HPP)</div>
      <div class="kpi-value o">${rp(totSP)}</div>
    </div>
  `);
}

// ── Alerts ─────────────────────────────────────────────
function renderAlerts() {
  const habisB  = Object.values(state.stokBahanCache).filter(b => b.stok_akhir <= 0);
  const hampirB = Object.values(state.stokBahanCache).filter(b => b.stok_akhir > 0 && b.stok_akhir <= b.stok_min);
  const habisP  = Object.values(state.stokProdukCache).filter(p => p.stok_saat_ini <= 0);

  let html = '';
  // esc() applied to all name strings from database
  if (habisB.length)
    html += `<div class="alert danger">🔴 Bahan HABIS: ${habisB.map(b => esc(b.nama)).join(', ')}</div>`;
  if (hampirB.length)
    html += `<div class="alert">⚠️ Bahan hampir habis: ${hampirB.map(b => esc(b.nama)).join(', ')}</div>`;
  if (habisP.length)
    html += `<div class="alert">🍞 Produk stok 0: ${habisP.map(p => esc(p.nama)).join(', ')}</div>`;

  setHTML('dash-alerts', html);
}

// ── Recent Sales ───────────────────────────────────────
async function renderRecentSales() {
  const { data, error } = await sb
    .from('penjualan')
    .select('produk_nama,qty,total,channel')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  const tbody = document.querySelector('#t-dash-jual tbody');
  if (!tbody) return;

  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--tm)">Belum ada transaksi</td></tr>`;
    return;
  }

  // esc() on all database strings
  tbody.innerHTML = data.map(x => `
    <tr>
      <td>${esc(x.produk_nama)}</td>
      <td>${esc(String(x.qty))}</td>
      <td><b>${rp(x.total)}</b></td>
      <td><span class="badge bg-gn">${esc(x.channel)}</span></td>
    </tr>
  `).join('');
}

// ── Bahan Kritis ───────────────────────────────────────
function renderBahanKritis() {
  const kritis = [
    ...Object.values(state.stokBahanCache).filter(b => b.stok_akhir <= 0),
    ...Object.values(state.stokBahanCache).filter(b => b.stok_akhir > 0 && b.stok_akhir <= b.stok_min),
  ];

  const el = document.getElementById('dash-bahan-kritis');
  if (!el) return;

  if (!kritis.length) {
    el.innerHTML = `<div style="text-align:center;padding:12px;color:var(--tm)">✅ Semua stok bahan aman</div>`;
    return;
  }

  el.innerHTML = kritis.map(b => {
    const habis  = b.stok_akhir <= 0;
    const bc     = habis ? 'bg-rd' : 'bg-yl';
    const label  = habis ? '🔴 Habis' : '🟡 Hampir';
    return `<div class="lr">
      <span>${esc(b.nama)}</span>
      <span>
        <b>${fmt(b.stok_akhir)} ${esc(b.satuan)}</b>
        <span class="badge ${bc}">${label}</span>
      </span>
    </div>`;
  }).join('');
}

// ── Stok Produk Summary ────────────────────────────────
function renderStokProdukDash() {
  const el = document.getElementById('dash-stok-produk');
  if (!el) return;

  const items = Object.values(state.stokProdukCache);
  if (!items.length) {
    el.innerHTML = `<div style="text-align:center;padding:12px;color:var(--tm)">Belum ada data produk</div>`;
    return;
  }

  el.innerHTML = items.map(p => {
    const s  = p.stok_saat_ini;
    const bc = s <= 0 ? 'bg-rd' : s <= p.stok_min ? 'bg-yl' : 'bg-gn';
    const st = s <= 0 ? '⚠️ Habis' : s <= p.stok_min ? '🟡 Rendah' : '🟢 Aman';
    return `<div class="lr">
      <span>${esc(p.nama)}</span>
      <span>
        <b>${fmt(s, 0)} ${esc(p.satuan)}</b>
        <span class="badge ${bc}">${st}</span>
      </span>
    </div>`;
  }).join('');
}
