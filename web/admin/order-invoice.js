// Invoice (Admin): tampilan di layar, model data, dan pembuat PDF dalam satu berkas.
// Rute: #/pesanan/<id>/invoice[/<revisi>]. Isi diambil dari kolom `snapshot` tabel `invoices`, jadi versi lama
// tampil dan terunduh persis seperti saat dibuat. Urutan berkas: 1) model data, 2) PDF (jsPDF), 3) halaman.
import { supabase } from "../assets/js/supabase.js";
import { toast } from "../assets/js/ui.js";
import { dateWIB } from "../assets/js/format.js";
import { COURIER, SHIPPING_PAY_METHOD } from "../assets/js/labels.js";
import { esc, setBusy } from "./ad-ui.js";

// ===================================================================
// 1. MODEL DATA (fungsi murni; dipakai layar dan PDF supaya isinya selalu sama)
// ===================================================================
/** Identitas toko di kop invoice. Sumber: formulir brief landing page. Nomor WA diambil dari tabel settings (bila ada). */
export const STORE = {
  name: "Hijabii by Intan",
  tagline: "Pretty with hijab, pretty with Hijabii.",
  address: "Kp. Pasir Bedil, Desa Cempaka, Kec. Warunggunung, Lebak, Banten",
  email: "hijabiibyintan@gmail.com",
  whatsapp: "6285892052182",
};

/** Rupiah polos "Rp 100.000" (tanpa karakter khusus, aman untuk font bawaan PDF). */
export const plainRp = (n) => `Rp ${Math.round(Number(n ?? 0)).toLocaleString("id-ID")}`;

/** 62812… -> 0812… (tampilan lokal). */
export const waDisplay = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.startsWith("62") ? `0${d.slice(2)}` : d;
};

/** Teks diskon satu baris. minus: tanda minus yang dipakai ("−" di layar, "-" di PDF). */
export function discountLabel(it, { minus = "−", none = "–" } = {}) {
  const amt = Number(it.discount_amount ?? 0);
  if (!(amt > 0)) return none;
  return `${minus}${plainRp(amt)}${it.discount_type === "percent" ? ` (${it.discount_value}%)` : ""}`;
}

export function buildInvoiceView(inv, { wa } = {}) {
  const s = inv?.snapshot ?? {};
  const r = s.recipient ?? {};
  const pay = s.payment ?? {};
  const isDana = pay.type === "dana";
  const payLines = [pay.number, isDana ? pay.name : pay.holder].filter(Boolean);
  if (!isDana && pay.number && pay.holder) payLines[1] = `a.n. ${pay.holder}`;
  if (isDana && pay.number && pay.name) payLines[1] = `a.n. ${pay.name}`;
  return {
    no: inv.invoice_no,
    revision: inv.revision ?? 0,
    createdAt: inv.created_at,
    orderNo: s.order_no ?? "",
    store: { ...STORE, whatsapp: wa || STORE.whatsapp },
    recipient: { name: r.name ?? "", phone: r.phone ?? "", address: r.address ?? "", city: r.city ?? "" },
    courier: [COURIER[s.courier] ?? s.courier, s.courier_service].filter(Boolean).join(" · "),
    shipPay: SHIPPING_PAY_METHOD[s.shipping_pay_method] ?? s.shipping_pay_method ?? "",
    payment: {
      title: isDana ? "DANA" : pay.bank ? `Transfer ${pay.bank}` : "Transfer bank",
      lines: payLines.length ? payLines : ["Info pembayaran belum diisi saat invoice ini dibuat."],
    },
    items: (s.items ?? []).map((it) => ({
      name: it.product_name ?? "", variant: [it.color, it.size].filter(Boolean).join(" / "), qty: it.qty,
      unit: it.unit_price, discount: it, lineTotal: it.line_total,
    })),
    subtotal: inv.subtotal, shipping: inv.shipping_cost, total: inv.total,
  };
}

// ===================================================================
// 2. PDF (digambar langsung dengan jsPDF; dimuat hanya saat tombol Unduh ditekan)
// ===================================================================
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
let pending = null;
function loadJsPdf() {
  if (globalThis.jspdf?.jsPDF) return Promise.resolve(globalThis.jspdf.jsPDF);
  pending ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSPDF_URL;
    s.onload = () => resolve(globalThis.jspdf.jsPDF);
    s.onerror = () => { pending = null; reject(new Error("Pustaka PDF gagal dimuat. Periksa koneksi lalu coba lagi.")); };
    document.head.appendChild(s);
  });
  return pending;
}

