# Edge Functions dan Pekerjaan Terjadwal — Kontrak (V1)

Acuan: `rulesapp.md` (bagian 6, 13, 14, 15, 17), `fitur.md`, `schema.sql` (catatan operasional), `rls.sql`, `flows.md`. Ini kontrak (input, output, hak panggil, langkah, galat), bukan kode final.

Prinsip: Edge Function dipakai untuk **hal yang tidak boleh dilakukan browser**: memakai service key, memegang API key pihak ketiga, dan mengubah akun (Auth). Aturan bisnis pesanan **tidak** ada di sini; semuanya di fungsi dan trigger database (`schema.sql`, `rls.sql`).

---

## 1. Daftar

| Nama | Jenis | Dipanggil oleh | Tujuan |
|---|---|---|---|
| `cek-ongkir` | Edge Function | Customer, Admin (browser) | Estimasi ongkir dari berat dan alamat tujuan |
| `cari-area` | Edge Function | Customer, Admin (browser) | Cari area tujuan (autocomplete alamat), pendukung `cek-ongkir` |
| `admin-set-password` | Edge Function | Super Admin (browser) | Ganti password user atau admin |
| `admin-create` | Edge Function | Super Admin (browser) | Buat akun admin |
| `send-push` | Edge Function | Database Webhook | Kirim Web Push |
| Kedaluwarsa pesanan | pg_cron (SQL, bukan Edge Function) | Sistem | Ubah pesanan time-out menjadi Kedaluwarsa |
| Ping Supabase | Pekerjaan terjadwal eksternal | GitHub Actions | Mencegah project gratis auto-pause |

`cari-area` tidak ada di daftar awal, tetapi `cek-ongkir` membutuhkan `destination_area_id` dari API ongkir (kolom `orders.destination_area_id` sudah ada), jadi saya sertakan.

Belum punya kontrak (perlu dibuat sebelum fitur terkait dikerjakan): `account-set-active` (nonaktif/aktifkan akun + ban di Auth, `schema.sql` catatan 5), `admin-delete`, `send-reset-link`, dan penghapus file Storage dari `storage_delete_queue` (`schema.sql` catatan 7).

---

## 2. Aturan umum Edge Function

- **Runtime:** Supabase Edge Functions (Deno, TypeScript). Satu folder per fungsi di `supabase/functions/<nama>/index.ts`, kode bersama di `supabase/functions/_shared/`.
- **`verify_jwt`:** `true` untuk semua fungsi yang dipanggil browser. `false` hanya untuk `send-push` (dipanggil webhook, diamankan header rahasia).
- **Otorisasi dua lapis.** Gerbang JWT dari platform, lalu fungsi memeriksa sendiri peran lewat `requireRole` (di bawah). Jangan pernah mempercayai `role` dari body atau klaim klien.
- **Service key** hanya dibaca dari environment fungsi (`SUPABASE_SERVICE_ROLE_KEY`). Tidak pernah dikirim ke browser, repo, atau log.
- **Password tidak pernah** ditulis ke log, `activity_logs`, atau respons selain satu kali di respons `admin-set-password` dan `admin-create`.
- **Format respons**
  - sukses: `200 { "ok": true, "data": { ... } }`
  - gagal: `4xx/5xx { "ok": false, "error": { "code": "...", "message": "pesan Indonesia yang aman ditampilkan" } }`
- **CORS:** hanya origin `SITE_URL` (dan `http://localhost` port pengembangan). Tangani `OPTIONS`.
- **Validasi input** ketat: tipe, panjang, format UUID. Tolak field tak dikenal. Respons `422 invalid_input`.
- **Batas laju** per pengguna: `cek-ongkir` dan `cari-area` 30 panggilan per menit, fungsi akun 10 per menit. Lewat batas: `429 rate_limited`.

### 2.1 Pemeriksaan peran (dipakai ulang)

```ts
// _shared/auth.ts (pola, bukan kode final)
export async function requireRole(req: Request, allowed: Array<'customer'|'admin'|'super_admin'>) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  const userClient = createClient(URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user } } = await userClient.auth.getUser();      // validasi token di server Auth
  if (!user) throw httpError(401, 'unauthenticated', 'Silakan masuk lagi.');
  const admin = createClient(URL, SERVICE_ROLE_KEY);               // service key hanya di sini
  const { data: p } = await admin.from('profiles')
    .select('id, role, is_active, must_change_password').eq('id', user.id).single();
  if (!p || !p.is_active || p.must_change_password || !allowed.includes(p.role))
    throw httpError(403, 'forbidden', 'Kamu tidak punya akses untuk aksi ini.');
  return { user, profile: p, admin };
}
```

