// Keranjang: tambah/ubah jumlah/hapus. Stok TIDAK dikunci di sini (baru terkunci saat Pesan); stok dicek ulang tiap halaman dibuka.
import { loadCart, setCartQty, removeCartItem, rupiah, esc, img, fail, emptyState, errorBox, toast } from "../tk-lib.js";

export async function init({ root, isStale }) {
  root.innerHTML = `<div class="tk-wrap"><div class="tk-head"><h1 class="tk-h1">Keranjang</h1></div><div id="cBody"><div class="skeleton" style="height:120px"></div></div></div>`;
  const body = root.querySelector("#cBody");
  let rows = [];

  const sub = () => rows.filter((r) => r.ok).reduce((s, r) => s + r.qty * r.price, 0);
  const okQty = () => rows.filter((r) => r.ok).reduce((s, r) => s + r.qty, 0);

  function paint() {
    if (!rows.length) { body.innerHTML = emptyState("Belum ada produk", "Pilih produk favoritmu lalu masukkan ke keranjang.", "#/katalog", "Lihat Koleksi"); return; }
    const over = rows.filter((r) => r.over), dead = rows.filter((r) => !r.ok);
    const can = okQty() > 0 && !over.length;
    body.innerHTML = `<div class="tk-cart">
      <div>
        ${over.length ? `<div class="tk-note" role="alert" style="margin-bottom:12px"><span>Stok beberapa produk berkurang. Sesuaikan jumlahnya sebelum checkout.</span><button class="btn btn-secondary btn-sm" type="button" data-fix>Sesuaikan</button></div>` : ""}
        ${dead.length ? `<div class="tk-note" role="alert" style="margin-bottom:12px"><span>Ada produk yang sudah habis atau tidak dijual. Hapus dari keranjang untuk melanjutkan.</span></div>` : ""}
        <ul class="tk-items" style="list-style:none;margin:0;padding:0">${rows.map(item).join("")}</ul>
      </div>
      <aside class="tk-card tk-sum" aria-label="Ringkasan">
        <h2 class="tk-h2" style="font-size:22px;margin-bottom:10px">Ringkasan</h2>
        <div class="tk-sum-row"><span>Subtotal produk (${okQty()})</span><span>${esc(rupiah(sub()))}</span></div>
        <div class="tk-sum-row tk-muted tk-small"><span>Ongkir dihitung saat checkout dan tampil di invoice.</span></div>
        <a class="btn btn-accent" href="#/checkout" ${can ? "" : 'aria-disabled="true" tabindex="-1" data-off'}>Checkout (${okQty()})</a>
      </aside></div>
      <div class="tk-bar-cta"><div class="tk-tot"><span>Subtotal</span><b>${esc(rupiah(sub()))}</b></div><a class="btn btn-accent" href="#/checkout" ${can ? "" : 'aria-disabled="true" tabindex="-1" data-off'}>Checkout (${okQty()})</a></div>`;
  }
  const item = (r) => `<li class="tk-it${r.ok && !r.over ? "" : " is-bad"}" data-id="${esc(r.id)}">
    <div class="tk-it-img">${img(r.image, r.name)}</div>
    <div style="min-width:0">
      ${r.slug ? `<a class="tk-it-name" href="#/produk/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>` : `<span class="tk-it-name">${esc(r.name)}</span>`}
      <div class="tk-it-var">${esc(r.color)} · ${esc(r.size)}</div>
      <div class="tk-it-var">${esc(rupiah(r.price))}</div>
      ${!r.active ? `<div class="tk-it-warn">Produk ini sudah tidak dijual.</div>` : r.stock <= 0 ? `<div class="tk-it-warn">Stok habis.</div>` : r.over ? `<div class="tk-it-warn">Stok tinggal ${r.stock}.</div>` : ""}
      <div class="tk-it-row">
        ${r.ok ? `<div class="tk-qty"><button type="button" data-dec aria-label="Kurangi jumlah ${esc(r.name)}" ${r.qty <= 1 ? "disabled" : ""}>−</button><output aria-live="polite">${r.qty}</output><button type="button" data-inc aria-label="Tambah jumlah ${esc(r.name)}" ${r.qty >= r.stock ? "disabled" : ""}>+</button></div>` : "<span></span>"}
        <button class="tk-link" type="button" data-del aria-label="Hapus ${esc(r.name)} dari keranjang">Hapus</button>
      </div></div></li>`;

  async function load() {
    try {
      rows = await loadCart();
      if (isStale()) return;
      paint();
    } catch (e) {
      console.error(e);
      if (isStale()) return;
      body.innerHTML = errorBox();
      body.querySelector("[data-retry]").addEventListener("click", load);
    }
  }
  // root (#view) dipakai ulang antar halaman: pendengar WAJIB dilepas saat pindah halaman (shell memanggil fungsi yang dikembalikan init)
  const ac = new AbortController();
  root.addEventListener("click", async (e) => {
    const off = e.target.closest("[data-off]"); if (off) { e.preventDefault(); toast("Selesaikan dulu produk yang bermasalah di keranjang.", "warning"); return; }
    if (e.target.closest("[data-fix]")) {
      try {
        for (const r of rows.filter((x) => x.over)) await setCartQty(r.id, r.stock);
        await load(); toast("Jumlah disesuaikan dengan stok.", "success");
      } catch (err) { fail(err); }
      return;
    }
    const li = e.target.closest("[data-id]"); if (!li) return;
    const r = rows.find((x) => x.id === li.dataset.id); if (!r) return;
    try {
      if (e.target.closest("[data-del]")) { await removeCartItem(r.id); rows = rows.filter((x) => x.id !== r.id); paint(); return; }
      const d = e.target.closest("[data-inc]") ? 1 : e.target.closest("[data-dec]") ? -1 : 0;
      if (!d) return;
      const next = r.qty + d;
      if (next < 1) return;
      if (next > r.stock) { toast(`Stok tinggal ${r.stock}.`, "warning"); return; }
      await setCartQty(r.id, next);
      r.qty = next; r.over = next > r.stock; paint();
      root.querySelector(`[data-id="${CSS.escape(r.id)}"] ${d > 0 ? "[data-inc]" : "[data-dec]"}`)?.focus();
    } catch (err) { fail(err, "Gagal memperbarui keranjang."); load(); }
  }, { signal: ac.signal });
  await load();
  return () => ac.abort();
}
