// Daftar produk: cari, filter status/kategori, halaman, hapus. Tambah/ubah ada di produk-edit.js (rute #/produk/baru dan #/produk/<id>).
import { supabase } from "../assets/js/supabase.js";
import { toast } from "../assets/js/ui.js";
import { rupiah } from "../assets/js/format.js";
import { PRODUCT_STATUS } from "../assets/js/labels.js";
import { esc, debounce, confirmDialog } from "./ad-ui.js";
import { imageUrl } from "./produk-img.js";

const PAGE_SIZE = 15;
const STATUS_CLASS = { active: "ad-badge-on", draft: "ad-badge-warn", archived: "ad-badge-off" };

const firstImage = (p) => [...(p.product_colors ?? [])].sort((a, b) => a.sort_order - b.sort_order).find((c) => c.image_path)?.image_path ?? null;
// product_variants di-embed lewat warna (tidak ada FK langsung products -> product_variants)
const totalStock = (p) => (p.product_colors ?? []).reduce((s, c) => s + (c.product_variants ?? []).reduce((t, v) => t + (v.stock ?? 0), 0), 0);

export async function initList({ root, isStale = () => false }) {
  root.innerHTML = `
    <header class="ad-page-head">
      <div>
        <h1 class="ad-h1">Produk</h1>
        <p class="ad-sub">Kelola produk, warna, ukuran, dan stok. Hanya produk berstatus Aktif yang tampil dan bisa dibeli.</p>
      </div>
      <a class="btn btn-primary" href="#/produk/baru">+ Tambah Produk</a>
    </header>
    <section class="ad-card" aria-label="Daftar produk">
      <div class="ad-toolbar">
        <input class="input ad-search" id="q" type="search" placeholder="Cari nama produk" aria-label="Cari produk" autocomplete="off">
        <select class="input" id="fCat" aria-label="Filter kategori"><option value="">Semua kategori</option></select>
        <select class="input" id="fStatus" aria-label="Filter status">
          <option value="">Semua status</option>
          ${Object.entries(PRODUCT_STATUS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}
        </select>
      </div>
      <div id="list" aria-live="polite"></div>
      <div class="ad-pager" id="pager"></div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const listEl = $("#list"), pagerEl = $("#pager"), search = $("#q"), catSel = $("#fCat"), statusSel = $("#fStatus");
  const state = { page: 0, total: 0, rows: new Map(), req: 0 };

  // Opsi kategori (gagal dimuat tidak menghalangi daftar)
  supabase.from("categories").select("id, name").order("sort_order").order("name").then(({ data }) => {
    if (isStale() || !data) return;
    catSel.insertAdjacentHTML("beforeend", `<option value="none">Tanpa kategori</option>` + data.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(""));
  });

  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    pagerEl.innerHTML = "";
    const from = state.page * PAGE_SIZE, to = from + PAGE_SIZE - 1;

    let q = supabase.from("products")
      .select("id, name, slug, price, status, category_id, categories(name), product_colors(image_path, sort_order, product_variants(stock))", { count: "exact" });
    const term = search.value.trim().replace(/[%\\]/g, " ").trim();
    if (term) q = q.ilike("name", `%${term}%`);
    if (statusSel.value) q = q.eq("status", statusSel.value);
    if (catSel.value === "none") q = q.is("category_id", null);
    else if (catSel.value) q = q.eq("category_id", catSel.value);
    const res = await q.order("created_at", { ascending: false }).range(from, to);
    if (my !== state.req || isStale()) return;

    if (res.error) {
      console.error(res.error);
      listEl.innerHTML = `<div class="ad-error" role="alert">Data gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
      return;
    }
    state.total = res.count ?? res.data.length;
    state.rows = new Map(res.data.map((r) => [r.id, r]));
    if (!res.data.length) {
      const filtered = term || statusSel.value || catSel.value;
      if (!filtered) listEl.innerHTML = `<div class="ad-empty">Belum ada produk. Tambahkan produk pertama, lalu isi warna, ukuran, dan stoknya.<br><a class="btn btn-primary btn-sm" href="#/produk/baru" style="margin-top:12px">+ Tambah Produk</a></div>`;
      else if (state.page > 0) { state.page--; return load(); }
      else listEl.innerHTML = `<div class="ad-empty">Tidak ada produk yang cocok.</div>`;
      return;
    }
    listEl.innerHTML = renderTable(res.data) + renderCards(res.data);
    renderPager(from, res.data.length);
  }

  const thumb = (p) => {
    const path = firstImage(p), url = path ? imageUrl(path) : null;
    return url ? `<img class="ad-thumb" src="${esc(url)}" alt="${esc(p.name)}" loading="lazy" width="48" height="60">`
               : `<span class="ad-thumb ad-ph" aria-hidden="true"></span>`;
  };
  const badge = (p) => `<span class="ad-badge ${STATUS_CLASS[p.status] ?? "ad-badge-off"}">${esc(PRODUCT_STATUS[p.status] ?? p.status)}</span>`;
  const stockText = (p) => { const n = totalStock(p); return n === 0 ? `<span class="ad-stock-zero">Habis</span>` : String(n); };
  const actions = (p) => `
    <a class="btn btn-secondary btn-sm" href="#/produk/${esc(p.id)}">Edit</a>
    <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${esc(p.id)}">Hapus</button>`;

  const renderTable = (rows) => `
    <div class="ad-table-wrap"><table class="ad-table">
      <thead><tr><th scope="col"><span class="ad-sr">Foto</span></th><th scope="col">Produk</th><th scope="col">Kategori</th><th scope="col">Harga</th><th scope="col">Stok</th><th scope="col">Status</th><th scope="col" class="ad-th-actions">Aksi</th></tr></thead>
      <tbody>${rows.map((p) => `<tr>
        <td>${thumb(p)}</td>
        <td><div class="ad-name">${esc(p.name)}</div><div class="ad-meta" style="margin-top:2px">${esc(p.slug)}</div></td>
        <td>${esc(p.categories?.name ?? "–")}</td>
        <td>${esc(rupiah(p.price))}</td>
        <td>${stockText(p)}</td>
        <td>${badge(p)}</td>
        <td><div class="ad-cell-actions">${actions(p)}</div></td></tr>`).join("")}
      </tbody></table></div>`;

  const renderCards = (rows) => `
    <ul class="ad-cards">${rows.map((p) => `<li>
      <div class="ad-prod-card">${thumb(p)}
        <div class="ad-prod-info">
          <div class="ad-card-top"><div class="ad-name">${esc(p.name)}</div>${badge(p)}</div>
          <div class="ad-email">${esc(rupiah(p.price))} · ${esc(p.categories?.name ?? "Tanpa kategori")}</div>
          <div class="ad-meta">Stok: ${stockText(p)}</div>
        </div></div>
      <div class="ad-card-actions">${actions(p)}</div></li>`).join("")}</ul>`;

  function renderPager(from, n) {
    const pages = Math.ceil(state.total / PAGE_SIZE);
    pagerEl.innerHTML = `<span>Menampilkan ${from + 1}–${from + n} dari ${state.total}</span>
      <div class="ad-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" data-act="prev" ${state.page === 0 ? "disabled" : ""}>Sebelumnya</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="next" ${state.page + 1 >= pages ? "disabled" : ""}>Berikutnya</button>
      </div>`;
  }

  async function remove(p) {
    const ok = await confirmDialog({
      title: "Hapus produk?",
      message: `“${p.name}” akan dihapus permanen beserta semua warna, ukuran, stok, foto, dan ulasannya. Riwayat pesanan tetap tersimpan. Bila hanya ingin menyembunyikan dari toko, ubah statusnya menjadi Arsip.`,
      confirmLabel: "Hapus permanen",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("products").delete().eq("id", p.id);
        if (error) throw error;
      },
    });
    if (ok) { toast("Produk dihapus.", "success"); if (state.rows.size === 1 && state.page > 0) state.page--; load(); }
  }

  // Listener hanya di elemen dalam halaman (bukan #view) agar tidak menumpuk saat halaman dibuka berulang.
  const onClick = (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const p = state.rows.get(b.dataset.id);
    switch (b.dataset.act) {
      case "retry": load(); break;
      case "prev": if (state.page > 0) { state.page--; load(); } break;
      case "next": state.page++; load(); break;
      case "delete": p && remove(p); break;
    }
  };
  listEl.addEventListener("click", onClick);
  pagerEl.addEventListener("click", onClick);
  search.addEventListener("input", debounce(() => { state.page = 0; load(); }, 300));
  catSel.addEventListener("change", () => { state.page = 0; load(); });
  statusSel.addEventListener("change", () => { state.page = 0; load(); });

  return load();
}