Catatan: pengecekan `must_change_password` di sini menutup celah yang saat ini ada di database (RPC seperti `place_order` belum menolak akun yang wajib ganti password). Itu keputusan saya; hapus bila tidak diinginkan.

### 2.2 Secrets (`supabase secrets set`)

| Nama | Dipakai oleh | Keterangan |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | semua | Disediakan platform |
| `SITE_URL` | semua | Alamat website (CORS, tautan, URL notifikasi) |
| `BITESHIP_API_KEY` atau `KOMERCE_API_KEY` | `cek-ongkir`, `cari-area` | **Provider belum diputuskan** |
| `MAIL_*` (host, port, user, pass atau API key) | `admin-set-password` | **Provider SMTP belum diputuskan** |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `send-push` | Buat sekali (`npx web-push generate-vapid-keys`). Public key juga dipakai browser |
| `PUSH_WEBHOOK_SECRET` | `send-push` | String acak panjang; sama dengan header webhook |

---

## 3. `cek-ongkir`

Memenuhi `rulesapp.md` bagian 6, termasuk aturan berat dan asal pengiriman.

| | |
|---|---|
| Dipanggil oleh | `requireRole(['customer','admin'])`. Admin dipakai saat membuat pesanan manual |
| Request | `{ "destination_area_id": "string", "items": [ { "variant_id": "uuid", "qty": 2 } ] }` |
| Validasi | `items` 1 sampai 50 baris, `qty` bilangan bulat 1 sampai 999, tidak ada `variant_id` ganda. Berat dari klien **diabaikan** (field berat tidak diterima) |

**Langkah**
1. `requireRole(['customer','admin'])`.
2. Ambil `variant_id` → produk dari database. Untuk customer, tolak bila produk tidak berstatus `active` (`422 product_unavailable`).
3. **Berat aktual** = jumlah `products.weight_gram × qty` seluruh item.
4. **Berat kirim** = `ceil((berat aktual + settings.packaging_buffer_gram) / settings.weight_round_gram) × settings.weight_round_gram`. Buffer ditambahkan **sekali per pesanan**. Contoh: aktual 250 → 250 + 100 = 350 → dibulatkan 400.
5. Asal = `settings.origin_area_id`. Bila kosong: `422 origin_not_set`.
6. Panggil API ongkir dengan key rahasia memakai **berat kirim**.
7. Ambil layanan **Pos, J&T, JNE** saja. Tandai `recommended: true` pada Kantor Pos bila tersedia.
8. Cache 10 menit per (asal, tujuan, berat kirim).

**Respons sukses**
```json
{
  "ok": true,
  "data": {
    "weight_gram": 450,
    "shipping_weight_gram": 600,
    "options": [
      { "courier": "pos", "service": "Pos Reguler", "price": 12000, "etd": "2-4 hari", "recommended": true },
      { "courier": "jnt", "service": "EZ", "price": 15000, "etd": "2-3 hari", "recommended": false },
      { "courier": "jne", "service": "REG", "price": 16000, "etd": "2-3 hari", "recommended": false }
    ]
  }
}
```
`courier` memakai nilai enum `courier_type` (`pos`, `jnt`, `jne`). Nilai `price` dalam Rupiah (integer). Berat aktual produk tidak pernah diubah oleh aturan ini.

| Galat | Kode | Perilaku UI |
|---|---|---|
| Provider mati atau timeout | `502 shipping_unavailable` | Tampilkan "Ongkir belum bisa dihitung. Kamu tetap bisa memesan; admin akan mengisi ongkir di invoice." dan kirim `p_shipping_cost = 0` ke `place_order` |
| Asal pengiriman belum diisi | `422 origin_not_set` | Sama seperti di atas. Admin diingatkan mengisi pengaturan |
| Area tidak ditemukan | `422 area_not_found` | Minta pilih ulang alamat |
| Varian tidak ditemukan | `422 variant_not_found` | Muat ulang keranjang |

