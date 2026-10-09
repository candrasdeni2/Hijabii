# PRODUCT REQUIREMENTS DOCUMENT

## Website E-Commerce Hijabii by Intan

**Versi 1.2 — Oktober 2026 — Dokumen internal pengembangan**

> Dokumen ini menggantikan PRD v1.0 dan v1.1 dan menjadi acuan utama. Dokumen "Kebutuhan Teknis — Alur Pembayaran" (Midtrans) berstatus **arsip**. Dokumen "Konsep Website untuk Client" perlu diselaraskan dengan PRD ini sebelum dibawa ke client (lihat bagian 17).

---

## 1. Overview

Hijabii by Intan adalah brand hijab/kerudung (berdiri 2025, berbasis di Lebak, Banten) yang saat ini berjualan lewat Shopee, TikTok Shop, dan WhatsApp. Proyek ini membangun website resmi brand: katalog produk sekaligus sistem pemesanan, dengan stack HTML, CSS, JavaScript, dan Supabase. WhatsApp tetap menjadi jembatan komunikasi untuk konfirmasi pesanan dan pembayaran.

**Target pengguna website:** wanita usia 17–35 tahun, mayoritas mahasiswa, positioning harga mid-range.

**Prinsip utama V1**
- Pembayaran **sepenuhnya manual** (tanpa payment gateway, tanpa QRIS).
- Semua pengaturan konten dan aturan bisnis diserahkan ke **admin** (produk, kategori, warna, ukuran, harga, diskon, ongkir, time-out, lookbook, FAQ, kontak).
- Retail dan grosir memakai **alur yang sama**. Fleksibilitas harga grosir ditangani lewat fitur edit invoice oleh admin.

---

## 2. Tujuan dan Metrik Keberhasilan

### 2.1 Tujuan
1. Memindahkan proses pemesanan dari chat WhatsApp manual menjadi form terstruktur di website, dengan invoice otomatis.
2. Memberi customer visibilitas atas status pesanan tanpa harus bertanya ke admin.
3. Memudahkan admin mengelola produk, stok, dan pesanan dari satu dashboard.
4. Transparansi ongkir sebelum checkout untuk mengurangi komplain, khususnya pengiriman luar Jawa.

### 2.2 KPI (usulan)
KPI adalah angka target untuk mengukur keberhasilan website. Nilai target diisi setelah 1–2 bulan data berjalan (baseline).

| KPI | Cara mengukur | Target |
|---|---|---|
| Porsi pesanan lewat website | Pesanan website ÷ total pesanan (website + chat manual) | Ditetapkan setelah baseline |
| Waktu konfirmasi admin | Selisih waktu pesanan masuk → status Dikonfirmasi | Ditetapkan setelah baseline |
| Komplain ongkir per bulan | Jumlah komplain ongkir yang dicatat admin | Menurun dari baseline |
| Pesanan per bulan | Jumlah pesanan berstatus Selesai | Ditetapkan setelah baseline |
| Tingkat pembatalan | Dibatalkan ÷ total pesanan | Dipantau lewat laporan |

---

## 3. Ruang Lingkup V1

### 3.1 Termasuk
- Website katalog produk, dapat diakses siapa saja.
- Daftar, login, dan reset password customer (email + password).
- Pemilihan varian (warna + ukuran), **keranjang belanja**, dan form pesanan.
- Cek ongkir otomatis dengan rekomendasi default **Kantor Pos**; customer tetap bisa memilih JNT/JNE.
- Pilihan metode bayar ongkir (TF/COD) dan metode bayar produk (DANA/rekening bank yang diisi admin).
- Invoice otomatis ter-generate saat klik "Pesan" dan dikirim ke admin (WhatsApp, notifikasi push, notifikasi di web).
- Admin edit qty, harga, diskon, dan ongkir; invoice digenerate ulang dengan penanda revisi.
- Admin membuatkan pesanan (pre-order) dengan data customer manual.
- Verifikasi pembayaran manual oleh admin (bukti dikirim via WhatsApp).
- Pembatalan pesanan oleh customer lewat website sebelum pesanan diproses.
- Perpanjangan time-out stok oleh admin.
- Input resi manual dan notifikasi ke customer saat pesanan dikirim.
- Menu "Pesanan Saya" untuk customer.
- Rating dan ulasan produk (teks saja, tanpa foto) oleh customer untuk pesanan yang Selesai, dengan moderasi oleh admin.
- Dashboard Admin: kelola kategori, produk, varian, stok, foto, lookbook, FAQ, pengaturan, pesanan, dan laporan.
- Dashboard Super Admin: kelola admin, kelola user (termasuk ganti password), laporan.
- Laporan pesanan dengan filter dan export Excel/PDF.

