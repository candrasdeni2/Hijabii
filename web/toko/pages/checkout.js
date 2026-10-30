// Checkout: kartu alamat (ubah lewat sheet), produk yang di-checkout di atas, opsi pengiriman (kurir + layanan, cek ongkir, fallback manual),
// pembayaran, rincian, lalu place_order. Beli langsung (#/checkout?beli=1) hanya membawa item itu dan tidak mengubah keranjang.
import { supabase, loadCart, rupiah, esc, fail, emptyState, errorBox, toast, withLoading, openDialog, getSettings, refreshCartCount, img, getCartOff, ICON, goBack } from "../tk-lib.js";
import { loadBuyNowRow, clearBuyNow } from "../buy-now.js";
import { mountAreaPicker, pretty } from "../../assets/js/area-picker.js";
import { getShippingRates } from "../../assets/js/shipping-cost.js";
import { COURIER } from "../../assets/js/labels.js";

const PHONE_RE = /^\+?\d{9,15}$/;
const COURIERS = ["jnt", "pos", "jne"];
const STORE = "Hijabii by Intan";

const CSS = `
.ck{max-width:680px;margin:0 auto;padding:0 16px 104px}
.ck svg{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ck-top{display:flex;align-items:center;gap:4px;margin:0 0 14px}
.ck-back{display:grid;place-items:center;width:44px;height:44px;margin-left:-10px;border:0;border-radius:50%;background:none;color:var(--ink,#2B211C);cursor:pointer}
.ck-back:hover{background:var(--sand,#EBE0D3)}.ck-back svg{width:22px;height:22px}
.ck-h1{font:600 24px/1.15 var(--font-serif,serif);margin:0}
.ck-card{background:var(--paper,#FBF8F3);border:1px solid var(--sand,#EBE0D3);border-radius:16px;padding:14px 16px;margin-bottom:12px}
.ck-btnrow{display:flex;align-items:center;gap:12px;width:100%;padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}
.ck-go{flex:none;width:18px;height:18px;margin-left:auto;opacity:.45}
.ck-pin{flex:none;width:22px;height:22px;color:var(--marsala,#7B4A4A);align-self:flex-start;margin-top:2px}
.ck-addr b{font-size:15px}.ck-addr .ck-ph{margin-left:6px;font-size:13px;color:rgba(43,33,28,.6)}
.ck-addr p{margin:3px 0 0;font-size:14px;line-height:1.45;color:rgba(43,33,28,.8);overflow-wrap:anywhere}
.ck-addr-empty{font-weight:600;font-size:15px;color:var(--marsala,#7B4A4A)}
.ck-store{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:600;font-size:15px}
.ck-store svg{width:18px;height:18px;color:var(--marsala,#7B4A4A)}
.ck-it{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;padding:10px 0;border-top:1px solid var(--sand,#EBE0D3)}
.ck-store + .ck-it{border-top:0;padding-top:0}
.ck-it-img{width:64px;height:80px;border-radius:10px;overflow:hidden;background:var(--sand,#EBE0D3)}
.ck-it-img .tk-img,.ck-it-img .tk-ph{width:100%;height:100%;object-fit:cover}
.ck-it b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:600;line-height:1.3}
.ck-it small{display:block;margin-top:2px;font-size:12px;color:rgba(43,33,28,.65)}
.ck-it-p{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:14px}
.ck-it-p span{color:rgba(43,33,28,.65)}
.ck-line{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:10px 0 0;margin-top:6px;border:0;border-top:1px solid var(--sand,#EBE0D3);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}
.ck-line span{flex:none;font-size:14px}.ck-line em{margin-left:auto;font-style:normal;font-size:13px;color:rgba(43,33,28,.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%}
.ck-line svg{flex:none;width:16px;height:16px;opacity:.45}
.ck-sec-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}
.ck-sec-h h2{font:600 16px/1.2 var(--font-sans,sans-serif);margin:0}
.ck-link{display:inline-flex;align-items:center;gap:2px;min-height:36px;padding:0;border:0;background:none;font:inherit;font-size:13px;color:rgba(43,33,28,.65);cursor:pointer}
.ck-link svg{width:14px;height:14px}.ck-link:disabled{opacity:.4;cursor:not-allowed}
.ck-ul{background:none;border:0;padding:0;color:var(--marsala,#7B4A4A);text-decoration:underline;text-underline-offset:3px;font:inherit;font-size:13px;cursor:pointer;min-height:36px}
.ck-svc{display:flex;align-items:flex-start;gap:12px;width:100%;padding:12px 14px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);text-align:left;font:inherit;color:inherit;cursor:pointer}
.ck-svc.is-sel{border-color:var(--marsala,#7B4A4A);box-shadow:0 0 0 1px var(--marsala,#7B4A4A);background:#FBF3F1}
.ck-svc b{display:block;font-size:14px;font-weight:600}.ck-svc small{display:block;margin-top:2px;font-size:12px;color:rgba(43,33,28,.65);overflow-wrap:anywhere}
.ck-svc .ck-pr{margin-left:auto;padding-left:8px;font-weight:600;font-size:14px;white-space:nowrap}
.ck-tag{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:#EFE3E3;color:var(--marsala,#7B4A4A);font-size:11px;font-weight:600;vertical-align:1px}
.ck-tabs{display:flex;gap:8px;margin:0 0 12px}
.ck-tab{flex:1;min-height:44px;padding:0 10px;border:1px solid var(--sand,#EBE0D3);border-radius:999px;background:var(--paper,#FBF8F3);font:500 14px var(--font-sans,sans-serif);cursor:pointer;color:var(--ink,#2B211C)}
.ck-tab[aria-pressed="true"]{background:var(--marsala,#7B4A4A);border-color:var(--marsala,#7B4A4A);color:var(--cream,#F6F0E7)}
.ck-svcs{display:grid;gap:10px}
.ck-msg{border-radius:12px;padding:.7rem .9rem;font-size:13px;line-height:1.5;margin-top:10px}
.ck-msg[data-k="warn"]{background:#FDF3E3;color:#8a6420;border:1px solid #EBD6AE}
.ck-msg[data-k="info"]{background:#EEF3F6;color:var(--info,#4F6B7D);border:1px solid #C9D8E1}
.ck-hint{font-size:12px;color:rgba(43,33,28,.6);line-height:1.5;margin:8px 0 0}
.ck-row2{display:grid;gap:12px}@media(min-width:520px){.ck-row2{grid-template-columns:1fr 1fr}}
.ck-stack{display:grid;gap:12px}
.ck-sub{margin:14px 0 8px;font-size:13px;font-weight:500}.ck-sub:first-of-type{margin-top:0}
.ck-opts{display:grid;gap:8px}
.ck-opt{display:flex;gap:12px;align-items:flex-start;padding:11px 14px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);cursor:pointer;min-height:48px}
.ck-opt:has(input:checked){border-color:var(--marsala,#7B4A4A);box-shadow:0 0 0 1px var(--marsala,#7B4A4A)}
.ck-opt:has(input:disabled){opacity:.5;cursor:not-allowed}
.ck-opt input{margin-top:3px;width:18px;height:18px;accent-color:var(--marsala,#7B4A4A);flex:none}
.ck-opt b{display:block;font-size:14px;font-weight:600}.ck-opt small{display:block;margin-top:2px;font-size:12px;color:rgba(43,33,28,.65);overflow-wrap:anywhere}
.ck-tr{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:14px}
.ck-tr small{display:block;font-size:12px;color:rgba(43,33,28,.6)}
.ck-tr.big{margin-top:6px;padding-top:12px;border-top:1px solid var(--sand,#EBE0D3);font-weight:700;font-size:16px}
.ck-aopt{display:block;width:100%;padding:12px 14px;margin-bottom:8px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);text-align:left;font:inherit;color:inherit;cursor:pointer}
.ck-aopt[aria-pressed="true"]{border-color:var(--marsala,#7B4A4A);box-shadow:0 0 0 1px var(--marsala,#7B4A4A)}
.ck-aopt b{font-size:14px}.ck-aopt p{margin:3px 0 0;font-size:13px;line-height:1.45;color:rgba(43,33,28,.75);overflow-wrap:anywhere}
.ck-bar{position:fixed;z-index:55;left:0;right:0;bottom:var(--tk-nav-h,0px);background:rgba(246,240,231,.97);backdrop-filter:blur(8px);border-top:1px solid rgba(43,33,28,.1)}
@media(min-width:1024px){.ck-bar{bottom:0}}
.ck-bar-in{display:flex;align-items:center;gap:14px;max-width:680px;margin:0 auto;padding:10px 16px}
.ck-tot{margin-left:auto;text-align:right;line-height:1.25}
.ck-tot small{display:block;font-size:11px;color:rgba(43,33,28,.6)}
.ck-tot b{font-size:18px;color:var(--marsala,#7B4A4A)}
.ck-bar .btn{flex:none;min-width:150px}
.ck .field-error{display:block;margin-top:6px}
.ck-btnrow:focus-visible,.ck-line:focus-visible,.ck-svc:focus-visible,.ck-aopt:focus-visible{outline:2px solid var(--marsala,#7B4A4A);outline-offset:3px}
`;

