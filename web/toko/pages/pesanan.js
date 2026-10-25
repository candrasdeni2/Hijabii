// Pesanan Saya: daftar (#/pesanan), detail + layar sukses (#/pesanan/<id>[?baru=1]), invoice (#/pesanan/<id>/invoice[/<revisi>]).
import { supabase, rupiah, esc, fail, errorBox, emptyState, toast, statusBadge, paymentChip, getSettings, waLink, copyText, dateWIB, dateTimeWIB, countdown, ICON, openDialog, withLoading } from "../tk-lib.js";
import { ORDER_STATUS, CANCEL_REASON, COURIER } from "../../assets/js/labels.js";
import { buildInvoiceView, invoiceSheetHtml, waOrderText, ensureInvoiceStyle } from "../invoice-view.js";

const PENDING = ["menunggu_konfirmasi", "direvisi_admin", "dikonfirmasi"];
const TABS = [
  ["semua", "Semua", null],
  ["menunggu", "Menunggu", PENDING],
  ["diproses", "Diproses", ["diproses"]],
  ["dikirim", "Dikirim", ["dikirim"]],
  ["selesai", "Selesai", ["selesai"]],
  ["batal", "Dibatalkan", ["dibatalkan", "kedaluwarsa"]],
];

const CSS = `
.po{max-width:720px;margin:0 auto;padding:0 16px 24px}
.po-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;margin-left:-6px;font-size:14px;color:rgba(43,33,28,.7);text-decoration:none}
.po-back svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.po-mono{font:600 14px var(--font-sans,sans-serif)}
.po-no{font:600 20px/1.2 var(--font-sans,sans-serif);margin:0}
.po-tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 0 14px}
.po-tab{flex:none;padding:8px 16px;border-radius:999px;border:1px solid var(--sand,#EBE0D3);background:var(--paper,#FBF8F3);font-size:13px;text-decoration:none;color:var(--ink,#2B211C)}
.po-tab[aria-current="page"]{background:var(--marsala,#7B4A4A);border-color:var(--marsala,#7B4A4A);color:var(--cream,#F6F0E7)}
.po-card{display:block;padding:16px 0;border-bottom:1px solid var(--sand,#EBE0D3);text-decoration:none;color:inherit}
.po-card:first-of-type{border-top:1px solid var(--sand,#EBE0D3)}
.po-row{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.po-sub{font-size:13px;color:rgba(43,33,28,.65);margin:4px 0 0;overflow-wrap:anywhere}
.po-tot{font-weight:600;font-size:15px;margin-top:8px}
.po-cd{font-size:12px;color:var(--warning,#B8863A);font-weight:500}
.po-ok{text-align:center;padding:22px 16px 20px;margin:4px 0 8px;background:var(--paper,#FBF8F3);border:1px solid var(--sand,#EBE0D3);border-radius:16px}
.po-ok svg{width:44px;height:44px;fill:none;stroke:var(--success,#4E6E58);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.po-ok h1{font:600 26px/1.2 var(--font-serif,serif);margin:8px 0 6px}
.po-ok p{margin:0;font-size:14px;line-height:1.55;color:rgba(43,33,28,.75)}
.po-big{font:600 30px/1.1 var(--font-serif,serif);color:var(--marsala,#7B4A4A);margin:12px 0 2px}
.po-acts{display:grid;gap:10px;margin:16px 0 4px}
@media(min-width:560px){.po-acts{grid-template-columns:1fr 1fr}}
.po-acts .btn{width:100%}
.po-sec{padding:18px 0;border-top:1px solid var(--sand,#EBE0D3)}
.po-sec h2{font:600 20px/1.2 var(--font-serif,serif);margin:0 0 10px}
.po-it{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:14px}
.po-it small{display:block;color:rgba(43,33,28,.6);font-size:12px}
.po-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0;font-size:14px}
.po-kv dt{color:rgba(43,33,28,.6)}.po-kv dd{margin:0;overflow-wrap:anywhere}
.po-tl{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.po-tl li{display:grid;grid-template-columns:12px 1fr;gap:12px;font-size:14px}
.po-tl li::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--marsala,#7B4A4A);margin-top:5px}
.po-tl li:first-child::before{background:var(--success,#4E6E58)}
.po-tl small{display:block;color:rgba(43,33,28,.6);font-size:12px}
.po-tot2{border-top:1px solid var(--sand,#EBE0D3);margin-top:6px;padding-top:10px}
.po-grand{border-top:1px solid var(--ink,#2B211C);margin-top:4px;padding-top:10px;font-size:16px}
.po-pay{margin-top:16px;padding:14px 16px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);font-size:14px;line-height:1.5}
.po-pay .po-h{font:600 10px/1.4 var(--font-sans,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:rgba(43,33,28,.55);margin:0 0 4px}
.po-numrow{display:flex;align-items:center;gap:6px;margin-top:2px}
.po-num{font:600 18px/1.3 var(--font-sans,sans-serif);letter-spacing:.02em;overflow-wrap:anywhere}
.po-cp{flex:none;width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--sand,#EBE0D3);border-radius:50%;background:var(--cream,#F6F0E7);color:var(--marsala,#7B4A4A);cursor:pointer}
.po-cp:hover{background:var(--sand,#EBE0D3)}
.po-cp svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.po-opts{display:grid;gap:10px;margin:0 0 6px}
.po-opt{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);cursor:pointer;font-size:14px;line-height:1.4;min-height:48px}
.po-opt:has(input:checked){border-color:var(--marsala,#7B4A4A);box-shadow:0 0 0 1px var(--marsala,#7B4A4A)}
.po-opt input{margin-top:2px;width:18px;height:18px;accent-color:var(--marsala,#7B4A4A);flex:none}
.po-link{background:none;border:0;padding:0 0 0 8px;color:var(--marsala,#7B4A4A);text-decoration:underline;font:inherit;cursor:pointer}
`;