### 3.2 Tidak termasuk V1
- Payment gateway otomatis (Midtrans/QRIS/virtual account).
- Pembayaran QRIS statis.
- Tracking pengiriman otomatis real-time dari API ekspedisi (menyusul di fase berikutnya).
- Pre-order yang dipesan langsung oleh customer di website (pre-order hanya lewat admin).
- Login dengan OTP WhatsApp.
- Foto/video pada ulasan produk (menghemat Supabase Storage).

---

## 4. Peran Pengguna dan Hak Akses

| Peran | Deskripsi |
|---|---|
| **Customer** | Mengunjungi website, membuat akun, memesan, membatalkan pesanan, memantau pesanan. |
| **Admin** | Operasional harian: produk, stok, pesanan, pembayaran, pengiriman, konten, laporan. |
| **Super Admin** | Pengawas: kelola admin, kelola user, laporan. **Tidak bisa** CRUD produk dan pesanan. |

### 4.1 Matriks akses

| Fitur | Customer | Admin | Super Admin |
|---|:---:|:---:|:---:|
| Lihat katalog, lookbook, FAQ | ✔ | ✔ | ✔ |
| Buat pesanan sendiri | ✔ | – | – |
| Batalkan pesanan sendiri (sebelum Diproses) | ✔ | – | – |
| Beri rating dan ulasan (pesanan Selesai) | ✔ | – | – |
| CRUD kategori, produk, varian, stok, foto | – | ✔ | – |
| CRUD lookbook dan FAQ | – | ✔ | – |
| Moderasi ulasan (sembunyikan/tampilkan/hapus) | – | ✔ | – |
| Pengaturan (nomor WA, DANA, rekening) | – | ✔ | – |
| Lihat dan proses semua pesanan | – | ✔ | – |
| Buat pesanan manual untuk customer | – | ✔ | – |
| Edit pesanan/invoice, perpanjang time-out | – | ✔ | – |
| Verifikasi pembayaran, input resi | – | ✔ | – |
| Laporan pesanan + export | – | ✔ | ✔ (tanpa alamat dan nomor customer) |
| Kelola admin | – | – | ✔ |
| Kelola user, ganti password user | – | – | ✔ |
| Lihat log aktivitas | – | – | ✔ |

Pembatasan hak akses dikunci di level database (RLS), bukan hanya disembunyikan di tampilan. Satu akun Super Admin dipegang pemilik brand.

---

## 5. Alur Utama (Retail dan Grosir Disatukan)

### 5.1 Dari pemesanan sampai invoice terkirim
1. Customer melihat katalog, memilih produk, warna, ukuran, dan jumlah, lalu menambahkannya ke keranjang.
2. Customer mengisi form pesanan (nama, kontak, alamat).
3. Sistem menampilkan estimasi ongkir otomatis. Kantor Pos direkomendasikan sebagai default; customer bisa memilih JNT atau JNE.
4. Customer memilih metode bayar ongkir (TF/COD) dan metode bayar produk (DANA/rekening bank).
5. Customer klik **"Pesan"**. Sistem:
   - menyimpan pesanan dan mengunci stok,
   - membuat invoice otomatis,
   - mengirim invoice ke admin: pesan WhatsApp (customer tinggal menekan kirim), notifikasi push, dan notifikasi di dashboard web.

