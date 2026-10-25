// Invoice (Customer): model data + tampilan + gaya cetak. Isi diambil dari kolom `snapshot` tabel `invoices`
// (sama dengan admin/order-invoice.js), jadi versi lama tampil persis seperti saat dibuat.
// Unduh = cetak lewat browser (window.print) -> "Simpan sebagai PDF".
import { esc } from "./tk-lib.js";
import { dateWIB } from "../assets/js/format.js";
import { COURIER, SHIPPING_PAY_METHOD } from "../assets/js/labels.js";

export const STORE = {
  name: "Hijabii by Intan",
  tagline: "Pretty with hijab, pretty with Hijabii.",
  address: "Kp. Pasir Bedil, Desa Cempaka, Kec. Warunggunung, Lebak, Banten",
  email: "hijabiibyintan@gmail.com",
  whatsapp: "6285892052182",
};
export const plainRp = (n) => `Rp ${Math.round(Number(n ?? 0)).toLocaleString("id-ID")}`;
export const waDisplay = (raw) => { const d = String(raw ?? "").replace(/\D/g, ""); return d.startsWith("62") ? `0${d.slice(2)}` : d; };
export function discountLabel(it, { minus = "−", none = "–" } = {}) {
  const amt = Number(it.discount_amount ?? 0);
  if (!(amt > 0)) return none;
  return `${minus}${plainRp(amt)}${it.discount_type === "percent" ? ` (${it.discount_value}%)` : ""}`;
}

export function buildInvoiceView(inv, { wa } = {}) {
  const s = inv?.snapshot ?? {}, r = s.recipient ?? {}, pay = s.payment ?? {};
  const isDana = pay.type === "dana";
  const payLines = [pay.number, isDana ? pay.name : pay.holder].filter(Boolean);
  if (!isDana && pay.number && pay.holder) payLines[1] = `a.n. ${pay.holder}`;
  if (isDana && pay.number && pay.name) payLines[1] = `a.n. ${pay.name}`;
  return {
    no: inv.invoice_no, revision: inv.revision ?? 0, createdAt: inv.created_at, orderNo: s.order_no ?? "",
    store: { ...STORE, whatsapp: wa || STORE.whatsapp },
    recipient: { name: r.name ?? "", phone: r.phone ?? "", address: r.address ?? "", city: r.city ?? "" },
    courier: [COURIER[s.courier] ?? s.courier, s.courier_service].filter(Boolean).join(" · "),
    shipPay: SHIPPING_PAY_METHOD[s.shipping_pay_method] ?? s.shipping_pay_method ?? "",
    payment: { title: isDana ? "DANA" : pay.bank ? `Transfer ${pay.bank}` : "Transfer bank",
      lines: payLines.length ? payLines : ["Info pembayaran belum diisi saat invoice ini dibuat."] },
    items: (s.items ?? []).map((it) => ({ name: it.product_name ?? "", variant: [it.color, it.size].filter(Boolean).join(" / "),
      qty: it.qty, unit: it.unit_price, discount: it, lineTotal: it.line_total })),
    subtotal: inv.subtotal, shipping: inv.shipping_cost, total: inv.total,
    // COD: ongkir dibayar ke kurir, jadi yang dibayar lewat DANA/rekening hanya harga produk
    cod: s.shipping_pay_method === "cod",
    payNow: s.shipping_pay_method === "cod" ? inv.subtotal : inv.total,
  };
}

