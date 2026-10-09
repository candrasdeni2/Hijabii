# Fitur Website Hijabii by Intan (V1)

Acuan: PRD v1.2, `rulesapp.md`, `schema.sql`, `rls.sql`. Dibagi per peran: Customer, Admin, Super Admin.

---

## 1. Customer

### Akun
- Daftar, login (email + password)
- Lupa password: reset lewat link email. Jika email tidak bisa diakses, hubungi admin via WhatsApp
- Profil: ubah nama, kontak, dan alamat sendiri
- Wajib ganti password saat login berikutnya jika password diubah super admin

### Katalog & Informasi
- Katalog produk per kategori (foto, varian warna/ukuran, harga, ketersediaan stok per varian)
- Detail produk: pilih warna, ukuran (sesuai warna yang dipilih), dan jumlah, plus rata-rata rating dan daftar ulasan
- Lookbook (foto produk dengan styling outfit)
- FAQ

### Pemesanan
- Keranjang belanja (simpan beberapa produk sebelum checkout)
- Form pesanan: nama, kontak, alamat penerima
- Cek ongkir otomatis berdasarkan alamat tujuan (default rekomendasi Kantor Pos, bisa pilih JNT/JNE). Nominal ongkir hanya tampil di detail invoice
- Pilih metode bayar ongkir (TF/COD)
- Pilih metode bayar produk (DANA/rekening bank)
- Tombol **Pesan** → pesanan tersimpan, stok terkunci, invoice otomatis dibuat dan dikirim ke admin (pesan WhatsApp `wa.me` terisi otomatis, customer tinggal menekan kirim)
- Invoice dapat dilihat dan diunduh

### Pesanan Saya
- Riwayat pesanan dan status terkini
- Melihat revisi invoice (versi, nomor revisi, timestamp)
- Melihat kurir dan nomor resi
- Batalkan pesanan (sebelum status Diproses) dengan memilih alasan
- Tombol **Beri Ulasan** per produk pada pesanan berstatus Selesai

### Rating & Ulasan
- Beri rating 1–5 bintang (wajib) dan teks ulasan (opsional, maks 500 karakter) per produk, hanya untuk pesanan Selesai
- **Tanpa upload foto/video** (Supabase Storage terbatas)
- Edit atau hapus ulasan sendiri
- Lihat rata-rata rating dan ulasan customer lain di detail produk (nama tampil sebagian)
- Catatan: detail aturan ulasan (syarat pesanan Selesai, maks 500 karakter, edit/hapus sendiri, tampil langsung, nama tampil sebagian) masih usulan dan belum dikonfirmasi. Yang pasti: ada rating dan ulasan, tanpa foto

### Notifikasi (push + di dalam web)
- Invoice direvisi admin
- Pesanan Diproses
- Pesanan Dikirim (kurir dan nomor resi)
- Pesanan dibatalkan admin atau kedaluwarsa
- Banner di akun jika password diubah oleh super admin

---

## 2. Admin

### Katalog & Konten
- CRUD kategori
- CRUD produk (nama, kategori, deskripsi, harga, berat aktual dalam gram, status)
- CRUD varian: warna (nama teks + foto utama + foto tambahan opsional), ukuran (untuk semua warna atau warna tertentu saja), stok per kombinasi warna + ukuran
- Upload foto langsung lewat form dengan pratinjau (kompres otomatis di browser)
- CRUD lookbook
- CRUD FAQ

