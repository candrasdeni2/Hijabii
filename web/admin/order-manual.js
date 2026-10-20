// Pesanan Manual (Admin): pesanan lewat chat / pre-order. Tanpa akun customer. Disimpan lewat RPC admin_create_order.
// Rute: #/pesanan/baru. Ongkir dihitung otomatis (Edge Function shipping-cost) setelah area tujuan + item dipilih; angkanya tetap bisa diubah manual. Item hanya varian yang SUDAH ada dan stoknya cukup (aturan database);
// produk baru dibuat di menu Produk (tab baru), lalu varian dimuat ulang otomatis saat tab ini aktif kembali.
import { supabase } from "../assets/js/supabase.js";
import { toast } from "../assets/js/ui.js";
import { rupiah } from "../assets/js/format.js";
import { COURIER } from "../assets/js/labels.js";
import { mountAreaPicker, pretty } from "../assets/js/area-picker.js";
import { getShippingRates } from "../assets/js/shipping-cost.js";
import { esc, modeCards, setBusy, debounce } from "./ad-ui.js";
import { discountAmount, sanitizeSearch } from "./order-utils.js";

const DRAFT_KEY = "ad.manualOrder.draft";
const RATE_COURIERS = ["pos", "jnt", "jne"];
const LIM = { qty: 999, price: 100_000_000, ship: 5_000_000 };
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "ALL SIZE", "ALLSIZE", "ALL"];
const toInt = (v) => (/^\d+$/.test(String(v).trim()) ? Number(v) : NaN);
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(String(s).toUpperCase()); return i < 0 ? 99 : i; };