const backLink = (href, label) => `<a class="po-back" href="${href}">${ICON.back}${esc(label)}</a>`;
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>`;

export async function init({ root, parts, query, profile, isStale }) {
  if (!document.getElementById("poStyle")) { const s = document.createElement("style"); s.id = "poStyle"; s.textContent = CSS; document.head.appendChild(s); }
  const [id, sub, rev] = parts;
  if (!id) return renderList({ root, query, profile, isStale });
  if (sub === "invoice") return renderInvoice({ root, id, rev: rev ?? "", isStale });
  return renderDetail({ root, id, baru: query.get("baru") === "1", isStale });
}

/* ================= DAFTAR ================= */
async function renderList({ root, query, profile, isStale }) {
  const key = TABS.some((t) => t[0] === query.get("s")) ? query.get("s") : "semua";
  const tab = TABS.find((t) => t[0] === key);
  root.innerHTML = `<div class="po"><div class="tk-head"><h1 class="tk-h1">Pesanan Saya</h1></div>
    <nav class="po-tabs" aria-label="Filter status">${TABS.map(([k, l]) => `<a class="po-tab" href="#/pesanan${k === "semua" ? "" : `?s=${k}`}" ${k === key ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    <div id="poBody"><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px;margin-top:10px"></div></div></div>`;
  const bodyEl = root.querySelector("#poBody");
  const load = async () => {
    let q = supabase.from("orders").select("id, order_no, status, payment_status, created_at, expires_at, order_items(product_name, qty, line_total)")
      .eq("customer_id", profile.id).order("created_at", { ascending: false }).limit(50);
    if (tab[2]) q = q.in("status", tab[2]);
    const { data, error } = await q;
    if (isStale()) return;
    if (error) { console.error(error); bodyEl.innerHTML = errorBox(); bodyEl.querySelector("[data-retry]").addEventListener("click", load); return; }
    if (!data.length) { bodyEl.innerHTML = emptyState(key === "semua" ? "Belum ada pesanan" : "Tidak ada pesanan di sini", key === "semua" ? "Pesanan yang kamu buat akan muncul di sini." : "", "#/katalog", "Lihat Koleksi"); return; }
    bodyEl.innerHTML = data.map((o) => {
      const its = o.order_items ?? [], total = its.reduce((s, i) => s + i.line_total, 0), qty = its.reduce((s, i) => s + i.qty, 0);
      const cd = PENDING.includes(o.status) ? countdown(o.expires_at) : null;
      const names = its.slice(0, 2).map((i) => i.product_name).join(", ") + (its.length > 2 ? ` +${its.length - 2} lainnya` : "");
      return `<a class="po-card" href="#/pesanan/${esc(o.id)}">
        <div class="po-row"><span class="po-mono">${esc(o.order_no)}</span>${statusBadge(o.status)}</div>
        <p class="po-sub">${esc(dateWIB(o.created_at))} · ${qty} barang</p>
        <p class="po-sub">${esc(names)}</p>
        <div class="po-row"><span class="po-tot">${esc(rupiah(total))}</span>${cd ? `<span class="po-cd">Bayar sebelum ${esc(cd)} lagi</span>` : ""}</div></a>`;
    }).join("");
  };
  await load();
}

/* ================= DETAIL / SUKSES ================= */
async function loadOrder(id) {
  const [o, it, inv, hist, st] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("id, product_name, color_name, size, qty, line_total").eq("order_id", id).order("created_at"),
    supabase.from("invoices").select("*").eq("order_id", id).order("revision", { ascending: false }),
    supabase.from("order_status_history").select("to_status, note, created_at").eq("order_id", id).order("created_at"),
    getSettings().catch(() => ({})),
  ]);
  for (const r of [o, it, inv, hist]) if (r.error) throw r.error;
  return { order: o.data, items: it.data ?? [], invoices: inv.data ?? [], history: hist.data ?? [], settings: st };
}