const CSS = `
.iv-sheet{background:#fff;border:1px solid var(--sand,#EBE0D3);border-radius:16px;padding:24px 20px;color:var(--ink,#2B211C)}
@media(min-width:640px){.iv-sheet{padding:36px 40px}}
.iv-top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.iv-brand{font:600 24px/1 var(--font-serif,serif);letter-spacing:.14em}
.iv-store{margin-top:8px;font-size:12px;line-height:1.55;color:rgba(43,33,28,.65);max-width:300px}
.iv-id{text-align:right;margin-left:auto}
.iv-over{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(43,33,28,.55)}
.iv-no{font:700 15px/1.3 ui-monospace,Menlo,Consolas,monospace;margin-top:4px}
.iv-date{font-size:13px;color:rgba(43,33,28,.65);margin-top:2px}
.iv-rev{display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;background:#F3ECF4;color:var(--marsala,#7B4A4A);font-size:12px;font-weight:600}
.iv-hr{border:0;border-top:1px solid var(--sand,#EBE0D3);margin:20px 0}
.iv-two{display:grid;gap:18px}
@media(min-width:560px){.iv-two{grid-template-columns:1fr 1fr}}
.iv-h{margin:0 0 6px;font:600 10px/1.4 var(--font-sans,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:rgba(43,33,28,.55)}
.iv-addr{margin:0;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
.iv-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:14px}
.iv-kv dt{color:rgba(43,33,28,.6)}.iv-kv dd{margin:0}
.iv-it{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid #F1EAE1}
.iv-it:first-of-type{border-top:1px solid var(--sand,#EBE0D3)}
.iv-it strong{display:block;font-size:14px;overflow-wrap:anywhere}
.iv-it small{display:block;margin-top:2px;font-size:12px;color:rgba(43,33,28,.6)}
.iv-it-r{text-align:right;font-size:13px;line-height:1.5;flex:none}
.iv-it-r b{display:block;font-size:14px}
.iv-it-r .iv-d{color:var(--success,#4E6E58)}
.iv-tot{margin:14px 0 0 auto;max-width:300px;display:grid;gap:6px;font-size:14px}
.iv-tot div{display:flex;justify-content:space-between;gap:16px}
.iv-tot .iv-grand{border-top:1px solid var(--ink,#2B211C);padding-top:8px;margin-top:2px;font-size:16px;font-weight:700}
.iv-pay{margin-top:22px;padding:14px 16px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);font-size:14px;line-height:1.55}
.iv-pay strong{display:block;margin-bottom:2px}
.iv-foot{margin:26px 0 0;text-align:center;font:italic 500 17px/1.3 var(--font-serif,serif);color:var(--marsala,#7B4A4A)}
.iv-foot small{display:block;margin-top:4px;font:400 12px var(--font-sans,sans-serif);font-style:normal;color:rgba(43,33,28,.6)}
.iv-vers{display:flex;gap:8px;overflow-x:auto;margin:0 0 14px;padding-bottom:2px}
.iv-ver{flex:none;padding:7px 14px;border-radius:999px;border:1px solid var(--sand,#EBE0D3);font-size:13px;text-decoration:none;color:var(--ink,#2B211C);background:var(--paper,#FBF8F3)}
.iv-ver[aria-current="page"]{background:var(--ink,#2B211C);border-color:var(--ink,#2B211C);color:var(--cream,#F6F0E7)}
@media print{
  @page{size:A4;margin:14mm}
  html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  #tkTop,#tkHeadSlot,#tkFootSlot,.no-print{display:none!important}
  .tk-main{padding:0!important}.tk-wrap{max-width:none!important;padding:0!important}
  .iv-sheet{border:0!important;border-radius:0!important;padding:0!important;box-shadow:none!important}
}`;
export function ensureInvoiceStyle() {
  if (document.getElementById("ivStyle")) return;
  const st = document.createElement("style"); st.id = "ivStyle"; st.textContent = CSS; document.head.appendChild(st);
}

