// Checkout: penerima (prefill dari alamat utama), area + kurir + cek ongkir (fallback manual), metode bayar, lalu place_order.
import { supabase, loadCart, rupiah, esc, fail, emptyState, errorBox, toast, withLoading, openDialog, getSettings, refreshCartCount, img } from "../tk-lib.js";
import { mountAreaPicker, pretty } from "../../assets/js/area-picker.js";
import { getShippingRates } from "../../assets/js/shipping-cost.js";
import { COURIER } from "../../assets/js/labels.js";

const PHONE_RE = /^\+?\d{9,15}$/;
const COURIERS = ["jnt","pos","jne"];

const CSS = `
.co{max-width:1040px;margin:0 auto;padding:0 16px}
.co-grid{display:grid;gap:24px}
@media(min-width:900px){.co-grid{grid-template-columns:minmax(0,1fr) 340px;gap:48px;align-items:start}.co-aside{position:sticky;top:84px}}
.co-sec{padding:20px 0;border-top:1px solid var(--sand,#EBE0D3)}
.co-sec:first-child{border-top:0;padding-top:4px}
.co-sec h2{font:600 22px/1.2 var(--font-serif,serif);margin:0 0 14px}
.co-stack{display:grid;gap:14px}
.co-row2{display:grid;gap:14px}@media(min-width:560px){.co-row2{grid-template-columns:1fr 1fr}}
.co-opts{display:grid;gap:10px}
.co-opt{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--sand,#EBE0D3);border-radius:12px;background:var(--paper,#FBF8F3);cursor:pointer;min-height:48px}
.co-opt:has(input:checked){border-color:var(--marsala,#7B4A4A);box-shadow:0 0 0 1px var(--marsala,#7B4A4A)}
.co-opt:has(input:disabled){opacity:.5;cursor:not-allowed}
.co-opt input{margin-top:3px;width:18px;height:18px;accent-color:var(--marsala,#7B4A4A);flex:none}
.co-opt b{display:block;font-size:14px;font-weight:600}
.co-opt small{display:block;font-size:12px;color:rgba(43,33,28,.65);margin-top:2px;overflow-wrap:anywhere}
.co-opt .co-price{margin-left:auto;font-weight:600;font-size:14px;white-space:nowrap;padding-left:8px}
.co-tag{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;background:#EFE3E3;color:var(--marsala,#7B4A4A);font-size:11px;font-weight:600;vertical-align:1px}
.co-sub{margin:16px 0 8px;font-size:13px;font-weight:500}
.co-msg{border-radius:12px;padding:.7rem .9rem;font-size:13px;line-height:1.5;margin-top:10px}
.co-msg[data-k="warn"]{background:#FDF3E3;color:#8a6420;border:1px solid #EBD6AE}
.co-msg[data-k="info"]{background:#EEF3F6;color:var(--info,#4F6B7D);border:1px solid #C9D8E1}
.co-link{background:none;border:0;padding:0;color:var(--marsala,#7B4A4A);text-decoration:underline;text-underline-offset:3px;font:inherit;cursor:pointer;min-height:36px}
.co-aside h2{font:600 22px/1.2 var(--font-serif,serif);margin:0 0 12px}
.co-li{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--sand,#EBE0D3)}
.co-li-img{width:52px;height:52px;border-radius:10px;overflow:hidden;flex:none;background:var(--sand,#EBE0D3)}
.co-li-img .tk-img,.co-li-img .tk-ph{width:100%;height:100%;object-fit:cover}
.co-li b{display:block;font-size:13px;font-weight:500;overflow-wrap:anywhere}
.co-li small{display:block;font-size:12px;color:rgba(43,33,28,.65)}
.co-li span.p{margin-left:auto;font-size:13px;white-space:nowrap}
.co-tr{display:flex;justify-content:space-between;gap:12px;padding:8px 0;font-size:14px}
.co-tr.big{font-weight:700;font-size:16px}
.co-hint{font-size:12px;color:rgba(43,33,28,.6);line-height:1.5;margin:6px 0 14px}
.co-aside .btn{width:100%}
`;

