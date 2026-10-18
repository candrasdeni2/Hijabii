// Detail pesanan (Admin): info penerima, item, invoice, riwayat status, dan panel Aksi sesuai status (design.md 9.2).
// Semua perubahan status lewat RPC database (admin_confirm_order, admin_verify_payment, admin_ship_order, admin_complete_order,
// cancel_order, admin_extend_timeout); Edit Invoice ada di order-edit.js. Aturan sebenarnya ditegakkan database; tombol hanya tampil bila valid.
import { supabase } from "../assets/js/supabase.js";
import { toast, statusBadge, paymentChip } from "../assets/js/ui.js";
import { rupiah, countdown } from "../assets/js/format.js";
import { COURIER, SHIPPING_PAY_METHOD, PRODUCT_PAY_METHOD, ORDER_STATUS, CANCEL_REASON } from "../assets/js/labels.js";
import { esc, fmtDate, openModal, confirmDialog, setBusy, copyText } from "./ad-ui.js";
import { EDITABLE, orderTotals, lineTotal, actionsFor, waLink, confirmMessage } from "./order-utils.js";

const BTN = {
  edit:     { label: "Edit Invoice", cls: "btn-secondary" },
  chat:     { label: "Chat WhatsApp customer", cls: "btn-secondary" },
  confirm:  { label: "Tandai Dikonfirmasi", cls: "btn-primary" },
  verify:   { label: "Verifikasi Pembayaran", cls: "btn-primary" },
  ship:     { label: "Proses & Kirim", cls: "btn-primary" },
  complete: { label: "Tandai Selesai", cls: "btn-primary" },
  extend:   { label: "Perpanjang Time-out", cls: "btn-secondary" },
  cancel:   { label: "Batalkan Pesanan", cls: "btn-danger-outline" },
};
const TIMEOUT_PRESETS = [6, 12, 24, 48];

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Aksi gagal. Coba lagi.");
  return data;
}