### 5.2 Dari pengecekan admin sampai selesai
1. Admin membuka pesanan. Untuk grosir atau koreksi, admin mengubah qty, harga, diskon, dan/atau ongkir.
2. Jika ada perubahan, invoice digenerate ulang (dapat diunduh, ada penanda revisi dan timestamp) dan status menjadi **Direvisi Admin**. Customer mendapat notifikasi.
3. Admin mengonfirmasi invoice final ke customer lewat WhatsApp (status **Dikonfirmasi**).
4. Customer membayar (DANA/rekening) dan mengirim bukti bayar via WhatsApp (bukan upload di website).
5. Admin memeriksa bukti bayar, lalu menandai pembayaran produk **Lunas** dan mengubah status menjadi **Diproses**.
6. Admin packing dan menyerahkan barang ke ekspedisi.
7. Admin menginput kurir dan nomor resi sambil mengubah status menjadi **Dikirim**. Customer menerima notifikasi push dan notifikasi di web.
8. Customer menerima barang; admin mengubah status menjadi **Selesai**.
9. Customer memantau seluruh status di menu "Pesanan Saya".

### 5.3 Pesanan buatan admin (pre-order)
Pre-order tidak tersedia untuk customer langsung. Customer menghubungi admin terlebih dahulu. Admin lalu membuat pesanan dari dashboard:
- Jika produk sudah ada, admin memilihnya seperti customer memesan.
- Jika belum ada, admin menambah produk lebih dulu lewat form tambah produk.
- Data customer diisi manual oleh admin (tanpa harus punya akun). Data disimpan langsung pada pesanan dan tidak muncul di daftar user.

---

## 6. Daftar Fitur

### 6.1 Customer

| Fitur | Deskripsi |
|---|---|
| Katalog produk | Daftar produk per kategori, foto, varian warna/ukuran, harga, ketersediaan stok per varian |
| Detail produk | Pilih warna, pilih ukuran (sesuai warna), jumlah, serta rata-rata rating dan daftar ulasan |
| Keranjang | Menyimpan beberapa produk sebelum checkout |
| Daftar, login, lupa password | Email + password; reset lewat link email |
| Form pesanan | Data penerima, alamat, ekspedisi, metode bayar ongkir dan produk |
| Cek ongkir otomatis | Estimasi dari alamat tujuan; default rekomendasi Pos |
| Invoice otomatis | Dibuat saat klik "Pesan", dapat dilihat dan diunduh |
| Pesanan Saya | Riwayat, status, revisi invoice, kurir dan nomor resi |
| Batalkan pesanan | Sebelum Diproses, dengan memilih alasan |
| Rating dan ulasan | Beri bintang 1–5 dan teks ulasan (tanpa foto) per produk pada pesanan Selesai lewat "Pesanan Saya"; edit/hapus ulasan sendiri |
| Notifikasi | Push dan di dalam web (pesanan direvisi, diproses, dikirim, dibatalkan) |
| Lookbook dan FAQ | Halaman informasi yang dikelola admin |

### 6.2 Admin

| Fitur | Deskripsi |
|---|---|
| Kelola kategori | Tambah, ubah, hapus kategori |
| Kelola produk | Nama, kategori, deskripsi, harga, berat (gram), status |
| Kelola varian | Warna (teks + foto), ukuran, stok per kombinasi (lihat 6.4) |
| Kelola pesanan | Daftar dan detail pesanan, filter status |
| Edit invoice | Ubah qty, harga, diskon, ongkir sebelum Diproses; generate ulang invoice |
| Perpanjang time-out | Tombol perpanjang masa penahanan stok per pesanan |
| Buat pesanan manual | Untuk pre-order atau pesanan lewat chat, data customer manual |
| Verifikasi pembayaran | Tandai Lunas setelah memeriksa bukti bayar di WhatsApp |
| Proses dan kirim | Input kurir dan nomor resi, ubah status |
| Laporan | Lihat dan export (bagian 9) |
| Kelola lookbook | CRUD foto lookbook |
| Kelola FAQ | CRUD pertanyaan dan jawaban |
| Kelola ulasan | Lihat semua ulasan, sembunyikan/tampilkan, hapus ulasan yang tidak pantas |
| Pengaturan | Nomor WhatsApp admin, nomor DANA, rekening bank, durasi default time-out, asal pengiriman, buffer kemasan dan pembulatan berat |
| Notifikasi | Push dan di dalam web untuk pesanan baru dan pembatalan |

