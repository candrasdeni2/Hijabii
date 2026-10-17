// Editor produk (Admin): informasi produk, warna + foto, ukuran, dan matriks stok.
//
// Model data (001_schema.sql): products -> product_colors (+ product_color_images untuk foto tambahan)
// -> product_variants (satu baris per kombinasi warna + ukuran; di sinilah stok disimpan).
// "Ukuran" di layar ini hanyalah kemudahan form: daftar ukuran diturunkan dari baris varian, dan
// "Semua warna" berarti varian dibuat untuk setiap warna. Set ukuran boleh berbeda tiap warna.
// Angka stok = stok TERSEDIA (sudah dikurangi stok yang dikunci pesanan aktif).
import { supabase } from "../assets/js/supabase.js";
import { toast } from "../assets/js/ui.js";
import { PRODUCT_STATUS } from "../assets/js/labels.js";
import { esc, openModal, confirmDialog, modeCards, setBusy } from "./ad-ui.js";
import { imageUrl, checkImageFile, compressToWebp, uploadWebp, removeFiles } from "./produk-img.js";

const MAX_EXTRA = 5;
const NAME_MAX = 120;
const HEX_RE = /^#[0-9a-f]{6}$/i;
// product_variants tidak punya FK langsung ke products (hanya FK komposit ke product_colors), jadi di-embed lewat warna.
const SELECT = `*, product_colors(id, name, hex_code, image_path, sort_order, created_at,
  product_color_images(id, image_path, sort_order), product_variants(id, color_id, size, stock, created_at))`;

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
const key = (s) => norm(s).toLowerCase();
const intOf = (v) => { const s = String(v ?? "").trim(); return /^\d+$/.test(s) ? Number(s) : null; };
const slugify = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "produk";
const stockLevel = (n) => (n === 0 ? "zero" : n <= 5 ? "low" : "ok");

function normalize(data) {
  const colors = [...(data.product_colors ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || new Date(a.created_at) - new Date(b.created_at))
    .map((c) => ({ ...c, extras: [...(c.product_color_images ?? [])].sort((a, b) => a.sort_order - b.sort_order) }));
  const { product_colors, ...product } = data;
  const variants = (product_colors ?? []).flatMap((c) => c.product_variants ?? []);
  return { product, colors, variants };
}

/** Daftar ukuran turunan dari baris varian. */
function deriveSizes(variants) {
  const map = new Map();
  [...variants]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.size.localeCompare(b.size, "id", { numeric: true }))
    .forEach((v) => {
      const k = key(v.size);
      let s = map.get(k);
      if (!s) { s = { key: k, name: v.size, rows: [], colorIds: new Set(), total: 0 }; map.set(k, s); }
      s.rows.push(v); s.colorIds.add(v.color_id); s.total += v.stock;
    });
  return [...map.values()];
}

