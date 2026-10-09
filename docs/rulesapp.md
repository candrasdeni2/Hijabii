# Aturan Aplikasi Hijabii by Intan (V1)

Acuan: PRD v1.2, `fitur.md`, `schema.sql`, `rls.sql`.

---

## 1. Prinsip Umum
- Pembayaran **sepenuhnya manual** (tanpa payment gateway, tanpa QRIS).
- Retail dan grosir memakai **alur yang sama**. Fleksibilitas harga grosir lewat edit invoice oleh admin.
- Penjualan hanya untuk **stok ready**.
- Semua pengaturan konten dan aturan bisnis dikelola admin.

## 2. Status Pesanan

| Status | Artinya |
|---|---|
| Menunggu Konfirmasi | Invoice baru masuk, admin belum memeriksa |
| Direvisi Admin | Admin mengubah qty/harga/diskon/ongkir, invoice digenerate ulang |
| Dikonfirmasi | Invoice final disepakati, menunggu pembayaran |
| Diproses | Pembayaran produk terverifikasi, barang disiapkan |
| Dikirim | Barang di tangan kurir, resi terisi |
| Selesai | Barang sudah diterima customer |
| Dibatalkan | Dibatalkan customer/admin; stok dikembalikan; alasan tercatat |
| Kedaluwarsa | Time-out habis tanpa pembayaran; stok dikembalikan; dihitung Dibatalkan di laporan |

- Status **Selesai** diubah manual oleh admin setelah barang diterima.
- Transisi yang diizinkan (dijaga trigger database):
  - Menunggu Konfirmasi → Direvisi Admin, Dikonfirmasi, Dibatalkan, Kedaluwarsa
  - Direvisi Admin → Dikonfirmasi, Dibatalkan, Kedaluwarsa
  - Dikonfirmasi → Direvisi Admin, Diproses, Dibatalkan, Kedaluwarsa
  - Diproses → Dikirim, Dibatalkan (hanya admin)
  - Dikirim → Selesai
  - Selesai, Dibatalkan, Kedaluwarsa adalah status akhir
- Diproses hanya bisa dicapai dari Dikonfirmasi dan hanya bila pembayaran produk sudah Lunas. Dikirim hanya bila kurir dan nomor resi terisi.
- Status pembayaran produk hanya dua: **Belum Dibayar → Lunas** (diubah admin setelah memeriksa bukti bayar).

## 3. Aturan Edit Pesanan & Invoice
1. Admin boleh mengubah qty, harga, diskon, dan ongkir **hanya sebelum status Diproses**. Setelah itu data pesanan **terkunci**.
2. Setiap versi invoice punya nomor, nomor revisi, dan timestamp. Invoice dapat diunduh. Nomor pesanan berformat `HJB-YYMMDD-0001`, nomor invoice `INV-YYMMDD-0001` (sama untuk semua revisi; revisi 0 = invoice awal).
3. Tidak ada harga grosir bertingkat otomatis. Admin menentukan harga dan diskon (persen atau nominal) lewat edit pesanan.
4. Tidak ada aturan tetap subsidi/gratis ongkir. Admin mengatur lewat edit ongkir per pesanan.
5. Customer mendapat notifikasi setiap invoice direvisi.

## 4. Aturan Stok & Time-out
1. Stok dicatat **per varian** (warna + ukuran).
2. Stok **dikunci saat pesanan dibuat** (klik Pesan).
3. Stok **dikembalikan** saat pesanan Dibatalkan atau Kedaluwarsa.
4. Time-out default **1×24 jam** sejak pesanan dibuat. Nilai default bisa diubah di pengaturan admin.
5. Admin bisa **memperpanjang time-out per pesanan** (terutama grosir yang negosiasinya lama), sehingga customer tidak perlu memesan ulang.
6. Jika time-out habis tanpa pembayaran (pembayaran produk masih Belum Dibayar), status otomatis menjadi **Kedaluwarsa** dan customer diberi notifikasi. Pengecekan berjalan terjadwal tiap 10 menit.
7. Perpanjangan time-out hanya bisa dilakukan sebelum status Diproses.