async function renderDetail({ root, id, baru, isStale }) {
  root.innerHTML = `<div class="po"><div class="skeleton" style="height:40px;width:50%"></div><div class="skeleton" style="height:200px;margin-top:14px"></div></div>`;
  let d;
  try { d = await loadOrder(id); } catch (e) {
    console.error(e); if (isStale()) return;
    root.innerHTML = `<div class="po">${errorBox()}</div>`; root.querySelector("[data-retry]").addEventListener("click", () => location.reload()); return;
  }
  if (isStale()) return;
  const { order: o, items, invoices, history, settings } = d;
  if (!o) { root.innerHTML = `<div class="po">${backLink("#/pesanan", "Pesanan Saya")}${emptyState("Pesanan tidak ditemukan", "Pesanan ini tidak ada atau bukan milikmu.", "#/pesanan", "Ke pesanan saya")}</div>`; return; }

  const latest = invoices[0] ?? null;
  const v = latest ? buildInvoiceView(latest, { wa: settings.admin_whatsapp }) : null;
  const wa = v ? waLink(settings, waOrderText(v)) : null;
  const pending = PENDING.includes(o.status), cd = pending ? countdown(o.expires_at) : null;
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const shipCost = latest ? latest.shipping_cost : o.shipping_cost;
  const grand = latest ? latest.total : subtotal + shipCost;
  const cod = o.shipping_pay_method === "cod";                      // COD: ongkir dibayar ke kurir
  const payNow = cod ? (latest ? latest.subtotal : subtotal) : grand;  // yang dibayar lewat DANA/rekening
  const canCancel = PENDING.includes(o.status);
  const pay = latest?.snapshot?.payment ?? null, payV = v?.payment ?? null;
  const showPay = o.payment_status === "belum_dibayar" && !(o.status === "dibatalkan" || o.status === "kedaluwarsa");
  const COPY = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>`;
  const tl = history.map((h, i) => ({ label: i === 0 ? "Pesanan dibuat" : (ORDER_STATUS[h.to_status]?.label ?? h.to_status), at: h.created_at, note: i === 0 ? "" : h.note }));
  const cancelled = o.status === "dibatalkan" || o.status === "kedaluwarsa";

  const actions = `<div class="po-acts">
    ${wa && pending ? `<a class="btn btn-accent" href="${esc(wa)}" target="_blank" rel="noopener">Kirim ke WhatsApp Admin</a>` : ""}
    ${latest ? `<a class="btn btn-secondary" href="#/pesanan/${esc(o.id)}/invoice">Lihat Invoice</a>` : ""}
  </div>${pending && !wa ? `<p class="po-sub">Nomor WhatsApp admin belum diatur. Hubungi admin lewat tombol chat.</p>` : ""}`;

  const head = baru ? `<section class="po-ok" aria-live="polite">${CHECK}<h1>Pesanan berhasil dibuat</h1>
      <p>Stok sudah dikunci untukmu. Kirim pesanan ini ke admin lewat WhatsApp agar segera dikonfirmasi.</p>
      ${pending ? `<div class="po-big" data-cd="${esc(o.expires_at)}">${cd ? esc(cd) : "Waktu habis"}</div><p>sisa waktu sebelum pesanan kedaluwarsa (${esc(dateTimeWIB(o.expires_at))})</p>` : ""}
    </section>${actions}`
    : `<div class="po-row" style="margin:6px 0 2px"><h1 class="po-no">${esc(o.order_no)}</h1><span>${statusBadge(o.status)} ${paymentChip(o.payment_status)}</span></div>
       <p class="po-sub">Dibuat ${esc(dateTimeWIB(o.created_at))}</p>
       ${pending ? `<p class="po-cd" style="margin-top:8px">Batas waktu: <span data-cd="${esc(o.expires_at)}">${cd ? esc(cd) + " lagi" : "habis"}</span> (${esc(dateTimeWIB(o.expires_at))})</p>` : ""}${actions}`;

  root.innerHTML = `<div class="po">${backLink("#/pesanan", "Pesanan Saya")}
    ${baru ? `<p class="po-sub" style="margin:0 0 6px"><span class="po-mono">${esc(o.order_no)}</span> · ${statusBadge(o.status)}</p>` : ""}
    ${head}
    <section class="po-sec"><h2>Produk</h2>${items.map((i) => `<div class="po-it"><span>${esc(i.product_name)}<small>${esc(i.color_name)} · ${esc(i.size)} · ${i.qty}×</small></span><b>${esc(rupiah(i.line_total))}</b></div>`).join("")}
      <div class="po-it po-tot2"><span>Total produk</span><b>${esc(rupiah(subtotal))}</b></div>
      <div class="po-it"><span>Ongkir${cod ? " (COD)" : ""}${cod ? "<small>Dibayar langsung ke kurir, tidak termasuk total bayar.</small>" : ""}</span><b>${esc(rupiah(shipCost))}</b></div>
      <div class="po-it po-grand"><span>Total bayar${cod ? " (produk)" : ""}</span><b>${esc(rupiah(payNow))}</b></div>
      ${showPay && payV ? `<div class="po-pay"><p class="po-h">Bayar ke</p><b>${esc(payV.title)}</b>
        ${pay?.number ? `<div class="po-numrow"><span class="po-num">${esc(pay.number)}</span><button class="po-cp" type="button" data-copy="${esc(pay.number)}" data-msg="Nomor ${esc(pay.type === "dana" ? "DANA" : "rekening")} disalin." aria-label="Salin nomor ${esc(pay.type === "dana" ? "DANA" : "rekening")}">${COPY}</button></div>` : ""}
        ${payV.lines[1] ? `<div>${esc(payV.lines[1])}</div>` : (!pay?.number ? `<div>${esc(payV.lines[0])}</div>` : "")}
        <p class="po-sub" style="margin-top:8px">Transfer sesuai total bayar. Bukti pembayaran dikirim lewat WhatsApp setelah admin mengonfirmasi pesanan.</p></div>` : ""}</section>
    <section class="po-sec"><h2>Pengiriman</h2><dl class="po-kv">
      <dt>Penerima</dt><dd>${esc(o.recipient_name)} · ${esc(o.recipient_phone)}</dd>
      <dt>Alamat</dt><dd>${esc(o.shipping_address)}${o.shipping_city ? `, ${esc(o.shipping_city)}` : ""}${o.shipping_postal_code ? ` ${esc(o.shipping_postal_code)}` : ""}</dd>
      <dt>Kurir</dt><dd>${esc([COURIER[o.courier] ?? o.courier, o.courier_service].filter(Boolean).join(" · "))}</dd>
      ${o.tracking_no ? `<dt>Resi</dt><dd>${esc([o.tracking_courier, o.tracking_no].filter(Boolean).join(" · "))}<button class="po-link" type="button" data-copy="${esc(o.tracking_no)}" data-msg="Nomor resi disalin.">Salin</button></dd>` : ""}
      ${cancelled ? `<dt>Alasan</dt><dd>${esc(CANCEL_REASON[o.cancel_reason] ?? "")}${o.cancel_note ? ` — ${esc(o.cancel_note)}` : ""}</dd>` : ""}
    </dl></section>
    <section class="po-sec"><h2>Riwayat</h2><ol class="po-tl">${tl.slice().reverse().map((t) => `<li><div>${esc(t.label)}<small>${esc(dateTimeWIB(t.at))}</small></div></li>`).join("")}</ol></section>
    ${canCancel ? `<section class="po-sec"><button class="btn btn-secondary" type="button" id="poCancel" style="color:var(--error,#9E3D3D);border-color:var(--error,#9E3D3D)">Batalkan pesanan</button>
      <p class="po-sub">Pesanan bisa dibatalkan selama belum diproses admin.</p></section>` : ""}</div>`;

  // hitung mundur hidup
  const tick = () => root.querySelectorAll("[data-cd]").forEach((el) => {
    const c = countdown(el.dataset.cd);
    el.textContent = c ? (el.closest(".po-ok") ? c : `${c} lagi`) : (el.closest(".po-ok") ? "Waktu habis" : "habis");
  });
  const timer = pending ? setInterval(tick, 20000) : null;
  const ac = new AbortController();   // #view dipakai ulang antar halaman: pendengar wajib dilepas saat pindah
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    try { await copyText(b.dataset.copy); toast(b.dataset.msg || "Disalin.", "success"); } catch (err) { fail(err, "Gagal menyalin."); }
  }, { signal: ac.signal });
  root.querySelector("#poCancel")?.addEventListener("click", () => openCancel(o), { signal: ac.signal });
  return () => { ac.abort(); if (timer) clearInterval(timer); };
}

/* ================= BATALKAN PESANAN ================= */
const CANCEL_CHOICES = ["salah_pilih_produk", "salah_alamat", "berubah_pikiran"];
function openCancel(o) {
  const node = document.createElement("div");
  node.innerHTML = `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">Pilih alasan membatalkan <b>${esc(o.order_no)}</b>. Stok akan dikembalikan dan pesanan tidak bisa dibuka lagi.</p>
    <div class="po-opts" role="radiogroup" aria-label="Alasan pembatalan">${CANCEL_CHOICES.map((k) => `<label class="po-opt"><input type="radio" name="poReason" value="${k}"><span>${esc(CANCEL_REASON[k])}</span></label>`).join("")}</div>
    <span class="field-error" id="poRErr"></span>
    <div class="po-acts" style="margin-top:14px"><button class="btn btn-danger" type="button" id="poYes">Ya, batalkan pesanan</button><button class="btn btn-secondary" type="button" id="poNo">Kembali</button></div>`;
  const dlg = openDialog({ title: "Batalkan pesanan", node });
  node.querySelector("#poNo").addEventListener("click", dlg.close);
  node.querySelector("#poYes").addEventListener("click", (e) => {
    const reason = node.querySelector('input[name="poReason"]:checked')?.value;
    if (!reason) { node.querySelector("#poRErr").textContent = "Pilih salah satu alasan."; return; }
    return withLoading(e.currentTarget, async () => {
      const { error } = await supabase.rpc("cancel_my_order", { p_order: o.id, p_reason: reason });
      if (error) { fail(error, "Pesanan gagal dibatalkan. Coba lagi."); return; }
      dlg.close();
      toast("Pesanan dibatalkan.", "success");
      history.replaceState(null, "", `#/pesanan/${o.id}`);                 // buang ?baru=1 bila ada
      window.dispatchEvent(new HashChangeEvent("hashchange"));            // render ulang lewat shell (pembersihan ikut berjalan)
    }, "Membatalkan…");
  });
}

