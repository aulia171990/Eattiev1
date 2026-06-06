// ═══════════════════════════════════════════════════════
// sales.js — Penjualan Module
// ═══════════════════════════════════════════════════════
import { sb }                        from './supabase.js';
import { esc, rp, fmt, today, genId, fmtDate } from './helpers.js';
import { toast, setHTML }            from './ui.js';
import { handleError }               from './errors.js';
import { guardedSubmit, requireRole, requireOnline } from './guard.js';
import { state, getStokProduk, refreshStokDebounced, invalidateStok } from './store.js';
import { renderDash }                from './dashboard.js';
import { currentRole, currentNama, currentUser } from './auth.js';

const PAGE_SIZE = 20;
let _page = 1;

// ── Hitung preview ─────────────────────────────────────
export function hitungJual() {
  const sel = document.getElementById('jual-prd');
  if (!sel?.options.length) return;
  const p = state.produkList.find(x => x.id === sel.value);
  if (!p) return;

  const qty  = parseFloat(document.getElementById('jual-qty')?.value) || 1;
  const dis  = parseFloat(document.getElementById('jual-dis')?.value) || 0;
  const stok = getStokProduk(p.id);

  const stokEl = document.getElementById('j-stok');
  if (stokEl) {
    // textContent — no XSS risk for numbers/satuan
    stokEl.textContent = `${fmt(stok, 0)} ${p.satuan}${stok < qty ? ' ⚠️' : ''}`;
    stokEl.style.color = stok < qty ? 'var(--rd)' : 'var(--gn)';
  }

  const hargaEl = document.getElementById('j-harga');
  if (hargaEl) hargaEl.textContent = rp(p.harga);

  const disEl = document.getElementById('j-dis');
  if (disEl) disEl.textContent = '- ' + rp(p.harga * qty * dis / 100);

  const totEl = document.getElementById('j-tot');
  if (totEl) totEl.textContent = rp(qty * p.harga * (1 - dis / 100));
}

// ── Load riwayat penjualan ─────────────────────────────
export async function loadPenjualan() {
  const dari   = document.getElementById('jual-f-dari')?.value;
  const sampai = document.getElementById('jual-f-sampai')?.value;
  const ch     = document.getElementById('jual-f-ch')?.value;

  try {
    let q = sb.from('penjualan')
      .select('*', { count: 'exact' })
      .order('tanggal',    { ascending: false })
      .order('created_at', { ascending: false });

    if (dari)   q = q.gte('tanggal', dari);
    if (sampai) q = q.lte('tanggal', sampai);
    if (ch)     q = q.eq('channel', ch);

    q = q.range((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) throw error;

    // Total
    const { data: totData } = await sb.from('penjualan').select('total.sum()');
    const lblEl = document.getElementById('lbl-tot-jual');
    if (lblEl) lblEl.textContent = `${count || 0} trx · ${rp(totData?.[0]?.sum || 0)}`;

    // Table — all db strings escaped
    const tbody = document.querySelector('#t-jual tbody');
    if (!tbody) return;

    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--tm)">Belum ada data</td></tr>`;
    } else {
      tbody.innerHTML = data.map(x => {
        const hapusBtn = currentRole === 'owner'
          ? `<button class="btn br2 bsm" data-id="${esc(x.id)}" data-action="hapus-jual">🗑</button>`
          : '';
        return `<tr>
          <td>${esc(fmtDate(x.tanggal))}</td>
          <td>${esc(x.produk_nama)}</td>
          <td>${esc(String(x.qty))}</td>
          <td><b>${rp(x.total)}</b></td>
          <td><span class="badge bg-gn">${esc(x.channel)}</span></td>
          <td>${hapusBtn}</td>
        </tr>`;
      }).join('');
    }

    // Pagination
    renderPagination(count || 0);

    // Use event delegation instead of inline onclick
    _bindTableActions();
  } catch (err) {
    handleError(err, 'sales.loadPenjualan');
  }
}

