# Eattie Bakery Manager v3 — Migration Guide

## Architecture: v2 (single file) → v3 (Vite + modules)

---

## File Structure

```
eattie/
├── index.html              # Shell HTML only — no inline JS/CSS
├── vite.config.js          # Vite bundler config
├── vercel.json             # Security headers + SPA rewrite
├── package.json
└── src/
    ├── main.js             # Entry point, router, realtime registration
    ├── supabase.js         # Supabase client singleton
    ├── helpers.js          # esc(), rp(), fmt(), genId(), debounce()
    ├── errors.js           # Centralized error handler
    ├── guard.js            # guardedSubmit(), requireRole(), requireOnline()
    ├── ui.js               # toast(), openModal(), setHTML(), showPage()
    ├── store.js            # Central state + smart stok cache
    ├── realtime.js         # Realtime manager singleton (no memory leak)
    ├── auth.js             # Login, register, logout, gate, session timer
    ├── dashboard.js        # Dashboard KPI + alerts (debounced)
    ├── sales.js            # Penjualan module
    ├── purchase.js         # Pembelian bahan module
    ├── production.js       # Produksi + BOM transaction
    ├── inventory.js        # Stok bahan, stok produk, resep/BOM
    ├── master.js           # Master produk + user management
    ├── reports.js          # Laporan L/R + Audit log viewer
    └── styles/
        └── main.css        # All styles in one file
```

---

## Step-by-Step Migration

### Step 1 — Install dependencies

```bash
cd eattie
npm install
npm run dev      # Test locally at localhost:3000
npm run build    # Build for production → dist/
```

### Step 2 — Run Supabase SQL (if not done)

Run `bakery_rls_v4.sql` in Supabase SQL Editor to ensure:
- RLS policies are active
- `get_my_role()` function exists
- `is_active_user()` function exists
- Ledger table exists
- Views `v_stok_bahan` and `v_stok_produk` exist

### Step 3 — Update Supabase Auth settings

Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://eattiebyana.vercel.app`
- Redirect URLs: `https://eattiebyana.vercel.app`

### Step 4 — Deploy to Vercel

**Option A: Drag & drop (easiest)**
```bash
npm run build
# Upload the dist/ folder to Vercel
```

**Option B: GitHub + Vercel (recommended)**
1. Push this folder to GitHub repo
2. Connect repo to Vercel
3. Set Build Command: `npm run build`
4. Set Output Directory: `dist`
5. Deploy

### Step 5 — Fix existing users roles (if needed)

```sql
-- Check users in Supabase SQL Editor
SELECT au.id, au.email, u.role, u.nama
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id;

-- Set owner role
INSERT INTO public.users (id, email, role, nama)
SELECT id, email, 'owner', 'Nama Owner'
FROM auth.users WHERE email = 'aulia171990@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'owner';
```

---

## What Changed vs v2

| Area | v2 (single file) | v3 (modular) |
|---|---|---|
| XSS | innerHTML with raw strings | `esc()` on all db strings |
| Realtime | Recreated on every login | Singleton, proper cleanup |
| Dashboard | Renders on every change | Debounced 400ms |
| Error handling | Per-function try/catch | `handleError()` + global handler |
| Submit guard | `btn.disabled` scattered | `guardedSubmit()` centralized |
| Role check | Scattered `if(currentRole)` | `requireRole()` everywhere |
| State | Global vars scattered | `store.js` central state |
| Stok cache | Re-computed O(n²) per render | Cached view from Supabase, debounced |
| Code size | 1700+ line monolith | 13 focused modules |
| Security headers | None | Full CSP, HSTS, X-Frame |
| Audit log | Basic viewer | Filterable, paginated, with diff |

---

## Security Checklist

- [x] XSS: `esc()` applied to all database strings before innerHTML
- [x] XSS: `textContent` used for simple text (no innerHTML)
- [x] XSS: Event delegation replaces `onclick="fn('${id}')"` pattern where possible
- [x] CSRF: Supabase JWT handles this automatically
- [x] Auth: Gate password prevents URL enumeration
- [x] Auth: Session auto-expires after 15 min idle
- [x] Auth: Role checks both client-side (UX) and server-side (RLS)
- [x] Auth: DOM elements removed (not just hidden) based on role
- [x] Transport: HTTPS enforced via HSTS header
- [x] Clickjacking: X-Frame-Options DENY
- [x] Content sniffing: X-Content-Type-Options nosniff
- [x] CSP: Restricts script/style/connect sources
- [x] Realtime: Channel singleton prevents duplicate subscriptions
- [x] Idempotency: genId() prevents duplicate transactions on retry

---

## Testing Checklist

### Auth
- [ ] Gate rejects wrong password
- [ ] Gate accepts correct password → shows login
- [ ] Login with wrong password shows error message
- [ ] Login as owner → all menus visible
- [ ] Login as baker → only Produksi + Dashboard + Stok Produk
- [ ] Login as kasir → only Penjualan + Dashboard + Stok Produk
- [ ] Idle 15 min → countdown appears → auto logout
- [ ] Extend session → timer resets
- [ ] Logout → returns to gate (not login)

### XSS
- [ ] Create product with name: `<script>alert(1)</script>`
- [ ] Verify it renders as text, not executed
- [ ] Same for bahan nama, petugas, supplier fields

### Sales
- [ ] Add transaction → stok produk decreases
- [ ] Block sale if stok = 0
- [ ] Delete transaction → stok restored
- [ ] Filter by date works
- [ ] Filter by channel works
- [ ] Pagination works > 20 records

### Production
- [ ] Add produksi → stok bahan decreases per BOM
- [ ] Block produksi if bahan stok insufficient
- [ ] Edit produksi (owner only) → HPP recalculates
- [ ] Delete produksi → stok reverted
- [ ] Double-click submit → only one record created

### Realtime
- [ ] Open 2 tabs → add sale in tab 1 → tab 2 updates
- [ ] Go offline → sync dot turns red
- [ ] Come back online → reconnects automatically

### Audit Log
- [ ] All transactions appear in audit log
- [ ] Filter by date works
- [ ] Filter by user works
- [ ] Filter by action type works
- [ ] Before/after diff shows for edits

---

## Deployment Checklist

- [ ] `npm run build` succeeds without errors
- [ ] `dist/` folder contains `index.html` + assets
- [ ] `vercel.json` is in project root
- [ ] Supabase Site URL updated to Vercel URL
- [ ] Supabase Redirect URL updated to Vercel URL
- [ ] Gate password changed from default `eattie2024`
- [ ] At least 1 owner account exists in `users` table
- [ ] All RLS policies verified in Supabase SQL Editor

---

## Scalability Notes (Multi-branch future)

When ready to support multiple branches:

1. Add `branch_id` column to all transaction tables:
```sql
ALTER TABLE penjualan  ADD COLUMN branch_id uuid REFERENCES branches(id);
ALTER TABLE produksi   ADD COLUMN branch_id uuid REFERENCES branches(id);
ALTER TABLE pembelian  ADD COLUMN branch_id uuid REFERENCES branches(id);
```

2. Add user-branch mapping:
```sql
CREATE TABLE user_branches (
  user_id   uuid REFERENCES auth.users(id),
  branch_id uuid REFERENCES branches(id),
  PRIMARY KEY (user_id, branch_id)
);
```

3. Update RLS policies to filter by `branch_id`

4. Add `branch_id` to `store.js` state and filter all queries

5. Owner sees all branches; baker/kasir sees only their branch