async function fetchProduct(id) {
  const { data, error } = await supabase.from("products").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

export async function initEditor({ root, isStale = () => false, productId }) {
  const isNew = !productId;
  root.innerHTML = `<div aria-hidden="true"><div class="ad-skel" style="width:40%;height:36px"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;

  let st = { product: null, colors: [], variants: [] };
  let loadError = null;
  const [catRes, loaded] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order").order("name"),
    isNew ? Promise.resolve(null) : fetchProduct(productId).catch((e) => { loadError = e; return null; }),
  ]);
  if (isStale()) return;
  const categories = catRes.data ?? [];

  if (!isNew && (loadError || !loaded)) {
    if (loadError) console.error(loadError);
    root.innerHTML = `<a class="ad-back" href="#/produk">← Kembali ke daftar</a>
      <div class="${loadError ? "ad-error" : "ad-empty"}" role="alert">${loadError ? "Produk gagal dimuat." : "Produk tidak ditemukan."}<br>
        ${loadError ? `<button class="btn btn-secondary btn-sm" type="button" id="retry">Coba lagi</button>` : `<a class="btn btn-secondary btn-sm" href="#/produk" style="margin-top:12px">Ke daftar produk</a>`}</div>`;
    root.querySelector("#retry")?.addEventListener("click", () => initEditor({ root, isStale, productId }));
    return;
  }
  if (loaded) st = loaded;

  /* ---------- Kerangka halaman ---------- */
  const p = st.product;
  root.innerHTML = `
    <a class="ad-back" href="#/produk">← Kembali ke daftar</a>
    <header class="ad-page-head">
      <div>
        <h1 class="ad-h1" id="pTitle">${isNew ? "Produk baru" : esc(p.name)}</h1>
        <p class="ad-sub">${isNew ? "Isi informasi dasar dulu. Warna, ukuran, dan stok bisa diisi setelah produk disimpan." : "Ubah informasi, warna, ukuran, dan stok produk."}</p>
      </div>
      ${isNew ? "" : `<button type="button" class="btn btn-danger-outline" data-act="delete-product">Hapus produk</button>`}
    </header>

    <section class="ad-card ad-sec" aria-labelledby="secInfo">
      <h2 id="secInfo">Informasi produk</h2>
      <form id="infoForm" novalidate class="ad-form">
        <div class="field"><label class="label" for="pName">Nama produk <span class="req">*</span></label>
          <input class="input" id="pName" maxlength="${NAME_MAX}" autocomplete="off" style="font-size:16px" value="${esc(p?.name ?? "")}">
          <span class="field-error" id="pNameErr"></span></div>
        <div class="ad-form-grid">
          <div class="field"><label class="label" for="pCat">Kategori</label>
            <select class="input" id="pCat" style="font-size:16px">
              <option value="">Tanpa kategori</option>
              ${categories.map((c) => `<option value="${esc(c.id)}" ${p?.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select></div>
          <div class="field"><label class="label" for="pStatus">Status</label>
            <select class="input" id="pStatus" style="font-size:16px" ${isNew ? "disabled" : ""}>
              ${(isNew ? ["draft"] : Object.keys(PRODUCT_STATUS)).map((k) => `<option value="${k}" ${(p?.status ?? "draft") === k ? "selected" : ""}>${esc(PRODUCT_STATUS[k])}</option>`).join("")}
            </select>
            <span class="ad-note">Hanya produk Aktif yang tampil dan bisa dibeli.</span>
            <span class="field-error" id="pStatusErr"></span></div>
          <div class="field"><label class="label" for="pPrice">Harga (Rp) <span class="req">*</span></label>
            <input class="input" id="pPrice" type="number" inputmode="numeric" min="0" step="1" style="font-size:16px" value="${p ? p.price : ""}">
            <span class="field-error" id="pPriceErr"></span></div>
          <div class="field"><label class="label" for="pWeight">Berat per pcs (gram) <span class="req">*</span></label>
            <input class="input" id="pWeight" type="number" inputmode="numeric" min="1" step="1" style="font-size:16px" value="${p ? p.weight_gram : ""}">
            <span class="ad-note">Berat aktual produk, dipakai menghitung ongkir.</span>
            <span class="field-error" id="pWeightErr"></span></div>
        </div>
        <div class="field"><label class="label" for="pDesc">Deskripsi</label>
          <textarea class="input" id="pDesc" rows="5" style="font-size:16px">${esc(p?.description ?? "")}</textarea></div>
        <p class="ad-note ad-note-warn" id="pMsg" role="alert" hidden></p>
        <div><button type="submit" class="btn btn-primary" id="pSubmit">${isNew ? "Buat produk" : "Simpan perubahan"}</button></div>
      </form>
    </section>

    ${isNew ? "" : `
    <section class="ad-card ad-sec" aria-labelledby="secColors">
      <div class="ad-sec-head"><h2 id="secColors">Warna</h2><button type="button" class="btn btn-secondary btn-sm" data-act="add-color">+ Tambah Warna</button></div>
      <div id="colorsEl"></div>
    </section>
    <section class="ad-card ad-sec" aria-labelledby="secSizes">
      <div class="ad-sec-head"><h2 id="secSizes">Ukuran</h2><button type="button" class="btn btn-secondary btn-sm" data-act="add-size">+ Tambah Ukuran</button></div>
      <div id="sizesEl"></div>
    </section>
    <section class="ad-card ad-sec" aria-labelledby="secStock">
      <div class="ad-sec-head"><h2 id="secStock">Stok</h2><button type="button" class="btn btn-primary btn-sm ad-stk-save-top" data-act="save-stock" disabled>Simpan stok</button></div>
      <p class="ad-note" style="margin-bottom:12px">Angka stok adalah stok tersedia (sudah dikurangi stok yang dikunci pesanan aktif). Kuning: tersisa 5 atau kurang. Merah: habis.</p>
      <div id="stockEl"></div>
      <button type="button" class="btn btn-primary ad-stk-save-bottom" data-act="save-stock" disabled>Simpan stok</button>
    </section>`}`;

  const $ = (s) => root.querySelector(s);
  const colorsEl = $("#colorsEl"), sizesEl = $("#sizesEl"), stockEl = $("#stockEl");
  const stockBtns = [...root.querySelectorAll('[data-act="save-stock"]')]; // tombol atas (desktop) dan bawah (mobile)

  /* ---------- Informasi produk ---------- */
  const activationProblem = () => {
    if (!st.colors.length) return "Tambahkan minimal satu warna sebelum mengaktifkan produk.";
    if (st.colors.some((c) => !c.image_path)) return "Setiap warna wajib punya foto utama sebelum produk diaktifkan.";
    if (!st.variants.length) return "Tambahkan minimal satu ukuran sebelum mengaktifkan produk.";
    return "";
  };

  $("#infoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = (id, t) => { $(id).textContent = t; };
    ["#pNameErr", "#pPriceErr", "#pWeightErr", "#pStatusErr"].forEach((i) => err(i, ""));
    $("#pMsg").hidden = true;

    const name = norm($("#pName").value);
    const price = intOf($("#pPrice").value), weight = intOf($("#pWeight").value);
    const status = $("#pStatus").value;
    let bad = false;
    if (!name) { err("#pNameErr", "Nama produk wajib diisi."); bad = true; }
    if (price === null || price < 1) { err("#pPriceErr", "Harga wajib diisi dengan bilangan bulat lebih dari 0."); bad = true; }
    if (weight === null || weight < 1) { err("#pWeightErr", "Berat wajib diisi dengan bilangan bulat gram (minimal 1)."); bad = true; }
    if (!isNew && status === "active" && p.status !== "active") {
      const problem = activationProblem();
      if (problem) { err("#pStatusErr", problem); bad = true; }
    }
    if (bad) return;

    const payload = { name, category_id: $("#pCat").value || null, description: $("#pDesc").value.trim() || null, price, weight_gram: weight };
    const btn = $("#pSubmit");
    setBusy(btn, true);

    if (isNew) {
      // slug unik dibuat dari nama; bila bentrok, tambahkan akhiran acak.
      let created = null, lastErr = null;
      for (let i = 0; i < 4 && !created; i++) {
        const slug = i === 0 ? slugify(name) : `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
        const { data, error } = await supabase.from("products").insert({ ...payload, slug, status: "draft" }).select("id").single();
        if (!error) created = data; else { lastErr = error; if (error.code !== "23505") break; }
      }
      if (!created) { console.error(lastErr); setBusy(btn, false); $("#pMsg").textContent = lastErr?.message || "Produk gagal dibuat."; $("#pMsg").hidden = false; return; }
      toast("Produk dibuat. Lanjutkan dengan menambah warna dan ukuran.", "success");
      location.hash = `#/produk/${created.id}`;
      return;
    }

    const { error } = await supabase.from("products").update({ ...payload, status }).eq("id", p.id);
    setBusy(btn, false);
    if (error) { console.error(error); $("#pMsg").textContent = error.message || "Perubahan gagal disimpan."; $("#pMsg").hidden = false; return; }
    st.product = { ...st.product, ...payload, status };
    $("#pTitle").textContent = name;
    toast("Produk disimpan.", "success");
  });

  if (isNew) { $("#pName").focus(); return; }

  /* ---------- Render: warna, ukuran, stok ---------- */
  const swatch = (c) => {
    const url = c.image_path ? imageUrl(c.image_path) : null;
    if (url) return `<img class="ad-thumb" src="${esc(url)}" alt="${esc(`${st.product.name} warna ${c.name}`)}" loading="lazy" width="48" height="60">`;
    if (c.hex_code && HEX_RE.test(c.hex_code)) return `<span class="ad-thumb ad-swatch" style="background:${esc(c.hex_code)}" aria-hidden="true"></span>`;
    return `<span class="ad-thumb ad-ph" aria-hidden="true"></span>`;
  };

  function renderColors() {
    if (!st.colors.length) {
      colorsEl.innerHTML = `<div class="ad-empty">Belum ada warna. Tambahkan warna pertama beserta foto utamanya.</div>`;
      return;
    }
    colorsEl.innerHTML = `<ul class="ad-colors">${st.colors.map((c) => {
      const n = st.variants.filter((v) => v.color_id === c.id).length;
      return `<li class="ad-color">
        <div>${swatch(c)}</div>
        <div class="ad-color-info">
          <div class="ad-name">${esc(c.name)}${c.hex_code && HEX_RE.test(c.hex_code) ? ` <span class="ad-hexdot" style="background:${esc(c.hex_code)}" title="${esc(c.hex_code)}"></span>` : ""}</div>
          <div class="ad-meta">${n} ukuran · ${c.extras.length} foto tambahan${c.image_path ? "" : ` · <span class="ad-warn-text">Foto utama belum ada</span>`}</div>
        </div>
        <div class="ad-cell-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-act="edit-color" data-id="${esc(c.id)}">Edit</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete-color" data-id="${esc(c.id)}">Hapus</button>
        </div></li>`;
    }).join("")}</ul>`;
  }

  function renderSizes() {
    const sizes = deriveSizes(st.variants);
    if (!sizes.length) {
      sizesEl.innerHTML = `<div class="ad-empty">${st.colors.length ? "Belum ada ukuran. Tambahkan ukuran (mis. S, M, L atau All Size)." : "Tambahkan warna dulu, lalu ukurannya."}</div>`;
      return;
    }
    sizesEl.innerHTML = `<ul class="ad-colors">${sizes.map((s) => {
      const all = st.colors.length > 0 && st.colors.every((c) => s.colorIds.has(c.id));
      const scope = all ? "Semua warna" : `Warna: ${st.colors.filter((c) => s.colorIds.has(c.id)).map((c) => c.name).join(", ")}`;
      return `<li class="ad-color ad-size">
        <div class="ad-color-info">
          <div class="ad-name">${esc(s.name)}</div>
          <div class="ad-meta">${esc(scope)} · Total stok ${s.total}</div>
        </div>
        <div class="ad-cell-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-act="edit-size" data-key="${esc(s.key)}">Edit</button>
          <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete-size" data-key="${esc(s.key)}">Hapus</button>
        </div></li>`;
    }).join("")}</ul>`;
  }

  function renderStock() {
    const sizes = deriveSizes(st.variants);
    if (!st.colors.length || !sizes.length) {
      stockEl.innerHTML = `<div class="ad-empty">Stok bisa diisi setelah ada warna dan ukuran.</div>`;
      syncStockBtn();
      return;
    }
    const vmap = new Map(st.variants.map((v) => [`${v.color_id}|${key(v.size)}`, v]));
    stockEl.innerHTML = `<div class="ad-stk" style="--n:${sizes.length}">
      <div class="ad-stk-head" aria-hidden="true"><span></span>${sizes.map((s) => `<span>${esc(s.name)}</span>`).join("")}</div>
      ${st.colors.map((c) => `<div class="ad-stk-row">
        <div class="ad-stk-name">${esc(c.name)}</div>
        <div class="ad-stk-cells">${sizes.map((s) => {
          const v = vmap.get(`${c.id}|${s.key}`);
          return v
            ? `<label class="ad-stk-cell"><span class="ad-stk-size">${esc(s.name)}</span>
                <input type="number" inputmode="numeric" min="0" max="99999" step="1" value="${v.stock}" data-vid="${esc(v.id)}" data-orig="${v.stock}"
                  data-level="${stockLevel(v.stock)}" aria-label="Stok ${esc(c.name)} ukuran ${esc(s.name)}"></label>`
            : `<div class="ad-stk-cell is-na"><span class="ad-stk-size">${esc(s.name)}</span><span class="ad-stk-na" role="img" aria-label="Tidak tersedia"><span class="ad-stk-na-txt">tidak tersedia</span></span></div>`;
        }).join("")}</div>${(() => {
          const na = sizes.filter((s) => !vmap.has(`${c.id}|${s.key}`));
          return na.length ? `<div class="ad-stk-nalist">Tidak tersedia: ${na.map((s) => esc(s.name)).join(", ")}</div>` : "";
        })()}</div>`).join("")}</div>`;
    syncStockBtn();
  }

  const dirtyInputs = () => [...stockEl.querySelectorAll("input[data-vid]")].filter((i) => i.value !== i.dataset.orig);
  function syncStockBtn() { const none = dirtyInputs().length === 0; stockBtns.forEach((b) => { b.disabled = none; }); }

  stockEl.addEventListener("input", (e) => {
    const i = e.target.closest("input[data-vid]");
    if (!i) return;
    const n = intOf(i.value);
    i.dataset.level = n === null ? "ok" : stockLevel(n);
    i.classList.toggle("is-dirty", i.value !== i.dataset.orig);
    i.removeAttribute("aria-invalid");
    syncStockBtn();
  });

  async function saveStock() {
    const dirty = dirtyInputs();
    if (!dirty.length) return;
    const items = []; let bad = false;
    for (const i of dirty) {
      const n = intOf(i.value);
      if (n === null || n > 99999) { i.setAttribute("aria-invalid", "true"); bad = true; } else items.push({ id: i.dataset.vid, stock: n });
    }
    if (bad) { toast("Stok harus bilangan bulat 0 sampai 99.999.", "error"); return; }
    stockBtns.forEach((b) => setBusy(b, true));
    const results = await Promise.all(items.map((it) => supabase.from("product_variants").update({ stock: it.stock }).eq("id", it.id)));
    stockBtns.forEach((b) => setBusy(b, false));
    const failed = results.filter((r) => r.error);
    if (failed.length) { console.error(failed[0].error); toast(`${failed.length} stok gagal disimpan.`, "error"); }
    else toast("Stok disimpan.", "success");
    await refresh();
  }

  /** Muat ulang data varian lalu render ulang; stok yang belum disimpan dipertahankan. */
  async function refresh() {
    const pending = new Map(dirtyInputs().map((i) => [i.dataset.vid, i.value]));
    try {
      const fresh = await fetchProduct(st.product.id);
      if (isStale()) return;
      if (!fresh) { location.hash = "#/produk"; return; }
      st = { ...fresh, product: { ...st.product, ...fresh.product } };
    } catch (e) { console.error(e); toast("Data gagal dimuat ulang.", "error"); return; }
    renderColors(); renderSizes(); renderStock();
    pending.forEach((val, vid) => {
      const inp = stockEl.querySelector(`input[data-vid="${CSS.escape(vid)}"]`);
      if (inp) { inp.value = val; inp.dispatchEvent(new Event("input", { bubbles: true })); }
    });
  }

  /* ---------- Dialog warna (+ foto) ---------- */
  function colorDialog(color) {
    const editing = Boolean(color);
    const sizes = deriveSizes(st.variants);
    const urls = [];
    let main = color?.image_path ? { kind: "existing", path: color.image_path, url: imageUrl(color.image_path) } : null;
    let extras = (color?.extras ?? []).map((x) => ({ kind: "existing", id: x.id, path: x.image_path, url: imageUrl(x.image_path) }));
    const removedExtras = [];

    const m = openModal({
      title: editing ? "Ubah warna" : "Tambah warna",
      onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
      html: `
        <form id="clForm" novalidate>
          <div class="field"><label class="label" for="clName">Nama warna <span class="req">*</span></label>
            <input class="input" id="clName" maxlength="40" autocomplete="off" style="font-size:16px" value="${esc(color?.name ?? "")}" placeholder="mis. Mocca">
            <span class="field-error" id="clNameErr"></span></div>
          <div class="field"><label class="label" for="clHex">Kode warna (opsional)</label>
            <div class="ad-hex">
              <input type="color" id="clHexPick" value="${color?.hex_code && HEX_RE.test(color.hex_code) ? esc(color.hex_code) : "#a98b7c"}" aria-label="Pilih warna">
              <input class="input" id="clHex" maxlength="7" autocomplete="off" spellcheck="false" style="font-size:16px" placeholder="#A98B7C" value="${esc(color?.hex_code ?? "")}">
            </div>
            <span class="ad-note">Dipakai sebagai swatch cadangan bila foto belum ada.</span>
            <span class="field-error" id="clHexErr"></span></div>
          <div class="field"><span class="label">Foto utama <span class="req">*</span></span>
            <div class="ad-photo-main"><div class="ad-photo-box" id="clMainBox"></div>
              <button type="button" class="btn btn-secondary btn-sm" id="clMainPick"></button></div>
            <input type="file" id="clMainFile" accept="image/*" hidden>
            <span class="field-error" id="clMainErr"></span></div>
          <div class="field"><span class="label">Foto tambahan (opsional, maksimal ${MAX_EXTRA})</span>
            <div class="ad-photo-grid" id="clExtras"></div>
            <input type="file" id="clExtraFile" accept="image/*" multiple hidden>
            <span class="field-error" id="clExtraErr"></span></div>
          ${!editing && sizes.length ? `
          <fieldset class="ad-checks"><legend class="label">Ukuran untuk warna ini</legend>
            ${sizes.map((s) => `<label class="ad-check"><input type="checkbox" name="clSize" value="${esc(s.name)}" ${st.colors.length === 0 || st.colors.every((c) => s.colorIds.has(c.id)) ? "checked" : ""}> ${esc(s.name)}</label>`).join("")}
          </fieldset>` : ""}
          <p class="ad-note">Foto dikompres otomatis ke WebP (maksimal 1200 px dan 2 MB) sebelum diunggah.</p>
          <p class="ad-note ad-note-warn" id="clMsg" role="alert" hidden></p>
          <div id="clProgWrap" hidden><progress id="clProg" max="1" value="0" style="width:100%"></progress><span class="ad-note" id="clProgTxt"></span></div>
          <div class="ad-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="clSubmit">${editing ? "Simpan" : "Tambah warna"}</button>
          </div>
        </form>`,
    });
    const q = (s) => m.el.querySelector(s);
    const setErr = (id, t) => { q(id).textContent = t; };

    const drawMain = () => {
      q("#clMainBox").innerHTML = main ? `<img src="${esc(main.url)}" alt="Foto utama">` : `<span>Belum ada foto</span>`;
      q("#clMainPick").textContent = main ? "Ganti foto" : "Pilih foto";
    };
    const drawExtras = () => {
      q("#clExtras").innerHTML = extras.map((x, i) => `<div class="ad-photo-thumb"><img src="${esc(x.url)}" alt="Foto tambahan ${i + 1}">
        <button type="button" data-rm="${i}" aria-label="Hapus foto tambahan ${i + 1}">×</button></div>`).join("")
        + (extras.length < MAX_EXTRA ? `<button type="button" class="ad-photo-add" id="clExtraAdd" aria-label="Tambah foto tambahan">+</button>` : "");
    };
    const fromFile = (file) => { const url = URL.createObjectURL(file); urls.push(url); return { kind: "new", file, url }; };
    drawMain(); drawExtras();

    q("#clMainPick").addEventListener("click", () => q("#clMainFile").click());
    q("#clMainBox").addEventListener("click", () => q("#clMainFile").click());
    q("#clMainFile").addEventListener("change", (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      const bad = checkImageFile(f);
      if (bad) { setErr("#clMainErr", bad); return; }
      setErr("#clMainErr", ""); main = fromFile(f); drawMain();
    });
    q("#clExtras").addEventListener("click", (e) => {
      if (e.target.closest("#clExtraAdd")) { q("#clExtraFile").click(); return; }
      const rm = e.target.closest("[data-rm]");
      if (!rm) return;
      const x = extras.splice(Number(rm.dataset.rm), 1)[0];
      if (x?.kind === "existing") removedExtras.push(x.id);
      setErr("#clExtraErr", ""); drawExtras();
    });
    q("#clExtraFile").addEventListener("change", (e) => {
      const files = [...e.target.files]; e.target.value = "";
      let msg = "";
      for (const f of files) {
        if (extras.length >= MAX_EXTRA) { msg = `Maksimal ${MAX_EXTRA} foto tambahan.`; break; }
        const bad = checkImageFile(f);
        if (bad) { msg = bad; continue; }
        extras.push(fromFile(f));
      }
      setErr("#clExtraErr", msg); drawExtras();
    });

    // kode hex: kotak teks adalah sumber kebenaran, pemilih warna hanya membantu
    q("#clHexPick").addEventListener("input", (e) => { q("#clHex").value = e.target.value.toUpperCase(); setErr("#clHexErr", ""); });
    q("#clHex").addEventListener("input", (e) => {
      const v = e.target.value.trim(); const withHash = v && !v.startsWith("#") ? `#${v}` : v;
      if (HEX_RE.test(withHash)) q("#clHexPick").value = withHash.toLowerCase();
      setErr("#clHexErr", "");
    });

    q("#clForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      ["#clNameErr", "#clHexErr", "#clMainErr"].forEach((i) => setErr(i, ""));
      q("#clMsg").hidden = true;
      const name = norm(q("#clName").value);
      let hex = q("#clHex").value.trim();
      if (hex && !hex.startsWith("#")) hex = `#${hex}`;
      let bad = false;
      if (!name) { setErr("#clNameErr", "Nama warna wajib diisi."); bad = true; }
      else if (st.colors.some((c) => c.id !== color?.id && key(c.name) === key(name))) { setErr("#clNameErr", "Nama warna sudah dipakai di produk ini."); bad = true; }
      if (hex && !HEX_RE.test(hex)) { setErr("#clHexErr", "Format kode warna harus seperti #A98B7C."); bad = true; }
      if (!main) { setErr("#clMainErr", "Foto utama wajib diisi."); bad = true; }
      if (bad) return;

      const btn = q("#clSubmit");
      setBusy(btn, true);
      const newFiles = [main, ...extras].filter((x) => x.kind === "new").length;
      let done = 0;
      const prog = q("#clProgWrap");
      const tick = () => { q("#clProg").value = newFiles ? done / newFiles : 1; q("#clProgTxt").textContent = `Mengunggah foto ${Math.min(done + 1, newFiles)} dari ${newFiles}…`; };
      if (newFiles) { prog.hidden = false; tick(); }

      const folder = `products/${st.product.id}`;
      const uploaded = [];
      const upload = async (item) => {
        const path = await uploadWebp(await compressToWebp(item.file), folder);
        uploaded.push(path); done++; if (newFiles) tick();
        return path;
      };
      const fail = (msg) => { setBusy(btn, false); prog.hidden = true; q("#clMsg").textContent = msg; q("#clMsg").hidden = false; };

      try {
        // 1) unggah foto baru
        const mainPath = main.kind === "new" ? await upload(main) : main.path;
        const newExtraPaths = [];
        for (const x of extras) if (x.kind === "new") newExtraPaths.push(await upload(x));

        if (!editing) {
          // 2a) buat warna + foto tambahan + varian
          const nextOrder = st.colors.reduce((mx, c) => Math.max(mx, c.sort_order ?? 0), -1) + 1;
          const { data: col, error } = await supabase.from("product_colors")
            .insert({ product_id: st.product.id, name, hex_code: hex ? hex.toUpperCase() : null, image_path: mainPath, sort_order: nextOrder }).select("id").single();
          if (error) throw Object.assign(error, { _field: error.code === "23505" ? "name" : "" });
          try {
            if (newExtraPaths.length) {
              const { error: e2 } = await supabase.from("product_color_images").insert(newExtraPaths.map((path, i) => ({ color_id: col.id, image_path: path, sort_order: i })));
              if (e2) throw e2;
            }
            const chosen = [...m.el.querySelectorAll('input[name="clSize"]:checked')].map((i) => i.value);
            if (chosen.length) {
              const { error: e3 } = await supabase.from("product_variants").insert(chosen.map((size) => ({ product_id: st.product.id, color_id: col.id, size, stock: 0 })));
              if (e3) throw e3;
            }
          } catch (inner) {
            await supabase.from("product_colors").delete().eq("id", col.id); // batalkan warna setengah jadi
            throw inner;
          }
        } else {
          // 2b) ubah warna; foto utama lama masuk antrean hapus lewat trigger
          const patch = { name, hex_code: hex ? hex.toUpperCase() : null };
          if (mainPath !== color.image_path) patch.image_path = mainPath;
          const { error } = await supabase.from("product_colors").update(patch).eq("id", color.id);
          if (error) throw Object.assign(error, { _field: error.code === "23505" ? "name" : "" });
          if (removedExtras.length) {
            const { error: e2 } = await supabase.from("product_color_images").delete().in("id", removedExtras);
            if (e2) throw e2;
          }
          if (newExtraPaths.length) {
            const base = color.extras.reduce((mx, x) => Math.max(mx, x.sort_order ?? 0), -1) + 1;
            const { error: e3 } = await supabase.from("product_color_images").insert(newExtraPaths.map((path, i) => ({ color_id: color.id, image_path: path, sort_order: base + i })));
            if (e3) throw e3;
          }
        }
        toast(editing ? "Warna diperbarui." : "Warna ditambahkan.", "success");
        m.close();
        refresh();
      } catch (ex) {
        console.error(ex);
        await removeFiles(uploaded); // file yang sudah terunggah tetapi tidak tersimpan
        if (ex._field === "name") { setBusy(btn, false); prog.hidden = true; setErr("#clNameErr", "Nama warna sudah dipakai di produk ini."); }
        else fail(ex.message || "Warna gagal disimpan.");
      }
    });
  }

  /* ---------- Dialog ukuran ---------- */
  function sizeDialog(size) {
    if (!st.colors.length) { toast("Tambahkan warna lebih dulu.", "error"); return; }
    const editing = Boolean(size);
    const allNow = editing ? st.colors.every((c) => size.colorIds.has(c.id)) : true;
    const m = openModal({
      title: editing ? "Ubah ukuran" : "Tambah ukuran",
      size: "sm",
      html: `
        <form id="szForm" novalidate>
          <div class="field"><label class="label" for="szName">Nama ukuran <span class="req">*</span></label>
            <input class="input" id="szName" maxlength="20" autocomplete="off" style="font-size:16px" value="${esc(size?.name ?? "")}" placeholder="mis. M atau All Size">
            <span class="field-error" id="szNameErr"></span></div>
          ${modeCards("szScope", [
            { v: "all", t: "Semua warna", d: "Ukuran ini tersedia di semua warna.", checked: allNow },
            { v: "some", t: "Warna tertentu saja", d: "Pilih warna yang punya ukuran ini.", checked: !allNow },
          ])}
          <fieldset class="ad-checks" id="szColors" ${allNow ? "hidden" : ""}><legend class="label">Warna</legend>
            ${st.colors.map((c) => `<label class="ad-check"><input type="checkbox" name="szColor" value="${esc(c.id)}" ${editing && size.colorIds.has(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}
            <span class="field-error" id="szColorsErr"></span>
          </fieldset>
          <p class="ad-note">Ukuran baru dimulai dengan stok 0. Isi stoknya di bagian Stok.</p>
          <p class="ad-note ad-note-warn" id="szMsg" role="alert" hidden></p>
          <div class="ad-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="szSubmit">${editing ? "Simpan" : "Tambah ukuran"}</button>
          </div>
        </form>`,
    });
    const q = (s) => m.el.querySelector(s);
    const form = q("#szForm");
    form.addEventListener("change", () => { q("#szColors").hidden = form.szScope.value !== "some"; });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      q("#szNameErr").textContent = ""; q("#szColorsErr").textContent = ""; q("#szMsg").hidden = true;
      const name = norm(q("#szName").value);
      const scopeAll = form.szScope.value === "all";
      const desired = new Set(scopeAll ? st.colors.map((c) => c.id) : [...form.querySelectorAll('input[name="szColor"]:checked')].map((i) => i.value));
      let bad = false;
      if (!name) { q("#szNameErr").textContent = "Nama ukuran wajib diisi."; bad = true; }
      else if (deriveSizes(st.variants).some((s) => s.key !== size?.key && s.key === key(name))) { q("#szNameErr").textContent = "Nama ukuran sudah ada."; bad = true; }
      if (!desired.size) { q("#szColorsErr").textContent = "Pilih minimal satu warna."; bad = true; }
      if (bad) return;

      const existing = new Map((size?.rows ?? []).map((r) => [r.color_id, r]));
      const toAdd = [...desired].filter((id) => !existing.has(id));
      const toRemove = [...existing.values()].filter((r) => !desired.has(r.color_id));
      const toKeep = [...existing.values()].filter((r) => desired.has(r.color_id));

      if (toRemove.some((r) => r.stock > 0)) {
        const ok = await confirmDialog({
          title: "Hapus ukuran dari warna?",
          message: `${toRemove.filter((r) => r.stock > 0).length} kombinasi masih punya stok dan akan ikut dihapus. Lanjutkan?`,
          confirmLabel: "Ya, hapus", danger: true,
        });
        if (!ok) return;
      }

      const btn = q("#szSubmit");
      setBusy(btn, true);
      try {
        if (toRemove.length) {
          const { error } = await supabase.from("product_variants").delete().in("id", toRemove.map((r) => r.id));
          if (error) throw error;
        }
        if (editing && name !== size.name && toKeep.length) {
          const { error } = await supabase.from("product_variants").update({ size: name }).in("id", toKeep.map((r) => r.id));
          if (error) throw error;
        }
        if (toAdd.length) {
          const { error } = await supabase.from("product_variants").insert(toAdd.map((color_id) => ({ product_id: st.product.id, color_id, size: name, stock: 0 })));
          if (error) throw error;
        }
        toast(editing ? "Ukuran diperbarui." : "Ukuran ditambahkan.", "success");
        m.close();
        refresh();
      } catch (ex) {
        console.error(ex);
        setBusy(btn, false);
        q("#szMsg").textContent = ex.code === "23505" ? "Nama ukuran bentrok dengan ukuran lain pada warna yang sama." : (ex.message || "Ukuran gagal disimpan.");
        q("#szMsg").hidden = false;
        refresh();
      }
    });
  }

  /* ---------- Hapus ---------- */
  async function deleteColor(c) {
    const n = st.variants.filter((v) => v.color_id === c.id);
    const stock = n.reduce((s, v) => s + v.stock, 0);
    const ok = await confirmDialog({
      title: "Hapus warna?",
      message: `Warna “${c.name}” akan dihapus beserta ${n.length} ukuran (total stok ${stock}) dan semua fotonya. Riwayat pesanan tetap tersimpan.`,
      confirmLabel: "Hapus", danger: true,
      onConfirm: async () => { const { error } = await supabase.from("product_colors").delete().eq("id", c.id); if (error) throw error; },
    });
    if (ok) { toast("Warna dihapus.", "success"); refresh(); }
  }

  async function deleteSize(s) {
    const ok = await confirmDialog({
      title: "Hapus ukuran?",
      message: `Ukuran “${s.name}” akan dihapus dari ${s.rows.length} warna (total stok ${s.total}).`,
      confirmLabel: "Hapus", danger: true,
      onConfirm: async () => { const { error } = await supabase.from("product_variants").delete().in("id", s.rows.map((r) => r.id)); if (error) throw error; },
    });
    if (ok) { toast("Ukuran dihapus.", "success"); refresh(); }
  }

  async function deleteProduct() {
    const ok = await confirmDialog({
      title: "Hapus produk?",
      message: `“${st.product.name}” akan dihapus permanen beserta semua warna, ukuran, stok, foto, dan ulasannya. Riwayat pesanan tetap tersimpan. Bila hanya ingin menyembunyikan dari toko, ubah statusnya menjadi Arsip.`,
      confirmLabel: "Hapus permanen", danger: true,
      onConfirm: async () => { const { error } = await supabase.from("products").delete().eq("id", st.product.id); if (error) throw error; },
    });
    if (ok) { toast("Produk dihapus.", "success"); location.hash = "#/produk"; }
  }

  /* ---------- Event ---------- */
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case "add-color": colorDialog(null); break;
      case "edit-color": colorDialog(st.colors.find((c) => c.id === b.dataset.id)); break;
      case "delete-color": deleteColor(st.colors.find((c) => c.id === b.dataset.id)); break;
      case "add-size": sizeDialog(null); break;
      case "edit-size": sizeDialog(deriveSizes(st.variants).find((s) => s.key === b.dataset.key)); break;
      case "delete-size": deleteSize(deriveSizes(st.variants).find((s) => s.key === b.dataset.key)); break;
      case "save-stock": saveStock(); break;
      case "delete-product": deleteProduct(); break;
    }
  });

  renderColors(); renderSizes(); renderStock();
}