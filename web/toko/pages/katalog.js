// Katalog (Customer): grid produk 2/3/4 kolom, chip kategori (geser horizontal), hasil pencarian dari header (#/katalog?q=...).
// Semua produk aktif dimuat sekali (di-cache 60 detik) lalu difilter di klien, jadi ganti kategori terasa instan.
// Foto lazy-load (loading="lazy" dari img() di tk-lib). Chip dan "lihat lainnya" tidak memicu muat ulang halaman:
// URL diperbarui dengan replaceState supaya bisa dibagikan dan tombol Kembali tetap benar.
import { loadProducts, loadCategories, productCard, gridSkeleton, emptyState, errorBox, esc } from "../tk-lib.js";

const PAGE = 24;          // kelipatan 2, 3, dan 4 kolom, jadi baris terakhir selalu penuh
const TTL = 60_000;
let cache = null;         // { t, products, categories }

async function loadAll(force = false) {
  if (!force && cache && Date.now() - cache.t < TTL) return cache;
  const [products, categories] = await Promise.all([loadProducts(), loadCategories().catch(() => [])]);
  cache = { t: Date.now(), products, categories };
  return cache;
}
/** huruf kecil + tanpa aksen, supaya "pasmina" cocok dengan "Pasmina" */
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export async function init({ root, query, isStale }) {
  const st = { cat: query.get("cat") ?? "", q: (query.get("q") ?? "").trim().slice(0, 60), shown: PAGE };
  root.innerHTML = `<div class="tk-wrap">
    <div class="tk-head"><div><h1 class="tk-h1">Katalog</h1><p class="tk-muted tk-small" id="kSub" style="margin:6px 0 0" aria-live="polite"></p></div></div>
    <div class="tk-chips" id="kChips" role="group" aria-label="Filter kategori" hidden></div>
    <div id="kBody">${gridSkeleton(8)}</div></div>`;
  const $ = (s) => root.querySelector(s);
  const body = $("#kBody"), chips = $("#kChips");
  let data = null;

  async function ensure(force = false) {
    try { data = await loadAll(force); }
    catch (e) {
      console.error(e);
      if (isStale()) return false;
      $("#kSub").textContent = "";
      body.innerHTML = errorBox();
      body.querySelector("[data-retry]").addEventListener("click", async () => {
        body.innerHTML = gridSkeleton(8);
        if (await ensure(true)) start();
      });
      return false;
    }
    return !isStale();
  }

  /** produk yang lolos filter; produk yang stoknya habis diletakkan paling akhir */
  const visible = () => {
    const q = norm(st.q);
    return data.products
      .filter((p) => (!st.cat || p.categoryId === st.cat) && (!q || norm(p.name).includes(q)))
      .sort((a, b) => (a.stock <= 0) - (b.stock <= 0));
  };
  const catsInUse = () => {
    const used = new Set(data.products.map((p) => p.categoryId));
    return data.categories.filter((c) => used.has(c.id));
  };
  function syncUrl() {
    const qs = new URLSearchParams();
    if (st.q) qs.set("q", st.q);
    if (st.cat) qs.set("cat", st.cat);
    const s = qs.toString();
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/katalog${s ? `?${s}` : ""}`);
  }

  function paintChips() {
    const cats = catsInUse();
    chips.hidden = cats.length === 0;
    if (chips.hidden) return;
    const chip = (id, name) => `<button type="button" class="tk-chip" data-cat="${esc(id)}" aria-pressed="${st.cat === id}">${esc(name)}</button>`;
    chips.innerHTML = chip("", "Semua") + cats.map((c) => chip(c.id, c.name)).join("");
  }

  function paint() {
    const list = visible();
    const hapus = st.cat ? `#/katalog?cat=${encodeURIComponent(st.cat)}` : "#/katalog";
    $("#kSub").innerHTML = `${list.length} produk${st.q ? ` untuk “${esc(st.q)}” · <a href="${esc(hapus)}" style="color:var(--marsala)">Hapus pencarian</a>` : ""}`;
    if (!list.length) {
      body.innerHTML = emptyState(
        st.q ? "Produk tidak ditemukan" : "Belum ada produk",
        st.q ? "Coba kata kunci lain, atau lihat semua koleksi." : st.cat ? "Belum ada produk di kategori ini." : "Koleksi sedang disiapkan. Cek lagi nanti ya.",
        st.q || st.cat ? "#/katalog" : "", "Lihat semua koleksi");
      return;
    }
    body.innerHTML = `<div class="tk-grid" id="kGrid" aria-label="Daftar produk">${list.slice(0, st.shown).map(productCard).join("")}</div><div class="tk-more" id="kMore" hidden></div>`;
    paintMore(list);
  }
  function paintMore(list) {
    const more = $("#kMore"), left = list.length - st.shown;
    more.hidden = left <= 0;
    more.innerHTML = left > 0 ? `<button class="btn btn-secondary" type="button" data-more>Lihat produk lainnya (${left})</button>` : "";
  }

  chips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    st.cat = b.dataset.cat; st.shown = PAGE;
    syncUrl(); paintChips(); paint();
  });
  body.addEventListener("click", (e) => {
    if (!e.target.closest("[data-more]")) return;
    const list = visible(), from = st.shown;
    st.shown += PAGE;
    $("#kGrid").insertAdjacentHTML("beforeend", list.slice(from, st.shown).map(productCard).join(""));   // tambah saja, tanpa menggambar ulang (posisi scroll aman)
    paintMore(list);
  });

  function start() {
    if (st.cat && !catsInUse().some((c) => c.id === st.cat)) st.cat = "";   // ?cat= yang tidak dikenal diabaikan
    paintChips(); paint();
  }
  if (await ensure()) start();
}
