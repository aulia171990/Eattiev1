// ═══════════════════════════════════════════════════════
// production.js — Produksi Module
// Safe BOM transaction, XSS-safe, guarded submit
// ═══════════════════════════════════════════════════════
import { sb }          from './supabase.js';
import { esc, rp, fmt, today, genId, fmtDate } from './helpers.js';
import { toast, openModal, closeModal } from './ui.js';
import { handleError } from './errors.js';
import { guardedSubmit, requireRole, requireOnline } from './guard.js';
import {
  state, getStokBahan, getStokProduk,
  refreshStokDebounced, invalidateStok
} from './store.js';
import { currentRole, currentNama, currentUser } from './auth.js';
import { renderDash }  from './dashboard.js';
import { renderStokBahan, renderStokProduk } from './inventory.js';

// ══════════════════════════════════════════════════════
// LOG PRODUKSI
// ══════════════════════════════════════════════════════
export async function loadProduksi() {
  try {
    const { data, error } = await sb
      .from('produksi')
      .select('*')
      .order('tanggal',    { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const tbody = document.querySelector('#t-prod tbody');
    if (!tbody) return;

    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--tm)">Belum ada data</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(x => {
      const actionBtns = currentRole === 'owner'
        ? `<div style="display:flex;gap:4px">
            <button class="btn by bsm"
              data-action="edit-produksi"
              data-id="${esc(x.id)}"
              data-qty="${x.qty}"
              data-bhn="${x.biaya_bahan}"
              data-tng="${x.biaya_tenaga}"
              data-ovh="${x.biaya_overhead}"
              data-pet="${esc(x.petugas || '')}"
              data-pid="${esc(x.produk_id)}">✏️</button>
            <button class="btn br2 bsm"
              data-action="hapus-produksi"
              data-id="${esc(x.id)}"
              data-qty="${x.qty}"
              data-pid="${esc(x.produk_id)}">🗑</button>
           </div>`
        : '';
      return `<tr>
        <td>${esc(fmtDate(x.tanggal))}</td>
        <td>${esc(x.produk_nama)}</td>
        <td>${esc(String(x.qty))}</td>
        <td><b>${rp(x.hpp)}</b></td>
        <td>${esc(x.shift)}</td>
        <td>${actionBtns}</td>
      </tr>`;
    }).join('');

    // Event delegation
    tbody.addEventListener('click', _handleProduksiTableClick, { once: true });
  } catch (err) {
    handleError(err, 'production.loadProduksi');
  }
}

function _handleProduksiTableClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id, qty, bhn, tng, ovh, pet, pid } = btn.dataset;
  if (action === 'edit-produksi')
    editProduksi(id, parseFloat(qty), parseFloat(bhn), parseFloat(tng), parseFloat(ovh), pet, pid);
  if (action === 'hapus-produksi')
    hapusProduksi(id, parseFloat(qty), pid);
}

// ══════════════════════════════════════════════════════
// CEK BOM (preview kebutuhan bahan)
// ══════════════════════════════════════════════════════
export async function cekBOM() {
  const sel = document.getElementById('prod-prd');
  if (!sel?.options.length) return;
  const pid = sel.value;
  const qty = parseFloat(document.getElementById('prod-qty')?.value) || 1;
  const bom = state.bomData[pid] || [];
  const prev = document.getElementById('bom-preview');
  if (!prev) return;

  if (!bom.length) {
    prev.innerHTML = `<div class="info-box" style="background:var(--rdl);color:var(--rd)">
      ⚠️ Belum ada resep untuk produk ini. Buat di menu Resep.
    </div>`;
    return;
  }

  let html      = `<div class="sec-label">Kebutuhan Bahan (${qty} unit)</div>`;
  let totalBhn  = 0;
  let ada_masalah = false;

  bom.forEach(r => {
    const b = state.bahanList.find(x => x.id === r.bid);
    if (!b) return;
    const butuh = r.qty * qty;
    const stok  = getStokBahan(b.id);
    const ok    = stok >= butuh;
    if (!ok) ada_masalah = true;
    totalBhn += butuh * b.harga;

    html += `<div class="bom-row" style="background:${ok ? 'var(--gnl)' : 'var(--rdl)'}">
      <span style="flex:1;font-size:13px;font-weight:600">${esc(b.nama)}</span>
      <span style="font-size:12px;color:var(--tm)">${fmt(butuh)} ${esc(b.satuan)}</span>
      <span class="badge ${ok ? 'bg-gn' : 'bg-rd'}" style="margin-left:6px">
        ${ok ? `✅ ${fmt(stok)}` : `❌ ${fmt(stok)}`}
      </span>
    </div>`;
  });

  html += `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--tm);padding:4px 2px">
    <span>Est. Biaya Bahan</span><span><b>${rp(totalBhn)}</b></span>
  </div>`;

  prev.innerHTML = html;

  const bhnEl  = document.getElementById('prod-bhn');
  const infoEl = document.getElementById('prod-info');
  if (bhnEl)  bhnEl.value = Math.round(totalBhn);
  if (infoEl) infoEl.innerHTML = ada_masalah
    ? `<div style="color:var(--rd)">❌ Stok bahan tidak cukup! Lakukan pembelian terlebih dahulu.</div>`
    : `🌾 Stok cukup. Produk jadi akan +${qty} unit setelah simpan.`;
}