### 6.3 Super Admin

| Fitur | Deskripsi |
|---|---|
| Kelola admin | Tambah, nonaktifkan, hapus akun admin |
| Kelola user | Daftar user, nonaktifkan akun |
| Ganti password user/admin | Lihat bagian 12.3 |
| Kirim link reset | Alternatif ganti password yang lebih aman |
| Laporan | Sama dengan admin, tanpa alamat dan nomor customer |
| Log aktivitas | Riwayat perubahan password dan pengelolaan akun |

### 6.4 Struktur produk, warna, ukuran, dan stok
- Satu **produk** memiliki banyak **warna**.
- Setiap warna berisi: nama warna (teks, misalnya "Merah"), foto utama, dan foto tambahan opsional.
- **Ukuran** dapat diatur untuk **semua warna** sekaligus atau untuk **warna tertentu saja**. Satu produk boleh punya set ukuran berbeda di tiap warna.
- **Stok dicatat per varian** (kombinasi warna + ukuran), misalnya Merah-L: 10.
- Penjualan hanya untuk stok ready.

### 6.5 Foto produk, lookbook, dan konten
- Foto **diupload langsung** lewat form (bukan link), disimpan di **Supabase Storage**.
- Browser mengecilkan gambar sebelum upload: sisi terpanjang maksimal 1200 px, format WebP, ukuran file maksimal 2 MB.
- Form menampilkan pratinjau gambar setelah dipilih.
- Saat produk, warna, atau lookbook dihapus, file gambarnya ikut dihapus dari storage.
- Lookbook (foto produk dengan styling outfit) dan FAQ dikelola admin lewat CRUD.

---

## 7. Status Pesanan dan Pembayaran

### 7.1 Status pesanan

| Status | Artinya |
|---|---|
| Menunggu Konfirmasi | Invoice baru masuk, admin belum memeriksa |
| Direvisi Admin | Admin mengubah qty/harga/diskon/ongkir, invoice digenerate ulang |
| Dikonfirmasi | Invoice final disepakati, menunggu pembayaran |
| Diproses | Pembayaran produk sudah diverifikasi admin, barang disiapkan |
| Dikirim | Barang sudah di tangan kurir, resi terisi |
| Selesai | Barang sudah diterima customer |
| Dibatalkan | Dibatalkan customer atau admin; stok dikembalikan; alasan tercatat |
| Kedaluwarsa | Time-out stok habis tanpa pembayaran; stok dikembalikan; dihitung Dibatalkan di laporan |

> Status "Menunggu Pembayaran" dan "Bukti Dikirim" pada v1.0 dihapus karena bukti bayar dikirim lewat WhatsApp sehingga sistem tidak dapat mendeteksinya.

### 7.2 Status pembayaran produk
**Belum Dibayar → Lunas** (diubah admin setelah memeriksa bukti bayar).

### 7.3 Ongkir
Ongkir **tidak** memiliki status pembayaran. Yang tercatat hanya metode ongkir (TF/COD) dan nominalnya di invoice. Customer **wajib membayar ongkir**. Nominal ongkir hanya tampil di detail invoice, tidak di tabel rekap pesanan atau laporan.

---

## 8. Aturan Bisnis