**Catatan keamanan:** nominal ongkir yang dikirim ke `place_order` berasal dari klien dan bisa dimanipulasi. Ini diterima di V1 karena admin memverifikasi tiap pesanan lewat edit invoice sebelum Dikonfirmasi (`rulesapp.md` bagian 6). Bila ingin lebih ketat nanti: tanda tangan hasil `cek-ongkir` (HMAC) dan verifikasi di `place_order`.

**Yang harus dipastikan sebelum provider final:** mendukung Kantor Pos, kuota gratis cukup, tarif luar Jawa tersedia. Kontrak ini netral; mengganti provider hanya menyentuh `_shared/shipping.ts`.

### 3.1 `cari-area` (pendukung)

| | |
|---|---|
| Dipanggil oleh | `requireRole(['customer','admin'])` |
| Request | `{ "q": "string, minimal 3 karakter" }` |
| Respons | `{ "areas": [ { "area_id": "string", "label": "Kec. X, Kota Y, Provinsi Z", "postal_code": "string" } ] }` (maksimal 10) |
| Dipakai | Autocomplete di checkout. `area_id` disimpan ke `orders.destination_area_id` lewat parameter `p_destination_area_id` pada `place_order` |
| Galat | `422 invalid_input` bila `q` kurang dari 3 karakter; `502 shipping_unavailable` |

---

## 4. `admin-set-password` (ganti password)

Sesuai `rulesapp.md` bagian 14.5 dan `flows.md` bagian 4.

| | |
|---|---|
| Dipanggil oleh | `requireRole(['super_admin'])` |
| Request | `{ "user_id": "uuid", "mode": "manual" \| "generate", "password": "string?" }` |

**Aturan**
- Target harus berperan `customer` atau `admin`.
- **Ditolak bila `user_id` sama dengan pemanggil:** `403 self_not_allowed`.
- `manual`: `password` wajib, minimal 8 karakter (`422 weak_password`).
- `generate`: 12 karakter acak dari CSPRNG, tanpa karakter yang mudah tertukar (`0 O 1 l I`).

**Langkah**
1. Set password baru lewat Auth Admin API (service key).
2. `update profiles set must_change_password = true, password_reset_notice_at = now()` (service_role melewati trigger `profiles_protect`).
3. Keluarkan semua sesi target di semua perangkat (lihat catatan di bawah).
4. Insert `notifications` bertipe `password_diubah` untuk target (memicu banner dan push).
5. Kirim email pemberitahuan: waktu perubahan dan "Bukan kamu? Hubungi admin lewat WhatsApp". **Tanpa password.**
6. Insert `activity_logs`: `action = 'password_changed'`, `target_type = 'profile'`, `target_id = user_id`, `actor_id` = super admin, `meta = { "mode": "manual" | "generate" }`. **Tanpa password.**
7. Respons.

**Respons sukses**
```json
{ "ok": true, "data": { "password": "string", "mail_sent": true } }
```
`password` hanya ada di respons ini dan **ditampilkan sekali**. UI menyediakan tombol salin dan tombol WhatsApp, lalu menghapus nilainya dari memori saat sheet ditutup. Super admin menyampaikan password ke user lewat WhatsApp.

| Galat | Kode |
|---|---|
| Target akun sendiri | `403 self_not_allowed` |
| Target tidak ada atau berperan lain | `404 user_not_found` / `403 forbidden` |
| Password manual lemah | `422 weak_password` |
| Email gagal terkirim | tetap `200` dengan `"mail_sent": false`, agar super admin memberi tahu user lewat WhatsApp |

**Urutan dan kegagalan:** bila langkah 1 gagal, tidak ada yang berubah. Langkah 2 sampai 6 dijalankan berurutan; kegagalan salah satunya dicatat di log fungsi (tanpa password) dan dikembalikan sebagai galat, kecuali email.

**Catatan implementasi:** HIJABII belum punya cara mengeluarkan sesi user lain. Perlu salah satu: fungsi database kecil `revoke_user_sessions(uuid)` yang hanya bisa dipanggil `service_role` (menghapus baris `auth.sessions` milik user), atau mekanisme setara di Auth Admin API. Fungsi ini belum ada di `schema.sql`.

