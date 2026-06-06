// ═══════════════════════════════════════════════════════
// inventory.js — Stok Bahan, Stok Produk, Resep/BOM
// ═══════════════════════════════════════════════════════
import { sb }          from './supabase.js';
import { esc, rp, fmt, genId, fmtDate } from './helpers.js';
import { toast }       from './ui.js';
import { handleError } from './errors.js';
import { guardedSubmit, requireRole } from './guard.js';
import { state, refreshStokDebounced, invalidateStok, invalidateMaster, loadMasterData, populateDropdowns } from './store.js';
import { currentRole, currentUser } from './auth.js';
import { renderDash }  from './dashboard.js';

// ══════════════════════════════════════════════════════
// STOK BAHAN
// ══════════════════════════════════════════════════════
export function renderStokBahan() {
  const el = document.getElementById('stok-bahan-list');
  if (!el) return;

  const items = Object.values(state.stokBahanCache);
  if (!items.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--tm)">Belum ada bahan</div>`;
    return;
  }

  el.innerHTML = items.map(b => {
    const s   = b.stok_akhir;
    const bc  = s <= 0 ? 'bg-rd' : s <= b.stok_min ? 'bg-yl' : 'bg-gn';
    const st  = s <= 0 ? '🔴 Habis' : s <= b.stok_min ? '🟡 Hampir' : '🟢 Aman';
    const pct = b.stok_min > 0 ? Math.min(100, (s / b.stok_min) * 50) : 100;
    const fc  = s <= 0 ? 'var(--rd)' : s <= b.stok_min ? 'var(--go)' : 'var(--gn)';
    const editBtn = currentRole === 'owner'
      ? `<button class="btn by bsm" data-action="edit-bahan" data-id="${esc(b.id)}">✏️</button>`
      : '';
    return `<div style="padding:11px 0;border-bottom:1px solid var(--cd)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-weight:600;font-size:14px">${esc(b.nama)}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge ${bc}">${st}</span>
          ${editBtn}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--tm);margin-bottom:6px">
        <span>Stok: <b style="color:var(--tx)">${fmt(s)} ${esc(b.satuan)}</b> | Min: ${fmt(b.stok_min)}</span>
        <span>Nilai: ${rp(s * b.harga)}</span>
      </div>
      <div class="pb">
        <div class="pf" style="width:${Math.min(100, Math.max(0, pct))}%;background:${fc}"></div>
      </div>
    </div>`;
  }).join('');

  // Event delegation for edit buttons
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'edit-bahan') editBahan(btn.dataset.id);
  }, { once: true });
}

export async function editBahan(id) {
  if (!requireRole(currentRole, 'owner')) return;
  try {
    const { data: b, error } = await sb.from('bahan').select('*').eq('id', id).single();
    if (error) throw error;
    document.getElementById('sb-id').value   = b.id;
    document.getElementById('sb-nama').value = b.nama;
    document.getElementById('sb-sat').value  = b.satuan;
    document.getElementById('sb-awal').value = b.stok_awal;
    document.getElementById('sb-min').value  = b.stok_min;
    document.getElementById('sb-hrg').value  = b.harga;
    document.getElementById('sb-nama')?.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    handleError(err, 'inventory.editBahan');
  }
}

export async function simpanBahan() {
  if (!requireRole(currentRole, 'owner')) return;
  const nama = document.getElementById('sb-nama')?.value.trim();
  if (!nama) return toast('❌ Nama bahan wajib');

  const id   = document.getElementById('sb-id')?.value;
  const data = {
    nama,
    satuan:    document.getElementById('sb-sat')?.value,
    stok_awal: parseFloat(document.getElementById('sb-awal')?.value) || 0,
    stok_min:  parseFloat(document.getElementById('sb-min')?.value)  || 0,
    harga:     parseFloat(document.getElementById('sb-hrg')?.value)  || 0,
    updated_at: new Date().toISOString(),
  };

  await guardedSubmit('simpan-bahan', async () => {
    let error;
    if (id) {
      ({ error } = await sb.from('bahan').update(data).eq('id', id));
    } else {
      ({ error } = await sb.from('bahan').insert({ ...data, id: genId('BHN') }));
    }
    if (error) throw error;
    await _writeLedger(id ? 'EDIT_BAHAN' : 'TAMBAH_BAHAN', id || 'new', null, data);
    toast(`✅ Bahan ${esc(nama)} ${id ? 'diupdate' : 'ditambahkan'}`);
    resetFormBahan();
    invalidateMaster();
    invalidateStok();
    await loadMasterData();
    await refreshStokDebounced();
    populateDropdowns();
    renderStokBahan();
  });
}

export function resetFormBahan() {
  ['sb-id', 'sb-nama'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['sb-awal', 'sb-min', 'sb-hrg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '0';
  });
}