1. **Edit pesanan:** admin dapat mengubah qty, harga, diskon, dan ongkir **hanya sebelum status Diproses**. Setelah itu data pesanan terkunci.
2. **Invoice:** setiap versi punya nomor, nomor revisi, dan timestamp agar tidak tertukar. Invoice dapat diunduh.
3. **Harga grosir dan diskon:** tidak ada harga bertingkat otomatis. Admin menentukan harga dan diskon (persentase atau nominal) lewat edit pesanan.
4. **Subsidi/gratis ongkir:** tidak ada aturan tetap. Admin mengatur lewat edit ongkir pada pesanan.
5. **Stok:** stok varian dikunci saat pesanan dibuat dan dikembalikan saat Dibatalkan atau Kedaluwarsa.
6. **Time-out stok:** default 1×24 jam sejak pesanan dibuat (nilai default dapat diubah di pengaturan admin). Admin dapat **memperpanjang time-out per pesanan**, terutama untuk grosir yang negosiasinya lama, agar customer tidak perlu memesan ulang. Setelah habis tanpa pembayaran, status menjadi Kedaluwarsa.
7. **Pembatalan oleh customer:**
   - Bisa dilakukan lewat website **sebelum pesanan Diproses**. Setelah Diproses atau Dikirim, pembatalan tidak dapat dilakukan.
   - Alasan yang dipilih: (a) salah memilih produk/warna/ukuran/jumlah, (b) salah memasukkan alamat atau data pengiriman, (c) berubah pikiran/tidak jadi membeli.
   - Status berubah otomatis menjadi Dibatalkan beserta alasan yang dipilih, dan admin mendapat notifikasi push serta notifikasi di web.
   - **Pengembalian dana:** untuk pesanan yang dibatalkan sebelum diproses, dana dikembalikan 100%. Customer **menghubungi admin** untuk proses refund; pengembalian dilakukan setelah pembatalan dikonfirmasi Hijabii.
8. **Retur:** mengikuti kebijakan existing, yaitu retur 2×24 jam hanya untuk produk rusak/cacat/salah kirim dengan video unboxing sebagai bukti.
9. **Metode bayar ongkir dan produk bersifat terpisah.** Ongkir boleh COD meski produk sudah ditransfer.
10. **Pre-order:** hanya lewat admin (bagian 5.3).
11. **Rating dan ulasan:**
    - Hanya customer **ber-akun** yang pesanannya berstatus **Selesai** yang dapat memberi ulasan, per produk pada pesanan tersebut. Pesanan manual buatan admin (tanpa akun) tidak dapat diulas.
    - Rating **1–5 bintang wajib**; teks ulasan opsional, maksimal 500 karakter. **Tanpa foto atau video** (menghemat Supabase Storage).
    - Satu ulasan per produk per pesanan. Customer boleh mengedit atau menghapus ulasannya sendiri.
    - Ulasan langsung tampil di detail produk bersama rata-rata rating dan jumlah ulasan. Nama ditampilkan sebagian (nama depan atau inisial).
    - Admin dapat menyembunyikan/menampilkan atau menghapus ulasan yang tidak pantas (spam, kata kasar, data pribadi). Rata-rata rating hanya menghitung ulasan yang tampil.

---

## 9. Laporan Pesanan (Admin dan Super Admin)

Laporan berisi pesanan yang sudah final: **Selesai** dan **Dibatalkan** (termasuk Kedaluwarsa). Pesanan yang masih berjalan dikelola di menu pesanan, bukan di laporan.

### 9.1 Filter

| Filter | Pilihan |
|---|---|
| Status pesanan | Selesai / Dibatalkan / Semua pesanan (Selesai + Dibatalkan) |
| Kategori/produk | Semua (default) / Kategori tertentu / Produk tertentu |
| Periode | Hari / Minggu / Bulan / Tahun, dengan pemilih tanggal |

### 9.2 Isi
- **Ringkasan:** jumlah pesanan selesai, total nilai produk selesai, jumlah pesanan dibatalkan, total nilai pesanan dibatalkan, rincian alasan pembatalan.
- **Tabel:** nomor pesanan, tanggal, customer, produk ringkas, qty, nilai produk, status, alasan batal (untuk yang dibatalkan).

### 9.3 Definisi
- **Nilai produk** = total harga semua produk dalam satu pesanan (qty × harga satuan, setelah diskon dan perubahan harga admin), **tanpa ongkir**.
- Nilai pesanan dibatalkan dipisahkan dari pendapatan (pesanan selesai).
- Periode dihitung dari **tanggal selesai atau tanggal dibatalkan**, zona WIB, minggu dimulai hari Senin.
- Saat memfilter kategori atau produk tertentu, laporan hanya menghitung **baris item yang cocok**; satu pesanan dapat muncul di lebih dari satu laporan kategori.
- Ongkir tidak ditampilkan di laporan maupun file export.
- Super admin tidak melihat alamat dan nomor customer.

