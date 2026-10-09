// labels.js — SATU objek pemetaan slug database -> label UI (design.md 13.4, 5.6).
// Slug HARUS persis enum di schema.sql. Label Indonesia hanya hidup di sini.
export const ORDER_STATUS = {
  menunggu_konfirmasi: { label:'Menunggu Konfirmasi', bg:'#FDF3E3', fg:'#B8863A' },
  direvisi_admin:      { label:'Direvisi Admin',      bg:'#F3ECF4', fg:'#7B4A4A' },
  dikonfirmasi:        { label:'Dikonfirmasi',        bg:'#EDF3F7', fg:'#4F6B7D' },
  diproses:            { label:'Diproses',            bg:'#EDF3F7', fg:'#4F6B7D' },
  dikirim:             { label:'Dikirim',             bg:'#F4F5E6', fg:'#6B6A47' },
  selesai:             { label:'Selesai',             bg:'#EEF5EF', fg:'#4E6E58' },
  dibatalkan:          { label:'Dibatalkan',          bg:'#FAEDED', fg:'#9E3D3D' },
  kedaluwarsa:         { label:'Kedaluwarsa',         bg:'#F1ECE6', fg:'#8A7A6E' },
};
export const PAYMENT_STATUS = {
  belum_dibayar: { label:'Belum dibayar', bg:'#FDF3E3', fg:'#B8863A' },
  lunas:         { label:'Lunas',         bg:'#EEF5EF', fg:'#4E6E58' },
};
export const COURIER = { pos:'Kantor Pos', jnt:'J&T', jne:'JNE' };
export const SHIPPING_PAY_METHOD = { tf:'Transfer', cod:'COD' };       // metode bayar ONGKIR
export const PRODUCT_PAY_METHOD  = { dana:'DANA', bank:'Rekening bank' }; // metode bayar PRODUK
export const CANCEL_REASON = {
  salah_pilih_produk:'Salah memilih produk/warna/ukuran/jumlah',
  salah_alamat:'Salah memasukkan alamat/data pengiriman',
  berubah_pikiran:'Berubah pikiran/tidak jadi membeli',
  kedaluwarsa:'Waktu pembayaran habis',
  dibatalkan_admin:'Dibatalkan admin',
};
export const PRODUCT_STATUS = { draft:'Draft', active:'Aktif', archived:'Arsip' };
export const ROLE = { customer:'Customer', admin:'Admin', super_admin:'Super Admin' };
export const NOTIFICATION_TYPE = {
  order_baru:'Pesanan baru', invoice_direvisi:'Invoice direvisi', diproses:'Pesanan diproses', dikirim:'Pesanan dikirim',
  dibatalkan_customer:'Dibatalkan customer', dibatalkan_admin:'Dibatalkan admin', kedaluwarsa:'Pesanan kedaluwarsa',
  password_diubah:'Password diubah',
};
