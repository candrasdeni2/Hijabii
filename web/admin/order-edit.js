// Edit Invoice (Admin): ubah qty, harga satuan, diskon per baris, hapus item, serta kurir/layanan/ongkir.
// Disimpan lewat satu RPC atomik admin_edit_order: perubahan data + invoice revisi baru + status "Direvisi Admin" dalam satu transaksi.
// RPC hanya menerima item yang SUDAH ada di pesanan (ubah/hapus); menambah item baru dilakukan lewat pesanan manual.
import { supabase } from "../assets/js/supabase.js";
import { toast } from "../assets/js/ui.js";
import { rupiah } from "../assets/js/format.js";
import { COURIER } from "../assets/js/labels.js";
import { esc, confirmDialog, setBusy } from "./ad-ui.js";
import { EDITABLE, discountAmount } from "./order-utils.js";

const LIMITS = { qty: 999, price: 100_000_000, ship: 5_000_000, dval: 100_000_000 };
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const toInt = (v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);

/** Bandingkan data awal dengan hasil edit; kirim hanya yang berubah. orig/draft: { items:[{id,qty,price,dtype,dval,remove}], shipping, courier, service } */
export function buildEditPayload(orig, draft) {
  const out = {};
  const items = [];
  for (const d of draft.items) {
    const o = orig.items.find((x) => x.id === d.id);
    if (d.remove) { items.push({ id: d.id, remove: true }); continue; }
    const ch = { id: d.id };
    if (d.qty !== o.qty) ch.qty = d.qty;
    if (d.price !== o.price) ch.unit_price = d.price;
    const sameDisc = d.dtype === o.dtype && (d.dtype === "none" || d.dval === o.dval);
    if (!sameDisc) { ch.discount_type = d.dtype === "none" ? "nominal" : d.dtype; ch.discount_value = d.dtype === "none" ? 0 : d.dval; }
    if (Object.keys(ch).length > 1) items.push(ch);
  }
  if (items.length) out.p_items = items;
  if (draft.shipping !== orig.shipping) out.p_shipping_cost = draft.shipping;
  if (draft.courier !== orig.courier) out.p_courier = draft.courier;
  if (draft.service !== orig.service) out.p_courier_service = draft.service;
  return out;
}

