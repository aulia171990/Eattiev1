// ═══════════════════════════════════════════════════════
// auth.js — Authentication & Session Management
// ═══════════════════════════════════════════════════════
import { sb }                          from './supabase.js';
import { toast }                       from './ui.js';
import { handleError }                 from './errors.js';
import { stopRealtime, clearRealtimeHandlers } from './realtime.js';

// ── App init callback (injected from main.js to break circular dep) ──
let _onLoginCallback = null;

/**
 * Register the post-login callback from main.js.
 * Called once during app bootstrap.
 * This breaks the auth.js ↔ main.js circular dependency.
 */
export function registerOnLoginCallback(fn) {
  _onLoginCallback = fn;
}

// ── Gate config ──────────────────────────────────────
const GATE_KEY      = 'eattie_gate_ok';
const GATE_PASSWORD = 'eattie2024'; // Change this!

// ── Session state ─────────────────────────────────────
export let currentUser = null;
export let currentRole = null;
export let currentNama = '';

export const ROLE_LABELS = {
  owner: '👑 Owner',
  baker: '👨‍🍳 Baker',
  kasir: '💁 Kasir',
};

// ── Auto-logout timer ─────────────────────────────────
const IDLE_MS     = 15 * 60 * 1000; // 15 min
const COUNTDOWN_S = 30;
let _idleTimer    = null;
let _countdownTimer = null;

// ── Gate ─────────────────────────────────────────────
export function checkGate() {
  const input = document.getElementById('gate-input');
  const errEl = document.getElementById('gate-err');
  // Compare value to prevent timing attacks (constant-time not needed client-side, but safe compare)
  if (input?.value === GATE_PASSWORD) {
    sessionStorage.setItem(GATE_KEY, '1');
    document.getElementById('url-gate').style.display = 'none';
    input.value = '';
    initApp();
  } else {
    // Use textContent — never innerHTML
    if (errEl) errEl.textContent = '❌ Kode akses salah';
    if (input) { input.value = ''; input.focus(); }
    setTimeout(() => { if (errEl) errEl.textContent = ''; }, 2000);
  }
}

export function checkGateOnLoad() {
  if (sessionStorage.getItem(GATE_KEY) === '1') {
    document.getElementById('url-gate').style.display = 'none';
    initApp();
  } else {
    document.getElementById('url-gate').style.display = 'flex';
    setTimeout(() => document.getElementById('gate-input')?.focus(), 100);
  }
}

// ── App init after gate ───────────────────────────────
async function initApp() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) {
      await onLogin(session.user);
    } else {
      showLoginScreen();
    }
  } catch (err) {
    handleError(err, 'auth.initApp');
    showLoginScreen();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      document.getElementById('app-screen').style.display = 'none';
      showLoginScreen();
    }
    if (event === 'TOKEN_REFRESHED') {
      console.debug('[Auth] Token refreshed');
    }
  });
}

// ── Login ─────────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById('login-email')?.value.trim();
  const pass  = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');

  if (errEl) errEl.textContent = '';
  if (!email || !pass) {
    if (errEl) errEl.textContent = 'Email dan password wajib diisi.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Masuk...'; }

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    await onLogin(data.user);
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Login gagal.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔐 Masuk'; }
  }
}

// ── Register ──────────────────────────────────────────
export async function doRegister() {
  const nama  = document.getElementById('reg-nama')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const pass  = document.getElementById('reg-pass')?.value;
  const role  = document.getElementById('reg-role')?.value;
  const errEl = document.getElementById('reg-err');
  const btn   = document.querySelector('#register-screen .btn');

  if (errEl) errEl.textContent = '';
  if (!nama || !email || !pass) {
    if (errEl) errEl.textContent = 'Semua field wajib diisi.';
    return;
  }
  if (pass.length < 6) {
    if (errEl) errEl.textContent = 'Password min. 6 karakter.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Mendaftar...'; }

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password: pass,
      options: { emailRedirectTo: 'https://eattiebyana.vercel.app' }
    });
    if (error) throw error;

    // Save pending role to localStorage (fallback if insert fails)
    localStorage.setItem('pending_role_' + email, JSON.stringify({ nama, role }));

    // Upsert into users table
    const { error: insErr } = await sb.from('users').upsert(
      { id: data.user.id, email, role, nama },
      { onConflict: 'id' }
    );
    if (insErr) console.warn('[Auth] Register upsert failed:', insErr.message);

    toast('✅ Akun berhasil dibuat! Silakan login.');
    showLoginScreen();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Pendaftaran gagal.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Daftar'; }
  }
}

