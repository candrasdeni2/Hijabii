# design.md: Hijabii by Intan (V1)

Dokumen desain untuk website e-commerce Hijabii. Menyatukan empat sumber (sudah dicocokkan dengan `schema.sql`, lihat [bagian 16](#16-hasil-pencocokan-dengan-schemasql)):

| Sumber | Dipakai untuk |
|---|---|
| `index.html` (landing page yang sudah jadi) | Token warna, font, gaya gerak, tone copy. **Sumber utama** |
| `stitch_hijabii_responsive_design_system.zip` (3 slide + 2 mockup) | Komponen, navigasi, breakpoint, tata letak admin |
| `fitur.md` (PRD v1.2) | Aturan fitur dan alur. **Menang bila bertentangan dengan Stitch** |
| `schema.sql` (Supabase V1) | Nama status, field, batas data, dan aturan yang benar-benar ditegakkan database. **Menang untuk semua hal yang berupa data** |

Prinsip rujukan: bila Stitch dan landing berbeda, ikuti landing (sudah live dan sudah disetujui). Bila Stitch dan `fitur.md` berbeda, ikuti `fitur.md`. Daftar perbedaannya ada di [bagian 14](#14-konflik-yang-sudah-diputuskan--perlu-konfirmasi).

---

## 1. Brand

- **Nama:** Hijabii by Intan
- **Tagline:** *Pretty with hijab, pretty with Hijabii.*
- **Arti nama:** "hijab" + "lii" (milikku)
- **Karakter:** feminine, modern, casual. Gaya visual minimalis, editorial, hangat
- **Target:** perempuan 17 sampai 35 tahun, mayoritas mahasiswi, harga menengah
- **Tone copy:** santai, hangat, pakai "kamu". Kalimat pendek. Contoh: "Find Your Color", "Be you. Be Hijabii.", "Hijabku, identitasku."
- **Bahasa UI:** Indonesia. Judul seksi marketing boleh campur Inggris seperti di landing
- **Logo:** belum ada file. Sementara pakai wordmark teks "Hijabii" (Cormorant Garamond). Stitch memakai varian huruf renggang kapital `H I J A B I I` (tracking 0.22em) untuk app/admin. Pilih satu per konteks:
  - Landing dan toko: `Hijabii` (kapital-kecil, tanpa tracking)
  - Admin dan app shell: `HIJABII` (kapital, tracking 0.22em)

---

## 2. Design Tokens

### 2.1 Warna inti

| Token | Hex | Peran |
|---|---|---|
| `cream` | `#F6F0E7` | Kanvas halaman, background utama |
| `paper` | `#FBF8F3` | Permukaan kartu, modal, seksi bergantian |
| `sand` | `#EBE0D3` | Border, chip sekunder, seksi aksen, tab aktif |
| `mocha` | `#A98B7C` | Teks sekunder, caption, divider halus |
| `marsala` | `#7B4A4A` | **Aksen utama**, hover CTA, ring pilihan aktif, fokus |
| `olive` | `#6B6A47` | Aksen organik, status Dikirim |
| `ink` | `#2B211C` | Teks utama, tombol primer gelap |

Opasitas teks yang dipakai di landing: `ink/75` isi paragraf, `ink/70` teks pendukung, `ink/60` meta, `ink/50` legal. Jangan pakai di bawah `ink/50` untuk teks yang harus terbaca.

### 2.2 Warna fungsional

| Token | Hex | Pakai untuk |
|---|---|---|
| `success` | `#4E6E58` | Selesai, stok aman |
| `warning` | `#B8863A` | Menunggu, stok menipis, kedaluwarsa mendekat |
| `error` | `#9E3D3D` | Dibatalkan, stok habis, validasi gagal |
| `info` | `#4F6B7D` | Diproses, tag logistik, tips |

### 2.3 Tailwind config (satu config untuk seluruh app)

```js
tailwind.config = {
  theme: {
    extend: {
      colors: {
        cream: '#F6F0E7', paper: '#FBF8F3', sand: '#EBE0D3',
        mocha: '#A98B7C', marsala: '#7B4A4A', olive: '#6B6A47', ink: '#2B211C',
        success: '#4E6E58', warning: '#B8863A', error: '#9E3D3D', info: '#4F6B7D'
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Jost', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        'warm-sm': '0 2px 8px rgba(43,33,28,.04)',
        'warm-md': '0 8px 24px rgba(43,33,28,.06)',
        'warm-lg': '0 16px 36px rgba(43,33,28,.08)',
        focus: '0 0 0 3px rgba(123,74,74,.18)'
      }
    }
  }
}
```

### 2.4 Tipografi

Dua keluarga: **Cormorant Garamond** (serif, editorial) dan **Jost** (sans, UI).

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
```

| Peran | Font | Ukuran | Bobot | Line-height |
|---|---|---|---|---|
| Display (hero) | Cormorant | 60 / 72 / 96 / 128 px (mobile → lg) | 500 | 1.0 |
| Display L (judul seksi landing) | Cormorant | 36 / 48 / 60 px | 500 | 1.2 |
| H1 (judul halaman app/admin) | Cormorant | 28 px | 600 | 1.25 |
| H2 (judul kartu) | Cormorant | 22 px | 500 | 1.3 |
| H3 (label grup UI) | Jost | 18 px | 600 | 1.4 |
| Body large | Jost | 16 px | 400 | 1.5 |
| Body | Jost | 14 px | 400 | 1.5 |
| Body small | Jost | 12 px | 500 | 1.4 |
| Caption / overline | Jost | 10 sampai 11 px | 600, UPPERCASE, tracking +0.05em | 1.4 |
| Harga | Jost | 14 sampai 16 px | 500 | bukan serif untuk harga di kartu |

Aturan:
- **Serif** hanya untuk judul, nama produk, kutipan, angka besar statistik. **Sans** untuk semua kontrol, tabel, form, dan angka di tabel
- Hapus `font-sans` dari Plus Jakarta Sans. Stitch slide 2 dan 3 memakai Plus Jakarta Sans. **Jangan dipakai**; landing dan slide 1 memakai Jost
- Input form minimal 16px di mobile agar iOS tidak auto-zoom

### 2.5 Spasi (basis 8px)

| Token | px | Pakai |
|---|---|---|
| 0.5x | 4 | Jarak mikro |
| 1x | 8 | Ikon ke teks, antar tag |
| 1.5x | 12 | Padding elemen form |
| 2x | 16 | Padding kartu, margin layar mobile (16 sampai 20) |
| 3x | 24 | Gutter grid |
| 4x | 32 | Jarak antar modul |
| 5x | 40 | Jeda seksi kecil |
| 6x | 48 | Inset hero |
| 8x | 64 | Margin halaman desktop |

Padding vertikal seksi landing: `py-16` (mobile), `py-24` (≥ md). Lebar konten: `max-w-6xl` (landing/toko), `max-w-7xl` (admin), form panjang `max-w-3xl`.

### 2.6 Radius dan elevasi

| Token | px | Pakai |
|---|---|---|
| `rounded-lg` | 8 | Chip ukuran, input kecil, badge angka |
| `rounded-xl` | 12 | Kartu produk, input, popover |
| `rounded-2xl` | 16 | Widget dashboard, panel checkout, kartu testimoni |
| `rounded-3xl` | 24 | Modal, drawer, bottom sheet |
| `rounded-[2rem]` | 32 | Banner CTA besar |
| `rounded-full` | pill | **Semua tombol CTA**, filter, status badge, avatar, FAB |

Bayangan memakai tint cokelat hangat, bukan abu: `rgba(43,33,28,.04 / .06 / .08)`. Hindari `shadow-black`.

---

## 3. Layout dan Responsif

### 3.1 Breakpoint

| Nama | Lebar | Customer | Admin |
|---|---|---|---|
| Mobile | < 768px | Header minimal + **bottom nav 4 item** | Header minimal + **bottom nav 4 slot** (ada "Lainnya") |
| Tablet | 768 sampai 1023px | Header ringkas, search jadi ikon | Sidebar rail 64px (ikon saja + tooltip) |
| Desktop | ≥ 1024px | Header horizontal penuh | Sidebar tetap 240px |

### 3.2 Grid produk

| Viewport | Kolom | Gap |
|---|---|---|
| Mobile | 2 | 12 px (landing: `gap-x-4 gap-y-8`) |
| Tablet | 3 | 16 px |
| Desktop | 3 di landing (hanya 5 produk), **4 di katalog toko** | 24 px |

Rasio foto kartu produk: **4:5** (landing memakai `aspect-[4/5]`; Stitch menulis 3:4. Pakai 4:5 agar konsisten dengan landing).

### 3.3 Aturan responsif

- Layout beradaptasi, bukan sekadar mengecil
- Target sentuh minimal **44 × 44 px**
- Navigasi mobile selalu terlihat saat scroll dan menghormati safe area: `pb-[env(safe-area-inset-bottom)]`
- **Tabel admin tidak boleh dijejalkan ke mobile.** Ubah jadi tumpukan kartu (nomor pesanan, customer, total, badge status, tombol aksi)
- Jangan membuat identitas visual terpisah antara mobile dan desktop
- Jangan lebih dari 4 item di bottom nav. Sisanya masuk "Lainnya"
- Jangan sembunyikan rute penting tanpa drawer atau sheet yang jelas
- Hormati `prefers-reduced-motion` (sudah ada di landing, pertahankan)

---

## 4. Navigasi

### 4.1 Customer

**Desktop (≥1024px):** logo kiri · menu tengah (Home, Katalog, Lookbook, FAQ) · kanan: search, notifikasi (bell + titik), akun, tombol pill marsala `Keranjang (n)`.

**Mobile bottom nav (4 item, sama persis):**

| # | Item | Isi |
|---|---|---|
| 1 | Home | Beranda / katalog |
| 2 | Keranjang | Badge jumlah |
| 3 | Pesanan | Pesanan Saya |
| 4 | Akun | Profil, alamat, FAQ, kontak admin, logout |

Header mobile: logo + search + bell. Aktif: ikon dan label `marsala`, semibold. Tidak aktif: `mocha`/`ink/60`.

Header transparan di atas hero, lalu pada scroll > 40px berubah menjadi `bg-cream/90 backdrop-blur-md` dengan garis bawah `ink/8`. Menu burger di landing (tanpa app shell) membuka panel dengan animasi `grid-template-rows` 0fr → 1fr.

> **Tidak ada ikon Wishlist** di navigasi atau kartu. Wishlist tidak ada di `fitur.md`. Lihat bagian 14.

### 4.2 Admin

**Desktop sidebar 240px** (urutan mengikuti fitur V1):

| Menu | Keterangan |
|---|---|
| Dashboard | Ringkasan |
| Pesanan | Badge merah jumlah pesanan baru / perlu tindakan |
| Produk | Produk + varian + stok |
| Kategori | |
| Lookbook | |
| FAQ | |
| Ulasan | Moderasi |
| Laporan | Export |
| Pengaturan | WA, DANA, rekening, time-out, asal kirim |

**Mobile bottom nav 4 slot:** Dashboard · Pesanan (badge) · Produk · **Lainnya**. "Lainnya" membuka bottom sheet (grid 2 kolom) berisi Kategori, Lookbook, FAQ, Ulasan, Laporan, Pengaturan.

### 4.3 Super Admin

Sidebar yang sama, menu berbeda: Dashboard ringkas (hanya jumlah admin/user aktif dan ringkasan laporan; super admin tidak bisa membaca daftar pesanan) · Kelola Admin · Kelola User · Laporan · Log Aktivitas. Tidak ada Produk dan Pesanan (hanya baca lewat Laporan, tanpa alamat dan nomor customer). Mobile: 4 slot = Admin · User · Laporan · Log.

---

## 5. Komponen

### 5.1 Tombol

Semua tombol CTA berbentuk **pill** (`rounded-full`), hover naik 2px (`translateY(-2px)`) dengan easing `cubic-bezier(.22,1,.36,1)` 0,5 detik.

| Varian | Gaya | Pakai |
|---|---|---|
| Primer | `bg-ink text-cream`, hover `bg-marsala` | Find Your Color, Pesan, Simpan |
| Aksen | `bg-marsala text-cream`, hover lebih gelap | Checkout, Kirim ke WhatsApp, aksi kunci |
| Sekunder | `border border-ink`, hover `bg-ink text-cream` | Lihat Koleksi, Tambah ke Keranjang |
| Di atas gelap | `bg-cream text-ink`, hover `bg-sand` | Banner CTA |
| Ghost/teks | teks `ink` atau `marsala` + underline offset-4 | Ubah Alamat, Lihat Semua → |
| Ikon bulat | 32 sampai 48px, border `sand`, `bg-cream/50` | Kembali, Bagikan, Chat |
| Disabled | `bg-[#DCD4C9] text-[#9A8F82]` | Stok habis, form belum lengkap |
| Bahaya | `bg-error text-cream` atau outline `error` | Batalkan pesanan, Hapus |

Padding standar: `px-7 py-3.5 text-sm`. Di tabel/admin padat boleh `px-4 py-2 text-xs`, tetap pill.

**Tombol WhatsApp mengambang** (landing): `fixed bottom-5 right-5`, pill `bg-ink`. Di app shell customer, pindahkan di atas bottom nav (`bottom-[calc(72px+env(safe-area-inset-bottom))]`) agar tidak menutupi nav.

### 5.2 Form dan input

- Input: `rounded-xl border border-sand bg-paper px-3.5 py-3`, placeholder `mocha`
- Fokus: `border-marsala` + `shadow-focus` (ring marsala 18%). Jangan memakai outline biru bawaan
- Label di atas input, 12 px medium; tanda wajib `*` warna `marsala`
- Pesan error di bawah input, `text-error text-xs`, border input menjadi `error`
- Stepper jumlah: pill `border sand`, tombol − dan + bulat 24 sampai 32px
- Radio/checkbox/switch: aksen `marsala`; switch aktif `bg-ink`, nonaktif `bg-sand`
- Pilihan metode bayar (TF/COD, DANA/rekening): **kartu radio** `rounded-xl`, kartu terpilih ber-border `marsala`
- Fokus keyboard global: `outline: 2px solid #7B4A4A; outline-offset: 3px` (sudah ada di landing)

### 5.3 Kartu produk

```
┌────────────────┐
│  foto 4:5      │  badge tag kiri atas (pill cream, text-xs)
│                │
├────────────────┤
│ Nama (serif)   │  text-xl sm:text-2xl
│ Rp 42.000      │  text-sm ink/70
│ ● ● ● ● ●      │  titik warna 12px atau thumbnail foto 24px
│ ★ 4.8 (120)    │  hanya bila ada ulasan
└────────────────┘
```

- Foto `rounded-2xl`, hover: `scale(1.06)` selama 1,1 detik, `overflow-hidden`
- Badge tag (mis. "Best seller", "Motif"): pill `bg-cream`, `text-xs`, pojok kiri atas
- Stok habis total: foto digrayscale + badge `Habis` (`bg-ink/70 text-cream`)
- Tidak ada tombol "+" cepat di kartu karena produk wajib pilih warna dan ukuran dulu (stok per varian). Klik kartu → halaman detail
- Rating hanya tampil bila ada ≥ 1 ulasan tampil. Kosong → sembunyikan baris, jangan tulis "0"

### 5.4 Pemilih varian (warna dan ukuran)

**Warna = foto, bukan titik hex.** Alasan dari Stitch: tekstur dan undertone kain menentukan pembelian.

- Thumbnail persegi **64 × 64 px** (mobile detail: 48 px), radius 8, border `sand`
- Aktif: `ring-2 ring-marsala` + label nama warna `marsala` bold
- Habis: foto grayscale, border putus-putus, nama dicoret, badge "Habis". **Tidak bisa diklik**
- Label di atas: `Warna: <nama aktif>`
- Fallback bila warna belum punya foto: lingkaran swatch hex 36 sampai 48px dengan `ring-offset-2` (pola landing)

**Ukuran = chip teks** (hanya tampil sesuai warna yang dipilih, aturan `fitur.md`):

- Aktif: `bg-ink text-cream`
- Tersedia: `bg-paper border-sand`, hover `border-mocha`
- Habis: `line-through`, opasitas turun, `disabled`
- Ketika warna berganti dan ukuran terpilih tidak tersedia di warna baru → reset pilihan ukuran dan tampilkan hint kecil
- Stok per kombinasi ditampilkan sebagai teks kecil ("Sisa 3") hanya bila ≤ 5, warna `warning`

### 5.5 Detail produk

Desktop: 2 kolom (galeri kiri, info kanan). Mobile: galeri penuh di atas, info di bawah, **sticky action bar** di bawah.

Urutan konten info: nama (serif) → harga → rating rata-rata + jumlah ulasan → info bahan dan ukuran → poin keunggulan → Warna → Ukuran → Jumlah → catatan "Warna pada foto bisa sedikit berbeda karena pencahayaan." → deskripsi → daftar ulasan.

Sticky action bar (mobile): ikon chat WhatsApp · `+ Keranjang` (sekunder) · `Pesan` (aksen marsala).

Galeri: foto utama warna terpilih + foto tambahan. Penghitung `1 / 5` pill `bg-ink/75 text-cream` di pojok kanan bawah. Tombol kembali dan bagikan: ikon bulat `bg-white/80 backdrop-blur`.

### 5.6 Status pesanan (badge pill)

Badge: `rounded-full px-3 py-1 text-xs font-medium` dengan titik 6px di kiri.

| Status | bg | teks / titik | Siapa melihat |
|---|---|---|---|
| Menunggu Konfirmasi | `#FDF3E3` | `#B8863A` | semua |
| Direvisi Admin | `#F3ECF4` * | `#7B4A4A` | semua |
| Dikonfirmasi | `#EDF3F7` | `#4F6B7D` | semua |
| Diproses | `#EDF3F7` | `#4F6B7D` | semua |
| Dikirim | `#F4F5E6` | `#6B6A47` | semua |
| Selesai | `#EEF5EF` | `#4E6E58` | semua |
| Dibatalkan | `#FAEDED` | `#9E3D3D` | semua |
| Kedaluwarsa | `#F1ECE6` | `#8A7A6E` | semua |

Slug di database (`order_status`): `menunggu_konfirmasi`, `direvisi_admin`, `dikonfirmasi`, `diproses`, `dikirim`, `selesai`, `dibatalkan`, `kedaluwarsa`. Label di atas persis mengikuti slug ini.

\* Warna Direvisi Admin (`#F3ECF4`) adalah usulan. Alternatif: pakai `warning` agar tidak menambah warna baru.

**Status pembayaran produk** terpisah dari status pesanan (`payment_status`: `belum_dibayar`, `lunas`). Tampilkan sebagai chip kecil kedua di detail pesanan: `Belum dibayar` (`warning`) atau `Lunas` (`success`) + waktu `paid_at`. Status pesanan tidak bisa menjadi Diproses sebelum Lunas.

Diproses dan Dikonfirmasi berbagi warna `info` supaya palet tetap tenang. Bedakan lewat teks, bukan warna.

### 5.7 Ulasan dan rating

- Bintang `★` berwarna `warning` (`#B8863A`), 1 sampai 5. Input rating: bintang 32px, area sentuh 44px
- Teks ulasan opsional, maks 500 karakter, tampilkan penghitung `128 / 500`
- Nama tampil sebagian = **nama depan saja** (kata pertama dari nama lengkap; kosong → "Pembeli"). Ini dihitung di view `product_reviews_public`
- **Tanpa upload foto/video.** Jangan tampilkan ikon kamera atau area unggah
- Ulasan disembunyikan admin → hilang dari publik dan dari rata-rata rating, tetap terlihat pemiliknya dengan label kecil "Disembunyikan". Pemilik tetap boleh mengedit teksnya, tapi tidak bisa menampilkannya kembali
- Satu ulasan per produk **per pesanan** (customer yang membeli produk sama di pesanan lain boleh mengulas lagi). Pesanan manual admin tidak bisa diulas (tidak punya akun customer)
- Ulasan langsung tampil tanpa persetujuan; admin hanya bisa menyembunyikan/menampilkan atau menghapus, **tidak bisa mengedit isi**
- Kartu testimoni di landing: `rounded-2xl bg-paper p-7`, kutipan serif `text-xl sm:text-2xl`, nama dan kota `text-sm ink/60`. Testimoni landing saat ini **dummy**, ganti sebelum online

### 5.8 Banner, toast, dan notifikasi

- **Toast**: pojok kanan atas desktop, atas-tengah mobile; `rounded-xl bg-ink text-cream`, ikon status berwarna fungsional, hilang otomatis 4 detik
- **Banner info** (mis. password diubah super admin): lebar penuh di atas konten akun, `bg-warning/10 border-warning/30`, ikon info, tombol "Ganti sekarang"
- **Pusat notifikasi** (bell): daftar, titik `error` untuk belum dibaca. Tiap item: ikon, judul, waktu relatif, tautan ke pesanan
- Tipe notifikasi mengikuti `fitur.md`: invoice direvisi, diproses, dikirim (+ kurir + resi), dibatalkan/kedaluwarsa, banner password

### 5.9 Modal, drawer, bottom sheet

- Backdrop `bg-ink/60`
- Modal desktop: `rounded-3xl bg-cream`, `max-w-3xl`, `max-h-[90vh]` scroll. Tombol tutup bulat 40px kanan atas. Esc dan klik backdrop menutup
- Mobile: modal berubah jadi **bottom sheet** `rounded-t-3xl` dengan handle `w-8 h-1 bg-sand`
- Saat terbuka, kunci scroll body

---

## 6. Gerak dan Interaksi

Easing utama: `--ease: cubic-bezier(.22,1,.36,1)`.

| Efek | Spesifikasi |
|---|---|
| Hero slideshow | 3 foto, crossfade 1,6 detik, ganti tiap 6 detik, zoom 1,07 → 1 selama 9 detik. Titik indikator, klik menghentikan auto |
| Parallax hero | `translate3d` 0,12× scroll, hanya saat `scrollY < innerHeight` |
| Reveal saat scroll | `opacity 0 → 1`, `translateY(44px) → 0`, 1,1 sampai 1,3 detik, jeda antar saudara 100ms |
| Counter angka | Easing cubic-out 1,4 detik, format `id-ID` |
| Hover foto | `scale(1.06)` 1,1 detik |
| Tombol pill | `translateY(-2px)` 0,5 detik |
| Lookbook desktop | Panel melebar `flex: 2.6` saat hover/klik, 0,9 detik; mobile: grid 2 kolom, tap untuk fokus |
| Testimoni | Scroll-snap, auto-geser 5 detik, berhenti saat hover |
| FAQ | `<details>`, tanda `+` berputar 45° |
| Burger menu | Garis 1 dan 3 berputar ±45°, garis 2 hilang |

**Di admin dan checkout kurangi gerak.** Reveal-on-scroll dan parallax hanya untuk halaman marketing (landing, lookbook). Halaman transaksional memakai transisi 150 sampai 250 ms saja.

---

## 7. Foto dan Aset

- Lokasi: `assets/img/`. Format `png | jpg | jpeg | webp`, dicari berurutan oleh `loadImg()`
- Penamaan landing:

| Pola | Contoh |
|---|---|
| `hero-01..03` | Slide hero |
| `about-model`, `about-bahan` | Seksi tentang |
| `<id>-utama` | `pasmina-tancel-utama.png` |
| `warna-<nama>` | `warna-cream.png` |
| `lookbook-<key>` | `lookbook-campus.png` (campus, office, casual, occasion) |
| `komunitas-01..05` | Grid sosial |
| `cta-banner` | Banner CTA |

- Untuk toko (data dari Supabase), foto varian disimpan di storage. **Kompres otomatis di browser sebelum upload** (aturan `fitur.md`). Target: sisi terpanjang ≤ 1600px, kualitas ≈ 0,8, **wajib WebP dan ≤ 2 MB** (bucket menolak format dan ukuran lain). Foto dibaca publik lewat URL bucket `hijabii-images`
- Sediakan placeholder: gradien `#E8DCCD → #D8C6B5` dengan nama file di tengah (pola `.ph` landing), agar layout tidak melompat saat foto belum ada
- Gunakan `loading="lazy"` kecuali hero dan foto di atas lipatan; selalu beri `width/height` atau `aspect-ratio`
- Teks `alt`: nama produk + warna (mis. "Pasmina Tancel warna Mocha"). Foto dekoratif: `alt=""`
- Gaya foto: pencahayaan hangat, latar krem/tanah, model berhijab, komposisi editorial. Hindari filter dingin

### Ikon

- Set garis (outline), stroke **1,6 px**, round cap dan join, kotak optik 24×24, tampil 20 px
- Warna mengikuti `currentColor` (ink / marsala / mocha)
- Ikon inti: home, search, bag, package, clipboard, user, chat, share, bell, menu, chevron, arrow, plus, minus, trash, edit, settings, map-pin, credit-card, wallet, truck, box, tag, chart, users, grid, calendar, eye
- **Jangan pakai emoji sebagai ikon UI.** Stitch memakai emoji di sheet "Lainnya" admin; ganti dengan ikon garis di atas

---

## 8. Halaman: Customer

### 8.1 Landing (sudah dibuat di `index.html`)

Urutan seksi: Hero → Tentang → Koleksi → Kenapa Hijabii (+ counter) → Find Your Color → Lookbook → Testimoni → Komunitas (Instagram) → FAQ → CTA → Footer.

Warna latar bergantian untuk ritme: `cream` → `cream` → `paper` → `sand` → `cream` → `sand` → `cream` → `paper` → `cream` → (CTA gelap `ink`) → `paper` (footer).

Catatan: `index.html` memakai `data-wa` link `wa.me` dan daftar produk di `CONFIG`. Saat halaman toko hidup, tombol "Pesan via WhatsApp" di modal diganti alur keranjang/pesan. Landing tetap bisa mempertahankan jalur WhatsApp langsung sampai V1 rilis.

### 8.2 Katalog

- Header halaman (serif H1) + chip kategori horizontal scroll (pill, aktif `bg-marsala text-cream`)
- Grid produk sesuai bagian 3.2
- Filter tambahan (urutkan, rentang harga) = **di luar fitur V1**; jangan dibuat sebelum diminta

### 8.3 Detail produk

Lihat 5.5. Tombol utama **Pesan** hanya aktif bila warna, ukuran, dan jumlah valid serta stok cukup.

### 8.4 Keranjang

- Daftar item: foto 80px, nama, warna · ukuran, harga satuan, stepper, hapus
- Ringkasan: **Subtotal produk saja**
- Tombol aksen `Checkout (n)`
- Keranjang kosong: ilustrasi garis sederhana + "Belum ada produk" + tombol `Lihat Koleksi`

### 8.5 Checkout / Form Pesanan

Urutan (satu halaman, kartu bertumpuk di mobile; dua kolom di desktop dengan ringkasan sticky di kanan):

1. **Data penerima**: nama, kontak (WhatsApp), alamat lengkap, **kota/kecamatan** (pencarian area dari API ongkir; menghasilkan `destination_area_id`), kode pos, catatan opsional. Prefill nama, kontak, dan alamat dari profil, bisa diubah. Tautan `Ubah Alamat`
2. **Kurir**: kartu radio. Default **Kantor Pos** (ditandai "Rekomendasi"), opsi JNT dan JNE. Cek ongkir otomatis berjalan setelah area tujuan dipilih. Bila cek ongkir gagal, tampilkan error dan tombol coba lagi (lihat 16.3 butir 4 untuk keputusan fallback)
3. **Bayar ongkir**: `Transfer` atau `COD`
4. **Bayar produk**: `DANA` atau `Rekening bank`. Tampilkan tujuan (nomor dan atas nama) dari pengaturan admin
5. **Ringkasan**: daftar item, subtotal produk
6. Tombol aksen `Pesan`

**Aturan penting: nominal ongkir tidak tampil di checkout.** Hanya tampil di detail invoice. Ringkasan checkout menampilkan subtotal produk, dan baris ongkir diganti teks seperti "Ongkir dihitung otomatis, lihat di invoice".

Setelah tombol **Pesan**: tampilkan layar sukses → ringkasan pesanan + invoice + tombol `Kirim ke WhatsApp Admin` (membuka `wa.me` dengan pesan terisi otomatis; customer tinggal menekan kirim) + tautan ke Pesanan Saya. Tampilkan **batas waktu bayar** (`expires_at`, default 24 jam) dengan hitungan mundur, dan jelaskan bahwa stok terkunci sampai waktu itu.

### 8.6 Invoice

- Kartu `paper`, header: wordmark, nomor invoice (font mono), tanggal
- Tabel item (produk, varian, qty, harga, diskon), lalu **Ongkir**, lalu **Total**
- Nomor invoice sama untuk semua revisi: `INV-` + nomor pesanan tanpa `HJB-` (contoh `INV-261006-0001`). Revisi 0 = invoice awal (tanpa pill); revisi ≥ 1 diberi pill `Revisi #n` + timestamp, daftar versi sebelumnya (tautan). Isi tiap versi adalah snapshot, termasuk info DANA/rekening saat itu, sehingga versi lama tetap sama persis saat diunduh
- Tombol `Unduh` (PDF)
- Setelah status Diproses, invoice terkunci (tanpa tombol edit di sisi mana pun)

### 8.7 Pesanan Saya

- Tab filter pill: Semua · Menunggu · Diproses · Dikirim · Selesai · Dibatalkan
- Kartu pesanan: nomor (format `HJB-YYMMDD-0001`, font mono), tanggal, **total produk tanpa ongkir**, badge status, 3 thumbnail produk, tombol `Lihat Detail`
- Dikirim: tampilkan kurir + nomor resi (`tracking_courier`, `tracking_no`; tombol salin)
- Pesanan belum Diproses: tampilkan hitungan mundur batas waktu bayar
- **Tidak ada tracking real-time dari API ekspedisi** (di luar scope). Timeline di detail diambil dari `order_status_history` (status + waktu nyata), bukan dihitung ulang: Pesanan dibuat → (Direvisi) → Dikonfirmasi → Diproses → Dikirim → Selesai. Resi ditampilkan sebagai teks
- `Batalkan Pesanan` tampil hanya sebelum Diproses; membuka sheet pilih alasan (wajib). Alasan: produk/warna/ukuran/jumlah salah · alamat atau data kirim salah · berubah pikiran
- `Beri Ulasan` tampil per produk pada pesanan Selesai

### 8.8 Akun

Daftar menu: Profil Saya · Alamat · Riwayat Pesanan · Notifikasi (badge) · Bantuan / FAQ · Logout, ditambah kartu "Butuh bantuan?" dengan tombol Hubungi via WhatsApp.
**Dihapus dari mockup Stitch:** "Metode Pembayaran" (tidak ada kartu tersimpan; metode dipilih per pesanan) dan "Pengaturan" yang tidak punya isi di V1.

### 8.9 Auth

- Masuk dan Daftar (email + password), layout satu kolom `max-w-sm` di atas `cream`
- Lupa password: kirim link ke email; teks bantuan "Tidak bisa akses email? Hubungi admin via WhatsApp" dengan tautan `wa.me`
- Login berikutnya setelah password diubah super admin → paksa layar **Ganti Password** (tidak bisa dilewati)
- Tidak ada OTP WhatsApp (di luar scope)

---

## 9. Halaman: Admin

Shell: sidebar + topbar (search, bell, avatar + nama + peran) + konten dengan `bg-cream`. Kartu `bg-paper rounded-2xl border border-sand shadow-warm-sm`.

### 9.1 Dashboard

- 4 kartu statistik (2×2 di tablet/mobile): Total Pesanan, Total Nilai Selesai, Pesanan Perlu Tindakan, Stok Menipis. Tiap kartu: ikon di kotak `sand`, angka serif besar, sparkline opsional
- Pesanan Terbaru (5 baris, badge status)
- Status Stok (Aman / Menipis / Habis dengan titik hijau, kuning, merah)
- Aksi Cepat: Tambah Produk · Kelola Pesanan · Buat Pesanan Manual · Lihat Laporan
- **Hapus:** "Pelanggan Baru" dan "Atur Promo" dari mockup Stitch (tidak ada di V1). Grafik penjualan tetap boleh karena laporan pesanan ada, tapi sumbernya hanya pesanan Selesai
- Banner promosi dan foto model di sidebar mockup bersifat dekoratif; boleh dipakai sebagai hiasan kecil, bukan fitur

### 9.2 Pesanan

Daftar (tabel desktop, kartu mobile) dengan filter status. Baris: nomor, tanggal, customer, ringkasan produk, total, badge status, `Lihat Detail →`.

**Detail pesanan** adalah layar paling padat; susun sebagai dua kolom:

| Kiri | Kanan (sticky) |
|---|---|
| Data customer, alamat, item, invoice (versi + revisi), riwayat status | Panel **Aksi** sesuai status saat ini |

Aksi menurut status (tombol hanya muncul bila valid):

| Status | Aksi tersedia |
|---|---|
| Menunggu / Direvisi | `Edit Invoice`, `Konfirmasi via WhatsApp`, `Perpanjang Time-out`, `Batalkan` |
| Dikonfirmasi | `Verifikasi Pembayaran` (Lunas → otomatis Diproses), `Edit Invoice` (status kembali ke Direvisi Admin, beri peringatan), `Perpanjang Time-out`, `Batalkan` |
| Diproses | `Proses & Kirim` (input kurir + resi, wajib), `Batalkan` |
| Dikirim | `Tandai Selesai`, (Batalkan masih diizinkan sebelum Dikirim saja, jadi **tidak** tampil di sini) |
| Selesai / Dibatalkan / Kedaluwarsa | Tidak ada aksi, tampilan baca saja |

- **Edit Invoice** = sheet/halaman dengan tabel item yang bisa diubah (qty, harga, diskon persen atau nominal) + ongkir. Diskon berlaku **per baris item** (persen 0 sampai 100, atau nominal Rupiah, maksimal sebesar subtotal baris). Ongkir diedit di panel yang sama. Tampilkan pratinjau total langsung. Tombol `Simpan Revisi` membuat revisi baru (penanda + timestamp), status menjadi Direvisi Admin. Perubahan qty otomatis menyesuaikan stok terkunci; bila stok tidak cukup, tampilkan error dari server
- **Perpanjang Time-out**: dialog dengan pilihan durasi **dalam jam** (preset 6 / 12 / 24 / 48 jam + input angka) dan pratinjau tanggal kedaluwarsa baru. Hanya sebelum Diproses
- **Verifikasi Pembayaran**: dialog konfirmasi "Sudah memeriksa bukti bayar dari WhatsApp?" dengan checkbox, lalu `Tandai Lunas`. Beri peringatan bahwa data pesanan akan terkunci
- **Batalkan**: dialog dengan **kolom catatan alasan wajib** (teks bebas, disimpan di `cancel_note`; alasan terklasifikasi otomatis `dibatalkan_admin`) dan pernyataan stok akan dikembalikan. Admin boleh membatalkan sampai Diproses; setelah Dikirim tidak bisa
- Tandai Lunas dan ubah ke Diproses dikirim dalam satu simpan (Lunas wajib sebelum Diproses). Setelah Diproses, ongkir, metode bayar, item, dan status bayar terkunci: sembunyikan semua kontrol edit
- Bukti bayar **tidak diunggah** ke web (diterima lewat WhatsApp). Jangan buat area unggah

### 9.3 Buat Pesanan Manual

Form lebar: data customer (diisi manual, tanpa akun) → tambah item (cari varian) → kurir, ongkir, metode bayar → ringkasan. Dipakai untuk pre-order dan pesanan lewat chat. Admin boleh mengisi **harga satuan dan diskon per item sejak awal** (untuk grosir). Pesanan manual tidak punya akun customer: tidak ada notifikasi ke customer dan tidak bisa diulas.

`+ Produk baru` membuka sheet pembuatan produk lengkap (warna, ukuran, stok); setelah disimpan, varian baru bisa dipilih di form. **Peringatan:** schema saat ini menolak item bila stok varian kurang dari qty, jadi pre-order untuk barang yang stoknya 0 belum bisa dibuat. Lihat 16.3 butir 1.

### 9.4 Produk, varian, stok

- Daftar produk: foto, nama, kategori, harga, status (**Draft / Aktif / Arsip**), total stok, aksi. Hanya produk Aktif tampil ke publik dan bisa dibeli. URL detail memakai `slug`
- Form produk: nama, kategori, deskripsi, harga (Rupiah, bilangan bulat), **berat aktual per pcs (gram, wajib > 0, tanpa nilai bawaan)**, status
- **Editor varian** (bagian paling kompleks, rancang dengan hati-hati):
  1. Daftar **Warna**: nama (teks, unik per produk), kode hex opsional (untuk swatch cadangan), foto utama, foto tambahan (opsional), pratinjau. Database mengizinkan foto utama kosong; **form yang mewajibkannya**
  2. Daftar **Ukuran**: nama + cakupan (`Semua warna` atau pilih warna tertentu). Ini hanya kemudahan form: database menyimpan satu baris varian per kombinasi warna + ukuran, jadi set ukuran boleh berbeda tiap warna
  3. **Matriks stok**: baris = warna, kolom = ukuran, sel = angka stok (input). Sel yang tidak berlaku diberi garis abu "tidak tersedia"
- Unggah foto: pilih/tarik file → pratinjau → kompres otomatis di browser menjadi **WebP ≤ 2 MB** (storage menolak format lain) → progress bar. Mengganti atau menghapus foto otomatis mengantre penghapusan file lama
- Angka stok = **stok tersedia** (sudah dikurangi stok yang terkunci pesanan aktif). Peringatan: sel `≤ 5` kuning, `0` merah

### 9.5 Kategori, Lookbook, FAQ

Daftar sederhana + dialog tambah/ubah. Kategori: nama (unik) + urutan. Lookbook: **foto + judul** (tidak ada tautan produk di schema), urutan, toggle aktif. FAQ: pertanyaan + jawaban, urutan dengan tombol naik/turun, toggle aktif.

### 9.6 Ulasan (moderasi)

Tabel: produk, customer (ambil dari **nama penerima di pesanan terkait**; admin tidak punya akses ke tabel profil), rating, teks, tanggal, status tampil. Aksi: `Sembunyikan/Tampilkan`, `Hapus` (dengan konfirmasi). Filter: rating, status tampil.

### 9.7 Laporan

- Filter: status (**Semua / Selesai / Dibatalkan**; Kedaluwarsa otomatis masuk Dibatalkan dan dibedakan lewat alasan), kategori/produk, periode (hari/minggu/bulan/tahun). Periode dihitung dari tanggal selesai atau tanggal batal (WIB). Minggu dimulai Senin; rentang tanggal dihitung di klien
- Kartu ringkasan: jumlah dan nilai Selesai; jumlah dan nilai Batal; rincian alasan batal (daftar atau bar sederhana). Alasan yang mungkin: salah pilih produk, salah alamat, berubah pikiran, kedaluwarsa, dibatalkan admin. Nilai = **nilai produk tanpa ongkir**. Bila filter produk/kategori aktif, qty dan nilai hanya menghitung baris item yang cocok
- Tabel: no. pesanan, tanggal, customer, produk ringkas, qty, nilai produk, status, alasan batal
- Tombol `Export Excel` dan `Export PDF` (mengikuti filter aktif)

### 9.8 Pengaturan

Kartu per grup: Kontak & Pembayaran (WA admin format `62…`, nomor DANA + atas nama, bank + nomor rekening + atas nama), Stok (durasi default time-out dalam jam, bawaan 24), Pengiriman (asal kirim **satu lokasi** dipilih lewat pencarian area, buffer kemasan bawaan 100 g sekali per pesanan, pembulatan berat ke atas bawaan 100 g). Tampilkan peringatan bila asal kirim belum diisi karena cek ongkir tidak bisa dipakai tanpanya. Pengaturan dapat dibaca publik (dipakai di checkout dan invoice). Tombol `Simpan` di bawah tiap kartu, toast sukses.

---

## 10. Halaman: Super Admin

Peran pengawas, **tanpa akses CRUD produk dan pesanan**.

- **Kelola Admin**: tabel (nama, email, status, dibuat) + `Tambah Admin`, `Nonaktifkan`, `Hapus`
- **Kelola User**: daftar + cari + `Nonaktifkan`/`Aktifkan`. Tampilkan hanya nama, email, peran, status. Jangan tampilkan alamat dan nomor telepon walau tabel profil memuatnya (lihat 16.3 butir 3). Akun nonaktif langsung kehilangan semua akses
- **Ganti Password** (user atau admin, **bukan akun sendiri**): dua mode
  - *Password sementara* / *generate otomatis* → tampilkan **sekali saja** di modal dengan tombol salin dan peringatan "tidak akan ditampilkan lagi"
  - *Kirim link reset* (disarankan, tag "Lebih aman"; super admin tidak mengetahui password)
- **Laporan**: sama dengan admin, **kolom alamat dan nomor customer disembunyikan**
- **Log Aktivitas**: tabel read-only (pelaku, aksi, target, waktu). **Tidak pernah menampilkan password**
- Beri penanda visual peran di topbar: chip `SUPER ADMIN` (`bg-marsala/10 text-marsala`) berbeda dari chip `ADMIN` (`bg-sand`)

---

## 11. State, Kosong, Error, Loading

| Kondisi | Perlakuan |
|---|---|
| Loading daftar | Skeleton `bg-sand/60` dengan `animate-pulse`, bentuk sama dengan konten |
| Loading tombol | Spinner kecil di dalam tombol, label berubah "Memproses…", tombol disabled |
| Kosong | Ilustrasi garis tunggal + satu kalimat + satu CTA |
| Error jaringan | Banner `error/10` + tombol `Coba Lagi` |
| Validasi form | Pesan di bawah field, fokus dipindah ke field pertama yang salah |
| Stok berubah saat checkout | Dialog: "Stok [produk] tinggal n" + tombol sesuaikan jumlah |
| Pesanan kedaluwarsa | Badge Kedaluwarsa + teks "Waktu pesanan habis, stok dikembalikan" |
| Tidak ada akses (RLS) | Halaman 403 ramah: "Kamu tidak punya akses ke halaman ini" + tombol kembali |
| Offline | Toast "Tidak ada koneksi" |

---

## 12. Aksesibilitas

- Kontras: `ink` di `cream` sudah lulus (≈ 14:1). `mocha` (`#A98B7C`) di `cream` hanya ≈ 2,9:1, **jangan untuk teks isi**; pakai untuk dekorasi atau teks ≥ 18px. Untuk caption gunakan `ink/60` ke atas
- Semua kontrol dapat dioperasikan keyboard; urutan fokus mengikuti urutan visual
- `aria-expanded` pada burger/accordion, `aria-label` pada tombol ikon, `aria-live="polite"` untuk toast
- Pemilih warna: tiap thumbnail adalah `<button>` dengan `aria-pressed`, nama warna sebagai label
- Jangan mengandalkan warna saja untuk status; badge selalu punya teks
- Modal: perangkap fokus, kembalikan fokus ke pemicu saat ditutup
- `lang="id"` pada `<html>`

---

## 13. Implementasi

### 13.1 Stack

HTML, CSS, JS, Tailwind (CDN untuk prototipe), Supabase (auth, Postgres, RLS, Storage, Edge Functions). Kunci API ongkir hanya di Edge Function, tidak di JS klien.

### 13.2 Struktur token di CSS

Meski memakai Tailwind CDN, simpan token sebagai CSS variable agar bisa dipakai di kode non-Tailwind (cetak invoice, PDF):

```css
:root{
  --cream:#F6F0E7; --paper:#FBF8F3; --sand:#EBE0D3; --mocha:#A98B7C;
  --marsala:#7B4A4A; --olive:#6B6A47; --ink:#2B211C;
  --success:#4E6E58; --warning:#B8863A; --error:#9E3D3D; --info:#4F6B7D;
  --ease:cubic-bezier(.22,1,.36,1);
}
```

### 13.3 Pola Tailwind yang sering dipakai

| Kebutuhan | Kelas |
|---|---|
| Bottom nav tetap | `fixed inset-x-0 bottom-0 md:hidden pb-[env(safe-area-inset-bottom)]` |
| Sidebar admin | `hidden lg:block w-60`, rail: `hidden md:block lg:hidden w-16` |
| Grid produk | `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6` |
| Tabel → kartu | tabel `hidden md:table`, daftar kartu `md:hidden` |
| Safe konten bawah (ada bottom nav) | `pb-24 md:pb-0` |

### 13.4 Penamaan

- Kelas utilitas Tailwind; komponen kustom berawalan jelas (`.ph`, `.reveal`, `.lb`)
- Berkas gambar: huruf kecil, tanda hubung, tanpa spasi (`pasmina-tancel-utama.png`)
- Kode status di database sudah ditetapkan di `schema.sql` (`menunggu_konfirmasi`, `direvisi_admin`, `dikonfirmasi`, `diproses`, `dikirim`, `selesai`, `dibatalkan`, `kedaluwarsa`). Pakai persis slug itu di kode; label Indonesia hanya di UI lewat satu objek pemetaan

---

## 14. Konflik yang sudah diputuskan / perlu konfirmasi

### Sudah diputuskan di dokumen ini

| # | Perbedaan | Keputusan |
|---|---|---|
| 1 | Font: Stitch slide 2 dan 3 memakai **Plus Jakarta Sans**; landing dan slide 1 memakai **Jost** | **Jost** |
| 2 | Warna: slide 3 memakai `#FAF7F2` (cream), `#7A5245` (marsala), `#2B231F` (ink) | Pakai token landing (`#F6F0E7`, `#7B4A4A`, `#2B211C`) |
| 3 | Checkout Stitch menampilkan **QRIS** dan **e-wallet** serta baris **Ongkir** dengan nominal | Hapus QRIS. Metode bayar sesuai `fitur.md` (TF/COD untuk ongkir; DANA/rekening untuk produk). Nominal ongkir **hanya di invoice** |
| 4 | Stitch punya **Wishlist** (hati di kartu dan detail, ikon di header) | Tidak dibuat di V1 |
| 5 | Stitch punya **Diskon & Promo** (menu admin, banner "Diskon 30%", harga coret, badge "20% Off") | Tidak ada modul promo di V1. Diskon hanya per pesanan lewat Edit Invoice. Hindari harga coret dan badge persen di katalog |
| 6 | Stitch punya **"Pelanggan Baru"**, kartu pendapatan dengan tren, "10RB+ Terjual" | Pendapatan diambil dari laporan pesanan Selesai. Statistik "terjual" bisa dipakai di landing (1.878) tapi bersifat konten statis |
| 7 | Stitch memakai **emoji** sebagai ikon di sheet "Lainnya" | Ganti ikon garis |
| 8 | Stitch memakai tombol bergaya `rounded-[10px]` | Semua CTA **pill** (`rounded-full`) seperti landing |
| 9 | Rasio foto kartu: Stitch 3:4, landing 4:5 | **4:5** |
| 10 | Stitch: tombol "+" cepat di kartu produk | Tidak ada (wajib pilih varian dulu) |
| 11 | Stitch: "Metode Pembayaran" tersimpan di menu Akun | Dihapus; metode dipilih per pesanan |

### Perlu konfirmasi (tidak bisa diputuskan dari file yang ada)

1. **Peran Super Admin.** `fitur.md` dan `schema.sql` (`user_role`) menetapkan 3 peran (Customer, Admin, Super Admin). Catatan umpan balik klien sebelumnya menyebut hanya **satu peran Admin**. Dokumen ini mengikuti `fitur.md` dan schema. Bila klien tetap satu admin, bagian 4.3 dan 10 bisa dihapus.
2. ~~Nama status awal~~ **Selesai:** `menunggu_konfirmasi` dan `kedaluwarsa` sudah ada di `schema.sql`.
3. ~~Aturan ulasan~~ **Selesai di sisi data:** `schema.sql` sudah menegakkan semuanya (pesanan Selesai milik sendiri, maks 500 karakter, edit/hapus sendiri, tampil langsung, nama depan saja). Yang belum adalah persetujuan klien atas aturan itu, karena `fitur.md` masih menyebutnya usulan.
4. **Kurir:** form landing menyebut Kantor Pos, J&T, JNE. Catatan awal menyebut hanya POS. Desain memakai default POS dengan opsi J&T/JNE seperti `fitur.md`.
5. ~~Warna produk~~ **Selesai:** `schema.sql` menyimpan warna **per produk** (`product_colors`). Landing yang memakai 5 warna global harus mengambil warna dari data produk saat dihubungkan ke database.
6. **Akun media sosial:** TikTok tertulis `@Hijabi_official` (satu "i") sedangkan Instagram `@Hijabii_official`. Di `index.html` sudah ada catatan "cek lagi"; konfirmasi ke klien.
7. **Logo** belum tersedia. Wordmark teks bersifat sementara.
8. **Testimoni** di landing masih dummy dan harus diganti sebelum online.

---

## 15. Checklist handoff

- [ ] Satu `tailwind.config` bersama (bagian 2.3) dipakai landing, toko, dan admin
- [ ] Jost + Cormorant Garamond dimuat dengan `display=swap`
- [ ] Bottom nav 4 item di mobile untuk customer dan admin; safe-area aktif
- [ ] Tabel admin punya versi kartu untuk mobile
- [ ] Pemilih warna memakai foto; ukuran memakai chip; kombinasi habis tidak bisa dipilih
- [ ] Checkout tidak menampilkan nominal ongkir; invoice menampilkannya
- [ ] Tombol aksi pesanan admin mengikuti tabel status (9.2)
- [ ] Tidak ada elemen wishlist, QRIS, promo, atau unggah foto ulasan
- [ ] Super Admin: laporan tanpa alamat dan nomor customer; log tanpa password
- [ ] Foto dikompres di browser sebelum diunggah; semua gambar punya `alt`
- [ ] Fokus keyboard terlihat; kontras teks ≥ 4,5:1 untuk teks isi
- [ ] Testimoni dummy dan akun TikTok dikonfirmasi sebelum rilis

---

## 16. Hasil pencocokan dengan `schema.sql`

### 16.1 Yang sudah cocok (tidak perlu diubah)

| Area | Desain | Schema |
|---|---|---|
| Peran | Customer, Admin, Super Admin | enum `user_role`, helper `is_admin()`, `is_super_admin()` |
| Alur status | Menunggu → (Direvisi) → Dikonfirmasi → Diproses → Dikirim → Selesai; Batal/Kedaluwarsa | enum `order_status` + trigger `orders_before_update` memvalidasi transisi |
| Batal customer | Hanya sebelum Diproses, 3 alasan | `cancel_my_order()` menerima `salah_pilih_produk`, `salah_alamat`, `berubah_pikiran` |
| Batal admin | Sampai Dikirim, alasan wajib | Boleh dari Diproses; `cancel_note` wajib |
| Resi wajib | Kurir + resi sebelum Dikirim | Trigger menolak Dikirim tanpa `tracking_courier` dan `tracking_no` |
| Lunas sebelum Diproses | Verifikasi pembayaran | Trigger menolak Diproses bila `payment_status <> 'lunas'` |
| Data terkunci | Setelah Diproses | Ongkir, metode bayar, status bayar, dan item terkunci |
| Stok terkunci | Saat Pesan, kembali saat batal/kedaluwarsa | `order_items_guard` dan `orders_before_update` |
| Time-out | Default dan per pesanan | `settings.default_timeout_hours` (24), `admin_extend_timeout()`, `expire_overdue_orders()` tiap 10 menit |
| Invoice | Revisi + timestamp, bisa diunduh | Tabel `invoices` (`revision`, `snapshot`), `revise_invoice()` |
| Ongkir hanya di invoice | Tidak tampil di checkout | Nominal ada di `invoices` dan `orders`; UI yang menyembunyikan (lihat 16.2) |
| Metode bayar | Ongkir: TF/COD. Produk: DANA/rekening | Enum `shipping_pay_method`, `product_pay_method` |
| Kurir | Default Pos, opsi JNT/JNE | Enum `courier_type`, default `pos` |
| Ulasan | 1 sampai 5, maks 500, tanpa foto | Constraint tabel `reviews` |
| Notifikasi | 8 jenis | Enum `notification_type`, realtime pada `notifications` |
| Laporan | Final saja, tanpa alamat/nomor, export | `report_orders()`, `report_summary()` tidak mengembalikan alamat atau nomor |
| Super admin | Tanpa akses produk/pesanan | Tidak ada policy super admin pada tabel katalog dan `orders` |
| Log aktivitas | Tanpa password | `activity_logs`, hanya super admin yang membaca |
| Foto | Kompres di browser | Bucket hanya `image/webp`, maks 2 MB |

### 16.2 Yang sudah disesuaikan di dokumen ini

| # | Sebelumnya di desain | Sekarang (mengikuti schema) |
|---|---|---|
| 1 | Nama status awal "usulan" | Final: `menunggu_konfirmasi` |
| 2 | Slug status contoh (`awaiting`, dst.) | Slug asli dari schema |
| 3 | Status pembayaran tidak dibedakan | Chip `Lunas` / `Belum dibayar` terpisah dari status pesanan |
| 4 | Nama tampil sebagian "Aulia R." | **Nama depan saja** |
| 5 | Ulasan: aturan "usulan" | Ditegakkan database; ditambah aturan 1 ulasan per produk per pesanan, pesanan manual tidak bisa diulas |
| 6 | Perpanjang time-out dalam jam/hari | **Jam saja** |
| 7 | Batal admin: dropdown alasan | **Catatan teks wajib** (`cancel_note`) |
| 8 | Aksi pada status Dikonfirmasi tanpa Edit Invoice | Edit Invoice ditambahkan (status kembali ke Direvisi Admin) |
| 9 | Total di kartu Pesanan Saya | **Total produk tanpa ongkir**, agar aturan "ongkir hanya di invoice" tidak bocor lewat daftar |
| 10 | Nomor pesanan gaya Stitch `#HIJ20251007-004` | `HJB-YYMMDD-0001`; invoice `INV-YYMMDD-0001` |
| 11 | Checkout tanpa kota/kode pos | Ditambah area tujuan, kota, kode pos, catatan |
| 12 | Filter laporan: Selesai / Dibatalkan / Kedaluwarsa | **Semua / Selesai / Dibatalkan** (Kedaluwarsa = Dibatalkan dengan alasan kedaluwarsa) |
| 13 | Lookbook dengan produk terkait | Dihapus (schema hanya judul dan foto) |
| 14 | Status produk Aktif/Arsip | **Draft / Aktif / Arsip** |
| 15 | Foto "utamakan WebP" | **Wajib WebP ≤ 2 MB** |
| 16 | Pengaturan tanpa detail | Ditambah asal kirim (area), buffer kemasan 100 g, pembulatan 100 g, atas nama DANA/bank |
| 17 | Warna produk global (landing) | Warna **per produk**; landing perlu mengikuti data produk |
| 18 | Dashboard super admin berisi statistik pesanan | Hanya jumlah akun dan ringkasan laporan |
| 19 | Nama customer di moderasi ulasan dari profil | Dari nama penerima di pesanan (admin tidak bisa membaca profil) |

### 16.3 Celah di schema yang perlu diputuskan sebelum desain final

Hal ini bukan salah desain; ini batas schema yang akan terasa di UI. Urutan dari yang paling berdampak.

1. **Pesanan manual untuk pre-order tidak bisa dibuat bila stok 0.** `order_items_guard` menolak item bila `stock < qty` meskipun admin yang membuat. Padahal `fitur.md` menyebut pesanan manual dipakai untuk pre-order. Pilihan: (a) admin menambah stok dulu lalu membuat pesanan; (b) schema mengizinkan stok negatif atau melewati pengecekan untuk `source = 'admin'`. Desain form saat ini mengasumsikan (a) dan memberi peringatan.
2. **Edit invoice tidak atomik.** Admin mengubah item dan ongkir langsung ke tabel (stok ikut berubah saat itu juga), baru kemudian `revise_invoice()` membuat versi baru. Bila admin menutup halaman di tengah jalan, data berubah tanpa revisi baru. Saran: satu RPC `revise_order(order_id, items, shipping_cost)` yang melakukan semuanya dalam satu transaksi. Sampai itu ada, UI edit invoice harus mengumpulkan semua perubahan di klien dan mengirim berurutan dengan pesan error yang jelas.
3. **Super admin bisa membaca alamat dan nomor telepon customer lewat tabel `profiles`.** RLS bekerja per baris, bukan per kolom. UI Kelola User sudah tidak menampilkannya, tapi API tetap mengembalikan. Bila "tanpa alamat dan nomor" harus ditegakkan di database, buat view khusus tanpa kolom itu untuk super admin.
4. **Ongkir dikirim dari klien ke `place_order`.** Customer bisa mengirim `shipping_cost` apa saja (termasuk 0). Risiko ini sudah ditutup secara proses, karena admin memverifikasi ongkir lewat edit invoice sebelum konfirmasi. Desain: beri penanda "Ongkir estimasi, periksa" di detail pesanan baru untuk admin. Perlu diputuskan juga **fallback bila API ongkir gagal**: blokir pesanan, atau izinkan dengan ongkir 0 dan penanda "Ongkir menunggu admin".
5. **Tidak ada notifikasi saat status Dikonfirmasi atau Selesai.** Customer hanya tahu konfirmasi lewat WhatsApp. Sesuai `fitur.md`, jadi tidak diubah; cukup pastikan timeline di Pesanan Saya mudah dilihat.
6. **Foto utama warna boleh kosong di database.** Form admin yang harus mewajibkannya, dan UI toko sudah menyiapkan swatch hex sebagai cadangan.
7. **Filter produk/kategori di laporan memotong qty dan nilai.** Hanya baris item yang cocok yang dihitung, bukan seluruh pesanan. Beri catatan kecil di bawah ringkasan saat filter aktif agar angka tidak disalahpahami.

### 16.4 Tambahan checklist handoff (dari schema)

- [ ] Kode status di UI memakai slug dari enum `order_status` dan satu objek pemetaan label
- [ ] Chip `payment_status` tampil terpisah dari badge status pesanan
- [ ] Daftar pesanan customer menampilkan total produk tanpa ongkir
- [ ] Hitungan mundur `expires_at` tampil di sukses-pesan dan Pesanan Saya
- [ ] Foto diunggah sebagai WebP ≤ 2 MB
- [ ] Error stok dari server (`Stok tidak cukup untuk …`) ditampilkan sebagai dialog yang bisa ditindaklanjuti
- [ ] Form produk mewajibkan berat gram dan (di UI) foto utama warna
- [ ] Pengaturan menolak cek ongkir bila asal kirim belum diisi
- [ ] Keputusan 16.3 butir 1, 2, 3, dan 4 sudah dijawab
