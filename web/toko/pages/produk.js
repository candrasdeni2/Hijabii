// Detail produk: galeri per warna, pemilih warna (foto), ukuran (sesuai warna terpilih), jumlah, stok per varian, rating + ulasan.
// Validasi stok saat tambah ke keranjang (addToCart). Tombol Pesan = tambah ke keranjang lalu buka checkout.
import { loadProductBySlug, loadReviews, getSettings, waLink, addToCart, me, isCustomer, goLogin, goBack, fail, UserError,
  rupiah, esc, img, hexOk, stars, toast, withLoading, copyText, emptyState, errorBox, dateWIB, ICON } from "../tk-lib.js";

const LOW = 5, REV_PAGE = 10;

export async function init({ root, parts, isStale }) {
  const slug = parts[0];
  root.innerHTML = `<div class="tk-wrap"><div class="tk-pd" aria-hidden="true"><div class="skeleton" style="aspect-ratio:4/5;border-radius:20px"></div><div><div class="skeleton tk-sk" style="height:40px;width:70%"></div><div class="skeleton tk-sk" style="width:30%"></div><div class="skeleton tk-sk" style="height:60px"></div></div></div></div>`;
  let p;
  try { p = slug ? await loadProductBySlug(slug) : null; }
  catch (e) {
    console.error(e);
    if (isStale()) return;
    root.innerHTML = `<div class="tk-wrap">${errorBox()}</div>`;
    root.querySelector("[data-retry]").addEventListener("click", () => init({ root, parts, isStale }));
    return;
  }
  if (isStale()) return;
  if (!p) { root.innerHTML = `<div class="tk-wrap">${emptyState("Produk tidak ditemukan", "Produk ini tidak tersedia atau sudah tidak dijual.", "#/katalog", "Lihat koleksi")}</div>`; return; }
  document.title = `${p.name} — Hijabii by Intan`;

  const st = { color: Math.max(0, p.colors.findIndex((c) => c.stock > 0)), variant: null, qty: 1, img: 0, hint: "" };
  const col = () => p.colors[st.color];
  const variant = () => col()?.variants.find((v) => v.id === st.variant) ?? null;
  const photos = () => { const c = col(); return c ? [c.image, ...(c.extra ?? [])].filter(Boolean) : []; };
  const settings = await getSettings().catch(() => ({}));
  if (isStale()) return;
  const wa = waLink(settings, `Halo Hijabii, saya mau tanya produk ${p.name}.`);
  const canShop = !me.profile || isCustomer();

  root.innerHTML = `<div class="tk-wrap">
    <div class="tk-pd">
      <div class="tk-gal">
        <div class="tk-gal-main" id="pGal">
          <div class="tk-gal-top"><button type="button" class="tk-rbtn" id="pBack" aria-label="Kembali">${ICON.back}</button><button type="button" class="tk-rbtn" id="pShare" aria-label="Bagikan">${ICON.share}</button></div>
          <div id="pImg" style="width:100%;height:100%"></div>
          <button type="button" class="tk-gal-nav is-prev" id="pPrev" aria-label="Foto sebelumnya">${ICON.back}</button>
          <button type="button" class="tk-gal-nav is-next" id="pNext" aria-label="Foto berikutnya">${ICON.next}</button>
          <span class="tk-gal-count" id="pCount" hidden></span>
        </div>
        <div class="tk-thumbs" id="pThumbs"></div>
      </div>
      <div class="tk-pd-info">
        <h1>${esc(p.name)}</h1>
        <p class="tk-pd-price">${esc(rupiah(p.price))}</p>
        ${p.count > 0 ? `<a class="tk-rate" href="#" id="pRateLink" style="text-decoration:none"><span class="tk-star" aria-hidden="true">${stars(p.avg)}</span><span>${p.avg.toFixed(1)}</span><span class="tk-muted">(${p.count} ulasan)</span></a>` : ""}
        <span class="tk-label" id="pColorLbl"></span><div class="tk-sws" id="pSws" role="group" aria-labelledby="pColorLbl"></div>
        <span class="tk-label" id="pSizeLbl">Ukuran</span><div class="tk-sizes" id="pSizes" role="group" aria-labelledby="pSizeLbl"></div>
        <p class="tk-hint" id="pHint" role="status" hidden></p>
        <span class="tk-label">Jumlah</span>
        <div><div class="tk-qty"><button type="button" id="pMinus" aria-label="Kurangi jumlah">−</button><output id="pQty" aria-live="polite">1</output><button type="button" id="pPlus" aria-label="Tambah jumlah">+</button></div><span class="tk-stock" id="pStock"></span></div>
        <p class="tk-small tk-muted" style="margin:14px 0 0">Warna pada foto bisa sedikit berbeda karena pencahayaan.</p>
        ${canShop ? "" : `<p class="tk-note" style="margin-top:16px">Akun admin tidak bisa berbelanja.</p>`}
        <div class="tk-cta"><button class="btn btn-secondary" type="button" data-act="cart">+ Keranjang</button><button class="btn btn-accent" type="button" data-act="buy">Pesan</button></div>
        ${p.description ? `<hr class="tk-sep"><h2 class="tk-h2" style="font-size:22px;margin-bottom:10px">Deskripsi</h2><p class="tk-desc">${esc(p.description)}</p>` : ""}
      </div>
    </div>
    <section id="pReviews" style="margin-top:40px" aria-labelledby="pRevT"><hr class="tk-sep"><h2 class="tk-h2" id="pRevT">Ulasan</h2><div id="pRevBody" style="margin-top:14px"></div></section>
  </div>
  <div class="tk-sticky">${wa ? `<a class="tk-wa-ico" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Tanya admin lewat WhatsApp">${ICON.chat}</a>` : ""}
    <button class="btn btn-secondary" type="button" data-act="cart">+ Keranjang</button><button class="btn btn-accent" type="button" data-act="buy">Pesan</button></div>`;
  const $ = (s) => root.querySelector(s);

  /* ---------- tampilan ---------- */
  function paintGallery() {
    const list = photos(), i = Math.min(st.img, Math.max(0, list.length - 1));
    st.img = i;
    $("#pImg").innerHTML = img(list[i] ?? null, `${p.name} ${col()?.name ?? ""}`, { eager: true });
    $("#pCount").hidden = list.length < 2; $("#pCount").textContent = `${i + 1} / ${list.length}`;
    ["#pPrev", "#pNext"].forEach((s) => $(s).classList.toggle("is-on", list.length > 1));
    $("#pThumbs").innerHTML = list.length > 1 ? list.map((path, n) => `<button type="button" data-i="${n}" aria-label="Foto ${n + 1}" ${n === i ? 'aria-current="true"' : ""}>${img(path, "")}</button>`).join("") : "";
  }
  function paintColors() {
    const c = col();
    $("#pColorLbl").innerHTML = `Warna: <b>${esc(c?.name ?? "-")}</b>`;
    $("#pSws").innerHTML = p.colors.map((x, i) => {
      const out = x.stock <= 0;
      return `<button type="button" class="tk-sw${x.image ? "" : " is-hex"}${out ? " is-out" : ""}" data-c="${i}" aria-pressed="${i === st.color}" aria-label="${esc(x.name)}${out ? ", habis" : ""}" title="${esc(x.name)}${out ? " (habis)" : ""}" ${out ? "disabled" : ""}
        ${x.image ? "" : `style="background:${hexOk(x.hex)}"`}>${x.image ? img(x.image, x.name) : ""}</button>`;
    }).join("");
  }
  function paintSizes() {
    const c = col();
    $("#pSizes").innerHTML = (c?.variants ?? []).map((v) => `<button type="button" class="tk-size" data-v="${esc(v.id)}" aria-pressed="${v.id === st.variant}" ${v.stock <= 0 ? "disabled" : ""}
      aria-label="Ukuran ${esc(v.size)}${v.stock <= 0 ? ", habis" : v.stock <= LOW ? `, sisa ${v.stock}` : ""}">${esc(v.size)}${v.stock > 0 && v.stock <= LOW ? `<span class="tk-sisa">sisa ${v.stock}</span>` : ""}</button>`).join("")
      || `<span class="tk-muted tk-small">Belum ada ukuran.</span>`;
    const h = $("#pHint"); h.hidden = !st.hint; h.textContent = st.hint;
  }
  function paintQty() {
    const v = variant(), max = v ? v.stock : 0;
    st.qty = v ? Math.min(Math.max(1, st.qty), Math.max(1, max)) : 1;
    $("#pQty").textContent = String(st.qty);
    $("#pMinus").disabled = !v || st.qty <= 1;
    $("#pPlus").disabled = !v || st.qty >= max;
    const s = $("#pStock");
    s.className = `tk-stock${v && v.stock <= LOW ? " is-low" : ""}`;
    s.textContent = !v ? "Pilih ukuran dulu" : v.stock <= LOW ? `Sisa ${v.stock}` : `Stok ${v.stock}`;
    const ok = Boolean(v) && st.qty >= 1 && st.qty <= max && canShop;
    root.querySelectorAll("[data-act]").forEach((b) => { b.disabled = !ok; });
  }
  const paintAll = () => { paintGallery(); paintColors(); paintSizes(); paintQty(); };

  /* ---------- interaksi ---------- */
  function pickColor(i) {
    const next = p.colors[i];
    if (!next || next.stock <= 0 || i === st.color) return;
    const prev = variant();
    st.color = i; st.img = 0; st.hint = "";
    if (prev) {
      const same = next.variants.find((v) => v.size === prev.size && v.stock > 0);
      if (same) st.variant = same.id;
      else { st.variant = null; st.hint = `Ukuran ${prev.size} tidak tersedia di warna ${next.name}. Pilih ukuran lain.`; }
    }
    paintAll();
  }
  // root (#view) dipakai ulang antar halaman: pendengar WAJIB dilepas saat pindah halaman (shell memanggil fungsi yang dikembalikan init)
  const ac = new AbortController();
  root.addEventListener("click", async (e) => {
    const t = e.target;
    const c = t.closest("[data-c]"); if (c) return pickColor(Number(c.dataset.c));
    const z = t.closest("[data-v]"); if (z && !z.disabled) { st.variant = z.dataset.v; st.hint = ""; st.qty = 1; paintSizes(); paintQty(); return; }
    const th = t.closest("[data-i]"); if (th) { st.img = Number(th.dataset.i); paintGallery(); return; }
    if (t.closest("#pPrev")) { const n = photos().length; st.img = (st.img - 1 + n) % n; return paintGallery(); }
    if (t.closest("#pNext")) { const n = photos().length; st.img = (st.img + 1) % n; return paintGallery(); }
    if (t.closest("#pMinus")) { st.qty -= 1; return paintQty(); }
    if (t.closest("#pPlus")) { st.qty += 1; return paintQty(); }
    if (t.closest("#pBack")) return goBack();
    if (t.closest("#pShare")) {
      const url = location.href;
      if (navigator.share) { try { await navigator.share({ title: p.name, url }); } catch { /* dibatalkan */ } }
      else toast((await copyText(url)) ? "Tautan disalin." : "Gagal menyalin tautan.", "info");
      return;
    }
    const rl = t.closest("#pRateLink"); if (rl) { e.preventDefault(); $("#pReviews").scrollIntoView({ behavior: "smooth" }); return; }
    const act = t.closest("[data-act]");
    if (act && !act.disabled) {
      if (!me.profile) { goLogin(); return; }
      if (!isCustomer()) { toast("Akun admin tidak bisa berbelanja.", "warning"); return; }
      const v = variant(); if (!v) return;
      const buy = act.dataset.act === "buy";
      try {
        await withLoading(act, () => addToCart(v.id, st.qty), buy ? "Menyiapkan…" : "Menambahkan…");
        if (buy) location.hash = "#/checkout";
        else { toast(`${p.name} (${col().name}, ${v.size}) masuk keranjang.`, "success"); st.qty = 1; paintQty(); }
      } catch (err) { fail(err, "Gagal menambahkan ke keranjang."); }
    }
  }, { signal: ac.signal });
  // geser foto di layar sentuh
  let x0 = null;
  const gal = $("#pGal");
  gal.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  gal.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    const n = photos().length; if (Math.abs(dx) < 40 || n < 2) return;
    st.img = (st.img + (dx < 0 ? 1 : -1) + n) % n; paintGallery();
  }, { passive: true });
  paintAll();

  /* ---------- ulasan ---------- */
  const revBody = $("#pRevBody");
  let loaded = 0;
  async function loadMore(first = false) {
    try {
      const rows = await loadReviews(p.id, loaded, loaded + REV_PAGE - 1);
      if (isStale()) return;
      if (first) {
        revBody.innerHTML = p.count > 0 ? `<div class="tk-avg"><b>${p.avg.toFixed(1)}</b><span><span class="tk-star">${stars(p.avg)}</span><br><span class="tk-muted tk-small">${p.count} ulasan</span></span></div><div class="tk-revs" id="pRevList"></div><div class="tk-more" id="pRevMore" hidden><button class="btn btn-secondary btn-sm" type="button">Lihat ulasan lainnya</button></div>`
          : `<p class="tk-muted">Belum ada ulasan untuk produk ini.</p>`;
        revBody.querySelector("#pRevMore button")?.addEventListener("click", () => loadMore());
      }
      const list = revBody.querySelector("#pRevList");
      if (list) list.insertAdjacentHTML("beforeend", rows.map((r) => `<article class="tk-rev"><div class="tk-rev-top"><span><b style="color:var(--ink)">${esc(r.display_name)}</b> · <span class="tk-star" aria-label="${r.rating} dari 5">${stars(r.rating)}</span></span><time datetime="${esc(r.created_at)}">${esc(dateWIB(r.created_at))}</time></div>${r.body ? `<p>${esc(r.body)}</p>` : ""}</article>`).join(""));
      loaded += rows.length;
      const more = revBody.querySelector("#pRevMore"); if (more) more.hidden = rows.length < REV_PAGE || loaded >= p.count;
    } catch (e) {
      console.error(e);
      if (first && !isStale()) revBody.innerHTML = errorBox("Ulasan gagal dimuat.");
      revBody.querySelector("[data-retry]")?.addEventListener("click", () => loadMore(true));
    }
  }
  loadMore(true);
  return () => ac.abort();
}
