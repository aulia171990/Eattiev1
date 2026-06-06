// ═══════════════════════════════════════════════════════
// purchase.js — Pembelian Bahan Baku
// ═══════════════════════════════════════════════════════
import { sb }          from './supabase.js';
import { esc, rp, fmt, today, genId, fmtDate } from './helpers.js';
import { toast }       from './ui.js';
import { handleError } from './errors.js';
import { guardedSubmit, requireRole, requireOnline } from './guard.js';
import { state, refreshStokDebounced, invalidateStok } from './store.js';
import { currentRole, currentUser } from './auth.js';
import { renderDash }  from './dashboard.js';
import { renderStokBahan } from './inventory.js';

export async function loadPembelian() {
  try {
    const { data, error } = await sb
      .from('pembelian')
      .select('*')
      .order('tanggal',    { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const tot = (data || []).reduce((s, x) => s + (x.total || 0), 0);
    const lbl = document.getElementById('lbl-tot-beli');
    if (lbl) lbl.textContent = `${(data || []).length} trx · ${rp(tot)}`;

    const tbody = document.querySelector('#t-beli tbody');
    if (!tbody) return;

    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--tm)">Belum ada data</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(x => {
      const hapusBtn = currentRole === 'owner'
        ? `<button class="btn br2 bsm" data-action="hapus-beli" data-id="${esc(x.id)}">🗑</button>`
        : '';
      return `<tr>
        <td>${esc(fmtDate(x.tanggal))}</td>
        <td>${esc(x.bahan_nama)}</td>
        <td>${fmt(x.qty)} ${esc(x.satuan)}</td>
        <td><b>${rp(x.total)}</b></td>
        <td>${hapusBtn}</td>
      </tr>`;
    }).join('');

    // Event delegation
    tbody.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (btn?.dataset.action === 'hapus-beli') hapusBeli(btn.dataset.id);
    }, { once: true });
  } catch (err) {
    handleError(err, 'purchase.loadPembelian');
  }
}

export async function tambahBeli() {
  if (!requireRole(currentRole, 'owner', 'baker')) return;
  if (!requireOnline()) return;

  await guardedSubmit('tambah-beli', async () => {
    const sel = document.getElementById('beli-bhn');
    const b   = state.bahanList.find(x => x.id === sel?.value);
    if (!b) return toast('❌ Pilih bahan');

    const qty = parseFloat(document.getElementById('beli-qty')?.value) || 0;
    if (qty <= 0) return toast('❌ Qty harus > 0');

    const hrg = parseFloat(document.getElementById('beli-hrg')?.value) || 0;
    const id  = genId('INV');

    const { error } = await sb.from('pembelian').insert({
      id,
      tanggal:      today(),
      bahan_id:     b.id,
      bahan_nama:   b.nama,
      satuan:       b.satuan,
      qty,
      harga_satuan: hrg,
      supplier:     document.getElementById('beli-sup')?.value || '-',
      created_by:   currentUser?.email,
    });
    if (error) throw error;

    await _writeLedger('TAMBAH_BELI', id, null, { bahan: b.nama, qty, total: qty * hrg });
    invalidateStok();
    await refreshStokDebounced();
    toast(`✅ Stok ${esc(b.nama)} +${fmt(qty)} ${b.satuan}`);
    loadPembelian();
    renderStokBahan();
    renderDash();
  }, { loadingText: '⏳ Menyimpan...' });
}

async function hapusBeli(id) {
  if (!requireRole(currentRole, 'owner')) return;
  if (!confirm('Hapus pembelian ini?')) return;
  try {
    const { error } = await sb.from('pembelian').delete().eq('id', id);
    if (error) throw error;
    await _writeLedger('HAPUS_BELI', id, { id }, {});
    invalidateStok();
    await refreshStokDebounced();
    toast('🗑 Pembelian dihapus');
    loadPembelian();
    renderStokBahan();
    renderDash();
  } catch (err) {
    handleError(err, 'purchase.hapusBeli');
  }
}

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
