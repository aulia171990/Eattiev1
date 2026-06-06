// ═══════════════════════════════════════════════════════
// master.js — Master Produk & User Management
// ═══════════════════════════════════════════════════════
import { sb }          from './supabase.js';
import { esc, rp, genId, fmtDate } from './helpers.js';
import { toast }       from './ui.js';
import { handleError } from './errors.js';
import { guardedSubmit, requireRole } from './guard.js';
import { state, invalidateMaster, loadMasterData, populateDropdowns } from './store.js';
import { currentRole, currentUser, ROLE_LABELS } from './auth.js';

// ══════════════════════════════════════════════════════
// MASTER PRODUK
// ══════════════════════════════════════════════════════
export function renderMasterProduk() {
  const tbody = document.querySelector('#t-produk tbody');
  if (!tbody) return;

  if (!state.produkList.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--tm)">Belum ada produk</td></tr>`;
    return;
  }

  tbody.innerHTML = state.produkList.map(p => {
    const m      = p.harga > 0 ? ((p.harga - p.hpp) / p.harga * 100).toFixed(1) : 0;
    const editBtn = currentRole === 'owner'
      ? `<button class="btn by bsm" data-action="edit-produk" data-id="${esc(p.id)}">✏️</button>`
      : '';
    return `<tr>
      <td>
        <b>${esc(p.nama)}</b><br>
        <span style="font-size:11px;color:var(--tm)">${esc(p.kategori)} · ${esc(p.satuan)}</span>
      </td>
      <td>${rp(p.hpp)}</td>
      <td>${rp(p.harga)}</td>
      <td><span class="badge bg-gn">${esc(String(m))}%</span></td>
      <td>${editBtn}</td>
    </tr>`;
  }).join('');

  // Event delegation
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn?.dataset.action === 'edit-produk') editProdukMaster(btn.dataset.id);
  }, { once: true });
}

export function editProdukMaster(id) {
  if (!requireRole(currentRole, 'owner')) return;
  const p = state.produkList.find(x => x.id === id);
  if (!p) return;

  const fields = {
    'mp-id':  p.id,
    'mp-nama': p.nama,
    'mp-kat':  p.kategori || 'Roti',
    'mp-sat':  p.satuan   || 'Pcs',
    'mp-hpp':  String(p.hpp),
    'mp-hrg':  String(p.harga),
    'mp-min':  String(p.stok_min || 0),
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  document.getElementById('mp-nama')?.scrollIntoView({ behavior: 'smooth' });
}

export async function simpanProduk() {
  if (!requireRole(currentRole, 'owner')) return;
  const nama = document.getElementById('mp-nama')?.value.trim();
  if (!nama) return toast('❌ Nama produk wajib');

  const hpp  = parseFloat(document.getElementById('mp-hpp')?.value) || 0;
  const hrg  = parseFloat(document.getElementById('mp-hrg')?.value) || 0;
  if (hrg < hpp) return toast('⚠️ Harga jual sebaiknya ≥ HPP');

  const id   = document.getElementById('mp-id')?.value;
  const data = {
    nama,
    kategori:   document.getElementById('mp-kat')?.value,
    satuan:     document.getElementById('mp-sat')?.value,
    hpp,
    harga:      hrg,
    stok_min:   parseFloat(document.getElementById('mp-min')?.value) || 0,
    updated_at: new Date().toISOString(),
  };

  await guardedSubmit('simpan-produk', async () => {
    let error;
    if (id) {
      ({ error } = await sb.from('produk').update(data).eq('id', id));
    } else {
      ({ error } = await sb.from('produk').insert({ ...data, id: genId('PRD') }));
    }
    if (error) throw error;
    toast(`✅ Produk ${esc(nama)} ${id ? 'diupdate' : 'ditambahkan'}`);
    resetFormProduk();
    invalidateMaster();
    await loadMasterData();
    populateDropdowns();
    renderMasterProduk();
  });
}

export function resetFormProduk() {
  ['mp-id', 'mp-nama'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['mp-hpp', 'mp-hrg', 'mp-min'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '0';
  });
}

// ══════════════════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════════════════
export async function loadUsers() {
  if (!requireRole(currentRole, 'owner')) return;
  try {
    const { data, error } = await sb
      .from('users')
      .select('*')
      .order('created_at');
    if (error) throw error;

    const tbody = document.querySelector('#t-users tbody');
    if (!tbody) return;

    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--tm)">Belum ada user</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(u => `<tr>
      <td><b>${esc(u.nama)}</b></td>
      <td style="font-size:12px">${esc(u.email)}</td>
      <td><span class="badge bg-br">${esc(ROLE_LABELS[u.role] || u.role)}</span></td>
      <td><span class="badge ${u.aktif ? 'bg-gn' : 'bg-rd'}">${u.aktif ? 'Aktif' : 'Non-aktif'}</span></td>
      <td>
        ${u.aktif
          ? `<button class="btn br2 bsm" data-action="nonaktif-user" data-id="${esc(u.id)}">Nonaktifkan</button>`
          : `<button class="btn bgn bsm" data-action="aktif-user" data-id="${esc(u.id)}">Aktifkan</button>`
        }
      </td>
    </tr>`).join('');

    // Event delegation
    tbody.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === 'nonaktif-user') await toggleUserAktif(id, false);
      if (action === 'aktif-user')   await toggleUserAktif(id, true);
    }, { once: true });
  } catch (err) {
    handleError(err, 'master.loadUsers');
  }
}

async function toggleUserAktif(id, aktif) {
  if (!confirm(`${aktif ? 'Aktifkan' : 'Nonaktifkan'} user ini?`)) return;
  try {
    const { error } = await sb.from('users').update({ aktif }).eq('id', id);
    if (error) throw error;
    toast(`✅ User berhasil ${aktif ? 'diaktifkan' : 'dinonaktifkan'}`);
    loadUsers();
  } catch (err) {
    handleError(err, 'master.toggleUserAktif');
  }
}