### 9.4 Export
- Export **Excel (.xlsx)** dan **PDF** mengikuti filter yang aktif.
- Berisi judul laporan (filter dan periode), tanggal cetak, ringkasan, dan tabel.
- Dibuat di sisi browser.

---

## 10. Data Utama (Ringkasan, Bukan Skema Teknis)

- **Profil/akun:** nama, email, kontak, alamat, role (customer/admin/super admin), status aktif, penanda wajib ganti password.
- **Kategori:** nama.
- **Produk:** nama, kategori, harga, berat aktual (gram), deskripsi, status.
- **Warna produk:** nama warna, foto utama, foto tambahan.
- **Varian:** ukuran, stok, terkait ke warna tertentu (atau berlaku untuk semua warna).
- **Pesanan:** customer (akun atau data manual), daftar item (qty, harga, diskon), ekspedisi, metode bayar ongkir dan produk, status pesanan, status pembayaran produk, batas time-out, alasan pembatalan, kurir dan nomor resi, dibuat oleh (customer/admin).
- **Invoice:** nomor, versi/revisi, total, tanggal.
- **Notifikasi:** penerima, jenis, isi, status dibaca; langganan push per perangkat.
- **Lookbook** dan **FAQ.**
- **Ulasan:** produk, akun customer, pesanan, rating 1–5, teks, status tampil/disembunyikan, waktu (tanpa foto).
- **Pengaturan:** nomor WhatsApp admin, nomor DANA, rekening bank, durasi default time-out, area asal pengiriman (satu lokasi), buffer kemasan dan pembulatan berat kirim.
- **Log aktivitas:** pelaku, aksi, target, waktu (tanpa menyimpan password).

> Skema detail (nama tabel, relasi, tipe field) belum dirancang dan menjadi tugas tahap desain database.

---

## 11. Integrasi Eksternal dan Stack

### 11.1 Stack
| Lapisan | Teknologi |
|---|---|
| Frontend | HTML, CSS, JavaScript (hosting Vercel) |
| Backend | Supabase: database, Auth, Edge Functions, Realtime |
| Storage foto | **Supabase Storage** (paket gratis) |
| Email | SMTP gratis kustom (untuk reset password dan pemberitahuan) |

### 11.2 Integrasi
- **API cek ongkir:** Biteship (condong), dengan verifikasi dukungan Kantor Pos dan kuota gratis sebelum final. Alternatif: Komerce/RajaOngkir. Sistem merekomendasikan Pos sebagai default, tetapi customer dapat memilih JNT/JNE. Estimasi memakai berat kirim yang dihitung server: total (berat produk × qty) + buffer kemasan, dibulatkan ke atas (contoh 250 gram menjadi 400 gram), dari satu asal pengiriman utama ke alamat tujuan. Customer tidak mengisi berat.
- **Supabase Edge Functions:** menyimpan API key di sisi server dan menjalankan aksi berhak istimewa (ganti password user).
- **WhatsApp:** memakai link `wa.me` dengan isi pesan terisi otomatis. Customer harus menekan kirim; pesanan tetap tersimpan di database dan muncul di dashboard admin meski pesan WA tidak terkirim.
- Tidak ada integrasi payment gateway.

### 11.3 Catatan storage
- Paket gratis Supabase memberi file storage sekitar 1 GB dan egress terbatas (angka perlu dicek di supabase.com/pricing sebelum final). Dengan kompresi, 1 GB cukup untuk ribuan foto.
- Foto disimpan sebagai alamat di database. Jika kuota bandwidth mulai penuh, foto dapat dipindah ke Cloudflare R2 (memerlukan domain sendiri untuk alamat publik); data tidak perlu diubah selain awalan alamat.

---

## 12. Autentikasi dan Keamanan

### 12.1 Login
Email + password lewat Supabase Auth. Tidak memakai OTP (berbayar). Perlu SMTP kustom karena email bawaan Supabase sangat terbatas kuotanya.