## 5. Aturan Pembayaran
1. Metode bayar **produk**: DANA atau rekening bank (nomor diisi admin di pengaturan).
2. Metode bayar **ongkir**: TF atau COD. Keduanya **terpisah**, jadi ongkir boleh COD meski produk sudah ditransfer.
3. Bukti bayar dikirim customer **lewat WhatsApp**, bukan upload di website.
4. Admin memeriksa bukti bayar, lalu menandai **Lunas** dan mengubah status ke **Diproses** dalam satu langkah. Hanya bisa dari status Dikonfirmasi.
5. Ongkir **tidak punya status pembayaran**. Yang tercatat hanya metode (TF/COD) dan nominal di invoice. Customer **wajib membayar ongkir**.
6. Nominal ongkir hanya tampil di **detail invoice**, tidak di tabel rekap pesanan, laporan, maupun file export.

## 6. Aturan Ongkir
- Estimasi otomatis dari alamat tujuan lewat API cek ongkir (Biteship/Komerce, final belum diputuskan).
- Default rekomendasi **Kantor Pos**; customer tetap bebas memilih JNT atau JNE.
- Nominal ongkir dari estimasi dikirim bersama pesanan dan **diverifikasi admin** lewat edit invoice sebelum Dikonfirmasi. Admin dapat mengubahnya per pesanan.

### Berat dan asal pengiriman
1. Admin mengisi **berat aktual** tiap produk (`weight_gram`, per pcs, wajib). Customer tidak mengisi berat apa pun saat checkout.
2. **Berat kirim** dihitung server (Edge Function cek ongkir), bukan klien: jumlah (berat produk × qty) seluruh item, ditambah **buffer kemasan** satu kali per pesanan, lalu **dibulatkan ke atas**. Buffer dan kelipatan pembulatan diatur admin di pengaturan (default 100 gram dan 100 gram). Contoh: 1 produk 250 gram → 250 + 100 = 350 → dibulatkan menjadi 400 gram.
3. Berat aktual produk tidak pernah diubah oleh aturan ini. Buffer dan pembulatan hanya dipakai saat meminta estimasi ke API, sehingga aturannya bisa diubah tanpa menyentuh data produk.
4. Asal pengiriman hanya **satu lokasi utama** untuk semua produk (`origin_area_id` di pengaturan, diisi admin). Belum ada asal per produk.
5. Alur estimasi: berat produk → total berat pesanan + buffer → pembulatan → asal + alamat tujuan → API ongkir → estimasi.
6. Bila asal pengiriman belum diisi atau API gagal, customer tetap bisa memesan dan admin mengisi ongkir lewat edit invoice.

## 7. Aturan Pembatalan oleh Customer
1. Hanya bisa lewat website **sebelum pesanan Diproses**. Setelah Diproses atau Dikirim, **tidak bisa dibatalkan**.
2. Customer wajib memilih salah satu alasan:
   - Salah memilih produk/warna/ukuran/jumlah
   - Salah memasukkan alamat atau data pengiriman
   - Berubah pikiran/tidak jadi membeli
3. Status otomatis berubah menjadi **Dibatalkan** beserta alasannya.
4. Admin mendapat notifikasi push dan notifikasi di web.
5. Stok dikembalikan.

### Pembatalan oleh Admin
1. Admin bisa membatalkan pesanan yang belum Dikirim (termasuk yang sudah Diproses).
2. Catatan alasan **wajib** diisi; alasan tercatat sebagai `dibatalkan_admin`.
3. Stok dikembalikan dan customer akun mendapat notifikasi.

## 8. Aturan Refund (Pengembalian Dana)
1. Pesanan yang dibatalkan **sebelum diproses**: dana dikembalikan **100%**.
2. Customer **menghubungi admin** untuk proses refund (tidak otomatis lewat website).
3. Pengembalian dilakukan **setelah pembatalan dikonfirmasi** Hijabii.
4. Tidak ada janji lama proses refund.
5. Batas waktu pengajuan: customer harus menghubungi admin dalam **2×24 jam sejak pesanan diterima**, dengan ketentuan yang berlaku (lihat Aturan Retur).
6. Jika customer menghubungi admin setelah lewat 2×24 jam sejak pesanan datang (misalnya baru menghubungi di hari ke-3), refund **tidak bisa** dilakukan.