/** "CIJORO LEBAK, RANGKASBITUNG, LEBAK, BANTEN, 42317" -> { city: "Lebak", postal: "42317" } */
export function parseAreaLabel(label) {
  const parts = String(label ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const postal = /^\d{5}$/.test(parts.at(-1) ?? "") ? parts.pop() : "";
  return { city: parts[2] ? pretty(parts[2]) : "", postal };
}

/** Susun payload RPC. Harga dikirim hanya bila diubah dari harga katalog; diskon hanya bila ada. */
export function buildManualPayload(f, items) {
  return {
    p_recipient_name: f.name, p_recipient_phone: f.phone, p_shipping_address: f.address,
    p_courier: f.courier, p_shipping_cost: f.ship, p_shipping_pay_method: f.spm, p_product_pay_method: f.ppm,
    p_items: items.map((i) => ({
      variant_id: i.vid, qty: i.qty,
      ...(i.price !== i.catalog ? { unit_price: i.price } : {}),
      ...(i.dtype !== "none" ? { discount_type: i.dtype, discount_value: i.dval } : {}),
    })),
    p_shipping_city: f.city || null, p_shipping_postal_code: f.postal || null, p_destination_area_id: f.areaId || null,
    p_courier_service: f.service || null, p_note: f.note || null,
  };
}

export async function renderManual({ pg, isStale = () => false }) {
  pg.innerHTML = `<div aria-hidden="true"><div class="ad-skel" style="width:40%;height:36px"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
  const { data: set } = await supabase.from("settings").select("*").eq("id", true).maybeSingle();
  if (isStale()) return;
  const S = set ?? {};
  const defCourier = Object.keys(COURIER).includes(S.default_courier) ? S.default_courier : "jnt";
  const danaHint = S.dana_number ? `DANA ${S.dana_number}${S.dana_account_name ? ` a.n. ${S.dana_account_name}` : ""}` : "Belum diatur di Pengaturan";
  const bankHint = S.bank_account_number ? `${S.bank_name ?? "Bank"} ${S.bank_account_number}${S.bank_account_holder ? ` a.n. ${S.bank_account_holder}` : ""}` : "Belum diatur di Pengaturan";

  const newRates = () => ({ status: "idle", msg: "", services: [], sig: "", selected: "", touched: false, req: 0, weight: 0, cached: false, stale: false });
  const st = { items: [], area: null, req: 0, lastQuery: "", rates: newRates() };

  pg.innerHTML = `
    <a class="od-back" href="#/pesanan">← Semua pesanan</a>
    <header class="ad-page-head"><div><h1 class="ad-h1">Pesanan Manual</h1>
      <p class="ad-sub">Untuk pesanan lewat chat atau pre-order. Pesanan manual tidak punya akun customer, jadi tidak ada notifikasi ke customer dan tidak bisa diulas.</p></div></header>
    <form id="omForm" novalidate>
      <p class="ad-note" id="omDraftNote" hidden style="margin-bottom:16px">Draf sebelumnya dipulihkan. Periksa lagi isinya sebelum dibuat.</p>
      <div class="od-grid">
        <div class="od-stack">
          <section class="ad-card"><h2>Customer</h2>
            <div class="oe-fields">
              <div class="field"><label class="label" for="omName">Nama penerima <span class="req">*</span></label>
                <input class="input" id="omName" autocomplete="off" maxlength="100" style="font-size:16px"><span class="field-error" data-err="name"></span></div>
              <div class="field"><label class="label" for="omPhone">WhatsApp / telepon <span class="req">*</span></label>
                <input class="input" id="omPhone" inputmode="tel" autocomplete="off" maxlength="20" style="font-size:16px" placeholder="081234567890"><span class="field-error" data-err="phone"></span></div>
            </div>
            <div class="field" style="margin-top:12px"><label class="label" for="omAddr">Alamat lengkap <span class="req">*</span></label>
              <textarea class="input" id="omAddr" rows="3" maxlength="300" style="font-size:16px;resize:vertical"></textarea><span class="field-error" data-err="address"></span></div>
            <div class="field" style="margin-top:12px"><span class="label" id="omAreaLabel">Area tujuan (untuk ongkir)</span>
              <div id="omArea" role="group" aria-labelledby="omAreaLabel"></div></div>
            <div class="oe-fields" style="margin-top:12px">
              <div class="field"><label class="label" for="omCity">Kota / kecamatan</label><input class="input" id="omCity" autocomplete="off" maxlength="100" style="font-size:16px"></div>
              <div class="field"><label class="label" for="omPostal">Kode pos</label><input class="input" id="omPostal" inputmode="numeric" autocomplete="off" maxlength="5" style="font-size:16px"><span class="field-error" data-err="postal"></span></div>
            </div>
            <div class="field" style="margin-top:12px"><label class="label" for="omNote">Catatan</label>
              <textarea class="input" id="omNote" rows="2" maxlength="300" style="font-size:16px;resize:vertical"></textarea></div>
          </section>

          <section class="ad-card"><h2>Item pesanan</h2>
            <div class="field"><label class="label" for="omSearch">Cari produk</label>
              <input class="input" id="omSearch" type="search" autocomplete="off" maxlength="40" style="font-size:16px" placeholder="Ketik nama produk (minimal 2 huruf)"></div>
            <div id="omResults" class="om-results" aria-live="polite"></div>
            <div class="om-tools">
              <a class="btn btn-secondary btn-sm" href="#/produk" target="_blank" rel="noopener">+ Produk baru</a>
              <button type="button" class="btn btn-secondary btn-sm" data-act="reload">Muat ulang varian</button></div>
            <p class="ad-note">Produk baru dibuat di menu Produk (tab baru). Isi stok minimal sebanyak yang dipesan, karena varian dengan stok kurang tidak bisa dipilih. Setelah kembali ke tab ini, varian dimuat ulang otomatis.</p>
            <div id="omItems" style="margin-top:12px"></div>
            <span class="field-error" data-err="items"></span>
          </section>

          <section class="ad-card"><h2>Pengiriman &amp; pembayaran</h2>
            <div class="oe-fields">
              <div class="field"><label class="label" for="omCourier">Kurir</label>
                <select class="input" id="omCourier" style="font-size:16px">${Object.entries(COURIER).map(([v, l]) => `<option value="${esc(v)}" ${v === defCourier ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
              <div class="field"><label class="label" for="omService">Layanan</label>
                <input class="input" id="omService" autocomplete="off" maxlength="60" style="font-size:16px" placeholder="EZ, Pos Reguler…"></div>
              <div class="field"><label class="label" for="omShip">Ongkir (Rp)</label>
                <input class="input" id="omShip" inputmode="numeric" autocomplete="off" style="font-size:16px" value="0"><span class="field-error" data-err="ship"></span></div>
            </div>
            <div id="omRates" style="margin-top:12px" aria-live="polite"></div>
            <p class="ad-note" style="margin-top:12px">Ongkir terhitung otomatis dari tarif kurir setelah area tujuan dan item dipilih. Angkanya tetap bisa kamu ubah manual.</p>
            <div class="field" style="margin-top:12px"><span class="label" id="omSpmL">Bayar ongkir</span>
              ${modeCards("omSpm", [{ v: "tf", t: "Transfer", d: "Ongkir dibayar lewat transfer bersama produk.", checked: true }, { v: "cod", t: "COD", d: "Ongkir dibayar ke kurir saat paket tiba." }])}</div>
            <div class="field" style="margin-top:12px"><span class="label" id="omPpmL">Bayar produk</span>
              ${modeCards("omPpm", [{ v: "dana", t: "DANA", d: danaHint, checked: true }, { v: "bank", t: "Rekening bank", d: bankHint }])}</div>
          </section>
        </div>

        <aside class="od-side"><section class="ad-card"><h2>Ringkasan</h2>
          <div class="od-totals od-totals--side">
            <div><span>Subtotal produk</span><b data-sum="sub"></b></div>
            <div><span>Ongkir</span><b data-sum="ship"></b></div>
            <div class="od-grand"><span>Total</span><b data-sum="total"></b></div></div>
          <p class="ad-note ad-note-warn" id="omMsg" role="alert" hidden style="margin-top:12px"></p>
          <div class="od-actions" style="margin-top:14px">
            <button type="submit" class="btn btn-primary" id="omSave">Buat Pesanan</button>
            <button type="button" class="btn btn-secondary" data-act="clear">Kosongkan form</button></div></section></aside>
      </div>
    </form>`;

  const $ = (s) => pg.querySelector(s);
  const form = $("#omForm");
  const radio = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value ?? "";

  // ---------- ongkir otomatis (Edge Function shipping-cost; berat dihitung server dari varian + qty) ----------
  const rateBox = $("#omRates");
  function applyService(svc) {
    $("#omService").value = svc.service; $("#omShip").value = String(Math.round(svc.cost));
    st.rates.selected = svc.service; st.rates.touched = false;
  }
  function syncRateRadios() {
    const ship = toInt($("#omShip").value), svc = $("#omService").value.trim();
    rateBox.querySelectorAll('input[name="omRate"]').forEach((r) => {
      const s = st.rates.services.find((x) => x.service === r.value);
      r.checked = Boolean(s) && s.service === svc && Math.round(s.cost) === ship;
    });
  }
  function renderRates() {
    const r = st.rates;
    if (r.status === "loading") { rateBox.innerHTML = `<p class="ad-note" aria-busy="true">Menghitung ongkir…</p>`; return; }
    if (r.status === "error") { rateBox.innerHTML = `<p class="ad-note ad-note-warn">${esc(r.msg)}</p><button type="button" class="ad-linkbtn" data-act="rates-retry">Coba lagi</button>`; return; }
    if (r.status === "idle") { rateBox.innerHTML = r.msg ? `<p class="ad-note">${esc(r.msg)}</p>` : ""; return; }
    if (!r.services.length) { rateBox.innerHTML = `<p class="ad-note ad-note-warn">Kurir ini tidak punya layanan untuk rute dan berat ini. Pilih kurir lain atau isi ongkir manual.</p>`; return; }
    const ship = toInt($("#omShip").value), svc = $("#omService").value.trim();
    rateBox.innerHTML = `${modeCards("omRate", r.services.map((s, i) => ({
      v: s.service, t: `${s.service} · ${rupiah(s.cost)}`, tag: i === 0 ? "Termurah" : "",
      d: [s.description, s.etd ? `estimasi ${s.etd}` : ""].filter(Boolean).join(" · ") || "Tarif resmi kurir",
      checked: s.service === svc && Math.round(s.cost) === ship,
    })))}
      <p class="ad-meta" style="margin-top:8px">Berat kirim ${r.weight} g${r.stale ? " · harga lama (layanan ongkir sedang tidak merespons)" : r.cached ? " · dari cache (maks 24 jam)" : ""}
        · <button type="button" class="ad-linkbtn" data-act="rates-fresh">Cek ulang</button></p>`;
  }
  async function loadRates({ fresh = false } = {}) {
    const r = st.rates, f = readForm(), items = parsedItems();
    const itemsOk = items.length > 0 && items.every((x) => Number.isInteger(x.qty) && x.qty >= 1 && x.qty <= LIM.qty);
    if (!st.area?.id || !RATE_COURIERS.includes(f.courier) || !itemsOk) {
      r.req++; r.status = "idle"; r.services = []; r.sig = "";
      r.msg = !st.area?.id ? "Pilih area tujuan dan tambahkan item untuk menghitung ongkir otomatis, atau isi ongkir manual."
        : !items.length ? "Tambahkan item untuk menghitung ongkir otomatis." : "Lengkapi jumlah item untuk menghitung ongkir otomatis.";
      renderRates(); return;
    }
    const sig = JSON.stringify([st.area.id, f.courier, items.map((x) => [x.vid, x.qty]).sort()]);
    if (!fresh && sig === r.sig && r.status === "ok") return;
    const my = ++r.req; r.status = "loading"; renderRates();
    try {
      const res = await getShippingRates({ destination: st.area.id, courier: f.courier, items: items.map((x) => ({ variant_id: x.vid, qty: x.qty })), fresh });
      if (my !== r.req || !pg.isConnected) return;
      r.sig = sig; r.status = "ok"; r.services = res.services ?? []; r.weight = res.weight_gram; r.cached = Boolean(res.cached); r.stale = Boolean(res.stale);
      if (r.services.length && !r.touched) applyService(r.services.find((x) => x.service === r.selected) ?? r.services[0]);   // default: termurah
    } catch (e) {
      if (my !== r.req) return;
      console.error(e);
      r.status = "error"; r.sig = ""; r.services = []; r.msg = e?.message || "Cek ongkir gagal. Isi ongkir manual.";
    }
    renderRates(); refresh(); save();
  }
  const queueRates = debounce(() => loadRates(), 600);

  // ---------- area (opsional) ----------
  const picker = mountAreaPicker({
    root: $("#omArea"), value: null, inputId: "omAreaInput",
    onChange: (s) => {
      st.area = s;
      const { city, postal } = parseAreaLabel(s?.label);
      if (city) $("#omCity").value = city;
      if (postal) $("#omPostal").value = postal;
      save(); refresh(); queueRates();
    },
  });

  // ---------- form <-> data ----------
  const readForm = () => ({
    name: $("#omName").value.trim().replace(/\s+/g, " "), phone: $("#omPhone").value.trim(), address: $("#omAddr").value.trim(),
    city: $("#omCity").value.trim(), postal: $("#omPostal").value.trim(), note: $("#omNote").value.trim(),
    courier: $("#omCourier").value, service: $("#omService").value.trim(), ship: toInt($("#omShip").value),
    spm: radio("omSpm"), ppm: radio("omPpm"), areaId: st.area?.id ?? "",
  });
  const parsedItems = () => st.items.map((i) => ({ ...i, qty: toInt(i.qty), price: toInt(i.price), dval: i.dtype === "none" ? 0 : toInt(i.dval) }));

  function validate(f, items) {
    const e = {};
    if (!f.name) e.name = "Nama penerima wajib diisi.";
    if (digits(f.phone).length < 8 || digits(f.phone).length > 15) e.phone = "Isi nomor yang valid (8 sampai 15 digit).";
    if (!f.address) e.address = "Alamat wajib diisi.";
    if (f.postal && !/^\d{5}$/.test(f.postal)) e.postal = "Kode pos 5 digit.";
    if (!(f.ship >= 0 && f.ship <= LIM.ship)) e.ship = `Isi 0 sampai ${rupiah(LIM.ship)}.`;
    if (!items.length) e.items = "Tambahkan minimal satu item.";
    items.forEach((x, i) => {
      if (!(x.qty >= 1 && x.qty <= LIM.qty)) e[`qty-${i}`] = `Isi 1 sampai ${LIM.qty}.`;
      else if (x.qty > x.stock) e[`qty-${i}`] = `Stok tidak cukup. Maksimal ${x.stock}.`;
      if (!(x.price >= 0 && x.price <= LIM.price)) e[`price-${i}`] = "Isi harga yang valid.";
      if (x.dtype === "percent" && !(x.dval >= 0 && x.dval <= 100)) e[`dval-${i}`] = "Persen 0 sampai 100.";
      else if (x.dtype === "nominal" && !(x.dval >= 0)) e[`dval-${i}`] = "Isi nominal yang valid.";
    });
    return e;
  }

  // ---------- item terpilih ----------
  function renderItems() {
    const box = $("#omItems");
    if (!st.items.length) { box.innerHTML = `<div class="ad-empty" style="padding:20px 8px">Belum ada item. Cari produk di atas lalu pilih varian.</div>`; return; }
    box.innerHTML = st.items.map((x, i) => `
      <section class="ad-card oe-item" data-card="${i}" style="margin-bottom:12px;box-shadow:none">
        <div class="oe-head"><div><div class="ad-name">${esc(x.product)}</div>
          <div class="ad-meta">${esc(x.color)} / ${esc(x.size)} · stok tersedia <span data-stock="${i}">${x.stock}</span> · harga katalog ${esc(rupiah(x.catalog))}</div></div>
          <button type="button" class="btn btn-danger-outline btn-sm" data-act="remove" data-i="${i}">Hapus</button></div>
        <div class="oe-fields">
          <div class="field"><label class="label" for="omQty${i}">Jumlah</label>
            <input class="input" id="omQty${i}" data-f="qty" data-i="${i}" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${esc(x.qty)}"><span class="field-error" data-err="qty-${i}"></span></div>
          <div class="field"><label class="label" for="omPrice${i}">Harga satuan (Rp)</label>
            <input class="input" id="omPrice${i}" data-f="price" data-i="${i}" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${esc(x.price)}"><span class="field-error" data-err="price-${i}"></span></div>
          <div class="field"><label class="label" for="omDtype${i}">Diskon</label>
            <select class="input" id="omDtype${i}" data-f="dtype" data-i="${i}" style="font-size:16px">
              <option value="none" ${x.dtype === "none" ? "selected" : ""}>Tanpa diskon</option>
              <option value="percent" ${x.dtype === "percent" ? "selected" : ""}>Persen (%)</option>
              <option value="nominal" ${x.dtype === "nominal" ? "selected" : ""}>Nominal (Rp)</option></select></div>
          <div class="field"><label class="label" for="omDval${i}">Nilai diskon</label>
            <input class="input" id="omDval${i}" data-f="dval" data-i="${i}" inputmode="numeric" autocomplete="off" style="font-size:16px" value="${esc(x.dval)}" ${x.dtype === "none" ? "disabled" : ""}><span class="field-error" data-err="dval-${i}"></span></div>
        </div>
        <p class="oe-line" data-line="${i}" aria-live="polite"></p></section>`).join("");
  }

  function refresh({ showErrors = false } = {}) {
    const f = readForm(), items = parsedItems();
    let sub = 0;
    items.forEach((x, i) => {
      const line = pg.querySelector(`[data-line="${i}"]`); if (!line) return;
      const q = Number.isFinite(x.qty) ? x.qty : 0, p = Number.isFinite(x.price) ? x.price : 0, d = Number.isFinite(x.dval) ? x.dval : 0;
      const disc = discountAmount(q, p, x.dtype === "none" ? "nominal" : x.dtype, d);
      sub += q * p - disc;
      line.textContent = `Subtotal baris: ${rupiah(q * p - disc)}${disc ? ` (diskon −${rupiah(disc)})` : ""}`;
      const dv = pg.querySelector(`[data-f="dval"][data-i="${i}"]`); if (dv) dv.disabled = x.dtype === "none";
    });
    const ship = Number.isFinite(f.ship) ? f.ship : 0;
    $("[data-sum=sub]").textContent = rupiah(sub); $("[data-sum=ship]").textContent = rupiah(ship); $("[data-sum=total]").textContent = rupiah(sub + ship);
    const errs = validate(f, items);
    pg.querySelectorAll("[data-err]").forEach((el) => { el.textContent = showErrors ? (errs[el.dataset.err] ?? "") : ""; });
    return { f, items, errs };
  }

  // ---------- draf sementara (sessionStorage: hilang saat tab ditutup) ----------
  const save = debounce(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ f: readForm(), area: st.area, items: st.items })); } catch { /* abaikan */ }
  }, 250);
  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* abaikan */ } };
  function restore() {
    let d; try { d = JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch { d = null; }
    if (!d?.f) return false;
    const f = d.f;
    $("#omName").value = f.name ?? ""; $("#omPhone").value = f.phone ?? ""; $("#omAddr").value = f.address ?? "";
    $("#omCity").value = f.city ?? ""; $("#omPostal").value = f.postal ?? ""; $("#omNote").value = f.note ?? "";
    if (f.courier && COURIER[f.courier]) $("#omCourier").value = f.courier;
    $("#omService").value = f.service ?? ""; $("#omShip").value = Number.isFinite(f.ship) ? String(f.ship) : "0";
    for (const [n, v] of [["omSpm", f.spm], ["omPpm", f.ppm]]) { const r = form.querySelector(`input[name="${n}"][value="${v}"]`); if (r) r.checked = true; }
    if (d.area?.id) { st.area = d.area; picker.set(d.area); }
    st.items = Array.isArray(d.items) ? d.items : [];
    return Boolean(f.name || f.phone || f.address || st.items.length);
  }

  // ---------- cari varian ----------
  const results = $("#omResults");
  async function search(q) {
    const my = ++st.req; st.lastQuery = q;
    if (q.length < 2) { results.innerHTML = q ? `<p class="ad-note">Ketik minimal 2 huruf.</p>` : ""; return; }
    results.innerHTML = `<p class="ad-note">Mencari…</p>`;
    const pr = await supabase.from("products").select("id, name, price, status").ilike("name", `%${q}%`).order("name").limit(8);
    if (my !== st.req) return;
    if (pr.error) { console.error(pr.error); results.innerHTML = `<p class="ad-note ad-note-warn">Pencarian gagal. Coba lagi.</p>`; return; }
    const prods = pr.data ?? [];
    if (!prods.length) { results.innerHTML = `<p class="ad-note">Produk tidak ditemukan. Belum ada di sistem? Gunakan “+ Produk baru”.</p>`; return; }
    const cr = await supabase.from("product_colors").select("id, name, product_id, product_variants(id, size, stock)").in("product_id", prods.map((p) => p.id)).order("name");
    if (my !== st.req) return;
    if (cr.error) { console.error(cr.error); results.innerHTML = `<p class="ad-note ad-note-warn">Pencarian gagal. Coba lagi.</p>`; return; }
    results.innerHTML = prods.map((p) => {
      const vars = (cr.data ?? []).filter((c) => c.product_id === p.id)
        .flatMap((c) => (c.product_variants ?? []).map((v) => ({ ...v, color: c.name })))
        .sort((a, b) => a.color.localeCompare(b.color) || sizeRank(a.size) - sizeRank(b.size) || String(a.size).localeCompare(b.size));
      return `<div class="om-group"><div class="om-prod">${esc(p.name)}${p.status !== "active" ? ` <span class="ad-badge ad-badge-off">${p.status === "draft" ? "Draft" : "Arsip"}</span>` : ""} <span class="ad-meta">${esc(rupiah(p.price))}</span></div>
        <div class="om-vars">${vars.length ? vars.map((v) => `<button type="button" class="om-opt" data-add="${esc(v.id)}" data-product="${esc(p.name)}" data-color="${esc(v.color)}" data-size="${esc(v.size)}" data-stock="${v.stock}" data-price="${p.price}" ${v.stock > 0 ? "" : "disabled"}
          title="${v.stock > 0 ? "" : "Stok habis. Tambah stok di menu Produk dulu."}">${esc(v.color)} / ${esc(v.size)} <small>${v.stock > 0 ? `stok ${v.stock}` : "habis"}</small></button>`).join("") : `<span class="ad-meta">Belum ada varian.</span>`}</div></div>`;
    }).join("");
  }

  function addVariant(b) {
    const vid = b.dataset.add, stock = Number(b.dataset.stock);
    const ex = st.items.find((x) => x.vid === vid);
    if (ex) {
      const q = toInt(ex.qty);
      if (Number.isFinite(q) && q >= stock) { toast(`Stok tersedia hanya ${stock}.`, "error"); return; }
      ex.qty = String((Number.isFinite(q) ? q : 0) + 1);
    } else {
      const catalog = Number(b.dataset.price);
      st.items.push({ vid, product: b.dataset.product, color: b.dataset.color, size: b.dataset.size, stock, catalog, qty: "1", price: String(catalog), dtype: "none", dval: "" });
    }
    renderItems(); refresh(); save(); queueRates();
  }

  /** Segarkan stok varian terpilih (mis. setelah stok ditambah di tab Produk) dan ulang pencarian terakhir. */
  async function reloadVariants({ quiet = false } = {}) {
    if (st.items.length) {
      const { data, error } = await supabase.from("product_variants").select("id, stock").in("id", st.items.map((x) => x.vid));
      if (!error) {
        const m = new Map((data ?? []).map((v) => [v.id, v.stock]));
        const gone = st.items.filter((x) => !m.has(x.vid));
        st.items = st.items.filter((x) => m.has(x.vid)).map((x) => ({ ...x, stock: m.get(x.vid) }));
        if (gone.length) toast(`${gone.length} item dihapus karena variannya sudah tidak ada.`, "error");
        renderItems(); refresh(); save();
      }
    }
    if (st.lastQuery) await search(st.lastQuery);
    if (!quiet) toast("Varian dimuat ulang.", "success");
  }
  let lastAuto = 0;
  const onVisible = () => {
    if (!pg.isConnected) { document.removeEventListener("visibilitychange", onVisible); return; }
    if (document.hidden || Date.now() - lastAuto < 2000) return;
    lastAuto = Date.now(); reloadVariants({ quiet: true });
  };
  document.addEventListener("visibilitychange", onVisible);

  // ---------- kirim ----------
  async function submit() {
    const { f, items, errs } = refresh({ showErrors: true });
    const msg = $("#omMsg"); msg.hidden = true;
    const keys = Object.keys(errs);
    if (keys.length) {
      const el = pg.querySelector(`[data-err="${keys[0]}"]`)?.closest(".field, section")?.querySelector("input,textarea,select");
      el?.focus(); return;
    }
    const btn = $("#omSave"); setBusy(btn, true, "Membuat…");
    const { data, error } = await supabase.rpc("admin_create_order", buildManualPayload(f, items));
    if (error) {
      setBusy(btn, false);
      msg.hidden = false; msg.textContent = error.message || "Pesanan gagal dibuat. Coba lagi.";
      msg.scrollIntoView?.({ block: "nearest" }); return;
    }
    clearDraft();
    toast("Pesanan manual dibuat.", "success");
    window.dispatchEvent(new CustomEvent("ad:orders-changed"));
    location.hash = `#/pesanan/${data}`;
  }

  // ---------- event ----------
  form.addEventListener("input", (e) => {
    const i = e.target.dataset?.i;
    if (i !== undefined && e.target.dataset.f) st.items[Number(i)][e.target.dataset.f] = e.target.value;
    if (e.target.id === "omShip" || e.target.id === "omService") { st.rates.touched = true; syncRateRadios(); }   // diubah manual: jangan ditimpa otomatis
    if (e.target.dataset?.f === "qty") queueRates();
    refresh(); save();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "omRate") {
      const svc = st.rates.services.find((x) => x.service === e.target.value);
      if (svc) applyService(svc);
      refresh(); save(); return;
    }
    const i = e.target.dataset?.i;
    if (i !== undefined && e.target.dataset.f) st.items[Number(i)][e.target.dataset.f] = e.target.value;
    if (e.target.id === "omCourier") queueRates();
    refresh(); save();
  });
  form.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]"); if (add && !add.disabled) return addVariant(add);
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "remove") { st.items.splice(Number(b.dataset.i), 1); renderItems(); refresh(); save(); queueRates(); }
    else if (b.dataset.act === "rates-fresh") loadRates({ fresh: true });
    else if (b.dataset.act === "rates-retry") loadRates();
    else if (b.dataset.act === "reload") reloadVariants();
    else if (b.dataset.act === "clear") {
      st.items = []; st.area = null; picker.set(null); form.reset(); $("#omShip").value = "0"; $("#omCourier").value = defCourier;
      results.innerHTML = ""; st.lastQuery = ""; clearDraft(); renderItems(); refresh(); $("#omDraftNote").hidden = true;
      st.rates = newRates(); renderRates(); loadRates();
    }
  });
  $("#omSearch").addEventListener("input", debounce((e) => search(sanitizeSearch(e.target.value)), 300));
  form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });

  const restored = restore();
  $("#omDraftNote").hidden = !restored;
  renderItems(); refresh();
  st.rates.touched = restored && toInt($("#omShip").value) > 0;   // ongkir dari draf dianggap pilihan admin, jangan ditimpa
  renderRates(); loadRates();
  if (restored && st.items.length) reloadVariants({ quiet: true });   // stok bisa berubah sejak draf disimpan
}