// ══════════════════════════════════════════════════════
// TAMBAH PRODUKSI (safe atomic transaction)
// ══════════════════════════════════════════════════════
export async function tambahProduksi() {
  if (!requireRole(currentRole, 'owner', 'baker')) return;
  if (!requireOnline()) return;

  await guardedSubmit('tambah-produksi', async () => {
    const sel = document.getElementById('prod-prd');
    const p   = state.produkList.find(x => x.id === sel?.value);
    if (!p) return toast('❌ Pilih produk');

    const qty = parseFloat(document.getElementById('prod-qty')?.value) || 0;
    if (qty <= 0) return toast('❌ Qty harus > 0');

    const bom = state.bomData[p.id] || [];

    // Pre-flight: re-fetch stok terkini
    toast('⏳ Mengecek stok terkini...');
    await refreshStokDebounced();

    // Validate stok per bahan
    for (const r of bom) {
      const b = state.bahanList.find(x => x.id === r.bid);
      if (!b) continue;
      const butuh = r.qty * qty;
      const stok  = getStokBahan(b.id);
      if (stok < butuh) {
        return toast(
          `❌ Stok ${esc(b.nama)} tidak cukup!\n` +
          `Dibutuhkan: ${fmt(butuh)}, Tersedia: ${fmt(stok)} ${b.satuan}`
        );
      }
    }

    const bhn = parseFloat(document.getElementById('prod-bhn')?.value) || 0;
    const tng = parseFloat(document.getElementById('prod-tng')?.value) || 0;
    const ovh = parseFloat(document.getElementById('prod-ovh')?.value) || 0;

    // Idempotency key generated client-side
    const produksiId = genId('BCH');

    let insertError = null;
    try {
      const { error } = await sb.from('produksi').insert({
        id:             produksiId,
        tanggal:        today(),
        produk_id:      p.id,
        produk_nama:    p.nama,
        qty,
        shift:          document.getElementById('prod-shift')?.value || 'Pagi',
        biaya_bahan:    bhn,
        biaya_tenaga:   tng,
        biaya_overhead: ovh,
        petugas:        document.getElementById('prod-pet')?.value || currentNama,
        created_by:     currentUser?.email,
      });
      insertError = error;
    } catch (networkErr) {
      // Network timeout — check if record was saved via idempotency key
      toast('⚠️ Koneksi terputus. Mengecek status...');
      await new Promise(r => setTimeout(r, 2000));
      const { data: cek } = await sb
        .from('produksi').select('id').eq('id', produksiId).maybeSingle();
      if (cek) {
        toast('✅ Data sudah tersimpan sebelum koneksi putus!');
      } else {
        toast('❌ Gagal menyimpan. Silakan coba lagi.');
      }
      await refreshStokDebounced();
      await cekBOM();
      await loadProduksi();
      renderDash();
      return;
    }

    if (insertError) {
      // Duplicate key = user double-clicked
      if (insertError.code === '23505') {
        toast('⚠️ Produksi ini sudah tersimpan (duplicate).');
      } else {
        throw insertError;
      }
    } else {
      await _writeLedger('TAMBAH_PRODUKSI', produksiId, null,
        { produk: p.nama, qty, hpp: bhn + tng + ovh }
      );
      toast(`✅ Batch ${produksiId}: +${qty} ${p.satuan} ${esc(p.nama)}`);
    }

    invalidateStok();
    await refreshStokDebounced();
    await cekBOM();
    await loadProduksi();
    renderDash();
  }, { loadingText: '⏳ Menyimpan produksi...' });
}

// ══════════════════════════════════════════════════════
// EDIT PRODUKSI (owner only)
// ══════════════════════════════════════════════════════
export function editProduksi(id, qty, bhn, tng, ovh, pet, pid) {
  if (!requireRole(currentRole, 'owner')) return;

  const epId = document.getElementById('ep-id');
  if (epId) { epId.value = id; epId.dataset.pid = pid; }

  const fields = { 'ep-qty': qty, 'ep-bhn': bhn, 'ep-tng': tng, 'ep-ovh': ovh };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  const petEl = document.getElementById('ep-pet');
  if (petEl) petEl.value = pet;

  hitungHPPEdit();
  openModal('modal-edit-prod');
}