export async function renderEdit({ pg, id, isStale = () => false }) {
  pg.innerHTML = `<div aria-hidden="true"><div class="ad-skel" style="width:40%;height:36px"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
  const [o, it] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", id).order("created_at"),
  ]);
  if (isStale()) return;
  const back = `<a class="od-back" href="#/pesanan/${esc(id)}">← Kembali ke pesanan</a>`;
  if (o.error || it.error) { console.error(o.error || it.error); pg.innerHTML = `<div class="ad-error" role="alert">Pesanan gagal dimuat. <a class="btn btn-secondary btn-sm" href="#/pesanan/${esc(id)}">Kembali</a></div>`; return; }
  const order = o.data, items = it.data ?? [];
  if (!order) { pg.innerHTML = `<a class="od-back" href="#/pesanan">← Semua pesanan</a><div class="ad-empty">Pesanan tidak ditemukan.</div>`; return; }
  if (!EDITABLE.includes(order.status)) { pg.innerHTML = `${back}<div class="ad-empty">Pesanan ini sudah diproses atau final, jadi invoicenya terkunci dan tidak bisa diedit.</div>`; return; }

  // stok tersedia per varian (untuk memberi tahu batas penambahan qty)
  const vIds = items.map((x) => x.variant_id).filter(Boolean);
  const stock = {};
  if (vIds.length) {
    const { data } = await supabase.from("product_variants").select("id, stock").in("id", vIds);
    (data ?? []).forEach((v) => { stock[v.id] = v.stock; });
  }
  if (isStale()) return;

  const orig = {
    items: items.map((x) => ({ id: x.id, qty: x.qty, price: x.unit_price, dtype: x.discount_value > 0 ? x.discount_type : "none", dval: x.discount_value, remove: false })),
    shipping: order.shipping_cost, courier: order.courier, service: order.courier_service ?? "",
  };
  const origTotal = items.reduce((s, x) => s + (x.line_total ?? 0), 0) + order.shipping_cost;
  const warn = order.status === "dikonfirmasi"
    ? "Invoice ini sudah dikonfirmasi. Menyimpan revisi mengembalikan status ke Direvisi Admin, dan customer perlu menyetujui rincian barunya lewat WhatsApp."
    : "Menyimpan revisi membuat invoice baru dan mengubah status menjadi Direvisi Admin.";

  pg.innerHTML = `
    ${back}
    <header class="ad-page-head"><div><h1 class="ad-h1">Edit Invoice</h1>
      <p class="ad-sub"><span class="od-mono">${esc(order.order_no)}</span> · ${esc(order.recipient_name)}</p></div></header>
    <form id="oeForm" novalidate>
      <p class="ad-note ad-note-warn" style="margin-bottom:16px">${esc(warn)}</p>
      <div class="od-grid">
        <div class="od-stack">
          ${items.map((x, i) => `
          <section class="ad-card oe-item" data-card="${i}">
            <div class="oe-head"><div><div class="ad-name">${esc(x.product_name)}</div>
              <div class="ad-meta">${esc(x.color_name)} / ${esc(x.size)}${x.variant_id && stock[x.variant_id] != null ? ` · stok tersedia ${stock[x.variant_id]}` : ""}</div></div>
              <button type="button" class="btn btn-danger-outline btn-sm" data-act="remove" data-i="${i}" aria-pressed="false">Hapus item</button></div>
            <div class="oe-fields">
              <div class="field"><label class="label" for="oeQty${i}">Jumlah</label>
                <input class="input" id="oeQty${i}" data-f="qty" data-i="${i}" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${x.qty}">
                <span class="field-error" data-err="qty-${i}"></span></div>
              <div class="field"><label class="label" for="oePrice${i}">Harga satuan (Rp)</label>
                <input class="input" id="oePrice${i}" data-f="price" data-i="${i}" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${x.unit_price}">
                <span class="field-error" data-err="price-${i}"></span></div>
              <div class="field"><label class="label" for="oeDtype${i}">Diskon</label>
                <select class="input" id="oeDtype${i}" data-f="dtype" data-i="${i}" style="font-size:16px">
                  <option value="none" ${orig.items[i].dtype === "none" ? "selected" : ""}>Tanpa diskon</option>
                  <option value="percent" ${orig.items[i].dtype === "percent" ? "selected" : ""}>Persen (%)</option>
                  <option value="nominal" ${orig.items[i].dtype === "nominal" ? "selected" : ""}>Nominal (Rp)</option></select></div>
              <div class="field"><label class="label" for="oeDval${i}">Nilai diskon</label>
                <input class="input" id="oeDval${i}" data-f="dval" data-i="${i}" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${orig.items[i].dtype === "none" ? "" : x.discount_value}">
                <span class="field-error" data-err="dval-${i}"></span></div>
            </div>
            <p class="oe-line" data-line="${i}" aria-live="polite"></p>
          </section>`).join("")}

          <section class="ad-card"><h2>Pengiriman</h2>
            <div class="oe-fields">
              <div class="field"><label class="label" for="oeCourier">Kurir</label>
                <select class="input" id="oeCourier" style="font-size:16px">${Object.entries(COURIER).map(([v, l]) => `<option value="${esc(v)}" ${v === order.courier ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
              <div class="field"><label class="label" for="oeService">Layanan</label>
                <input class="input" id="oeService" autocomplete="off" maxlength="60" style="font-size:16px" value="${esc(order.courier_service ?? "")}" placeholder="EZ, Pos Reguler…"></div>
              <div class="field"><label class="label" for="oeShip">Ongkir (Rp)</label>
                <input class="input" id="oeShip" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${order.shipping_cost}">
                <span class="field-error" data-err="ship"></span></div>
            </div>
            <p class="ad-note" style="margin-top:12px">Ongkir otomatis adalah estimasi dari API. Untuk tujuan jauh, cocokkan dengan tarif kurir bila perlu.</p>
          </section>
        </div>
        <aside class="od-side"><section class="ad-card"><h2>Ringkasan revisi</h2>
          <div class="od-totals" style="max-width:none;margin-top:0">
            <div><span>Subtotal produk</span><span data-sum="sub"></span></div>
            <div><span>Ongkir</span><span data-sum="ship"></span></div>
            <div class="od-grand"><span>Total baru</span><span data-sum="total"></span></div>
            <div><span>Total sebelumnya</span><span>${esc(rupiah(origTotal))}</span></div>
            <div><span>Selisih</span><span data-sum="delta"></span></div></div>
          <p class="ad-note ad-note-warn" id="oeMsg" role="alert" hidden style="margin-top:12px"></p>
          <div class="od-actions" style="margin-top:14px">
            <button type="submit" class="btn btn-primary" id="oeSave" disabled>Simpan Revisi</button>
            <a class="btn btn-secondary" href="#/pesanan/${esc(id)}">Batal</a></div></section></aside>
      </div>
    </form>`;

  const form = pg.querySelector("#oeForm"), q = (s) => pg.querySelector(s);
  const removed = new Set();

  /** Baca isi form -> data bertipe angka (NaN bila tidak valid) */
  function read() {
    return {
      items: items.map((x, i) => {
        const g = (f) => pg.querySelector(`[data-f="${f}"][data-i="${i}"]`).value;
        const dtype = g("dtype");
        return { id: x.id, qty: toInt(g("qty")), price: toInt(g("price")), dtype, dval: dtype === "none" ? 0 : toInt(g("dval")), remove: removed.has(i) };
      }),
      shipping: toInt(q("#oeShip").value), courier: q("#oeCourier").value, service: q("#oeService").value.trim(),
    };
  }
  function validate(d) {
    const e = {};
    d.items.forEach((x, i) => {
      if (x.remove) return;
      if (!(x.qty >= 1 && x.qty <= LIMITS.qty)) e[`qty-${i}`] = `Isi 1 sampai ${LIMITS.qty}.`;
      else {
        const vid = items[i].variant_id, extra = x.qty - orig.items[i].qty;
        if (vid && stock[vid] != null && extra > stock[vid]) e[`qty-${i}`] = `Stok tidak cukup. Tambahan maksimal ${stock[vid]}.`;
      }
      if (!(x.price >= 0 && x.price <= LIMITS.price)) e[`price-${i}`] = "Isi harga yang valid.";
      if (x.dtype === "percent" && !(x.dval >= 0 && x.dval <= 100)) e[`dval-${i}`] = "Persen 0 sampai 100.";
      else if (x.dtype === "nominal" && !(x.dval >= 0 && x.dval <= LIMITS.dval)) e[`dval-${i}`] = "Isi nominal yang valid.";
    });
    if (!(d.shipping >= 0 && d.shipping <= LIMITS.ship)) e.ship = `Isi 0 sampai ${rupiah(LIMITS.ship)}.`;
    if (d.items.every((x) => x.remove)) e._all = "Pesanan harus punya minimal satu item. Untuk membatalkan pesanan, gunakan aksi Batalkan.";
    return e;
  }

  function refresh({ showErrors = false } = {}) {
    const d = read();
    let sub = 0;
    d.items.forEach((x, i) => {
      const card = pg.querySelector(`[data-card="${i}"]`), line = pg.querySelector(`[data-line="${i}"]`);
      card.classList.toggle("is-removed", x.remove);
      card.querySelectorAll("input,select").forEach((el) => { el.disabled = x.remove; });
      const dv = pg.querySelector(`[data-f="dval"][data-i="${i}"]`); dv.disabled = x.remove || x.dtype === "none";
      const btn = card.querySelector("[data-act=remove]"); btn.textContent = x.remove ? "Batalkan hapus" : "Hapus item"; btn.setAttribute("aria-pressed", String(x.remove));
      if (x.remove) { line.textContent = "Item ini akan dihapus dari pesanan dan stoknya dikembalikan."; return; }
      const qty = Number.isFinite(x.qty) ? x.qty : 0, price = Number.isFinite(x.price) ? x.price : 0, dval = Number.isFinite(x.dval) ? x.dval : 0;
      const disc = discountAmount(qty, price, x.dtype === "none" ? "nominal" : x.dtype, dval);
      const total = qty * price - disc;
      sub += total;
      line.textContent = `Subtotal baris: ${rupiah(total)}${disc ? ` (diskon −${rupiah(disc)})` : ""}`;
    });
    const ship = Number.isFinite(d.shipping) ? d.shipping : 0, total = sub + ship, delta = total - origTotal;
    q("[data-sum=sub]").textContent = rupiah(sub); q("[data-sum=ship]").textContent = rupiah(ship); q("[data-sum=total]").textContent = rupiah(total);
    const dEl = q("[data-sum=delta]");
    dEl.textContent = delta === 0 ? "Tidak berubah" : `${delta > 0 ? "+" : "−"}${rupiah(Math.abs(delta))}`;
    dEl.className = delta > 0 ? "oe-delta-up" : delta < 0 ? "oe-delta-down" : "";

    const errs = validate(d);
    pg.querySelectorAll("[data-err]").forEach((el) => { el.textContent = showErrors ? (errs[el.dataset.err] ?? "") : ""; });
    const msg = q("#oeMsg"); msg.hidden = !(errs._all && true); msg.textContent = errs._all ?? "";
    const dirty = Object.keys(buildEditPayload(orig, { ...d, items: d.items.map((x) => ({ ...x, qty: x.qty, price: x.price })) })).length > 0;
    q("#oeSave").disabled = !dirty || Boolean(errs._all);
    return { d, errs };
  }

  form.addEventListener("input", () => refresh());
  form.addEventListener("change", () => refresh());
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act=remove]");
    if (!b) return;
    const i = Number(b.dataset.i);
    if (removed.has(i)) removed.delete(i); else removed.add(i);
    refresh();
  });

  async function save() {
    const { d, errs } = refresh({ showErrors: true });
    const keys = Object.keys(errs).filter((k) => k !== "_all");
    if (keys.length || errs._all) { pg.querySelector(`[data-err="${keys[0]}"]`)?.closest(".field")?.querySelector("input")?.focus(); return; }
    const payload = buildEditPayload(orig, d);
    if (!Object.keys(payload).length) return;
    if (order.status === "dikonfirmasi") {
      const ok = await confirmDialog({ title: "Simpan revisi invoice?", confirmLabel: "Ya, simpan revisi", message: "Status pesanan kembali ke Direvisi Admin. Beri tahu customer lewat WhatsApp dan minta persetujuan atas rincian yang baru." });
      if (!ok) return;
    }
    const btn = q("#oeSave");
    setBusy(btn, true, "Menyimpan…");
    const { error } = await supabase.rpc("admin_edit_order", { p_order: id, ...payload });
    if (error) {
      setBusy(btn, false);
      const msg = q("#oeMsg"); msg.hidden = false; msg.textContent = error.message || "Revisi gagal disimpan. Coba lagi.";
      msg.scrollIntoView?.({ block: "nearest" });
      return;
    }
    toast("Revisi disimpan. Status: Direvisi Admin.", "success");
    window.dispatchEvent(new CustomEvent("ad:orders-changed"));
    location.hash = `#/pesanan/${id}`;
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); save(); });
  refresh();
}