const C = { ink: [43, 33, 28], mute: [128, 122, 120], sand: [235, 224, 211], marsala: [123, 74, 74], paper: [251, 248, 243] };
/** Font bawaan PDF hanya Latin-1: ganti tanda kutip/strip "pintar", buang karakter di luar jangkauan. */
const safe = (t) => String(t ?? "")
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014\u2212]/g, "-")
  .replace(/[\u00A0\u202F]/g, " ").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");

export const invoiceFileName = (v) => `Invoice-${v.no}${v.revision > 0 ? `-rev${v.revision}` : ""}.pdf`;

export function drawInvoice(doc, v) {
  const W = 210, H = 297, M = 18, R = W - M, BOTTOM = H - 24;
  const col = { name: M, nameW: 62, qty: 92, price: 118, disc: 156, sub: R };
  let y = M;
  const color = (c) => doc.setTextColor(...c);
  const font = (f, style = "normal", size = 9.5) => { doc.setFont(f, style); doc.setFontSize(size); };
  const text = (t, x, yy, o) => doc.text(safe(t), x, yy, o);
  const wrap = (t, w) => doc.splitTextToSize(safe(t), w);
  const overline = (t, x, yy, o = {}) => { font("helvetica", "bold", 7.5); color(C.mute); text(String(t).toUpperCase(), x, yy, { charSpace: 0.5, ...o }); };
  const rule = (yy, c = C.sand) => { doc.setDrawColor(...c); doc.setLineWidth(0.25); doc.line(M, yy, R, yy); };

  // ---- Kop ----
  font("times", "bold", 22); color(C.ink); text("HIJABII", M, y + 6, { charSpace: 1.6 });
  font("helvetica", "normal", 8.5); color(C.mute);
  let sy = y + 12;
  text(v.store.name, M, sy); sy += 4.2;
  for (const l of wrap(v.store.address, 84)) { text(l, M, sy); sy += 4.2; }
  text([waDisplay(v.store.whatsapp), v.store.email].filter(Boolean).join("  ·  "), M, sy);
  overline("Invoice", R, y + 3, { align: "right", charSpace: 0 });
  font("courier", "bold", 12); color(C.ink); text(v.no, R, y + 10, { align: "right" });
  font("helvetica", "normal", 9); color(C.mute); text(dateWIB(v.createdAt), R, y + 15.5, { align: "right" });
  if (v.revision > 0) { font("helvetica", "bold", 9); color(C.marsala); text(`Revisi #${v.revision}`, R, y + 20.5, { align: "right" }); }
  y = Math.max(sy, y + 22) + 6; rule(y); y += 8;

  // ---- Penerima & pengiriman ----
  const xR = M + 96;
  overline("Ditagihkan kepada", M, y); overline("Pengiriman", xR, y);
  let yl = y + 5.5, yr = y + 5.5;
  font("helvetica", "bold", 10); color(C.ink); text(v.recipient.name, M, yl); yl += 4.8;
  font("helvetica", "normal", 9.5);
  for (const l of [v.recipient.phone, ...wrap(v.recipient.address, 84), v.recipient.city].filter(Boolean)) { text(l, M, yl); yl += 4.6; }
  const kv = (k, val) => { if (!val) return; font("helvetica", "normal", 9); color(C.mute); text(k, xR, yr); font("helvetica", "normal", 9.5); color(C.ink); text(val, xR + 28, yr); yr += 4.8; };
  kv("Kurir", v.courier); kv("Bayar ongkir", v.shipPay);
  y = Math.max(yl, yr) + 7;

  // ---- Tabel item ----
  const head = () => {
    overline("Produk", col.name, y); overline("Qty", col.qty, y, { align: "right", charSpace: 0 }); overline("Harga", col.price, y, { align: "right", charSpace: 0 });
    overline("Diskon", col.disc, y, { align: "right", charSpace: 0 }); overline("Subtotal", col.sub, y, { align: "right", charSpace: 0 });
    y += 2.5; rule(y); y += 5.5;
  };
  head();
  for (const it of v.items) {
    const nameLines = wrap(it.name, col.nameW);
    const h = nameLines.length * 4.6 + (it.variant ? 4.4 : 0) + 3.5;
    if (y + h > BOTTOM) { doc.addPage(); y = M; head(); }
    font("helvetica", "bold", 9.5); color(C.ink);
    nameLines.forEach((l, i) => text(l, col.name, y + i * 4.6));
    if (it.variant) { font("helvetica", "normal", 8.5); color(C.mute); text(it.variant, col.name, y + nameLines.length * 4.6 - 0.2); }
    font("helvetica", "normal", 9.5); color(C.ink);
    text(String(it.qty), col.qty, y, { align: "right" });
    text(plainRp(it.unit), col.price, y, { align: "right" });
    text(discountLabel(it.discount, { minus: "-", none: "-" }), col.disc, y, { align: "right" });
    text(plainRp(it.lineTotal), col.sub, y, { align: "right" });
    y += h; rule(y - 5.15, [241, 234, 225]);
  }
  y += 3;

  // ---- Total ----
  const payLines = v.payment.lines.flatMap((l) => wrap(l, 120));
  const payH = 11 + payLines.length * 4.8 + 4;
  if (y + 32 + payH + 22 > H - 18) { doc.addPage(); y = M; }
  const tot = (label, val, bold) => {
    font("helvetica", bold ? "bold" : "normal", bold ? 11 : 9.5); color(C.ink);
    text(label, col.disc, y, { align: "right" }); text(val, col.sub, y, { align: "right" }); y += bold ? 0 : 5.5;
  };
  tot("Subtotal produk", plainRp(v.subtotal)); tot("Ongkir", plainRp(v.shipping));
  rule(y - 2.5, C.ink); y += 3; tot("Total", plainRp(v.total), true); y += 10;

  // ---- Pembayaran produk ----
  doc.setFillColor(...C.paper); doc.setDrawColor(...C.sand); doc.setLineWidth(0.3);
  doc.roundedRect(M, y, R - M, payH, 3, 3, "FD");
  overline("Pembayaran produk", M + 5, y + 6.5);
  font("helvetica", "bold", 10); color(C.ink); text(v.payment.title, M + 5, y + 12.5);
  font("helvetica", "normal", 9.5);
  payLines.forEach((l, i) => text(l, M + 5, y + 17.5 + i * 4.8));
  y += payH + 12;

  // ---- Penutup ----
  font("times", "italic", 12); color(C.marsala); text("Terima kasih sudah berbelanja di Hijabii by Intan.", W / 2, y, { align: "center" });
  font("helvetica", "normal", 8.5); color(C.mute); text(v.store.tagline, W / 2, y + 5, { align: "center" });

  // ---- Nomor halaman ----
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); font("helvetica", "normal", 8); color(C.mute);
    text(v.no + (v.revision > 0 ? ` · Revisi #${v.revision}` : ""), M, H - 10);
    text(`Halaman ${i} dari ${n}`, R, H - 10, { align: "right" });
  }
}