/** Lembar invoice (dipakai layar dan cetak). */
export function invoiceSheetHtml(v) {
  return `<article class="iv-sheet" aria-label="Invoice ${esc(v.no)}">
    <header class="iv-top">
      <div><div class="iv-brand">HIJABII</div>
        <div class="iv-store">${esc(v.store.name)}<br>${esc(v.store.address)}<br>${esc([waDisplay(v.store.whatsapp), v.store.email].filter(Boolean).join(" · "))}</div></div>
      <div class="iv-id"><div class="iv-over">Invoice</div><div class="iv-no">${esc(v.no)}</div>
        <div class="iv-date">${esc(dateWIB(v.createdAt))}</div>${v.revision > 0 ? `<div class="iv-rev">Revisi #${v.revision}</div>` : ""}</div>
    </header>
    <hr class="iv-hr">
    <div class="iv-two">
      <section><h2 class="iv-h">Ditagihkan kepada</h2>
        <p class="iv-addr"><strong>${esc(v.recipient.name)}</strong><br>${esc(v.recipient.phone)}<br>${esc(v.recipient.address)}${v.recipient.city ? `<br>${esc(v.recipient.city)}` : ""}</p></section>
      <section><h2 class="iv-h">Pengiriman</h2>
        <dl class="iv-kv">${v.courier ? `<dt>Kurir</dt><dd>${esc(v.courier)}</dd>` : ""}${v.shipPay ? `<dt>Bayar ongkir</dt><dd>${esc(v.shipPay)}</dd>` : ""}</dl></section>
    </div>
    <hr class="iv-hr">
    <div role="table" aria-label="Item invoice">${v.items.map((it) => {
      const d = discountLabel(it.discount);
      return `<div class="iv-it" role="row"><div role="cell"><strong>${esc(it.name)}</strong><small>${esc(it.variant)}</small></div>
        <div class="iv-it-r" role="cell">${esc(it.qty)} × ${esc(plainRp(it.unit))}${d !== "–" ? `<span class="iv-d" style="display:block">Diskon ${esc(d)}</span>` : ""}<b>${esc(plainRp(it.lineTotal))}</b></div></div>`;
    }).join("")}</div>
    <div class="iv-tot"><div><span>Subtotal produk</span><b>${esc(plainRp(v.subtotal))}</b></div>
      <div><span>Ongkir${v.cod ? " (COD, dibayar ke kurir)" : ""}</span><b>${esc(plainRp(v.shipping))}</b></div>
      <div class="iv-grand"><span>${v.cod ? "Total bayar (produk)" : "Total"}</span><b>${esc(plainRp(v.payNow))}</b></div></div>
    <section class="iv-pay"><h2 class="iv-h">Pembayaran produk</h2><strong>${esc(v.payment.title)}</strong>${v.payment.lines.map((l) => `<div>${esc(l)}</div>`).join("")}</section>
    <p class="iv-foot">Terima kasih sudah berbelanja di Hijabii by Intan.<small>${esc(v.store.tagline)}</small></p>
  </article>`;
}

/** Teks pesan WhatsApp ke admin (customer yang menekan kirim). Maksimal 8 baris item agar tautan wa.me tidak kepanjangan. */
export function waOrderText(v, { max = 8 } = {}) {
  const lines = v.items.slice(0, max).map((it) => `- ${it.name}${it.variant ? ` (${it.variant})` : ""} x${it.qty}`);
  if (v.items.length > max) lines.push(`- dan ${v.items.length - max} item lainnya`);
  return [
    "Halo Admin Hijabii, saya sudah membuat pesanan di website.",
    "",
    `No. pesanan: ${v.orderNo}`,
    `Invoice: ${v.no}${v.revision > 0 ? ` (revisi ${v.revision})` : ""}`,
    `Atas nama: ${v.recipient.name}`,
    "",
    "Item:", ...lines, "",
    v.cod ? `Total bayar: ${plainRp(v.payNow)} (produk saja)` : `Total: ${plainRp(v.total)} (sudah termasuk ongkir)`,
    ...(v.cod ? [`Ongkir ${plainRp(v.shipping)} dibayar COD ke kurir`] : []),
    `Bayar produk: ${v.payment.title}${v.shipPay ? ` | Bayar ongkir: ${v.shipPay}` : ""}`,
    "",
    "Mohon dicek dan dikonfirmasi ya. Bukti pembayaran akan saya kirim di chat ini setelah pesanan dikonfirmasi.",
  ].join("\n");
}