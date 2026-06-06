// ═══════════════════════════════════════════════════════
// reports.js — Laporan Laba Rugi + Audit Log Viewer
// ═══════════════════════════════════════════════════════
import { sb }          from './supabase.js';
import { esc, rp, fmt, fmtDateTime } from './helpers.js';
import { setHTML }     from './ui.js';
import { handleError } from './errors.js';
import { requireRole } from './guard.js';
import { state, getNilaiStokBahan, getNilaiStokProduk } from './store.js';
import { currentRole } from './auth.js';

// ══════════════════════════════════════════════════════
// LAPORAN LABA RUGI
// ══════════════════════════════════════════════════════
export async function renderLaporan() {
  if (!requireRole(currentRole, 'owner')) return;
  try {
    const dari   = document.getElementById('lap-dari')?.value;
    const sampai = document.getElementById('lap-sampai')?.value;

    let qJ = sb.from('penjualan').select('total,channel,produk_id,produk_nama,qty');
    let qP = sb.from('produksi').select('hpp,produk_id,produk_nama,qty');
    let qB = sb.from('pembelian').select('total');

    if (dari)   { qJ = qJ.gte('tanggal', dari); qP = qP.gte('tanggal', dari); qB = qB.gte('tanggal', dari); }
    if (sampai) { qJ = qJ.lte('tanggal', sampai); qP = qP.lte('tanggal', sampai); qB = qB.lte('tanggal', sampai); }

    const [{ data: jData }, { data: pData }, { data: bData }] =
      await Promise.all([qJ, qP, qB]);

    const totJ    = (jData || []).reduce((s, x) => s + (x.total || 0), 0);
    const totH    = (pData || []).reduce((s, x) => s + (x.hpp   || 0), 0);
    const totBeli = (bData || []).reduce((s, x) => s + (x.total || 0), 0);
    const labaK   = totJ - totH;
    const opex    = totBeli * 0.15;
    const labaB   = labaK - opex;
    const pajak   = Math.max(0, labaB) * 0.005;
    const labaBersih = labaB - pajak;
    const margin  = totJ > 0 ? labaBersih / totJ : 0;

    // All values are numbers — rp() formats safely, no XSS risk
    setHTML('lap-lr', `
      <div class="lbox">
        <div class="lr sub"><span>A. Pendapatan Penjualan</span><span>${rp(totJ)}</span></div>
        <div class="lr" style="padding-left:12px"><span>Jumlah Transaksi</span><span>${(jData || []).length} trx</span></div>
        <div class="lr" style="padding-left:12px"><span>Rata-rata/Transaksi</span>
          <span>${rp((jData || []).length ? totJ / (jData || []).length : 0)}</span>
        </div>
      </div>
      <div class="lbox">
        <div class="lr sub"><span>B. HPP Produksi</span><span style="color:var(--rd)">(${rp(totH)})</span></div>
        <div class="lr sub"><span>C. Laba Kotor</span><span style="color:var(--gn)">${rp(labaK)}</span></div>
      </div>
      <div class="lbox">
        <div class="lr sub"><span>D. Est. Biaya Operasional</span><span style="color:var(--rd)">(${rp(opex)})</span></div>
        <div class="lr sub"><span>E. Laba Sebelum Pajak</span><span>${rp(labaB)}</span></div>
        <div class="lr" style="padding-left:12px">
          <span>Pajak UMKM (0.5%)</span><span style="color:var(--rd)">(${rp(pajak)})</span>
        </div>
      </div>
      <div class="lbox" style="background:var(--gnl)">
        <div class="lr tot"><span>💰 LABA BERSIH</span><span>${rp(labaBersih)}</span></div>
        <div class="lr" style="color:var(--gn)">
          <span>Margin Laba Bersih</span><span>${(margin * 100).toFixed(1)}%</span>
        </div>
      </div>
    `);

    _renderChannel(jData || [], totJ);
    _renderTerlaris(jData || []);
    _renderNilaiStok();
  } catch (err) {
    handleError(err, 'reports.renderLaporan');
  }
}

function _renderChannel(jData, totJ) {
  const channels = ['Toko', 'Online', 'Pre-order'];
  setHTML('lap-ch', `<div class="lbox">${
    channels.map(ch => {
      const trx = jData.filter(x => x.channel === ch);
      const tot = trx.reduce((s, x) => s + (x.total || 0), 0);
      const pct = totJ > 0 ? (tot / totJ * 100).toFixed(1) : '0';
      return `<div class="lr">
        <span><span class="badge bg-gn">${esc(ch)}</span> (${trx.length}x)</span>
        <span><b>${rp(tot)}</b> <span style="font-size:12px;color:var(--tm)">${pct}%</span></span>
      </div>`;
    }).join('')
  }</div>`);
}