**Alternatif lebih aman:** "Kirim link reset" (`send-reset-link`, belum dikontrakkan), sehingga super admin tidak pernah mengetahui password.

---

## 5. `admin-create` (buat admin)

Sesuai `rulesapp.md` bagian 13: akun admin dibuat super admin lewat Edge Function. Tidak ada form daftar untuk admin.

| | |
|---|---|
| Dipanggil oleh | `requireRole(['super_admin'])` |
| Request | `{ "email": "string", "full_name": "string", "phone": "string?", "temp_password": "string?" }` |

**Aturan**
- Email valid dan belum dipakai.
- `temp_password` opsional. Bila kosong, dibuat otomatis (12 karakter CSPRNG). Bila diisi, minimal 8 karakter.
- Akun baru selalu `role = 'admin'`. Fungsi ini **tidak pernah** membuat super admin (hanya satu, dibuat manual lewat SQL Editor).
- Undangan lewat email (`inviteUserByEmail`) tidak termasuk V1; password sementara disampaikan lewat WhatsApp.

**Langkah**
1. Validasi input dan keunikan email.
2. `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, phone } })`.
3. Trigger `handle_new_user` membuat profil dengan role `customer`. Fungsi lalu `update profiles set role = 'admin', must_change_password = true where id = <user baru>` (service_role melewati `profiles_protect`).
4. Bila langkah 3 gagal: hapus user yang baru dibuat agar tidak tertinggal akun customer yang tidak diinginkan.
5. Insert `activity_logs`: `action = 'admin_created'`, `target_type = 'profile'`, `target_id` = user baru, `actor_id` = super admin, `meta = {}`. **Tanpa password.**

**Respons sukses**
```json
{ "ok": true, "data": { "user_id": "uuid", "temp_password": "string" } }
```
`temp_password` tampil sekali. Admin baru wajib mengganti password saat login pertama.

| Galat | Kode |
|---|---|
| Email sudah dipakai | `409 email_taken` |
| Password lemah | `422 weak_password` |
| Dipanggil bukan super admin | `403 forbidden` |

Disarankan membuat satu **admin cadangan** dengan email berbeda.

---

## 6. `send-push` (Web Push)

Notifikasi di dalam web (baris `notifications` + Realtime) adalah **jalur utama**. Push hanya tambahan; kegagalannya tidak boleh memengaruhi apa pun (`rulesapp.md` bagian 15).

| | |
|---|---|
| Dipanggil oleh | **Database Webhook** pada `INSERT` tabel `public.notifications`. Bukan browser. `verify_jwt = false` |
| Autentikasi | Header `x-webhook-secret` harus sama dengan `PUSH_WEBHOOK_SECRET`. Salah atau kosong: `401` |
| Request (dari webhook) | `{ "type": "INSERT", "table": "notifications", "record": { "id", "user_id", "type", "title", "body", "data", "is_read", "created_at" } }` |

**Langkah**
1. Tolak bila header rahasia salah (`401`).
2. Abaikan bila `type` bukan `INSERT` atau `table` bukan `notifications` (balas `200`).
3. Ambil semua `push_subscriptions` milik `record.user_id`. Bila tidak ada, balas `200`.
4. Tentukan `url` tujuan dari peran penerima dan `record.data.order_id`:
   - customer: halaman detail pesanan miliknya
   - admin: halaman detail pesanan di dashboard admin
   - tipe `password_diubah`: halaman akun
   (Jalur halaman final mengikuti routing front-end yang belum ditetapkan.)
5. Kirim payload `{ "title", "body", "url", "tag": record.id }` memakai VAPID ke tiap langganan.
6. Langganan yang membalas `404` atau `410` dihapus dari `push_subscriptions`.
7. **Selalu balas `200`** (jangan membuat webhook mengulang karena push gagal).

**Respons:** `200 { "ok": true, "data": { "sent": 1, "removed": 0 } }`.

Jenis notifikasi yang memicu push mengikuti `rulesapp.md` bagian 15: `order_baru`, `dibatalkan_customer`, `invoice_direvisi`, `diproses`, `dikirim`, `dibatalkan_admin`, `kedaluwarsa`, `password_diubah`.

**iPhone:** push hanya jalan bila website dipasang ke Home Screen (PWA, iOS 16.4 ke atas). Pada Safari biasa, tombol "Aktifkan notifikasi" menampilkan petunjuk "Tambahkan ke Layar Utama".