// ── Event delegation for table buttons ─────────────────
function _bindTableActions() {
  const tbody = document.querySelector('#t-jual tbody');
  if (!tbody) return;
  // Remove old listener to prevent duplicates
  tbody.replaceWith(tbody.cloneNode(true));
  const newTbody = document.querySelector('#t-jual tbody');
  newTbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'hapus-jual') hapusJual(btn.dataset.id);
  });
}

// ── Tambah penjualan ───────────────────────────────────
export async function tambahJual() {
  if (!requireRole(currentRole, 'kasir', 'owner', 'baker')) return;
  if (!requireOnline()) return;

  await guardedSubmit('tambah-jual', async () => {
    const sel = document.getElementById('jual-prd');
    const p   = state.produkList.find(x => x.id === sel?.value);
    if (!p) return toast('❌ Pilih produk');

    const qty = parseFloat(document.getElementById('jual-qty')?.value) || 0;
    if (qty <= 0) return toast('❌ Qty harus > 0');

    // Re-fetch stok for accuracy
    await refreshStokDebounced();
    const stok = getStokProduk(p.id);
    if (stok < qty) return toast(`❌ Stok ${esc(p.nama)} hanya ${fmt(stok, 0)} ${p.satuan}`);

    const dis   = parseFloat(document.getElementById('jual-dis')?.value) || 0;
    const id    = genId('TRX');

    const { error } = await sb.from('penjualan').insert({
      id,
      tanggal:      today(),
      produk_id:    p.id,
      produk_nama:  p.nama,
      qty,
      harga_satuan: p.harga,
      diskon:       dis,
      channel:      document.getElementById('jual-ch')?.value || 'Toko',
      kasir:        document.getElementById('jual-kasir')?.value || currentNama,
      created_by:   currentUser?.email,
    });
    if (error) throw error;

    await _writeLedger('TAMBAH_JUAL', id, null, { produk: p.nama, qty });
    invalidateStok();
    await refreshStokDebounced();

    toast(`✅ Transaksi tersimpan! Stok ${esc(p.nama)} -${qty}`);
    hitungJual();
    loadPenjualan();
    renderDash();
  }, { btnId: 'btn-simpan-jual', loadingText: '⏳ Menyimpan...' });
}

// ── Hapus penjualan ────────────────────────────────────
async function hapusJual(id) {
  if (!requireRole(currentRole, 'owner')) return;
  if (!confirm('Hapus transaksi ini?')) return;

  try {
    const { error } = await sb.from('penjualan').delete().eq('id', id);
    if (error) throw error;
    await _writeLedger('HAPUS_JUAL', id, { id }, {});
    invalidateStok();
    await refreshStokDebounced();
    toast('🗑 Transaksi dihapus');
    loadPenjualan();
    renderDash();
  } catch (err) {
    handleError(err, 'sales.hapusJual');
  }
}

// ── Reset filter ───────────────────────────────────────
export function resetFilterJual() {
  ['jual-f-dari', 'jual-f-sampai'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const chEl = document.getElementById('jual-f-ch');
  if (chEl) chEl.value = '';
  _page = 1;
  loadPenjualan();
}

// ── Pagination ─────────────────────────────────────────
function renderPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const el = document.getElementById('jual-pgn');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  let btns = `<span class="pgn-info">Hal ${_page}/${totalPages}</span>`;
  const max = Math.min(totalPages, 7);
  for (let i = 1; i <= max; i++) {
    btns += `<button class="pgn-btn${i === _page ? ' active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (totalPages > 7) btns += `<span class="pgn-info">... ${totalPages}</span>`;
  el.innerHTML = btns;

  // Delegate pagination clicks
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    _page = parseInt(btn.dataset.page);
    loadPenjualan();
  }, { once: true });
}

// ── Write audit ledger ─────────────────────────────────
async function _writeLedger(tipe, refId, oldVal, newVal) {
  try {
    await sb.from('ledger').insert({
      tipe, ref_id: refId,
      old_val: oldVal, new_val: newVal,
      role: currentRole,
      user_email: currentUser?.email,
    });
  } catch (err) {
    console.warn('[Ledger] Write failed:', err.message);
  }
}