const NEXT = ICON.next.replace("<svg", '<svg class="ck-go"');
const NEXT_S = ICON.next;
const PIN = '<svg class="ck-pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

// Kode pos hanya ditambahkan bila belum ada di label area (hindari tampil dobel)
const zip = (a) => (a.postal_code && !String(a.area_label ?? "").includes(a.postal_code) ? ` · ${esc(a.postal_code)}` : "");

export async function init({ root, query, profile, isStale }) {
  if (!document.getElementById("ckStyle")) { const el = document.createElement("style"); el.id = "ckStyle"; el.textContent = CSS; document.head.appendChild(el); }
  const isBuy = query.get("beli") === "1";
  if (!isBuy) clearBuyNow();   // masuk dari keranjang: buang sisa item beli langsung
  root.innerHTML = `<div class="ck"><div class="ck-top"><h1 class="ck-h1">Checkout</h1></div><div id="ckBody"><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:160px;margin-top:12px"></div></div></div>`;
  const body = root.querySelector("#ckBody");

  let rows, addrs, settings;
  try {
    [rows, { data: addrs }, settings] = await Promise.all([
      isBuy ? loadBuyNowRow().then((r) => (r ? [r] : [])) : loadCart(),
      supabase.from("addresses").select("id, label, recipient_name, recipient_phone, destination_area_id, area_label, address_line, postal_code, is_primary")
        .order("is_primary", { ascending: false }).order("created_at", { ascending: false }),
      getSettings().catch(() => ({})),
    ]);
  } catch (e) {
    console.error(e);
    if (isStale()) return;
    body.innerHTML = errorBox();
    body.querySelector("[data-retry]").addEventListener("click", () => location.reload());
    return;
  }
  if (isStale()) return;
  addrs = addrs ?? [];

  if (isBuy) {
    if (!rows.length) { toast("Produk untuk dibeli tidak ditemukan. Pilih lagi dari halaman produk.", "warning"); location.hash = "#/katalog"; return; }
  } else {
    if (!rows.length) { body.innerHTML = emptyState("Keranjang kosong", "Pilih produk dulu sebelum checkout.", "#/katalog", "Lihat Koleksi"); return; }
    const unsel = getCartOff();   // hanya produk yang dicentang di keranjang
    rows = rows.filter((r) => !unsel.has(r.id));
    if (!rows.length) { toast("Pilih dulu produk yang mau di-checkout.", "warning"); location.hash = "#/keranjang"; return; }
  }
  if (rows.some((r) => !r.ok || r.over)) {
    toast(isBuy ? "Stok produk ini berubah atau habis. Cek lagi di halaman produk." : "Ada produk di keranjang yang perlu disesuaikan dulu.", "warning");
    location.hash = isBuy && rows[0]?.slug ? `#/produk/${encodeURIComponent(rows[0].slug)}` : "#/keranjang"; return;
  }

  const items = rows.map((r) => ({ variant_id: r.variantId, qty: r.qty }));
  const subtotal = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const qtyAll = rows.reduce((s, r) => s + r.qty, 0);
  const hasDana = Boolean(settings.dana_number), hasBank = Boolean(settings.bank_account_number);
  const backTo = isBuy && rows[0]?.slug ? `#/produk/${encodeURIComponent(rows[0].slug)}` : "#/keranjang";

  const st = {
    addr: addrs[0] ?? null,
    courier: "jnt", cache: {}, svc: -1, manual: false, manualCost: null, note: "",
    shipPay: "tf", prodPay: hasDana || !hasBank ? "dana" : "bank",
  };
  let ver = 0, sheetRender = null, activePicker = null;
  const areaObj = () => (st.addr ? { id: String(st.addr.destination_area_id), label: st.addr.area_label } : null);
  const services = () => st.cache[st.courier]?.services ?? [];
  const selSvc = () => (st.svc >= 0 ? services()[st.svc] ?? null : null);
  const shipCost = () => (st.manual ? st.manualCost : (selSvc()?.cost ?? null));
  const shipService = () => (st.manual ? (root.querySelector("#ckManualSvc")?.value.trim() || null) : selSvc()?.service ?? null);
  const cod = () => st.shipPay === "cod";

  /* ================= kerangka ================= */
  root.querySelector(".ck-top").insertAdjacentHTML("afterbegin", `<button type="button" class="ck-back" id="ckBack" aria-label="Kembali">${ICON.back}</button>`);
  body.innerHTML = `
    <section class="ck-card" aria-label="Alamat pengiriman"><div id="ckAddrBox"></div><span class="field-error" data-e="addr"></span></section>

    <section class="ck-card" aria-label="Produk yang dibeli">
      <div class="ck-store">${ICON.bag}${esc(STORE)}</div>
      ${rows.map((r) => `<div class="ck-it"><div class="ck-it-img">${img(r.image, r.name)}</div><div style="min-width:0"><b>${esc(r.name)}</b>
        <small>${esc(r.color)} · ${esc(r.size)}</small><div class="ck-it-p"><b style="font-weight:600">${esc(rupiah(r.price))}</b><span>×${r.qty}</span></div></div></div>`).join("")}
      <button type="button" class="ck-line" id="ckNoteBtn"><span>Catatan untuk penjual</span><em id="ckNoteTxt">Tinggalkan catatan</em>${NEXT_S}</button>
    </section>

    <section class="ck-card" aria-label="Opsi pengiriman">
      <div class="ck-sec-h"><h2>Opsi Pengiriman</h2><button type="button" class="ck-link" id="ckShipAll" disabled>Lihat Semua ${NEXT_S}</button></div>
      <div id="ckShipBox" aria-live="polite"></div><span class="field-error" data-e="ship"></span>
    </section>

    <section class="ck-card" aria-label="Pembayaran">
      <div class="ck-sub">Bayar ongkir</div>
      <div class="ck-opts" role="radiogroup" aria-label="Bayar ongkir">
        <label class="ck-opt"><input type="radio" name="ckShipPay" value="tf" checked><span><b>Transfer</b></span></label>
        <label class="ck-opt"><input type="radio" name="ckShipPay" value="cod"><span><b>COD</b></span></label></div>
      <div class="ck-sub">Bayar produk</div>
      <div class="ck-opts" role="radiogroup" aria-label="Bayar produk">
        <label class="ck-opt"><input type="radio" name="ckProdPay" value="dana" ${st.prodPay === "dana" ? "checked" : ""} ${hasDana ? "" : "disabled"}><span><b>DANA</b>
          <small>${hasDana ? `${esc(settings.dana_number)}${settings.dana_account_name ? ` · a.n. ${esc(settings.dana_account_name)}` : ""}` : "Belum diatur admin"}</small></span></label>
        <label class="ck-opt"><input type="radio" name="ckProdPay" value="bank" ${st.prodPay === "bank" ? "checked" : ""} ${hasBank ? "" : "disabled"}><span><b>Rekening bank${settings.bank_name ? ` ${esc(settings.bank_name)}` : ""}</b>
          <small>${hasBank ? `${esc(settings.bank_account_number)}${settings.bank_account_holder ? ` · a.n. ${esc(settings.bank_account_holder)}` : ""}` : "Belum diatur admin"}</small></span></label></div>
      <p class="ck-hint">Bukti pembayaran dikirim lewat WhatsApp setelah admin mengonfirmasi pesanan.</p>
    </section>

    <section class="ck-card" aria-label="Rincian pembayaran"><div id="ckSum"></div></section>

    <div class="ck-bar"><div class="ck-bar-in">
      <div class="ck-tot"><small id="ckTotNote"></small><b id="ckTot"></b></div>
      <button class="btn btn-accent" type="button" id="ckPlace">Buat Pesanan</button></div></div>`;

  const $ = (s) => root.querySelector(s);
  const setE = (k, t) => { const el = $(`[data-e="${k}"]`); if (el) el.textContent = t; };

  /* ================= alamat ================= */
  function paintAddr() {
    const a = st.addr;
    $("#ckAddrBox").innerHTML = a
      ? `<button type="button" class="ck-btnrow ck-addr" id="ckAddr" aria-label="Ubah alamat pengiriman">${PIN}<span style="min-width:0;flex:1"><b>${esc(a.recipient_name)}</b><span class="ck-ph">${esc(a.recipient_phone)}</span>
          <p>${esc(a.address_line)}</p><p>${esc(pretty(a.area_label))}${zip(a)}</p></span>${NEXT}</button>`
      : `<button type="button" class="ck-btnrow" id="ckAddr"><span class="ck-addr-empty">Tambah alamat pengiriman</span>${NEXT}</button>`;
  }

  function setAddr(a) {
    st.addr = a; ver++; st.cache = {}; st.svc = -1; st.manual = false; st.manualCost = null;
    setE("addr", ""); setE("ship", "");
    paintAddr(); paintShip(); paintSum();
    if (a) fetchRates(st.courier);
  }

  function openAddrSheet() {
    activePicker?.destroy(); activePicker = null;
    const node = document.createElement("div");
    let dlg = null;
    const close = () => { activePicker?.destroy(); activePicker = null; dlg?.close(); };

    const renderList = () => {
      activePicker?.destroy(); activePicker = null;
      node.innerHTML = `<div>${addrs.map((a) => `<button type="button" class="ck-aopt" data-id="${esc(a.id)}" aria-pressed="${st.addr?.id === a.id}">
          <b>${esc(a.label)}${a.is_primary ? ' <span class="ck-tag">Utama</span>' : ""}</b> · ${esc(a.recipient_name)}, ${esc(a.recipient_phone)}
          <p>${esc(a.address_line)}</p><p>${esc(pretty(a.area_label))}${zip(a)}</p></button>`).join("")}</div>
        <button type="button" class="btn btn-secondary" data-other style="width:100%;margin-top:4px">Isi alamat lain untuk pesanan ini</button>
        <p class="ck-hint" style="text-align:center"><a href="#/alamat" class="ck-ul">Kelola alamat tersimpan</a></p>`;
    };
    const renderForm = () => {
      const c = st.addr && !st.addr.id ? st.addr : null;   // alamat manual yang sedang dipakai
      node.innerHTML = `<div class="ck-stack">
        <div class="field"><label class="label" for="afName">Nama penerima <span class="req">*</span></label><input class="input" id="afName" maxlength="80" autocomplete="name" value="${esc(c?.recipient_name ?? profile?.full_name ?? "")}"><span class="field-error" data-fe="name"></span></div>
        <div class="field"><label class="label" for="afPhone">Nomor HP / WhatsApp <span class="req">*</span></label><input class="input" id="afPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="08xx" value="${esc(c?.recipient_phone ?? profile?.phone ?? "")}"><span class="field-error" data-fe="phone"></span></div>
        <div class="field"><label class="label" for="afArea">Kelurahan / kecamatan / kota / Kode Pos <span class="req">*</span></label><div id="afAreaBox"></div><span class="field-error" data-fe="area"></span></div>
        <div class="field"><label class="label" for="afLine">Alamat lengkap <span class="req">*</span></label><textarea class="input" id="afLine" rows="3" maxlength="300" placeholder="Jalan, nomor rumah, RT/RW, patokan">${esc(c?.address_line ?? "")}</textarea><span class="field-error" data-fe="line"></span></div>
        ${addrs.length ? "" : `<p class="ck-hint" style="margin:0">Simpan alamat di menu Alamat supaya lain kali terisi otomatis.</p>`}
        <div style="display:grid;gap:10px;margin-top:4px"><button type="button" class="btn btn-accent" data-use>Gunakan alamat ini</button>${addrs.length ? '<button type="button" class="btn btn-secondary" data-backlist>Kembali</button>' : ""}</div></div>`;
      activePicker = mountAreaPicker({ root: node.querySelector("#afAreaBox"), inputId: "afArea", value: c ? { id: String(c.destination_area_id), label: c.area_label } : null });
    };
    node.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-id]");
      if (opt) { const a = addrs.find((x) => x.id === opt.dataset.id); if (a) { close(); setAddr(a); } return; }
      if (e.target.closest("[data-other]")) { renderForm(); return; }
      if (e.target.closest("[data-backlist]")) { renderList(); return; }
      if (e.target.closest("a[href]")) { close(); return; }
      if (e.target.closest("[data-use]")) {
        const q = (s) => node.querySelector(s), fe = (k, t) => { q(`[data-fe="${k}"]`).textContent = t; };
        ["name", "phone", "area", "line"].forEach((k) => fe(k, ""));
        const name = q("#afName").value.trim(), phone = q("#afPhone").value.replace(/[\s-]/g, ""), line = q("#afLine").value.trim(), area = activePicker?.get();
        let bad = false;
        if (!name) { fe("name", "Nama penerima wajib diisi."); bad = true; }
        if (!PHONE_RE.test(phone)) { fe("phone", "Nomor HP tidak valid (9–15 angka)."); bad = true; }
        if (!area) { fe("area", "Pilih area dari hasil pencarian."); bad = true; }
        if (line.length < 5) { fe("line", "Alamat lengkap minimal 5 karakter."); bad = true; }
        if (bad) return;
        const a = { recipient_name: name, recipient_phone: phone, destination_area_id: area.id, area_label: area.label ?? "", address_line: line, postal_code: (String(area.label ?? "").match(/\b\d{5}\b/) ?? [null])[0] };
        close(); setAddr(a);
      }
    });
    addrs.length ? renderList() : renderForm();
    dlg = openDialog({ title: "Alamat pengiriman", node });
  }

  /* ================= catatan ================= */
  function openNote() {
    const node = document.createElement("div");
    node.innerHTML = `<div class="field"><label class="label" for="ntTxt">Catatan untuk penjual</label>
      <textarea class="input" id="ntTxt" rows="4" maxlength="200" placeholder="Mis. titip di satpam"></textarea></div>
      <div style="display:grid;gap:10px;margin-top:12px"><button type="button" class="btn btn-accent" id="ntSave">Simpan</button><button type="button" class="btn btn-secondary" id="ntNo">Batal</button></div>`;
    node.querySelector("#ntTxt").value = st.note;
    const dlg = openDialog({ title: "Catatan", node });
    node.querySelector("#ntNo").addEventListener("click", dlg.close);
    node.querySelector("#ntSave").addEventListener("click", () => {
      st.note = node.querySelector("#ntTxt").value.trim().slice(0, 200);
      $("#ckNoteTxt").textContent = st.note || "Tinggalkan catatan";
      dlg.close();
    });
  }

  /* ================= ongkir ================= */
  async function fetchRates(courier) {
    const area = areaObj(); if (!area) return;
    const v = ver;
    st.cache[courier] = { status: "loading", services: [] };
    paintShip(); sheetRender?.();
    try {
      const r = await getShippingRates({ destination: area.id, courier, items });
      if (v !== ver || isStale()) return;
      const list = r.services ?? [];
      st.cache[courier] = { status: list.length ? "ok" : "empty", services: list, stale: Boolean(r.stale) };
    } catch (e) {
      if (v !== ver || isStale()) return;
      console.error(e);
      st.cache[courier] = { status: "error", services: [], err: e?.message || "Cek ongkir gagal." };
    }
    if (courier === st.courier && st.svc < 0 && st.cache[courier].services.length) st.svc = 0;
    paintShip(); paintSum(); sheetRender?.();
  }

  function paintShip() {
    const box = $("#ckShipBox"), c = st.cache[st.courier], area = areaObj();
    $("#ckShipAll").disabled = !area;
    if (!area) { box.innerHTML = `<p class="ck-hint" style="margin:0">Pilih alamat pengiriman dulu untuk melihat ongkir.</p>`; return; }
    if (st.manual) {
      box.innerHTML = `<div class="ck-row2"><div class="field"><label class="label" for="ckManual">Ongkir (Rp)</label><input class="input" id="ckManual" inputmode="numeric" placeholder="mis. 9000" value="${st.manualCost ?? ""}"></div>
        <div class="field"><label class="label" for="ckManualSvc">Layanan (opsional)</label><input class="input" id="ckManualSvc" maxlength="40" placeholder="mis. REG"></div></div>
        <div class="ck-msg" data-k="info">Ongkir manual akan diperiksa admin dan bisa disesuaikan lewat revisi invoice.</div>
        <div style="margin-top:8px"><button type="button" class="ck-ul" data-recheck>Coba cek ongkir lagi</button></div>`;
      return;
    }
    if (!c || c.status === "loading") { box.innerHTML = `<div class="skeleton" style="height:62px"></div>`; return; }
    if (c.status === "ok" && selSvc()) {
      const s = selSvc();
      box.innerHTML = `<button type="button" class="ck-svc is-sel" data-open-ship aria-label="Ubah opsi pengiriman"><span style="min-width:0"><b>${esc(COURIER[st.courier])} · ${esc(s.service)}</b>
        <small>${esc([s.description, s.etd ? `estimasi ${s.etd}` : ""].filter(Boolean).join(" · ") || "Estimasi ditentukan kurir")}</small></span><span class="ck-pr">${esc(rupiah(s.cost))}</span></button>
        ${c.stale ? `<div class="ck-msg" data-k="warn">Harga ongkir diambil dari data tersimpan karena layanan ongkir sedang bermasalah. Admin akan memeriksanya lagi.</div>` : ""}`;
      return;
    }
    box.innerHTML = c.status === "empty"
      ? `<div class="ck-msg" data-k="warn" style="margin-top:0">${esc(COURIER[st.courier])} tidak punya layanan untuk tujuan dan berat pesananmu. Pilih kurir lain lewat "Lihat Semua" atau isi ongkir manual.</div>`
      : `<div class="ck-msg" data-k="warn" role="alert" style="margin-top:0">${esc(c.err || "Cek ongkir gagal.")} <button type="button" class="ck-ul" data-retry-rate>Coba lagi</button></div>`;
    box.insertAdjacentHTML("beforeend", `<div style="margin-top:8px"><button type="button" class="ck-ul" data-manual>Isi ongkir manual</button></div>`);
  }

  function openShipSheet() {
    if (!areaObj()) return;
    let tab = st.courier;
    if (!st.cache[tab]) fetchRates(tab);
    const node = document.createElement("div");
    const render = () => {
      const c = st.cache[tab];
      const list = !c || c.status === "loading" ? `<div class="skeleton" style="height:62px"></div><div class="skeleton" style="height:62px"></div>`
        : c.status === "ok" ? c.services.map((s, i) => `<button type="button" class="ck-svc${tab === st.courier && i === st.svc && !st.manual ? " is-sel" : ""}" data-svc="${i}"><span style="min-width:0"><b>${esc(s.service)}</b>
            <small>${esc([s.description, s.etd ? `estimasi ${s.etd}` : ""].filter(Boolean).join(" · ") || "Estimasi ditentukan kurir")}</small></span><span class="ck-pr">${esc(rupiah(s.cost))}</span></button>`).join("")
        : `<div class="ck-msg" data-k="warn" style="margin-top:0">${c.status === "empty" ? `${esc(COURIER[tab])} tidak punya layanan untuk tujuan ini.` : esc(c.err || "Cek ongkir gagal.")}
            <button type="button" class="ck-ul" data-retry>${c.status === "empty" ? "Cek lagi" : "Coba lagi"}</button></div><div><button type="button" class="ck-ul" data-manual>Isi ongkir manual</button></div>`;
      node.innerHTML = `<div class="ck-tabs" role="group" aria-label="Kurir">${COURIERS.map((k) => `<button type="button" class="ck-tab" data-tab="${k}" aria-pressed="${k === tab}">${esc(COURIER[k])}${k === "jnt" ? '<span class="ck-tag" style="background:rgba(255,255,255,.25);color:inherit">Rekomendasi</span>' : ""}</button>`).join("")}</div>
        <div class="ck-svcs">${list}</div>`;
    };
    render();   // isi dulu: node belum ada di DOM, jadi tidak boleh ada cek isConnected di sini
    const dlg = openDialog({ title: "Pilih pengiriman", node });
    // pembaruan berikutnya (hasil ongkir datang) hanya jalan selama sheet masih terbuka
    sheetRender = () => { if (!node.isConnected) { sheetRender = null; return; } render(); };
    node.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) { tab = t.dataset.tab; if (!st.cache[tab]) fetchRates(tab); render(); return; }
      const s = e.target.closest("[data-svc]");
      if (s) { st.courier = tab; st.svc = Number(s.dataset.svc); st.manual = false; setE("ship", ""); dlg.close(); sheetRender = null; paintShip(); paintSum(); return; }
      if (e.target.closest("[data-retry]")) { fetchRates(tab); return; }
      if (e.target.closest("[data-manual]")) { st.manual = true; st.courier = tab; dlg.close(); sheetRender = null; paintShip(); paintSum(); $("#ckManual")?.focus(); }
    });
  }

  /* ================= rincian + bar ================= */
  function paintSum() {
    const cost = shipCost(), c = cod();
    const total = c ? subtotal : subtotal + (cost ?? 0);
    $("#ckSum").innerHTML = `<div class="ck-sec-h"><h2>Rincian Pembayaran</h2></div>
      <div class="ck-tr"><span>Subtotal produk (${qtyAll})</span><span>${esc(rupiah(subtotal))}</span></div>
      <div class="ck-tr"><span>Ongkir${c ? " (COD)" : ""}${c ? "<small>Dibayar langsung ke kurir, tidak termasuk total bayar.</small>" : ""}</span><span>${cost === null ? "—" : esc(rupiah(cost))}</span></div>
      <div class="ck-tr big"><span>Total bayar${c ? " (produk)" : ""}</span><span>${esc(rupiah(total))}</span></div>`;
    $("#ckTot").textContent = rupiah(total);
    $("#ckTotNote").textContent = c ? "Total (produk saja)" : cost === null ? "Total (belum termasuk ongkir)" : "Total";
  }

  /* ================= event ================= */
  const ac = new AbortController();
  $("#ckBack").addEventListener("click", () => goBack(backTo), { signal: ac.signal });
  body.addEventListener("click", (e) => {
    if (e.target.closest("#ckAddr")) return openAddrSheet();
    if (e.target.closest("#ckNoteBtn")) return openNote();
    if (e.target.closest("#ckShipAll") || e.target.closest("[data-open-ship]")) return openShipSheet();
    if (e.target.closest("[data-retry-rate]")) return fetchRates(st.courier);
    if (e.target.closest("[data-manual]")) { st.manual = true; paintShip(); paintSum(); $("#ckManual")?.focus(); return; }
    if (e.target.closest("[data-recheck]")) { st.manual = false; st.manualCost = null; paintSum(); if (st.cache[st.courier]?.status === "ok") { if (st.svc < 0) st.svc = 0; paintShip(); paintSum(); } else fetchRates(st.courier); }
  }, { signal: ac.signal });
  body.addEventListener("input", (e) => {
    if (e.target.id !== "ckManual") return;
    const v = e.target.value.trim(), n = Number(v);
    st.manualCost = v !== "" && Number.isInteger(n) && n >= 0 ? n : null;
    setE("ship", ""); paintSum();
  }, { signal: ac.signal });
  body.addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "ckShipPay") { st.shipPay = t.value; paintSum(); }
    else if (t.name === "ckProdPay") st.prodPay = t.value;
  }, { signal: ac.signal });

  function stockDialog(message) {
    const node = document.createElement("div");
    node.innerHTML = `<p style="margin:0 0 1rem;font-size:14px;line-height:1.5">${esc(message)}</p>
      <p style="margin:0 0 1.25rem;font-size:13px;color:rgba(43,33,28,.65)">Stok berubah saat kamu memesan. ${isBuy ? "Cek lagi produknya" : "Sesuaikan jumlahnya di keranjang"} lalu coba lagi.</p>
      <div style="display:grid;gap:10px"><a class="btn btn-accent" href="${backTo}" id="stGo">${isBuy ? "Ke halaman produk" : "Ke keranjang"}</a><button class="btn btn-secondary" type="button" id="stX">Tutup</button></div>`;
    const dlg = openDialog({ title: "Stok tidak cukup", node });
    node.querySelector("#stX").addEventListener("click", dlg.close);
    node.querySelector("#stGo").addEventListener("click", dlg.close);
  }

  /* ================= Buat Pesanan ================= */
  $("#ckPlace").addEventListener("click", async (e) => {
    ["addr", "ship"].forEach((k) => setE(k, ""));
    const a = st.addr;
    let cost = shipCost();
    if (!a) { setE("addr", "Tambah alamat pengiriman dulu."); $("#ckAddr").scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (cost === null) { setE("ship", st.manual ? "Isi nominal ongkir." : "Pilih layanan pengiriman atau isi ongkir manual."); $("#ckShipBox").scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (!(st.prodPay === "dana" ? hasDana : hasBank)) { setE("ship", "Metode bayar produk belum diatur admin."); return; }

    await withLoading(e.currentTarget, async () => {
      try {
        // Ambil harga terbaru saat memesan; bila berubah dari yang ditampilkan, minta customer memeriksa ulang.
        if (!st.manual) {
          const shown = selSvc();
          const fresh = await getShippingRates({ destination: String(a.destination_area_id), courier: st.courier, items, fresh: true }).catch(() => null);
          if (fresh?.services?.length) {
            const f = fresh.services.find((s) => s.service === shown.service);
            if (!f) { st.cache[st.courier] = { status: "ok", services: fresh.services }; st.svc = 0; paintShip(); paintSum(); toast("Layanan yang kamu pilih sudah tidak tersedia. Pilih ulang layanannya.", "warning"); return; }
            if (f.cost !== shown.cost) { st.cache[st.courier] = { status: "ok", services: fresh.services }; st.svc = fresh.services.indexOf(f); paintShip(); paintSum(); toast("Harga ongkir diperbarui. Periksa lagi lalu tekan Buat Pesanan.", "warning"); return; }
          }
        }
        cost = shipCost();
        const args = {
          p_recipient_name: a.recipient_name, p_recipient_phone: a.recipient_phone, p_shipping_address: a.address_line,
          p_courier: st.courier, p_shipping_cost: cost,
          p_shipping_pay_method: st.shipPay, p_product_pay_method: st.prodPay,
          p_items: items, p_shipping_city: pretty(a.area_label), p_shipping_postal_code: a.postal_code || null,
          p_destination_area_id: String(a.destination_area_id), p_courier_service: shipService(), p_note: st.note || null,
          p_clear_cart: !isBuy,   // beli langsung tidak menyentuh keranjang (butuh migrasi 010)
        };
        let { data, error } = await supabase.rpc("place_order", args);
        if (error && /p_clear_cart|PGRST202|Could not find the function/i.test(`${error.code} ${error.message}`)) {   // migrasi 010 belum dijalankan
          if (isBuy) { console.error(error); toast("Beli langsung butuh pembaruan database (migrasi 010). Hubungi admin.", "error", 6000); return; }
          delete args.p_clear_cart;
          ({ data, error } = await supabase.rpc("place_order", args));
        }
        if (error) throw error;
        if (isBuy) clearBuyNow();
        await refreshCartCount();
        location.hash = `#/pesanan/${data}?baru=1`;
      } catch (err) {
        if (/stok/i.test(String(err?.message))) { stockDialog(err.message); return; }
        fail(err, "Pesanan gagal dibuat. Coba lagi.");
      }
    }, "Memproses…");
  });

  /* ================= mulai ================= */
  paintAddr(); paintShip(); paintSum();
  if (st.addr) fetchRates(st.courier);
  return () => { ac.abort(); ver++; sheetRender = null; activePicker?.destroy(); activePicker = null; };
}