**Pengaturan webhook:** Dashboard → Database → Webhooks, tabel `notifications`, event `INSERT`, tujuan Edge Function `send-push`, tambahkan header `x-webhook-secret`.

---

## 7. Kedaluwarsa pesanan (pg_cron)

Ini **bukan Edge Function**: murni SQL di database, tanpa HTTP.

| | |
|---|---|
| Pelaksana | `pg_cron` memanggil `select public.expire_overdue_orders()` |
| Jadwal | Tiap 10 menit (`*/10 * * * *`), sesuai `rulesapp.md` bagian 4 |
| Siapa boleh memanggil | Hanya sistem (postgres/service_role). `EXECUTE` dicabut dari `anon` dan `authenticated` di `rls.sql` |
| Input | Tidak ada |
| Output | `integer`: jumlah pesanan yang dikedaluwarsakan pada eksekusi itu |

**Perilaku:** mengubah status menjadi `kedaluwarsa` untuk pesanan berstatus Menunggu Konfirmasi, Direvisi Admin, atau Dikonfirmasi yang `payment_status = 'belum_dibayar'` dan `expires_at < now()`. Trigger lalu mengisi alasan `kedaluwarsa`, mengembalikan stok sekali, menulis riwayat status, dan mengirim notifikasi `kedaluwarsa` ke customer akun. Rinciannya di `flows.md` bagian 5.

**Pengaktifan (manual, sekali):** aktifkan extension `pg_cron` di Dashboard → Database → Extensions, lalu jalankan di SQL Editor:
```sql
select cron.schedule('expire-orders', '*/10 * * * *', $$select public.expire_overdue_orders()$$);
```

**Pemantauan:** `select * from cron.job_run_details order by start_time desc limit 20;`. Fungsi idempotent, jadi aman bila terjadwal dua kali atau dijalankan ulang manual. Perpanjangan oleh admin (`admin_extend_timeout`) mencegah kedaluwarsa selama dilakukan sebelum `expires_at`.

---

## 8. Ping Supabase (anti auto-pause)

Project paket gratis dapat jeda otomatis setelah sekitar 1 minggu tanpa aktivitas (`rulesapp.md` bagian 17). Ping mingguan menjaganya tetap aktif.

| | |
|---|---|
| Pelaksana | GitHub Actions (`.github/workflows/keepalive.yml`) atau cron Vercel |
| Jadwal | Mingguan, mis. Senin 03:00 UTC (10:00 WIB) |
| Siapa boleh memanggil | Siapa pun dengan anon key. Tabel `settings` memang dapat dibaca publik oleh RLS (`settings_read`), jadi tidak butuh login |
| Request | `GET {SUPABASE_URL}/rest/v1/settings?select=id&limit=1` dengan header `apikey: <anon key>` |
| Output sukses | `200` dengan body `[{"id":true}]` |
| Gagal | Status bukan 2xx: workflow gagal, GitHub mengirim email pemberitahuan ke pemilik repo |

```yaml
name: keepalive
on:
  schedule: [{ cron: '0 3 * * 1' }]     # tiap Senin 10.00 WIB
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS "${{ secrets.SUPABASE_URL }}/rest/v1/settings?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

Simpan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di GitHub Secrets. **Jangan** memakai service key untuk ping. Tambahkan pengingat bulanan untuk memeriksa status project. Bila project sudah terlanjur jeda, pulihkan lewat dashboard Supabase (data tidak hilang).

---

## 9. Keputusan yang masih terbuka

| # | Hal | Dibutuhkan untuk |
|---|---|---|
| 1 | Provider API ongkir (Biteship atau Komerce) | `cek-ongkir`, `cari-area` |
| 2 | Provider SMTP gratis | `admin-set-password` (email), reset password |
| 3 | Cara mengeluarkan sesi user lain (fungsi `revoke_user_sessions` atau setara) | `admin-set-password`, nonaktifkan akun |
| 4 | Apakah `requireRole` menolak akun `must_change_password` (usulan: ya) | Semua fungsi |
| 5 | Jalur URL halaman untuk tautan push | `send-push` |
| 6 | Kontrak `account-set-active`, `admin-delete`, `send-reset-link`, penghapus file Storage | Fitur Kelola Admin/User dan foto |
