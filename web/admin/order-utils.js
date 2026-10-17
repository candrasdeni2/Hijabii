// Fungsi murni untuk modul Pesanan (mudah diuji): total, ringkasan item, filter, pesan WhatsApp, aksi per status.
import { ORDER_STATUS } from "../assets/js/labels.js";
import { rupiah } from "../assets/js/format.js";

/** Giliran admin untuk bertindak: konfirmasi, verifikasi bayar, kirim. (Direvisi Admin menunggu customer; Dikirim menunggu serah-terima.) */
export const NEED_ACTION = ["menunggu_konfirmasi", "dikonfirmasi", "diproses"];
/** Data pesanan masih boleh diubah (sebelum Diproses). */
export const EDITABLE = ["menunggu_konfirmasi", "direvisi_admin", "dikonfirmasi"];
export const FINAL = ["selesai", "dibatalkan", "kedaluwarsa"];

export const STATUS_FILTERS = [
  { v: "", t: "Semua status" },
  { v: "perlu", t: "Perlu tindakan" },
  ...Object.entries(ORDER_STATUS).map(([v, s]) => ({ v, t: s.label })),
];

/** Sama persis dengan kolom generated order_items.discount_amount: persen dibulatkan ke bawah, nominal dibatasi subtotal baris. */
export const discountAmount = (qty, price, type, value) => {
  const base = qty * price;
  return Math.min(type === "percent" ? Math.floor((base * value) / 100) : value, base);
};
export const lineTotal = (it) => it.line_total ?? (it.qty * it.unit_price - (it.discount_amount ?? 0));
export function orderTotals(items, shippingCost = 0) {
  const subtotal = (items ?? []).reduce((s, it) => s + lineTotal(it), 0);
  return { subtotal, shipping: shippingCost ?? 0, total: subtotal + (shippingCost ?? 0) };
}

/** "Pasmina Tancel · Cream/M ×2 +1 lainnya" */
export function itemsSummary(items) {
  const list = items ?? [];
  if (!list.length) return "–";
  const f = list[0];
  return `${f.product_name} · ${f.color_name}/${f.size} ×${f.qty}${list.length > 1 ? ` +${list.length - 1} lainnya` : ""}`;
}

/** Bersihkan kata kunci untuk filter PostgREST .or(): buang karakter pemisah/wildcard (, ( ) % _ * : \ ") agar tidak merusak query. */
export function sanitizeSearch(raw) {
  return String(raw ?? "").replace(/[^\p{L}\p{N} .'\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

/** 0812… / 812… / +62812… -> 62812… ; kosong bila tidak ada digit. */
export function waPhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}
export function waLink(raw, text) {
  const p = waPhone(raw);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null;
}
export function confirmMessage(order, totals) {
  return `Halo ${order.recipient_name}, ini konfirmasi pesanan ${order.order_no} di Hijabii by Intan.\n`
    + `Produk: ${rupiah(totals.subtotal)}\nOngkir: ${rupiah(totals.shipping)}\nTotal: ${rupiah(totals.total)}\n\n`
    + "Mohon cek rinciannya. Kalau sudah sesuai, balas pesan ini ya. Terima kasih!";
}

/** Aksi yang valid per status (design.md 9.2). Urutan = urutan tombol. */
export function actionsFor(status) {
  switch (status) {
    case "menunggu_konfirmasi":
    case "direvisi_admin": return ["edit", "chat", "confirm", "extend", "cancel"];
    case "dikonfirmasi":   return ["edit", "chat", "verify", "extend", "cancel"];
    case "diproses":       return ["ship", "cancel"];
    case "dikirim":        return ["complete"];
    default:               return [];
  }
}