function _renderTerlaris(jData) {
  const byP = {};
  jData.forEach(x => {
    if (!byP[x.produk_id]) byP[x.produk_id] = { nama: x.produk_nama, qty: 0, total: 0 };
    byP[x.produk_id].qty   += x.qty   || 0;
    byP[x.produk_id].total += x.total || 0;
  });
  const top = Object.values(byP).sort((a, b) => b.total - a.total).slice(0, 5);
  setHTML('lap-top', top.length
    ? `<div class="lbox">${top.map((p, i) => `
        <div class="lr">
          <span>${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${esc(p.nama)}</span>
          <span><b>${rp(p.total)}</b> <span style="font-size:11px;color:var(--tm)">${p.qty}x</span></span>
        </div>`).join('')}</div>`
    : '<div class="lbox" style="text-align:center;color:var(--tm)">Belum ada data</div>'
  );
}

function _renderNilaiStok() {
  const nilaiB = getNilaiStokBahan();
  const nilaiP = getNilaiStokProduk();
  const nilaiJual = Object.values(state.stokProdukCache)
    .reduce((s, p) => s + (p.stok_saat_ini * p.harga || 0), 0);

  setHTML('lap-stok', `<div class="lbox">
    <div class="lr sub"><span>Nilai Stok Bahan Baku (at cost)</span><span>${rp(nilaiB)}</span></div>
    <div class="lr sub"><span>Nilai Stok Produk Jadi (at HPP)</span><span>${rp(nilaiP)}</span></div>
    <div class="lr" style="font-size:12px;color:var(--tm)">
      <span>Potensi Nilai Jual</span><span>${rp(nilaiJual)}</span>
    </div>
    <div class="lr tot"><span>Total Nilai Stok (at HPP)</span><span>${rp(nilaiB + nilaiP)}</span></div>
  </div>`);
}

// ══════════════════════════════════════════════════════
// AUDIT LOG VIEWER — enterprise-grade
// ══════════════════════════════════════════════════════
const AUDIT_PAGE_SIZE = 25;
let _auditPage     = 1;
let _auditFilters  = { dari: '', sampai: '', user: '', tipe: '' };

const TIPE_LABELS = {
  TAMBAH_JUAL:     '💰 Penjualan',
  HAPUS_JUAL:      '🗑 Hapus Jual',
  TAMBAH_BELI:     '🛒 Pembelian',
  HAPUS_BELI:      '🗑 Hapus Beli',
  TAMBAH_PRODUKSI: '🏭 Produksi',
  EDIT_PRODUKSI:   '✏️ Edit Produksi',
  HAPUS_PRODUKSI:  '🗑 Hapus Produksi',
  TAMBAH_BAHAN:    '🌾 Tambah Bahan',
  EDIT_BAHAN:      '✏️ Edit Bahan',
  LOGIN_FAILED:    '🔒 Login Gagal',
};

export async function loadAuditLog() {
  if (!requireRole(currentRole, 'owner')) return;

  // Sync filter state from inputs
  _auditFilters = {
    dari:   document.getElementById('audit-f-dari')?.value   || '',
    sampai: document.getElementById('audit-f-sampai')?.value || '',
    user:   document.getElementById('audit-f-user')?.value   || '',
    tipe:   document.getElementById('audit-f-tipe')?.value   || '',
  };

  try {
    let q = sb.from('ledger')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (_auditFilters.dari)   q = q.gte('created_at', _auditFilters.dari);
    if (_auditFilters.sampai) q = q.lte('created_at', _auditFilters.sampai + 'T23:59:59');
    if (_auditFilters.user)   q = q.ilike('user_email', `%${_auditFilters.user}%`);
    if (_auditFilters.tipe)   q = q.eq('tipe', _auditFilters.tipe);

    q = q.range((_auditPage - 1) * AUDIT_PAGE_SIZE, _auditPage * AUDIT_PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) throw error;

    _renderAuditTable(data || []);
    _renderAuditPagination(count || 0);
  } catch (err) {
    handleError(err, 'reports.loadAuditLog');
  }
}

function _renderAuditTable(rows) {
  const el = document.getElementById('audit-table-body');
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--tm)">Belum ada log</td></tr>`;
    return;
  }

  el.innerHTML = rows.map(e => {
    const tipeLabel = TIPE_LABELS[e.tipe] || esc(e.tipe);

    // Render before/after diff safely
    let diffHtml = '';
    if (e.old_val || e.new_val) {
      const oldStr = e.old_val ? JSON.stringify(e.old_val) : '-';
      const newStr = e.new_val ? JSON.stringify(e.new_val) : '-';
      diffHtml = `
        <div style="font-size:10px;margin-top:4px">
          <span style="color:var(--rd)">▼ ${esc(oldStr)}</span><br>
          <span style="color:var(--gn)">▲ ${esc(newStr)}</span>
        </div>`;
    }

    return `<tr>
      <td style="font-size:11px;color:var(--tm)">${esc(fmtDateTime(e.created_at))}</td>
      <td><b>${tipeLabel}</b>${diffHtml}</td>
      <td style="font-size:11px">${esc(e.ref_id || '-')}</td>
      <td style="font-size:11px">${esc(e.user_email || '-')}</td>
      <td><span class="badge bg-br">${esc(e.role || '-')}</span></td>
    </tr>`;
  }).join('');
}

function _renderAuditPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const el = document.getElementById('audit-pgn');
  if (!el) return;

  const info = document.getElementById('audit-count');
  if (info) info.textContent = `${total} entri`;

  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let btns = `<span class="pgn-info">Hal ${_auditPage}/${totalPages}</span>`;
  const max = Math.min(totalPages, 7);
  for (let i = 1; i <= max; i++) {
    btns += `<button class="pgn-btn${i === _auditPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (totalPages > 7) btns += `<span class="pgn-info">... ${totalPages}</span>`;
  el.innerHTML = btns;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    _auditPage = parseInt(btn.dataset.page);
    loadAuditLog();
  }, { once: true });
}

export function resetAuditFilters() {
  ['audit-f-dari', 'audit-f-sampai', 'audit-f-user'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tipeEl = document.getElementById('audit-f-tipe');
  if (tipeEl) tipeEl.value = '';
  _auditPage = 1;
  loadAuditLog();
}