export async function renderDetail({ pg, id, isStale = () => false }) {
  const S = { order: null, items: [], invoices: [], history: [], req: 0 };

  async function load() {
    const my = ++S.req;
    pg.innerHTML = `<div aria-hidden="true"><div class="ad-skel" style="width:40%;height:36px"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    const [o, it, inv, h] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", id).order("created_at"),
      supabase.from("invoices").select("id, invoice_no, revision, subtotal, shipping_cost, total, created_at").eq("order_id", id).order("revision", { ascending: false }),
      supabase.from("order_status_history").select("id, from_status, to_status, note, created_at").eq("order_id", id).order("created_at").order("id"),
    ]);
    if (my !== S.req || isStale()) return;
    const err = o.error || it.error || inv.error || h.error;
    if (err) { console.error(err); pg.innerHTML = `<div class="ad-error" role="alert">Pesanan gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button> <a class="btn btn-secondary btn-sm" href="#/pesanan">Kembali</a></div>`; return; }
    if (!o.data) { pg.innerHTML = `<a class="od-back" href="#/pesanan">← Semua pesanan</a><div class="ad-empty">Pesanan tidak ditemukan.</div>`; return; }
    S.order = o.data; S.items = it.data ?? []; S.invoices = inv.data ?? []; S.history = h.data ?? [];
    render();
  }

  const kv = (rows) => `<dl class="od-kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const discountText = (it) => (it.discount_amount > 0 ? `−${esc(rupiah(it.discount_amount))}${it.discount_type === "percent" ? ` (${it.discount_value}%)` : ""}` : "–");

  const initials = (n) => String(n ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  function render() {
    const o = S.order, t = orderTotals(S.items, o.shipping_cost);
    const editable = EDITABLE.includes(o.status);
    const left = editable && o.payment_status === "belum_dibayar" ? countdown(o.expires_at) : null;
    const acts = actionsFor(o.status);
    const wa = waLink(o.recipient_phone, confirmMessage(o, t));

    const actionHtml = acts.length
      ? `<div class="od-actions">${acts.map((a) => (a === "edit"
          ? `<a class="btn ${BTN.edit.cls}" href="#/pesanan/${esc(id)}/edit">${BTN.edit.label}</a>`
          : a === "chat"
          ? (wa ? `<a class="btn ${BTN.chat.cls}" href="${esc(wa)}" target="_blank" rel="noopener">${BTN.chat.label}</a>` : "")
          : `<button type="button" class="btn ${BTN[a].cls}" data-act="${a}">${BTN[a].label}</button>`)).join("")}</div>`
      : `<p class="ad-muted" style="margin:0">Pesanan ini sudah final. Tidak ada aksi yang tersedia.</p>`;

    const invoiceHtml = S.invoices.length
      ? S.invoices.map((v) => `<a class="od-inv-row od-inv-link" href="#/pesanan/${esc(id)}/invoice/${v.revision}" aria-label="Buka invoice ${esc(v.invoice_no)} ${v.revision > 0 ? `revisi ${v.revision}` : "awal"}">
          <span class="od-mono">${esc(v.invoice_no)}</span>
          ${v.revision > 0 ? `<span class="ad-badge ad-badge-off">Revisi #${v.revision}</span>` : `<span class="ad-badge ad-badge-on">Awal</span>`}
          <span class="ad-meta" style="margin:0">${esc(fmtDate(v.created_at))} · total ${esc(rupiah(v.total))}</span>
          <span class="od-inv-go" aria-hidden="true">Lihat / unduh →</span></a>`).join("")
      : `<span class="ad-muted">Belum ada invoice.</span>`;

    pg.innerHTML = `
      <a class="od-back" href="#/pesanan">← Semua pesanan</a>
      <div class="od-grid">
        <div class="od-stack">
          <section class="ad-card" aria-label="Ringkasan pesanan">
            <div class="od-head">
              <div class="od-who">
                <div class="od-av" aria-hidden="true">${esc(initials(o.recipient_name))}</div>
                <div style="min-width:0">
                  <h1 class="od-name">${esc(o.recipient_name)}</h1>
                  <div class="od-meta"><span class="od-mono">${esc(o.order_no)}</span> · dibuat ${esc(fmtDate(o.created_at))}${o.source === "admin" ? " · pesanan manual" : ""}</div>
                </div>
              </div>
              <div class="od-badges">${statusBadge(o.status)} ${paymentChip(o.payment_status)}</div>
            </div>
            <hr class="od-hr">
            <div class="od-two">
              <section><h2 class="od-sub">Penerima</h2>${kv([
                ["Telepon", esc(o.recipient_phone)], ["Alamat", esc(o.shipping_address)],
                (o.shipping_city || o.shipping_postal_code) && ["Kota / kode pos", esc([o.shipping_city, o.shipping_postal_code].filter(Boolean).join(" · "))],
                o.note && ["Catatan", `<span style="white-space:pre-wrap">${esc(o.note)}</span>`]])}</section>
              <section><h2 class="od-sub">Pengiriman dan pembayaran</h2>${kv([
                ["Kurir pilihan", esc([COURIER[o.courier] ?? o.courier, o.courier_service].filter(Boolean).join(" · "))],
                ["Bayar ongkir", esc(SHIPPING_PAY_METHOD[o.shipping_pay_method] ?? o.shipping_pay_method)],
                ["Bayar produk", esc(PRODUCT_PAY_METHOD[o.product_pay_method] ?? o.product_pay_method)],
                o.paid_at && ["Lunas pada", esc(fmtDate(o.paid_at))],
                editable && ["Batas bayar", `${esc(fmtDate(o.expires_at))}${o.payment_status === "belum_dibayar" ? ` (${left ? `sisa ${esc(left)}` : "waktu habis"})` : ""}`],
                o.tracking_no && ["Resi", `${esc(o.tracking_courier ?? "")} · <span class="od-mono">${esc(o.tracking_no)}</span> <button type="button" class="od-copy" data-act="copy" data-text="${esc(o.tracking_no)}" aria-label="Salin nomor resi" title="Salin nomor resi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="translate(.5 0)"><path d="M9 16H3V2h7l3 3v3"/><path d="M10 2v3h3"/><path d="M9 8h8l3 3v11H9z"/><path d="M17 8v3h3"/><path d="M12 15h5M12 19h5"/></g></svg></button>`],
                o.cancelled_at && ["Dibatalkan", `${esc(CANCEL_REASON[o.cancel_reason] ?? o.cancel_reason ?? "")}${o.cancel_note ? ` — ${esc(o.cancel_note)}` : ""}`]])}</section>
            </div>
          </section>

          <section class="ad-card"><h2>Item pesanan</h2>
            <div class="od-items" role="table" aria-label="Item pesanan">
              <div class="od-it od-ith" role="row"><span role="columnheader">Produk</span><span role="columnheader">Qty</span><span role="columnheader">Harga</span><span role="columnheader">Diskon</span><span role="columnheader">Subtotal</span></div>
              ${S.items.map((it) => `<div class="od-it" role="row">
                <div class="od-it-name" role="cell"><strong>${esc(it.product_name)}</strong><small>${esc(it.color_name)} / ${esc(it.size)}</small></div>
                <div role="cell"><span class="od-lbl">Qty</span><span>${it.qty}</span></div>
                <div role="cell"><span class="od-lbl">Harga</span><span>${esc(rupiah(it.unit_price))}</span></div>
                <div role="cell"><span class="od-lbl">Diskon</span><span>${discountText(it)}</span></div>
                <div role="cell"><span class="od-lbl">Subtotal</span><span>${esc(rupiah(lineTotal(it)))}</span></div></div>`).join("")}
            </div>
            <div class="od-totals"><div><span>Subtotal produk</span><b>${esc(rupiah(t.subtotal))}</b></div>
              <div><span>Ongkir</span><b>${esc(rupiah(t.shipping))}</b></div>
              <div class="od-grand"><span>Total</span><b>${esc(rupiah(t.total))}</b></div></div>
            <hr class="od-hr">
            <div class="od-inv"><h2 class="od-sub">Invoice</h2>${invoiceHtml}</div></section>

          <details class="ad-card od-hist"><summary>Riwayat status</summary>
            <ol class="od-tl">${S.history.map((h) => `<li>
            <strong>${h.from_status ? `${esc(ORDER_STATUS[h.from_status]?.label ?? h.from_status)} → ` : "Pesanan dibuat: "}${esc(ORDER_STATUS[h.to_status]?.label ?? h.to_status)}</strong>
            <small>${esc(fmtDate(h.created_at))}${h.note ? ` · ${esc(h.note)}` : ""}</small></li>`).join("") || "<li>Belum ada riwayat.</li>"}</ol></details>
        </div>
        <aside class="od-side"><section class="ad-card" aria-label="Aksi pesanan"><h2>Aksi</h2>${actionHtml}</section></aside>
      </div>`;
  }

  async function done(message) {
    toast(message, "success");
    window.dispatchEvent(new CustomEvent("ad:orders-changed"));
    await load();
  }

  const dialogs = {
    async confirm() {
      if (await confirmDialog({ title: "Tandai dikonfirmasi?", confirmLabel: "Ya, dikonfirmasi",
        message: "Pastikan rincian invoice sudah disepakati dengan customer lewat WhatsApp. Setelah ini pesanan menunggu pembayaran produk.",
        onConfirm: () => rpc("admin_confirm_order", { p_order: id }) })) await done("Pesanan dikonfirmasi.");
    },
    async complete() {
      if (await confirmDialog({ title: "Tandai selesai?", confirmLabel: "Ya, selesai",
        message: "Gunakan setelah paket diterima customer. Pesanan akan masuk laporan sebagai Selesai dan tidak bisa diubah lagi.",
        onConfirm: () => rpc("admin_complete_order", { p_order: id }) })) await done("Pesanan selesai.");
    },
    verify() {
      const m = openModal({ title: "Verifikasi pembayaran", size: "sm", html: `
        <form id="vfForm" novalidate>
          <p class="ad-modal-text">Pesanan akan ditandai <strong>Lunas</strong> dan langsung <strong>Diproses</strong>. Setelah itu item, ongkir, dan metode bayar terkunci.</p>
          <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;min-height:44px">
            <input type="checkbox" id="vfOk" style="width:20px;height:20px;margin-top:2px;accent-color:var(--marsala)"><span>Saya sudah memeriksa bukti bayar dari WhatsApp.</span></label>
          <div class="ad-modal-actions"><button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="vfSubmit" disabled>Tandai Lunas</button></div></form>` });
      const q = (s) => m.el.querySelector(s);
      q("#vfOk").addEventListener("change", (e) => { q("#vfSubmit").disabled = !e.target.checked; });
      q("#vfForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!q("#vfOk").checked) return;
        setBusy(q("#vfSubmit"), true);
        try { await rpc("admin_verify_payment", { p_order: id }); m.close(); await done("Pembayaran diverifikasi. Pesanan diproses."); }
        catch (ex) { toast(ex.message, "error"); setBusy(q("#vfSubmit"), false); }
      });
    },
    ship() {
      const o = S.order;
      const m = openModal({ title: "Proses & kirim", size: "sm", html: `
        <form id="shForm" novalidate>
          <div class="field"><label class="label" for="shCourier">Kurir <span class="req">*</span></label>
            <select class="input" id="shCourier" style="font-size:16px">${Object.entries(COURIER).map(([v, l]) => `<option value="${esc(v)}" ${v === o.courier ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
          <div class="field"><label class="label" for="shResi">Nomor resi <span class="req">*</span></label>
            <input class="input" id="shResi" autocomplete="off" spellcheck="false" maxlength="50" style="font-size:16px"><span class="field-error" id="shResiErr"></span></div>
          <div class="ad-modal-actions"><button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="shSubmit">Tandai Dikirim</button></div></form>` });
      const q = (s) => m.el.querySelector(s);
      q("#shForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        q("#shResiErr").textContent = "";
        const resi = q("#shResi").value.trim().replace(/\s+/g, "");
        if (!resi) { q("#shResiErr").textContent = "Nomor resi wajib diisi."; q("#shResi").focus(); return; }
        const sel = q("#shCourier");
        setBusy(q("#shSubmit"), true);
        try { await rpc("admin_ship_order", { p_order: id, p_courier: COURIER[sel.value] ?? sel.value, p_tracking_no: resi }); m.close(); await done("Pesanan ditandai dikirim."); }
        catch (ex) { toast(ex.message, "error"); setBusy(q("#shSubmit"), false); }
      });
    },
    cancel() {
      const m = openModal({ title: "Batalkan pesanan", size: "sm", html: `
        <form id="cnForm" novalidate>
          <p class="ad-modal-text">Stok produk akan dikembalikan. Pesanan yang dibatalkan tidak bisa dibuka lagi.</p>
          <div class="field"><label class="label" for="cnNote">Alasan pembatalan <span class="req">*</span></label>
            <textarea class="input" id="cnNote" rows="3" maxlength="300" style="font-size:16px;resize:vertical"></textarea><span class="field-error" id="cnNoteErr"></span></div>
          <div class="ad-modal-actions"><button type="button" class="btn btn-secondary" data-close>Kembali</button>
            <button type="submit" class="btn btn-danger" id="cnSubmit">Batalkan Pesanan</button></div></form>` });
      const q = (s) => m.el.querySelector(s);
      q("#cnForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        q("#cnNoteErr").textContent = "";
        const note = q("#cnNote").value.trim();
        if (note.length < 3) { q("#cnNoteErr").textContent = "Isi alasan pembatalan (minimal 3 karakter)."; q("#cnNote").focus(); return; }
        setBusy(q("#cnSubmit"), true);
        try { await rpc("cancel_order", { p_order: id, p_reason: "dibatalkan_admin", p_note: note }); m.close(); await done("Pesanan dibatalkan. Stok dikembalikan."); }
        catch (ex) { toast(ex.message, "error"); setBusy(q("#cnSubmit"), false); }
      });
    },
    extend() {
      const o = S.order;
      const m = openModal({ title: "Perpanjang time-out", size: "sm", html: `
        <form id="exForm" novalidate>
          <p class="ad-modal-text">Batas bayar sekarang: <strong>${esc(fmtDate(o.expires_at))}</strong>. Stok tetap terkunci sampai batas baru.</p>
          <div class="field"><label class="label" for="exHours">Tambah durasi (jam) <span class="req">*</span></label>
            <input class="input" id="exHours" inputmode="numeric" autocomplete="off" style="font-size:16px" value="24"><span class="field-error" id="exErr"></span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px" role="group" aria-label="Pilihan cepat">${TIMEOUT_PRESETS.map((h) => `<button type="button" class="btn btn-secondary btn-sm" data-h="${h}">${h} jam</button>`).join("")}</div>
          <p class="ad-note" id="exPreview" aria-live="polite"></p>
          <div class="ad-modal-actions"><button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="exSubmit">Perpanjang</button></div></form>` });
      const q = (s) => m.el.querySelector(s);
      const hours = () => { const v = q("#exHours").value.trim(); return /^\d+$/.test(v) && +v >= 1 && +v <= 720 ? +v : null; };
      const preview = () => {
        const h = hours();
        q("#exPreview").textContent = h ? `Batas baru: ${fmtDate(new Date(Math.max(new Date(o.expires_at).getTime(), Date.now()) + h * 3600000))}` : "";
      };
      q("#exHours").addEventListener("input", preview);
      m.el.querySelectorAll("[data-h]").forEach((b) => b.addEventListener("click", () => { q("#exHours").value = b.dataset.h; preview(); }));
      preview();
      q("#exForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        q("#exErr").textContent = "";
        const h = hours();
        if (!h) { q("#exErr").textContent = "Isi 1 sampai 720 jam."; q("#exHours").focus(); return; }
        setBusy(q("#exSubmit"), true);
        try { await rpc("admin_extend_timeout", { p_order: id, p_hours: h }); m.close(); await done("Time-out diperpanjang."); }
        catch (ex) { toast(ex.message, "error"); setBusy(q("#exSubmit"), false); }
      });
    },
  };

  pg.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === "retry") load();
    else if (act === "copy") toast((await copyText(b.dataset.text)) ? "Nomor resi disalin." : "Gagal menyalin.", "success");
    else dialogs[act]?.();
  });
  return load();
}