export function hitungHPPEdit() {
  const pid = document.getElementById('ep-id')?.dataset.pid;
  const qty = parseFloat(document.getElementById('ep-qty')?.value) || 0;

  if (pid && qty > 0) {
    const bomEst = (state.bomData[pid] || []).reduce((s, r) => {
      const b = state.bahanList.find(x => x.id === r.bid);
      return s + (b ? r.qty * qty * b.harga : 0);
    }, 0);
    const bomEl = document.getElementById('ep-bhn-bom');
    if (bomEl) bomEl.textContent = rp(bomEst) + ' (BOM)';
  }

  const bhn = parseFloat(document.getElementById('ep-bhn')?.value) || 0;
  const tng = parseFloat(document.getElementById('ep-tng')?.value) || 0;
  const ovh = parseFloat(document.getElementById('ep-ovh')?.value) || 0;
  const prevEl = document.getElementById('ep-hpp-preview');
  if (prevEl) prevEl.textContent = rp(bhn + tng + ovh);
}

export function recalcBOM() {
  const pid = document.getElementById('ep-id')?.dataset.pid;
  const qty = parseFloat(document.getElementById('ep-qty')?.value) || 0;
  if (!pid || !qty) return;

  const bomEst = (state.bomData[pid] || []).reduce((s, r) => {
    const b = state.bahanList.find(x => x.id === r.bid);
    return s + (b ? r.qty * qty * b.harga : 0);
  }, 0);

  const bhnEl = document.getElementById('ep-bhn');
  if (bhnEl) bhnEl.value = Math.round(bomEst);
  hitungHPPEdit();
  toast('🔄 Biaya bahan direcalc dari BOM');
}

export async function saveEditProduksi() {
  if (!requireRole(currentRole, 'owner')) return;

  const id       = document.getElementById('ep-id')?.value;
  const pid      = document.getElementById('ep-id')?.dataset.pid;
  const qtyBaru  = parseFloat(document.getElementById('ep-qty')?.value) || 0;
  if (qtyBaru <= 0) return toast('❌ Qty tidak valid');

  await guardedSubmit('save-edit-produksi', async () => {
    // Fetch original
    const { data: lama, error: fetchErr } = await sb
      .from('produksi')
      .select('qty,biaya_bahan,biaya_tenaga,biaya_overhead')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const qtySelisih = qtyBaru - lama.qty;

    // Validate bahan if qty increases
    if (qtySelisih > 0) {
      for (const r of (state.bomData[pid] || [])) {
        const b = state.bahanList.find(x => x.id === r.bid);
        if (!b) continue;
        const butuh = r.qty * qtySelisih;
        if (getStokBahan(b.id) < butuh) {
          return toast(`❌ Stok ${esc(b.nama)} tidak cukup! Butuh +${fmt(butuh)} ${b.satuan}`);
        }
      }
    }

    // Validate produk stok not negative if qty decreases
    if (qtySelisih < 0) {
      const stokNanti = getStokProduk(pid) + qtySelisih;
      if (stokNanti < 0) {
        const p = state.produkList.find(x => x.id === pid);
        return toast(`❌ Stok ${esc(p?.nama)} akan negatif (${fmt(stokNanti)})!`);
      }
    }

    const bhnBaru = parseFloat(document.getElementById('ep-bhn')?.value) || 0;
    const tngBaru = parseFloat(document.getElementById('ep-tng')?.value) || 0;
    const ovhBaru = parseFloat(document.getElementById('ep-ovh')?.value) || 0;

    const { error } = await sb.from('produksi').update({
      qty:            qtyBaru,
      biaya_bahan:    bhnBaru,
      biaya_tenaga:   tngBaru,
      biaya_overhead: ovhBaru,
      petugas:        document.getElementById('ep-pet')?.value || currentNama,
      edited_at:      new Date().toISOString(),
      edited_by:      currentUser?.email,
    }).eq('id', id);
    if (error) throw error;

    await _writeLedger('EDIT_PRODUKSI', id, lama,
      { qty: qtyBaru, bhn: bhnBaru, hpp: bhnBaru + tngBaru + ovhBaru }
    );

    invalidateStok();
    await refreshStokDebounced();
    closeModal('modal-edit-prod');
    await loadProduksi();
    renderDash();
    renderStokBahan();
    renderStokProduk();
    toast(`✅ Produksi diupdate: qty=${qtyBaru}, HPP=${rp(bhnBaru + tngBaru + ovhBaru)}`);
  });
}

// ══════════════════════════════════════════════════════
// HAPUS PRODUKSI (owner only)
// ══════════════════════════════════════════════════════
async function hapusProduksi(id, qty, pid) {
  if (!requireRole(currentRole, 'owner')) return;

  const stok = getStokProduk(pid);
  if (stok - qty < 0) {
    const p = state.produkList.find(x => x.id === pid);
    return toast(`❌ Tidak bisa dihapus! Stok ${esc(p?.nama)} akan negatif.`);
  }
  if (!confirm(`Hapus produksi ini? Stok produk -${qty} unit.`)) return;

  try {
    const { error } = await sb.from('produksi').delete().eq('id', id);
    if (error) throw error;
    await _writeLedger('HAPUS_PRODUKSI', id, { qty, pid }, {});
    invalidateStok();
    await refreshStokDebounced();
    await loadProduksi();
    renderDash();
    toast('🗑 Produksi dihapus');
  } catch (err) {
    handleError(err, 'production.hapusProduksi');
  }
}

// ── Audit ledger helper ────────────────────────────────
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