// ── Logout ────────────────────────────────────────────
export async function doLogout(skipConfirm = false) {
  const fromTimeout = document.getElementById('timeout-modal')
    ?.classList.contains('show');
  if (!fromTimeout && !skipConfirm && !confirm('Yakin ingin logout?')) return;

  // Cleanup
  clearTimeout(_idleTimer);
  clearInterval(_countdownTimer);
  document.getElementById('timeout-modal')?.classList.remove('show');
  stopRealtime();
  clearRealtimeHandlers();

  currentUser = null;
  currentRole = null;
  currentNama = '';

  await sb.auth.signOut();

  // Return to gate
  document.getElementById('app-screen').style.display = 'none';
  sessionStorage.removeItem(GATE_KEY);
  document.getElementById('url-gate').style.display = 'flex';
  const gi = document.getElementById('gate-input');
  if (gi) { gi.value = ''; gi.focus(); }
}

// ── onLogin ───────────────────────────────────────────
export async function onLogin(user) {
  currentUser = user;

  // Fetch role — try by ID first, then email
  let { data } = await sb.from('users')
    .select('role,nama')
    .eq('id', user.id)
    .maybeSingle();

  if (!data) {
    const res2 = await sb.from('users')
      .select('role,nama')
      .eq('email', user.email)
      .maybeSingle();
    data = res2.data;
  }

  // Fallback: localStorage pending role
  if (!data) {
    const pending = localStorage.getItem('pending_role_' + user.email);
    if (pending) {
      const { nama, role } = JSON.parse(pending);
      const { error: upsertErr } = await sb.from('users').upsert(
        { id: user.id, email: user.email, role, nama },
        { onConflict: 'id' }
      );
      if (!upsertErr) localStorage.removeItem('pending_role_' + user.email);
      data = { role, nama };
    }
  }

  currentRole = data?.role || 'kasir';
  currentNama = data?.nama || user.email;

  console.debug('[Auth] Logged in as:', currentRole, currentNama);

  // Update UI
  const tbRole = document.getElementById('tb-role');
  const tbDate = document.getElementById('tb-date');
  // Use textContent — never innerHTML
  if (tbRole) tbRole.textContent = ROLE_LABELS[currentRole] || currentRole;
  if (tbDate) tbDate.textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Auto-fill kasir
  const kasirEl = document.getElementById('jual-kasir');
  if (kasirEl) kasirEl.value = currentNama;

  // Apply RBAC — remove unauthorized nav items from DOM
  applyRBAC();

  // Show app
  document.getElementById('login-screen').style.display    = 'none';
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('app-screen').style.display      = 'block';

  // Start idle timer
  resetIdleTimer();

  // Call post-login callback (registered by main.js — no circular import)
  if (_onLoginCallback) {
    await _onLoginCallback();
  } else {
    console.warn('[Auth] onLogin callback not registered — call registerOnLoginCallback() in main.js');
  }
}

// ── RBAC — remove unauthorized elements from DOM ─────
export function applyRBAC() {
  document.querySelectorAll('.owner-only').forEach(el => {
    if (currentRole !== 'owner') el.remove();
  });
  document.querySelectorAll('.baker-only').forEach(el => {
    if (currentRole !== 'baker' && currentRole !== 'owner') el.remove();
  });
}

// ── Auto-logout ───────────────────────────────────────
export function resetIdleTimer() {
  clearTimeout(_idleTimer);
  const modal = document.getElementById('timeout-modal');
  if (modal?.classList.contains('show')) {
    modal.classList.remove('show');
    clearInterval(_countdownTimer);
  }
  if (currentUser) {
    _idleTimer = setTimeout(showTimeoutWarning, IDLE_MS);
  }
}

function showTimeoutWarning() {
  let countdown = COUNTDOWN_S;
  const numEl   = document.getElementById('countdown-num');
  if (numEl) numEl.textContent = countdown;
  document.getElementById('timeout-modal')?.classList.add('show');

  _countdownTimer = setInterval(() => {
    countdown--;
    if (numEl) numEl.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(_countdownTimer);
      doLogout(true);
    }
  }, 1000);
}

export function extendSession() {
  clearInterval(_countdownTimer);
  document.getElementById('timeout-modal')?.classList.remove('show');
  resetIdleTimer();
  toast('✅ Sesi diperpanjang 15 menit');
}

// ── Helpers ───────────────────────────────────────────
function showLoginScreen() {
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('login-screen').style.display    = 'flex';
}

export function showRegister() {
  document.getElementById('login-screen').style.display    = 'none';
  document.getElementById('register-screen').style.display = 'flex';
}

export function showLogin() {
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('login-screen').style.display    = 'flex';
}

// Track activity for idle timer
['click', 'keydown', 'touchstart', 'scroll'].forEach(ev =>
  document.addEventListener(ev, resetIdleTimer, { passive: true })
);