/* ================= INVOICE ================= */
async function renderInvoice({ root, id, rev, isStale }) {
  ensureInvoiceStyle();
  root.innerHTML = `<div class="po"><div class="skeleton" style="height:36px;width:40%"></div><div class="skeleton" style="height:320px;margin-top:14px"></div></div>`;
  let list, settings;
  try {
    const [inv, st] = await Promise.all([
      supabase.from("invoices").select("*").eq("order_id", id).order("revision", { ascending: false }),
      getSettings().catch(() => ({})),
    ]);
    if (inv.error) throw inv.error;
    list = inv.data ?? []; settings = st;
  } catch (e) {
    console.error(e); if (isStale()) return;
    root.innerHTML = `<div class="po">${backLink(`#/pesanan/${esc(id)}`, "Pesanan")}${errorBox("Invoice gagal dimuat.")}</div>`;
    root.querySelector("[data-retry]").addEventListener("click", () => location.reload()); return;
  }
  if (isStale()) return;
  const back = backLink(`#/pesanan/${esc(id)}`, "Kembali ke pesanan");
  if (!list.length) { root.innerHTML = `<div class="po">${back}${emptyState("Invoice belum ada", "Invoice untuk pesanan ini belum tersedia.", `#/pesanan/${id}`, "Ke pesanan")}</div>`; return; }
  const latest = list[0], cur = rev === "" ? latest : list.find((x) => String(x.revision) === String(rev));
  if (!cur) { root.innerHTML = `<div class="po">${back}${emptyState("Versi tidak ditemukan", "", `#/pesanan/${id}/invoice`, "Buka versi terbaru")}</div>`; return; }

  const v = buildInvoiceView(cur, { wa: settings.admin_whatsapp });
  const lbl = (n) => (n === 0 ? "Awal" : `Revisi #${n}`);
  const wa = waLink(settings, waOrderText(buildInvoiceView(latest, { wa: settings.admin_whatsapp })));
  root.innerHTML = `<div class="po"><div class="no-print">${back}
      <div class="po-row" style="margin:2px 0 14px"><h1 class="tk-h1" style="margin:0">Invoice</h1>
        <button class="btn btn-primary" type="button" id="ivPrint">Cetak / Simpan PDF</button></div>
      ${list.length > 1 ? `<nav class="iv-vers" aria-label="Versi invoice">${list.map((x) => `<a class="iv-ver" href="#/pesanan/${esc(id)}/invoice/${x.revision}" ${x.revision === cur.revision ? 'aria-current="page"' : ""}>${lbl(x.revision)}${x.revision === latest.revision ? " · Terbaru" : ""}</a>`).join("")}</nav>` : ""}
      ${cur.revision !== latest.revision ? `<div class="co-msg" style="background:#FDF3E3;border:1px solid #EBD6AE;border-radius:12px;padding:.7rem .9rem;font-size:13px;margin-bottom:14px">Ini versi lama. Invoice yang berlaku sekarang adalah ${lbl(latest.revision)}. <a href="#/pesanan/${esc(id)}/invoice/${latest.revision}">Buka versi terbaru</a></div>` : ""}
    </div>
    ${invoiceSheetHtml(v)}
    ${wa ? `<div class="no-print po-acts"><a class="btn btn-accent" href="${esc(wa)}" target="_blank" rel="noopener">Kirim ke WhatsApp Admin</a></div>` : ""}</div>`;
  root.querySelector("#ivPrint").addEventListener("click", () => {
    const t = document.title; document.title = `Invoice-${v.no}${v.revision > 0 ? `-rev${v.revision}` : ""}`;   // nama file PDF bawaan browser
    window.print(); setTimeout(() => { document.title = t; }, 500);
  });
}