### 12.2 Lupa password
- **Customer:** klik "Lupa password", masukkan email, terima link reset, atur password baru di halaman reset. Jika email tidak lagi dapat diakses, customer menghubungi admin lewat WhatsApp.
- **Admin:** reset lewat email, atau super admin mengirim link reset atau mengganti password.
- **Super Admin:** reset lewat email. Cadangan terakhir: akun pemilik project Supabase dapat mengatur ulang lewat dashboard Supabase.
- Disarankan memiliki satu akun admin cadangan dengan email berbeda.

### 12.3 Ganti password oleh Super Admin
1. Super admin membuka Kelola User/Admin, lalu klik "Ganti Password".
2. Super admin mengisi password sementara atau memilih generate otomatis (ditampilkan sekali).
3. Perubahan dijalankan lewat Edge Function yang memeriksa dahulu bahwa pemanggil adalah super admin. Service key tidak ada di JavaScript browser.
4. Akun target ditandai **wajib ganti password** saat login berikutnya, dan sesi lama di perangkat lain dikeluarkan.
5. User diberi tahu lewat **email** (berisi waktu perubahan dan instruksi menghubungi admin bila tidak merasa meminta) dan **banner notifikasi di akun** saat login berikutnya.
6. Dicatat di log aktivitas (siapa, akun siapa, kapan; tanpa password).
7. Super admin tidak dapat memakai fitur ini untuk akunnya sendiri. Password sementara disampaikan ke user lewat WhatsApp.
8. Opsi alternatif yang lebih aman: "Kirim link reset", sehingga super admin tidak pernah mengetahui password.

### 12.4 Keamanan data
- RLS aktif di semua tabel: customer hanya melihat pesanannya sendiri; admin dan super admin dibatasi sesuai matriks bagian 4.1.
- API key dan service key hanya di Edge Functions.
- Bucket foto: baca publik, tulis hanya admin.

---

## 13. Notifikasi

| Penerima | Kejadian | Jalur |
|---|---|---|
| Admin | Pesanan baru (invoice masuk) | Push + notifikasi web + WhatsApp |
| Admin | Pesanan dibatalkan customer (beserta alasan) | Push + notifikasi web |
| Customer | Invoice direvisi admin | Push + notifikasi web |
| Customer | Status Diproses | Push + notifikasi web |
| Customer | Status Dikirim (kurir dan nomor resi) | Push + notifikasi web |
| Customer | Pesanan dibatalkan admin atau kedaluwarsa | Push + notifikasi web |
| User/Admin | Password diubah super admin | Email + banner akun |

**Catatan teknis:** push di iPhone hanya berjalan jika website dipasang ke Home Screen (PWA, iOS 16.4 ke atas). Karena itu notifikasi di dalam web (real-time) selalu tersedia sebagai jalur utama di semua perangkat.

---

## 14. Persyaratan Non-Fungsional

| Area | Persyaratan |
|---|---|
| Keamanan | RLS di semua tabel, uji akses per role, Edge Function memverifikasi role |
| Performa | Loading halaman katalog di bawah 3 detik di 4G; gambar dikompres dan lazy-load |
| Backup | Paket gratis Supabase terbatas fitur backup, sehingga dilakukan export data berkala terjadwal |
| Ketersediaan | Project gratis dapat auto-pause setelah 1 minggu tanpa aktivitas. Mitigasi: ping terjadwal mingguan dan pengingat memeriksa status project. Restore dilakukan lewat dashboard Supabase tanpa kehilangan data |
| Testing | Uji manual alur utama (pesan → revisi → konfirmasi → proses → kirim → selesai), pembatalan, time-out, laporan dan export, dan uji RLS |
| Kompatibilitas | Mobile-first (mayoritas pengguna mahasiswa di ponsel), browser modern |

---

## 15. Asumsi yang Berlaku

1. "Semua pesanan" pada laporan berarti Selesai + Dibatalkan; Kedaluwarsa dihitung Dibatalkan.
2. Status **Selesai** diubah manual oleh admin setelah barang diterima.
3. Satu akun super admin dipegang pemilik brand; admin harian terpisah.
4. Rekap untuk admin dan super admin memakai laporan yang sama (bagian 9); perbedaannya hanya pada data customer yang ditampilkan.
5. Time-out default 1×24 jam, dapat diubah di pengaturan dan diperpanjang per pesanan.
6. Paket Supabase gratis dipakai pada tahap awal.
7. Detail aturan ulasan di bagian 8 poin 11 (syarat pesanan Selesai, teks opsional maks 500 karakter, edit/hapus sendiri, tampil langsung, nama tampil sebagian) adalah usulan dan belum dikonfirmasi. Yang pasti: ada rating dan ulasan, tanpa foto.