## 9. Aturan Retur
- Mengikuti kebijakan existing: retur **2×24 jam**, hanya untuk produk **rusak/cacat/salah kirim**.
- Wajib menyertakan **video unboxing** sebagai bukti.

## 10. Aturan Pre-order
- Customer **tidak bisa** pre-order langsung di website.
- Customer menghubungi admin dulu, lalu admin membuat pesanan dari dashboard.
- Data customer diisi manual oleh admin (tanpa perlu akun) dan disimpan langsung di pesanan, **tidak muncul di daftar user**.
- Pada pesanan manual, admin boleh menentukan harga satuan dan diskon sejak awal (pesanan website selalu memakai harga katalog dari server).
- Pesanan manual tidak punya akun customer, sehingga tidak ada notifikasi ke customer dan tidak bisa diulas.
- Jika produk belum ada, admin menambahkannya lebih dulu.

## 11. Aturan Produk, Varian & Foto
- Satu produk punya banyak warna; tiap warna punya nama (teks), foto utama, foto tambahan opsional.
- Ukuran bisa diatur untuk semua warna atau warna tertentu saja; set ukuran boleh beda tiap warna.
- Foto diupload langsung lewat form ke Supabase Storage (bukan link).
- Kompresi di browser: sisi terpanjang maks **1200 px**, format **WebP**, ukuran maks **2 MB**. Form menampilkan pratinjau.
- Saat produk, warna, atau lookbook dihapus, file gambarnya **ikut dihapus** dari storage.

## 12. Aturan Rating & Ulasan
1. Hanya customer **ber-akun** dengan pesanan berstatus **Selesai** yang bisa memberi ulasan, per produk pada pesanan tersebut.
2. Pesanan manual buatan admin (tanpa akun) **tidak bisa** diulas.
3. Rating **1–5 bintang wajib**. Teks ulasan opsional, maksimal **500 karakter**.
4. **Tanpa foto atau video** (menghemat Supabase Storage).
5. Satu ulasan per produk per pesanan. Customer boleh **mengedit atau menghapus** ulasannya sendiri.
6. Ulasan langsung tampil di detail produk bersama rata-rata rating dan jumlah ulasan. Nama ditampilkan sebagian (saat ini diimplementasikan: nama depan saja, atau "Pembeli" bila kosong).
7. Admin boleh **menyembunyikan/menampilkan** atau menghapus ulasan yang tidak pantas (spam, kata kasar, data pribadi). Rata-rata rating hanya menghitung ulasan yang tampil.
8. Akses dikunci di RLS: customer hanya menulis/mengubah ulasannya sendiri dan hanya untuk item pesanannya yang Selesai; moderasi hanya admin.
9. Catatan: detail di poin 1, 3, 5, 6, dan 7 adalah usulan dan belum dikonfirmasi. Yang sudah pasti: ada rating dan ulasan, tanpa foto.

## 13. Aturan Hak Akses
- **Customer**: hanya melihat dan mengelola pesanannya sendiri.
- **Admin**: operasional harian (produk, stok, pesanan, pembayaran, pengiriman, konten, laporan).
- **Super Admin**: kelola admin, user, laporan, log aktivitas. **Tidak bisa** CRUD produk dan pesanan. Tidak melihat alamat dan nomor customer di laporan.
- Pembatasan dikunci di level database (**RLS** aktif di semua tabel), bukan hanya disembunyikan di tampilan.
- Satu akun Super Admin dipegang pemilik brand. Disarankan ada satu akun admin cadangan dengan email berbeda.
- Akun pertama super admin dibuat dengan mendaftar biasa lalu role diubah lewat SQL Editor oleh pemilik project. Akun admin berikutnya dibuat super admin lewat Edge Function.
- Hanya akun **aktif** yang memiliki peran. Akun nonaktif kehilangan semua hak akses peran.
- Super admin dapat membaca daftar user (profil) untuk mengelola akun. Alamat dan nomor customer pada pesanan dan laporan tidak terlihat olehnya.
- Bucket foto: baca publik, tulis hanya admin.
- API key dan service key hanya di Edge Functions, tidak di JavaScript browser.