export async function downloadInvoicePdf(v) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `Invoice ${v.no}`, author: v.store.name, subject: "Invoice" });
  drawInvoice(doc, v);
  doc.save(invoiceFileName(v));
}

// ===================================================================
// 3. HALAMAN INVOICE
// ===================================================================
export async function renderInvoice({ pg, id, rev = "", isStale = () => false }) {
  const backOrder = `<a class="od-back" href="#/pesanan/${esc(id)}">← Kembali ke pesanan</a>`;
  pg.innerHTML = `<div aria-hidden="true"><div class="ad-skel" style="width:40%;height:36px"></div><div class="ad-skel" style="height:320px"></div></div>`;

  const [inv, st] = await Promise.all([
    supabase.from("invoices").select("*").eq("order_id", id).order("revision", { ascending: false }),
    supabase.from("settings").select("admin_whatsapp").eq("id", true).maybeSingle(),
  ]);
  if (isStale()) return;
  if (inv.error) {
    console.error(inv.error);
    pg.innerHTML = `${backOrder}<div class="ad-error" role="alert">Invoice gagal dimuat. <a class="btn btn-secondary btn-sm" href="#/pesanan/${esc(id)}/invoice">Coba lagi</a></div>`;
    return;
  }
  const list = inv.data ?? [];
  if (!list.length) { pg.innerHTML = `${backOrder}<div class="ad-empty">Pesanan ini belum punya invoice.</div>`; return; }

  const latest = list[0];
  const cur = rev === "" ? latest : list.find((v) => String(v.revision) === String(rev));
  if (!cur) {
    pg.innerHTML = `${backOrder}<div class="ad-empty">Versi invoice tidak ditemukan. <a href="#/pesanan/${esc(id)}/invoice">Buka versi terbaru</a></div>`;
    return;
  }

  const v = buildInvoiceView(cur, { wa: st.data?.admin_whatsapp });
  const verLabel = (n) => (n === 0 ? "Awal" : `Revisi #${n}`);
  const kv = (rows) => `<dl class="od-kv">${rows.filter(Boolean).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join("")}</dl>`;

  pg.innerHTML = `
    ${backOrder}
    <header class="ad-page-head"><div><h1 class="ad-h1">Invoice</h1>
      <p class="ad-sub"><span class="od-mono">${esc(v.no)}</span> · ${esc(v.recipient.name)}</p></div>
      <button type="button" class="btn btn-primary" id="ivPdf">Unduh PDF</button></header>

    ${list.length > 1 ? `<nav class="iv-vers" aria-label="Versi invoice">${list.map((x) =>
      `<a class="iv-ver" href="#/pesanan/${esc(id)}/invoice/${x.revision}" ${x.revision === cur.revision ? 'aria-current="page"' : ""}>${verLabel(x.revision)}${x.revision === latest.revision ? " · Terbaru" : ""}</a>`).join("")}</nav>` : ""}
    ${cur.revision !== latest.revision ? `<p class="ad-note ad-note-warn" style="margin-bottom:16px">Ini versi lama. Invoice yang berlaku sekarang adalah ${verLabel(latest.revision)}. <a href="#/pesanan/${esc(id)}/invoice/${latest.revision}">Buka versi terbaru</a></p>` : ""}

    <article class="ad-card iv-sheet" aria-label="Invoice ${esc(v.no)}">
      <header class="iv-top">
        <div><div class="iv-brand">HIJABII</div>
          <div class="iv-store">${esc(v.store.name)}<br>${esc(v.store.address)}<br>${esc([waDisplay(v.store.whatsapp), v.store.email].filter(Boolean).join(" · "))}</div></div>
        <div class="iv-id"><div class="iv-over">Invoice</div>
          <div class="od-mono iv-no">${esc(v.no)}</div>
          <div class="iv-date">${esc(dateWIB(v.createdAt))}</div>
          ${v.revision > 0 ? `<div class="iv-rev">Revisi #${v.revision}</div>` : ""}</div>
      </header>
      <hr class="od-hr">
      <div class="od-two">
        <section><h2 class="od-sub">Ditagihkan kepada</h2>
          <p class="iv-addr"><strong>${esc(v.recipient.name)}</strong><br>${esc(v.recipient.phone)}<br>${esc(v.recipient.address)}${v.recipient.city ? `<br>${esc(v.recipient.city)}` : ""}</p></section>
        <section><h2 class="od-sub">Pengiriman</h2>${kv([["Kurir", v.courier], ["Bayar ongkir", v.shipPay]])}</section>
      </div>
      <hr class="od-hr">
      <div class="od-items" role="table" aria-label="Item invoice">
        <div class="od-it od-ith" role="row"><span role="columnheader">Produk</span><span role="columnheader">Qty</span><span role="columnheader">Harga</span><span role="columnheader">Diskon</span><span role="columnheader">Subtotal</span></div>
        ${v.items.map((it) => `<div class="od-it" role="row">
          <div class="od-it-name" role="cell"><strong>${esc(it.name)}</strong><small>${esc(it.variant)}</small></div>
          <div role="cell"><span class="od-lbl">Qty</span><span>${esc(it.qty)}</span></div>
          <div role="cell"><span class="od-lbl">Harga</span><span>${esc(plainRp(it.unit))}</span></div>
          <div role="cell"><span class="od-lbl">Diskon</span><span>${esc(discountLabel(it.discount))}</span></div>
          <div role="cell"><span class="od-lbl">Subtotal</span><span>${esc(plainRp(it.lineTotal))}</span></div></div>`).join("")}
      </div>
      <div class="od-totals"><div><span>Subtotal produk</span><b>${esc(plainRp(v.subtotal))}</b></div>
        <div><span>Ongkir</span><b>${esc(plainRp(v.shipping))}</b></div>
        <div class="od-grand"><span>Total</span><b>${esc(plainRp(v.total))}</b></div></div>
      <section class="iv-pay"><h2 class="od-sub">Pembayaran produk</h2>
        <strong>${esc(v.payment.title)}</strong>${v.payment.lines.map((l) => `<div>${esc(l)}</div>`).join("")}</section>
      <p class="iv-foot">Terima kasih sudah berbelanja di Hijabii by Intan.<small>${esc(v.store.tagline)}</small></p>
    </article>`;

  const btn = pg.querySelector("#ivPdf");
  btn.addEventListener("click", async () => {
    setBusy(btn, true, "Menyiapkan PDF…");
    try { await downloadInvoicePdf(v); toast("PDF invoice diunduh.", "success"); }
    catch (e) { console.error(e); toast(e.message || "PDF gagal dibuat. Coba lagi.", "error"); }
    finally { setBusy(btn, false); }
  });
}