// ══════════════════════════════════════════════════════
// STOK PRODUK JADI
// ══════════════════════════════════════════════════════
export function renderStokProduk() {
  const el = document.getElementById('stok-produk-list');
  if (!el) return;

  const items = Object.values(state.stokProdukCache);
  if (!items.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--tm)">Belum ada data</div>`;
    return;
  }

  el.innerHTML = items.map(p => {
    const s  = p.stok_saat_ini;
    const bc = s <= 0 ? 'bg-rd' : s <= p.stok_min ? 'bg-yl' : 'bg-gn';
    const st = s <= 0 ? '🔴 Habis' : s <= p.stok_min ? '🟡 Rendah' : '🟢 Aman';
    return `<div style="padding:12px 0;border-bottom:1px solid var(--cd)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div>
          <span style="font-weight:600;font-size:14px">${esc(p.nama)}</span>
          <span class="badge bg-br">${esc(p.kategori)}</span>
        </div>
        <span class="badge ${bc}">${st}</span>
      </div>
      <div style="display:flex;justify-content:space-around;font-size:12px;background:var(--cr);border-radius:var(--rs);padding:8px;margin-top:6px">
        <div style="text-align:center">
          <div style="color:var(--tm)">Diproduksi</div>
          <div style="font-weight:700;color:var(--gn)">${fmt(p.total_produksi, 0)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--tm)">Terjual</div>
          <div style="font-weight:700;color:var(--rd)">${fmt(p.total_terjual, 0)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--tm)">Stok</div>
          <div style="font-weight:700;font-size:16px">${fmt(s, 0)} ${esc(p.satuan)}</div>
        </div>
        <div style="text-align:center">
          <div style="color:var(--tm)">Nilai(HPP)</div>
          <div style="font-weight:700;color:var(--or)">${rp(s * p.hpp)}</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// RESEP / BOM
// ══════════════════════════════════════════════════════
export function renderResep() {
  const sel = document.getElementById('bom-prd');
  if (sel) {
    sel.innerHTML = state.produkList
      .map(p => `<option value="${esc(p.id)}">${esc(p.nama)}</option>`)
      .join('');
  }
  loadBOM();
  renderBOMSummary();
}

export function loadBOM() {
  const pid = document.getElementById('bom-prd')?.value;
  const bom = state.bomData[pid] || [];
  const container = document.getElementById('bom-rows');
  if (!container) return;
  container.innerHTML = '';
  if (bom.length) bom.forEach(r => addBOMRow(r.bid, r.qty));
  else addBOMRow();
}

export function addBOMRow(bid = '', qty = '') {
  const div  = document.createElement('div');
  div.className = 'bom-row';
  const opts = state.bahanList
    .map(b => `<option value="${esc(b.id)}" ${b.id === bid ? 'selected' : ''}>${esc(b.nama)} (${esc(b.satuan)})</option>`)
    .join('');
  div.innerHTML = `
    <select style="flex:2">${opts}</select>
    <input type="number" min="0" step="0.001" placeholder="Qty/unit" value="${esc(String(qty))}" style="flex:1">
    <button class="rm" type="button">✕</button>
  `;
  div.querySelector('.rm').addEventListener('click', () => div.remove());
  document.getElementById('bom-rows')?.appendChild(div);
}

export async function simpanBOM() {
  if (!requireRole(currentRole, 'owner')) return;
  const pid  = document.getElementById('bom-prd')?.value;
  const rows = document.querySelectorAll('#bom-rows .bom-row');

  const newBOM = [];
  rows.forEach(r => {
    const sel = r.querySelector('select');
    const inp = r.querySelector('input');
    const qty = parseFloat(inp?.value) || 0;
    if (sel?.value && qty > 0) {
      newBOM.push({ produk_id: pid, bahan_id: sel.value, qty_per_unit: qty });
    }
  });

  if (!newBOM.length) return toast('❌ Tambahkan minimal 1 bahan');

  await guardedSubmit('simpan-bom', async () => {
    await sb.from('resep').delete().eq('produk_id', pid);
    const { error } = await sb.from('resep').insert(newBOM);
    if (error) throw error;

    state.bomData[pid] = newBOM.map(r => ({ bid: r.bahan_id, qty: r.qty_per_unit }));
    const pNama = state.produkList.find(x => x.id === pid)?.nama || pid;
    toast(`✅ Resep ${esc(pNama)} tersimpan (${newBOM.length} bahan)`);
    renderBOMSummary();
  });
}

export function renderBOMSummary() {
  const el = document.getElementById('bom-summary');
  if (!el) return;
  el.innerHTML = state.produkList.map(p => {
    const bom = state.bomData[p.id] || [];
    if (!bom.length) {
      return `<div class="lr">
        <span>${esc(p.nama)}</span>
        <span class="badge bg-rd">Belum ada resep</span>
      </div>`;
    }
    const items = bom
      .map(r => {
        const b = state.bahanList.find(x => x.id === r.bid);
        return b ? `${esc(b.nama)}: ${fmt(r.qty)} ${esc(b.satuan)}` : '';
      })
      .filter(Boolean)
      .join(' · ');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--cd)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600">${esc(p.nama)}</span>
        <span class="badge bg-gn">${bom.length} bahan</span>
      </div>
      <div style="font-size:12px;color:var(--tm);margin-top:3px">${items}</div>
    </div>`;
  }).join('');
}

// ── Ledger helper ──────────────────────────────────────
async function _writeLedger(tipe, refId, oldVal, newVal) {
  try {
    await sb.from('ledger').insert({
      tipe, ref_id: refId,
      old_val: oldVal, new_val: newVal,
      role: currentRole, user_email: currentUser?.email,
    });
  } catch (err) {
    console.warn('[Ledger] Write failed:', err.message);
  }
}