## 14. Aturan Autentikasi & Password
1. Login email + password via Supabase Auth (tanpa OTP). Reset lewat link email (SMTP kustom).
2. **Customer**: reset lewat email; jika email tidak bisa diakses, hubungi admin via WhatsApp.
3. **Admin**: reset lewat email, atau super admin kirim link reset/ganti password.
4. **Super Admin**: reset lewat email. Cadangan terakhir lewat dashboard Supabase oleh pemilik project.
5. **Ganti password oleh Super Admin:**
   - Lewat Edge Function yang memverifikasi dulu bahwa pemanggil adalah super admin
   - Password sementara diisi manual atau generate otomatis (ditampilkan sekali)
   - Akun target ditandai **wajib ganti password** saat login berikutnya, sesi lama di perangkat lain dikeluarkan
   - User diberi tahu lewat email dan banner di akun
   - Dicatat di log aktivitas (tanpa password)
   - **Tidak boleh dipakai untuk akun super admin sendiri**
   - Password sementara disampaikan ke user lewat WhatsApp
   - Alternatif lebih aman: "Kirim link reset"

## 15. Aturan Notifikasi

| Penerima | Kejadian | Jalur |
|---|---|---|
| Admin | Pesanan baru | Push + web + WhatsApp |
| Admin | Pesanan dibatalkan customer (+ alasan) | Push + web |
| Customer | Invoice direvisi | Push + web |
| Customer | Diproses | Push + web |
| Customer | Dikirim (kurir + resi) | Push + web |
| Customer | Dibatalkan admin / kedaluwarsa | Push + web |
| User/Admin | Password diubah super admin | Email + banner akun |

- Notifikasi **di dalam web (real-time)** adalah jalur utama di semua perangkat.
- Notifikasi admin dikirim ke semua akun dengan role admin yang aktif (super admin tidak menerima notifikasi pesanan).
- Push di iPhone hanya jalan jika website dipasang ke Home Screen (PWA, iOS 16.4+).
- WhatsApp memakai link `wa.me`: customer harus menekan kirim sendiri. Pesanan tetap tersimpan di database dan muncul di dashboard admin meski pesan WA tidak terkirim.

## 16. Aturan Laporan
1. Hanya berisi pesanan final: **Selesai** dan **Dibatalkan** (termasuk Kedaluwarsa). Pesanan berjalan dikelola di menu pesanan.
2. "Semua pesanan" = Selesai + Dibatalkan.
3. **Nilai produk** = total harga semua produk dalam satu pesanan (qty × harga satuan, setelah diskon dan perubahan harga admin), **tanpa ongkir**.
4. Nilai pesanan dibatalkan dipisahkan dari pendapatan (pesanan selesai).
5. Periode dihitung dari **tanggal selesai atau tanggal dibatalkan**, zona **WIB**, minggu mulai **Senin**.
6. Filter kategori/produk tertentu hanya menghitung **baris item yang cocok**; satu pesanan bisa muncul di lebih dari satu laporan kategori.
7. Ongkir tidak ditampilkan di laporan maupun export.
8. Super admin tidak melihat alamat dan nomor customer.
9. Export Excel (.xlsx) dan PDF mengikuti filter aktif, berisi judul (filter + periode), tanggal cetak, ringkasan, dan tabel. Dibuat di sisi browser.

## 17. Aturan Non-Fungsional
- Mobile-first, browser modern.
- Katalog load di bawah 3 detik di 4G; gambar dikompres dan lazy-load.
- Backup lewat export data berkala terjadwal.
- Supabase gratis bisa auto-pause setelah 1 minggu tanpa aktivitas: mitigasi dengan ping terjadwal mingguan.

## 18. Yang Masih Belum Diputuskan
- API ongkir final (Biteship vs Komerce, cek dukungan Kantor Pos dan kuota gratis)
- Kuota Supabase gratis terbaru (500 MB vs 1 GB, egress)
- Provider SMTP gratis
- Status Selesai: manual admin atau otomatis N hari setelah Dikirim
- Domain (dibutuhkan jika foto pindah ke Cloudflare R2 atau ingin alamat website sendiri)
- Target KPI (setelah baseline 1–2 bulan)
- Skenario refund untuk pembatalan sebelum diproses perlu dipertegas (kapan customer dianggap sudah membayar, karena Lunas baru dicatat saat Diproses)
- Apakah super admin boleh melihat kolom phone dan address di daftar user (profil), atau disembunyikan lewat view daftar user