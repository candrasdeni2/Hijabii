# Hijabii by Intan — Website V1

Toko online hijab. Stack: HTML + CSS + JS (Tailwind CDN), Supabase (Auth, Postgres + RLS, Storage, Edge Functions), Vercel.
Urutan pengerjaan mengikuti `docs/timeline.md`: **backend → Super Admin → Admin → Customer → landing → rilis**.

## Struktur

```
supabase/
  migrations/   001_schema.sql · 002_rls.sql · 003_patches.sql   (urut, jangan edit yang sudah dijalankan)
  seed/         001_super_admin.sql · 002_sample_data.sql
  functions/    _shared/ + satu folder per Edge Function (Fase 1 dst.)
  tests/        run_local.sh · _harness/ (stub Supabase untuk uji lokal) · rls_*.sql · flow_*.sql (Fase 1)
web/            situs statis (Vercel menyajikan folder ini)
  assets/css    tokens.css · components.css
  assets/js     config · supabase · auth · labels · routes · format · ui · tailwind-config
  _dev/         foundation.html  (halaman uji Fase 0, noindex)
  toko/ admin/ superadmin/
tests/          check-enums.mjs · ui.test.mjs     →  npm test
docs/           PRD, aturan, desain, timeline
```

## Fase 0 — langkah yang harus dilakukan manual

### 0.1 Project & deploy
1. **Supabase**: buat project baru (region Singapore). Catat *Project URL* dan *anon key* (Settings → API).
   **service_role key jangan masuk repo.**
2. SQL Editor → jalankan **berurutan**, satu berkas per kali:
   `supabase/migrations/001_schema.sql` → `002_rls.sql` → `003_patches.sql`.
   `002_rls.sql` berakhir dengan pemeriksaan otomatis; bila ada tabel tanpa RLS ia akan gagal dengan pesan `Tabel tanpa RLS`.
3. Cek bucket `hijabii-images` ada (Storage). Cek Database → Replication: `notifications` dan `orders` ada di publikasi `supabase_realtime`.
4. **GitHub**: buat repo, lalu dari folder ini:
   ```bash
   git init && git add . && git commit -m "Fase 0: fondasi"
   git branch -M main
   git remote add origin <URL-REPO-KAMU>
   git push -u origin main
   ```
5. **Vercel**: Import repo. Framework preset *Other*. `vercel.json` sudah mengarahkan output ke `web/`.
6. Isi `web/assets/js/config.js` dengan Project URL + anon key (nilai publik, aman di browser).

### 0.3 Cek eksternal (keputusan #1, #2, #3 di `docs/timeline.md` bagian 6)
- Kuota Supabase gratis terbaru (storage 500 MB atau 1 GB, egress).
- Daftar akun Biteship dan/atau Komerce, uji apakah **Kantor Pos** didukung. Tanpa keduanya sistem tetap jalan (ongkir fallback 0).
- Pilih kandidat SMTP gratis.

### 0.5 Akun super admin & data contoh
1. Supabase → Authentication → Users → *Add user* (email pemilik, password kuat, **Auto Confirm**).
2. SQL Editor: ganti email di `supabase/seed/001_super_admin.sql`, jalankan.
3. (Opsional, dev) jalankan `supabase/seed/002_sample_data.sql`. Berat produk di berkas itu hanya contoh.

## Menjalankan & menguji

```bash
npm install
npm run dev     # situs di http://localhost:5173, buka /_dev/foundation.html
npm test        # slug label = enum database, perilaku komponen UI
```

Uji database lokal (PostgreSQL 15+ dengan stub Supabase; dipakai untuk skrip uji Fase 1):

```bash
PGUSER=postgres bash supabase/tests/run_local.sh
```

**Fase 0 selesai bila:** skema ada di project baru dengan pemeriksaan RLS lulus, dan `/_dev/foundation.html` berhasil login serta membaca `settings` memakai token desain.