### Pengelolaan Pesanan
- Daftar dan detail pesanan, filter berdasarkan status
- **Edit invoice** (sebelum Diproses): ubah qty, harga, diskon (persen/nominal), dan ongkir. Invoice digenerate ulang dengan penanda revisi dan timestamp, status menjadi Direvisi Admin
- Konfirmasi invoice final ke customer via WhatsApp (status Dikonfirmasi)
- **Perpanjang time-out** stok per pesanan
- **Buat pesanan manual** untuk pre-order atau pesanan lewat chat (data customer diisi manual, tanpa perlu akun)
- Tambah produk baru langsung dari form pesanan manual bila produk belum ada
- **Verifikasi pembayaran**: tandai Lunas setelah memeriksa bukti bayar yang dikirim via WhatsApp. Hanya bisa dari status Dikonfirmasi, dan sekaligus mengubah status ke Diproses (data pesanan lalu terkunci)
- **Proses & kirim**: input kurir dan nomor resi (wajib), ubah status ke Dikirim
- Tandai pesanan Selesai secara manual setelah barang diterima customer (hanya dari status Dikirim)
- Batalkan pesanan sebelum Dikirim (alasan wajib dicatat, stok dikembalikan). Customer sendiri hanya bisa membatalkan sebelum Diproses

### Ulasan
- Lihat semua ulasan customer
- Sembunyikan/tampilkan atau hapus ulasan yang tidak pantas (spam, kata kasar, data pribadi)

### Laporan
- Laporan pesanan final (Selesai dan Dibatalkan, termasuk Kedaluwarsa)
- Filter: status, kategori/produk, periode (hari/minggu/bulan/tahun)
- Ringkasan: jumlah dan nilai pesanan selesai, jumlah dan nilai pesanan batal, rincian alasan pembatalan
- Tabel: no. pesanan, tanggal, customer, produk ringkas, qty, nilai produk, status, alasan batal
- Export Excel (.xlsx) dan PDF sesuai filter aktif

### Pengaturan
- Nomor WhatsApp admin
- Nomor DANA
- Rekening bank
- Durasi default time-out stok
- Asal pengiriman (satu lokasi), buffer kemasan, dan pembulatan berat kirim untuk estimasi ongkir

### Notifikasi (push + di dalam web)
- Pesanan baru (juga lewat WhatsApp)
- Pesanan dibatalkan customer beserta alasan

---

## 3. Super Admin

Peran pengawas. **Tidak bisa** CRUD produk dan pesanan.

- Kelola admin: tambah, nonaktifkan, hapus akun admin
- Kelola user: lihat daftar user, nonaktifkan akun
- Ganti password user/admin (password sementara atau generate otomatis, ditampilkan sekali). Tidak bisa dipakai untuk akun sendiri
- Kirim link reset password (alternatif lebih aman, super admin tidak tahu password)
- Laporan pesanan + export Excel/PDF (sama seperti admin, **tanpa alamat dan nomor customer**)
- Log aktivitas: riwayat perubahan password dan pengelolaan akun (pelaku, aksi, target, waktu; tanpa password)

---

## Matriks Akses Ringkas

| Fitur | Customer | Admin | Super Admin |
|---|:---:|:---:|:---:|
| Lihat katalog, lookbook, FAQ | ✔ | ✔ | ✔ |
| Buat pesanan sendiri | ✔ | – | – |
| Batalkan pesanan sendiri (sebelum Diproses) | ✔ | – | – |
| Batalkan pesanan (sebelum Dikirim, alasan wajib) | – | ✔ | – |
| Beri rating dan ulasan (pesanan Selesai) | ✔ | – | – |
| CRUD kategori, produk, varian, stok, foto | – | ✔ | – |
| CRUD lookbook dan FAQ | – | ✔ | – |
| Moderasi ulasan | – | ✔ | – |
| Pengaturan (WA, DANA, rekening) | – | ✔ | – |
| Lihat dan proses semua pesanan | – | ✔ | – |
| Buat pesanan manual | – | ✔ | – |
| Edit invoice, perpanjang time-out | – | ✔ | – |
| Verifikasi pembayaran, input resi | – | ✔ | – |
| Laporan + export | – | ✔ | ✔ (tanpa alamat & nomor customer) |
| Kelola admin | – | – | ✔ |
| Kelola user, ganti password | – | – | ✔ |
| Log aktivitas | – | – | ✔ |

## Di Luar Scope V1
- Payment gateway otomatis (Midtrans/QRIS/VA) dan QRIS statis
- Tracking pengiriman real-time dari API ekspedisi
- Pre-order langsung oleh customer (hanya lewat admin)
- Login OTP WhatsApp
- Foto/video pada ulasan