function stockDialog(message) {
  const node = document.createElement("div");
  node.innerHTML = `<p style="margin:0 0 1rem;font-size:14px;line-height:1.5">${esc(message)}</p>
    <p style="margin:0 0 1.25rem;font-size:13px;color:rgba(43,33,28,.65)">Stok berubah saat kamu memesan. Sesuaikan jumlahnya di keranjang lalu coba lagi.</p>
    <div style="display:grid;gap:10px"><a class="btn btn-accent" href="#/keranjang" id="stGo">Ke keranjang</a><button class="btn btn-secondary" type="button" id="stX">Tutup</button></div>`;
  const dlg = openDialog({ title: "Stok tidak cukup", node });
  node.querySelector("#stX").addEventListener("click", dlg.close);
  node.querySelector("#stGo").addEventListener("click", dlg.close);
}

export async function init({ root, profile, isStale }) {
  if (!document.getElementById("coStyle")) {
    const st = document.createElement("style"); st.id = "coStyle"; st.textContent = CSS; document.head.appendChild(st);
  }
  root.innerHTML = `<div class="co"><div class="tk-head"><h1 class="tk-h1">Checkout</h1></div><div id="coBody"><div class="skeleton" style="height:180px"></div></div></div>`;
  const body = root.querySelector("#coBody");

  let rows, addrs, settings;
  try {
    [rows, { data: addrs }, settings] = await Promise.all([
      loadCart(),
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

  if (!rows.length) { body.innerHTML = emptyState("Keranjang kosong", "Pilih produk dulu sebelum checkout.", "#/katalog", "Lihat Koleksi"); return; }
  if (rows.some((r) => !r.ok || r.over)) { toast("Ada produk di keranjang yang perlu disesuaikan dulu.", "warning"); location.hash = "#/keranjang"; return; }

  const items = rows.map((r) => ({ variant_id: r.variantId, qty: r.qty }));
  const subtotal = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const qtyAll = rows.reduce((s, r) => s + r.qty, 0);
  const hasDana = Boolean(settings.dana_number), hasBank = Boolean(settings.bank_account_number);

  const st = {
    addrId: addrs[0]?.id ?? "", area: null, courier: "jnt",
    rate: "idle", services: [], svc: -1, stale: false, manual: false, err: "",
    shipPay: "tf", prodPay: hasDana || !hasBank ? "dana" : "bank",
  };
  let seq = 0;

  body.innerHTML = `<div class="co-grid">
    <div>
      <section class="co-sec"><h2>Penerima</h2><div class="co-stack">
        ${addrs.length ? `<div class="field"><label class="label" for="coAddr">Alamat tersimpan</label>
          <select class="input" id="coAddr">${addrs.map((a) => `<option value="${esc(a.id)}">${esc(a.label)}${a.is_primary ? " (Utama)" : ""} — ${esc(a.recipient_name)}</option>`).join("")}<option value="">Isi alamat lain</option></select></div>` : ""}
        <div class="co-row2">
          <div class="field"><label class="label" for="coName">Nama penerima <span class="req">*</span></label><input class="input" id="coName" autocomplete="name" maxlength="80"><span class="field-error" data-e="name"></span></div>
          <div class="field"><label class="label" for="coPhone">Nomor HP / WhatsApp <span class="req">*</span></label><input class="input" id="coPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="08xx"><span class="field-error" data-e="phone"></span></div>
        </div>
        <div class="field"><label class="label" for="coArea">Kelurahan / kecamatan / kota <span class="req">*</span></label><div id="coAreaBox"></div><span class="field-error" data-e="area"></span></div>
        <div class="field"><label class="label" for="coLine">Alamat lengkap <span class="req">*</span></label><textarea class="input" id="coLine" rows="3" maxlength="300" placeholder="Jalan, nomor rumah, RT/RW, patokan"></textarea><span class="field-error" data-e="line"></span></div>
        <div class="co-row2">
          <div class="field"><label class="label" for="coPost">Kode pos</label><input class="input" id="coPost" inputmode="numeric" maxlength="5"><span class="field-error" data-e="post"></span></div>
          <div class="field"><label class="label" for="coNote">Catatan (opsional)</label><input class="input" id="coNote" maxlength="200" placeholder="Mis. titip di satpam"></div>
        </div>
      </div></section>

      <section class="co-sec"><h2>Pengiriman</h2>
        <div class="co-opts" role="radiogroup" aria-label="Kurir">${COURIERS.map((c) => `<label class="co-opt"><input type="radio" name="coCourier" value="${c}" ${c === st.courier ? "checked" : ""}>
          <span><b>${esc(COURIER[c])}${c === "jnt" ? '<span class="co-tag">Rekomendasi</span>' : ""}</b></span></label>`).join("")}</div>
        <div id="coRates" aria-live="polite"></div>
        <span class="field-error" data-e="ship"></span>
      </section>

      <section class="co-sec"><h2>Pembayaran</h2>
        <div class="co-sub" style="margin-top:0">Bayar ongkir</div>
        <div class="co-opts" role="radiogroup" aria-label="Bayar ongkir">
          <label class="co-opt"><input type="radio" name="coShipPay" value="tf" checked><span><b>Transfer</b></span></label>
          <label class="co-opt"><input type="radio" name="coShipPay" value="cod"><span><b>COD</b></span></label></div>
        <div class="co-sub">Bayar produk</div>
        <div class="co-opts" role="radiogroup" aria-label="Bayar produk">
          <label class="co-opt"><input type="radio" name="coProdPay" value="dana" ${st.prodPay === "dana" ? "checked" : ""} ${hasDana ? "" : "disabled"}><span><b>DANA</b>
            <small>${hasDana ? `${esc(settings.dana_number)}${settings.dana_account_name ? ` · a.n. ${esc(settings.dana_account_name)}` : ""}` : "Belum diatur admin"}</small></span></label>
          <label class="co-opt"><input type="radio" name="coProdPay" value="bank" ${st.prodPay === "bank" ? "checked" : ""} ${hasBank ? "" : "disabled"}><span><b>Rekening bank${settings.bank_name ? ` ${esc(settings.bank_name)}` : ""}</b>
            <small>${hasBank ? `${esc(settings.bank_account_number)}${settings.bank_account_holder ? ` · a.n. ${esc(settings.bank_account_holder)}` : ""}` : "Belum diatur admin"}</small></span></label></div>
        <p class="co-hint">Bukti pembayaran dikirim lewat WhatsApp setelah admin mengonfirmasi pesanan.</p>
      </section>
    </div>

    <aside class="co-aside" aria-label="Ringkasan pesanan"><h2>Ringkasan</h2>
      ${rows.map((r) => `<div class="co-li"><div class="co-li-img">${img(r.image, r.name)}</div><div style="min-width:0"><b>${esc(r.name)}</b><small>${esc(r.color)} · ${esc(r.size)} · ${r.qty}×</small></div><span class="p">${esc(rupiah(r.qty * r.price))}</span></div>`).join("")}
      <div class="co-tr" style="margin-top:6px"><span>Subtotal produk (${qtyAll})</span><b>${esc(rupiah(subtotal))}</b></div>
      <p class="co-hint">Ongkir dihitung otomatis dan tampil di invoice. Stok dikunci begitu kamu menekan Pesan.</p>
      <button class="btn btn-accent" type="button" id="coPlace">Pesan</button>
    </aside></div>`;

  const $ = (s) => body.querySelector(s);
  const setE = (k, t) => { const el = $(`[data-e="${k}"]`); if (el) el.textContent = t; };

  const picker = mountAreaPicker({ root: $("#coAreaBox"), inputId: "coArea", value: null, onChange: (sel) => { st.area = sel; setE("area", ""); getRates(); } });

  function fillFrom(a) {
    $("#coName").value = a?.recipient_name ?? profile?.full_name ?? "";
    $("#coPhone").value = a?.recipient_phone ?? profile?.phone ?? "";
    $("#coLine").value = a?.address_line ?? "";
    $("#coPost").value = a?.postal_code ?? "";
    const area = a ? { id: String(a.destination_area_id), label: a.area_label } : null;
    picker.set(area); st.area = area;
    getRates();
  }

  /* ---- ongkir ---- */
  const shipCost = () => {
    if (st.manual) { const n = Number($("#coManual")?.value); return Number.isInteger(n) && n >= 0 && $("#coManual")?.value !== "" ? n : null; }
    return st.svc >= 0 && st.services[st.svc] ? st.services[st.svc].cost : null;
  };
  const shipService = () => (st.manual ? ($("#coManualSvc")?.value.trim() || null) : st.services[st.svc]?.service ?? null);

  function paintRates() {
    const box = $("#coRates");
    // Isi manual hanya ditawarkan saat cek ongkir gagal/kosong (cadangan), bukan sebagai pilihan biasa.
    const manualLink = st.manual ? `<button class="co-link" type="button" data-manual="0">Coba cek ongkir lagi</button>`
      : (st.rate === "error" || st.rate === "empty") ? `<button class="co-link" type="button" data-manual="1">Isi ongkir manual</button>` : "";
    if (!st.area) { box.innerHTML = `<p class="co-hint">Pilih area tujuan dulu untuk melihat ongkir.</p>`; return; }
    let h = "";
    if (st.manual) {
      h = `<div class="co-sub">Ongkir manual</div><div class="co-row2">
        <div class="field"><label class="label" for="coManual">Ongkir (Rp)</label><input class="input" id="coManual" inputmode="numeric" placeholder="mis. 9000"></div>
        <div class="field"><label class="label" for="coManualSvc">Layanan (opsional)</label><input class="input" id="coManualSvc" maxlength="40" placeholder="mis. REG"></div></div>
        <div class="co-msg" data-k="info">Ongkir manual akan diperiksa admin dan bisa disesuaikan lewat revisi invoice.</div>`;
    } else if (st.rate === "loading") {
      h = `<div class="skeleton" style="height:52px;margin-top:12px"></div><div class="skeleton" style="height:52px;margin-top:8px"></div>`;
    } else if (st.rate === "ok") {
      h = `<div class="co-sub">Pilih layanan</div><div class="co-opts" role="radiogroup" aria-label="Layanan">${st.services.map((s, i) => `<label class="co-opt">
        <input type="radio" name="coSvc" value="${i}" ${i === st.svc ? "checked" : ""}><span><b>${esc(s.service)}</b><small>${esc([s.description, s.etd ? `estimasi ${s.etd}` : ""].filter(Boolean).join(" · "))}</small></span>
        <span class="co-price">${esc(rupiah(s.cost))}</span></label>`).join("")}</div>
        ${st.stale ? `<div class="co-msg" data-k="warn">Harga ongkir diambil dari data tersimpan karena layanan ongkir sedang bermasalah. Admin akan memeriksanya lagi.</div>` : ""}`;
    } else if (st.rate === "empty") {
      h = `<div class="co-msg" data-k="warn">Kurir ini tidak punya layanan untuk tujuan dan berat pesananmu. Coba kurir lain atau isi ongkir manual.</div>`;
    } else if (st.rate === "error") {
      h = `<div class="co-msg" data-k="warn" role="alert">${esc(st.err || "Cek ongkir gagal.")} <button class="co-link" type="button" data-retry-rate>Coba lagi</button></div>`;
    }
    box.innerHTML = h + (manualLink ? `<div style="margin-top:8px">${manualLink}</div>` : "");
  }

  async function getRates() {
    st.services = []; st.svc = -1; st.stale = false;
    if (!st.area) { st.rate = "idle"; paintRates(); return; }
    const my = ++seq; st.rate = "loading"; st.err = ""; paintRates();
    try {
      const r = await getShippingRates({ destination: st.area.id, courier: st.courier, items });
      if (my !== seq || isStale()) return;
      st.services = r.services ?? []; st.stale = Boolean(r.stale);
      st.rate = st.services.length ? "ok" : "empty"; st.svc = st.services.length ? 0 : -1;
    } catch (e) {
      if (my !== seq || isStale()) return;
      console.error(e); st.rate = "error"; st.err = e?.message || "Cek ongkir gagal.";
    }
    paintRates();
  }

  /* ---- event ---- */
  const ac = new AbortController();
  body.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "coAddr") fillFrom(addrs.find((a) => a.id === t.value) ?? null);
    else if (t.name === "coCourier") { st.courier = t.value; st.manual = false; getRates(); }
    else if (t.name === "coSvc") st.svc = Number(t.value);
    else if (t.name === "coShipPay") st.shipPay = t.value;
    else if (t.name === "coProdPay") st.prodPay = t.value;
  }, { signal: ac.signal });
  body.addEventListener("click", (e) => {
    const m = e.target.closest("[data-manual]");
    if (m) { st.manual = m.dataset.manual === "1"; if (st.manual) { paintRates(); $("#coManual")?.focus(); } else getRates(); return; }
    if (e.target.closest("[data-retry-rate]")) getRates();
  }, { signal: ac.signal });

  fillFrom(addrs.find((a) => a.id === st.addrId) ?? null);

  /* ---- Pesan ---- */
  $("#coPlace").addEventListener("click", async (e) => {
    ["name", "phone", "area", "line", "post", "ship"].forEach((k) => setE(k, ""));
    const name = $("#coName").value.trim(), phone = $("#coPhone").value.replace(/[\s-]/g, "");
    const line = $("#coLine").value.trim(), post = $("#coPost").value.trim(), note = $("#coNote").value.trim();
    const errs = [];
    if (!name) errs.push(["name", "Nama penerima wajib diisi.", "#coName"]);
    if (!PHONE_RE.test(phone)) errs.push(["phone", "Nomor HP tidak valid (9–15 angka).", "#coPhone"]);
    if (!st.area) errs.push(["area", "Pilih area dari hasil pencarian.", "#coArea"]);
    if (line.length < 5) errs.push(["line", "Alamat lengkap minimal 5 karakter.", "#coLine"]);
    if (post && !/^\d{5}$/.test(post)) errs.push(["post", "Kode pos harus 5 angka.", "#coPost"]);
    let cost = shipCost();
    if (st.area && cost === null) errs.push(["ship", st.manual ? "Isi nominal ongkir." : "Pilih layanan pengiriman atau isi ongkir manual.", "#coRates"]);
    if (!errs.length && !(st.prodPay === "dana" ? hasDana : hasBank)) errs.push(["ship", "Metode bayar produk belum diatur admin.", "#coRates"]);
    if (errs.length) { errs.forEach(([k, m]) => setE(k, m)); (body.querySelector(errs[0][2]) ?? $("#coRates"))?.scrollIntoView({ block: "center", behavior: "smooth" }); body.querySelector(errs[0][2])?.focus?.(); return; }

    await withLoading(e.currentTarget, async () => {
      try {
        // Ambil harga terbaru saat memesan; bila berubah dari yang ditampilkan, minta customer memeriksa ulang.
        if (!st.manual) {
          const shown = st.services[st.svc];
          const fresh = await getShippingRates({ destination: st.area.id, courier: st.courier, items, fresh: true }).catch(() => null);
          if (fresh?.services?.length) {
            const f = fresh.services.find((s) => s.service === shown.service);
            if (!f) { st.services = fresh.services; st.svc = 0; paintRates(); toast("Layanan yang kamu pilih sudah tidak tersedia. Pilih ulang layanannya.", "warning"); return; }
            if (f.cost !== shown.cost) { st.services = fresh.services; st.svc = fresh.services.indexOf(f); paintRates(); toast("Harga ongkir diperbarui. Periksa lagi lalu tekan Pesan.", "warning"); return; }
          }
        }
        cost = shipCost();
        const { data, error } = await supabase.rpc("place_order", {
          p_recipient_name: name, p_recipient_phone: phone, p_shipping_address: line,
          p_courier: st.courier, p_shipping_cost: cost,
          p_shipping_pay_method: st.shipPay, p_product_pay_method: st.prodPay,
          p_items: items, p_shipping_city: pretty(st.area.label), p_shipping_postal_code: post || null,
          p_destination_area_id: st.area.id, p_courier_service: shipService(), p_note: note || null,
        });
        if (error) throw error;
        await refreshCartCount();
        location.hash = `#/pesanan/${data}?baru=1`;
      } catch (err) {
        if (/stok/i.test(String(err?.message))) { stockDialog(err.message); return; }
        fail(err, "Pesanan gagal dibuat. Coba lagi.");
      }
    }, "Memproses…");
  });

  return () => { ac.abort(); picker.destroy(); seq++; };
}