---

## 16. Hal yang Masih Perlu Dikonfirmasi

| No | Hal | Keterangan |
|---|---|---|
| 1 | API ongkir final | Biteship vs Komerce: pastikan dukungan Kantor Pos dan kuota gratis |
| 2 | Kuota Supabase gratis terbaru | Cek angka file storage (500 MB vs 1 GB) dan egress di supabase.com/pricing |
| 3 | Provider SMTP gratis | Pilih layanan email untuk reset password dan pemberitahuan |
| 4 | Target KPI | Isi angka target setelah ada baseline 1–2 bulan |
| 5 | Waktu proses refund | Diputuskan: tidak ada janji lama proses; customer wajib menghubungi admin dalam 2×24 jam sejak pesanan diterima, lewat dari itu tidak bisa. Skenario batal-sebelum-diproses masih perlu dipertegas |
| 6 | Penyelesaian pesanan | Selesai diubah manual admin, atau otomatis setelah N hari dari Dikirim |
| 7 | Domain | Belum ada; dibutuhkan jika foto dipindah ke R2 atau ingin alamat website sendiri |
| 8 | Konten | Daftar produk awal, varian, harga, nomor WA, DANA, rekening, isi FAQ dan keunggulan brand diisi admin lewat dashboard |
| 9 | Target peluncuran | Tidak ada batas waktu saat ini |

---

## 17. Sinkronisasi dengan Dokumen Lain

- **Dokumen Konsep untuk Client:** masih menyebut upload bukti bayar di website, QRIS, dan status tanpa "Direvisi Admin"/"Kedaluwarsa". Perlu diperbarui agar sesuai PRD ini.
- **Dokumen Kebutuhan Teknis Alur Pembayaran (Midtrans):** keputusan Midtrans dibatalkan; dokumen ditandai **arsip**.

### Riwayat Perubahan dari v1.0

| Hal | v1.0 | v1.1 |
|---|---|---|
| Keranjang | Tidak termasuk | Termasuk |
| Edit pesanan admin | qty dan ongkir | qty, harga, diskon, ongkir |
| Pesanan manual admin | Tidak ada | Ada (pre-order, data customer manual) |
| Stok | Tidak dirinci | Per varian (warna + ukuran) |
| Status | 8 status termasuk Menunggu Pembayaran dan Bukti Dikirim | Disederhanakan; ditambah Dibatalkan dan Kedaluwarsa |
| Status pembayaran | Tidak ada | Produk saja (Belum Dibayar/Lunas); ongkir tidak dicatat |
| Role | Admin saja | Admin + Super Admin |
| Pembatalan | TBD | Ditetapkan (bagian 8) |
| Time-out stok | TBD | Default 1×24 jam + perpanjang oleh admin |
| Retur | TBD | Mengikuti kebijakan existing |
| Autentikasi | TBD | Email + password + reset email |
| Laporan | Rekap penjualan | Laporan dengan 3 filter + export Excel/PDF |
| Foto | Cloudflare R2 | Supabase Storage (upload langsung) |
| Lookbook, FAQ, pengaturan | Tidak ada | CRUD oleh admin |
| Tracking | Diagram otomatis (bertentangan dengan scope) | Resi manual di V1, otomatis di fase berikutnya |

### Perubahan v1.1 ke v1.2

| Hal | v1.1 | v1.2 |
|---|---|---|
| Rating dan ulasan | Tidak ada | Ada, teks saja tanpa foto, oleh customer pesanan Selesai; moderasi admin |
| Batas refund | TBD | 2×24 jam sejak pesanan diterima, tanpa janji lama proses |

---

*— Dokumen ini hidup dan akan diperbarui seiring keputusan baru —*
