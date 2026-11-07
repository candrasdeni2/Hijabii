// Keranjang: tambah/ubah jumlah/hapus + centang produk untuk checkout. Stok TIDAK dikunci di sini (baru terkunci saat Pesan); stok dicek ulang tiap halaman dibuka.
// Tampilan mengikuti referensi: judul besar, "Pilih semua", daftar produk, kartu Ringkasan (desktop di kanan, mobile di bawah daftar).
// Mobile: tiap produk = kartu sendiri (checkbox | foto | info). Desktop (>=768px): satu kartu berisi daftar dengan garis tipis.
// Gaya dimuat dari sini sendiri (ctStyle, awalan .ct-) supaya tidak bergantung pada shell.css.
import { loadCart, setCartQty, removeCartItem, getCartOff, setCartOff, rupiah, esc, img, fail, emptyState, errorBox, toast } from "../tk-lib.js";

const CSS = `
.ct{max-width:1080px;margin:0 auto;padding:0 16px}
.ct svg{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ct-h1{font:600 40px/1.1 var(--font-serif,serif);margin:0 0 8px}
@media(min-width:768px){.ct-h1{font-size:46px;margin-bottom:18px}}
.ct-all{display:inline-flex;align-items:center;gap:10px;min-height:40px;margin:0 0 12px;font-size:15px;cursor:pointer}
.ct-all[hidden]{display:none}
.ct-grid{display:grid;gap:16px}
@media(min-width:900px){.ct-grid{grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}}
.ct-card{background:var(--paper,#FBF8F3);border:1px solid var(--sand,#EBE0D3);border-radius:18px;box-shadow:var(--shadow-sm,0 2px 8px rgba(43,33,28,.04))}
.ct-list{list-style:none;margin:0;padding:0}
.ct-note{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(184,134,58,.3);background:rgba(184,134,58,.1);border-radius:12px;font-size:14px}
.ct-note .btn{margin-left:auto;flex:none}

/* checkbox bulat-persegi bermerek (centang putih di atas marsala) */
.ct-ck{appearance:none;-webkit-appearance:none;flex:none;width:22px;height:22px;margin:0;border:1.5px solid rgba(43,33,28,.35);border-radius:6px;background:var(--paper,#FBF8F3) center/16px no-repeat;cursor:pointer}
.ct-ck:checked{background-color:var(--marsala,#7B4A4A);border-color:var(--marsala,#7B4A4A);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
.ct-ck:indeterminate{background-color:var(--marsala,#7B4A4A);border-color:var(--marsala,#7B4A4A);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8h8' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")}
.ct-ck:disabled{opacity:.4;cursor:not-allowed}
.ct-ck:focus-visible{outline:2px solid var(--marsala,#7B4A4A);outline-offset:3px}
.ct-pick{display:grid;place-items:center;align-self:center;padding:9px;margin:-9px;cursor:pointer}   /* area sentuh ±40px tanpa melebarkan kolom */

/* ===== Baris produk — MOBILE: tiap produk kartu sendiri: [checkbox] [foto] [info] ===== */
.ct-listcard{background:none;border:0;border-radius:0;box-shadow:none}   /* pembungkus daftar tidak jadi kartu di mobile */
.ct-it{display:grid;grid-template-columns:22px 104px minmax(0,1fr);gap:12px;padding:14px;margin-bottom:12px;
  border:1px solid var(--sand,#EBE0D3);border-radius:20px;background:var(--paper,#FBF8F3);box-shadow:var(--shadow-sm,0 2px 8px rgba(43,33,28,.04))}
.ct-list>li:last-child{margin-bottom:0}
.ct-it.is-off .ct-img{opacity:.55}
.ct-it.is-bad{background:#FBF3F1}
.ct-it .ct-pick{align-self:start;margin-top:-6px}   /* checkbox sejajar bagian atas foto */
.ct-img{align-self:stretch;min-height:125px;border-radius:14px;overflow:hidden;background:var(--sand,#EBE0D3)}   /* mobile: tinggi foto = tinggi baris, jadi batas bawah foto sejajar dengan bawah tombol qty */
.ct-img .tk-img,.ct-img .tk-ph{width:100%;height:100%;object-fit:cover}
.ct-info{min-width:0;display:flex;flex-direction:column;justify-content:flex-start}
.ct-name{display:block;font:600 17px/1.25 var(--font-serif,serif);color:var(--ink,#2B211C);text-decoration:none;overflow-wrap:anywhere}
.ct-var{margin-top:3px;font-size:13px;color:rgba(43,33,28,.65)}
.ct-warn{margin-top:6px;font-size:13px;color:var(--error,#9E3D3D)}
.ct-bottom{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding-top:8px}   /* mentok ke bawah kolom info */
.ct-price{flex:0 0 100%;font-size:16px;font-weight:700;color:var(--marsala,#7B4A4A)}
/* mobile: qty (kiri) + hapus (kanan) SELALU satu baris, tidak pernah wrap */
.ct-act{display:flex;flex:0 0 100%;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.ct-qty{display:inline-flex;flex:none;align-items:center;border:1px solid var(--sand,#EBE0D3);border-radius:999px;background:var(--cream,#F6F0E7);padding:3px}
.ct-qty button{width:30px;height:30px;border:0;border-radius:50%;background:transparent;font-size:20px;line-height:1;color:var(--ink,#2B211C);cursor:pointer}
.ct-qty button:hover:not(:disabled){background:var(--sand,#EBE0D3)}
.ct-qty button:disabled{opacity:.35;cursor:not-allowed}
.ct-qty output{min-width:30px;text-align:center;font-weight:500}
.ct-del{display:inline-flex;flex:none;align-items:center;justify-content:center;gap:6px;width:36px;height:36px;margin-left:auto;margin-right:-4px;padding:0;border:0;border-radius:50%;background:none;color:var(--marsala,#7B4A4A);font:inherit;font-size:14px;cursor:pointer}   /* ikon tempat sampah di ujung kanan */
.ct-del:hover{background:rgba(123,74,74,.08)}
.ct-del svg{width:20px;height:20px}
.ct-del-t{display:none}   /* mobile: ikon saja */

/* layar sangat sempit (<=360px): perkecil foto & qty supaya qty + hapus tetap muat satu baris */
@media(max-width:360px){
  .ct-it{grid-template-columns:22px 88px minmax(0,1fr);gap:10px;padding:12px}
  .ct-qty button{width:28px;height:28px}
  .ct-qty output{min-width:26px}
}

/* ===== >=768px: satu kartu berisi daftar, antar produk dipisah garis tipis ===== */
@media(min-width:768px){
  .ct-listcard{background:var(--paper,#FBF8F3);border:1px solid var(--sand,#EBE0D3);border-radius:18px;box-shadow:var(--shadow-sm,0 2px 8px rgba(43,33,28,.04))}
  .ct-it{grid-template-columns:24px 124px minmax(0,1fr);gap:18px;padding:18px 20px;margin:0;border:0;border-top:1px solid var(--sand,#EBE0D3);border-radius:0;background:transparent;box-shadow:none}
  .ct-list>li:first-child{border-top:0}
  .ct-it .ct-pick{align-self:center;margin-top:-9px}
  .ct-ck,.ct-it .ct-ck{width:24px;height:24px}
  .ct-img{aspect-ratio:1/1.12;min-height:0;align-self:start;border-radius:12px}
  .ct-info{display:block}
  .ct-name{font-size:22px}
  .ct-var{font-size:14px;margin-top:4px}
  .ct-bottom{flex-wrap:nowrap;gap:20px;margin-top:14px;padding-top:0}
  .ct-price{flex:none;font-size:20px;min-width:120px}
  .ct-act{display:contents}   /* desktop: qty & hapus langsung jadi anak .ct-bottom (satu baris dengan harga) */
  .ct-qty button{width:36px;height:36px}
  .ct-qty output{min-width:34px}
  .ct-del{width:auto;height:40px;margin-right:0;border-radius:0;text-decoration:underline;text-underline-offset:3px}
  .ct-del:hover{background:none}
  .ct-del svg{width:16px;height:16px}
  .ct-del-t{display:inline}
}

/* ringkasan */
.ct-sum{padding:20px}
@media(min-width:900px){.ct-sum{position:sticky;top:84px}}
.ct-sum h2{font:600 26px/1.2 var(--font-serif,serif);margin:0 0 14px}
.ct-row{display:flex;justify-content:space-between;gap:12px;font-size:15px}
.ct-info-row{display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--sand,#EBE0D3);font-size:14px;color:rgba(43,33,28,.8)}
.ct-info-row svg{flex:none;width:22px;height:22px;color:var(--marsala,#7B4A4A)}
.ct-go{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;margin-top:18px}
.ct-go svg{width:18px;height:18px}
`;

const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>';
const INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

export async function init({ root, isStale }) {
  if (!document.getElementById("ctStyle")) { const el = document.createElement("style"); el.id = "ctStyle"; el.textContent = CSS; document.head.appendChild(el); }
  root.innerHTML = `<div class="ct"><h1 class="ct-h1">Keranjang</h1><div id="cBody"><div class="skeleton" style="height:120px"></div></div></div>`;
  const body = root.querySelector("#cBody");
  let rows = [];
  let unsel = getCartOff();   // id item yang TIDAK dicentang (sessionStorage; dibaca juga oleh checkout)

  const isSel = (r) => r.ok && !unsel.has(r.id);
  const sub = () => rows.filter(isSel).reduce((s, r) => s + r.qty * r.price, 0);
  const okQty = () => rows.filter(isSel).reduce((s, r) => s + r.qty, 0);

  // "Pilih semua": centang penuh / setengah (indeterminate) / kosong
  function syncAll() {
    const w = root.querySelector("#cSelAllW"), cb = root.querySelector("#cSelAll"); if (!w || !cb) return;
    const can = rows.filter((r) => r.ok), n = can.filter((r) => !unsel.has(r.id)).length;
    w.hidden = !rows.length; cb.disabled = !can.length;
    cb.checked = can.length > 0 && n === can.length; cb.indeterminate = n > 0 && n < can.length;
  }

  const item = (r) => `<li class="ct-it${r.ok && !r.over ? "" : " is-bad"}${isSel(r) ? "" : " is-off"}" data-id="${esc(r.id)}">
    <label class="ct-pick"><input class="ct-ck" type="checkbox" data-sel aria-label="Pilih ${esc(r.name)} untuk checkout" ${isSel(r) ? "checked" : ""} ${r.ok ? "" : "disabled"}></label>
    <div class="ct-img">${img(r.image, r.name)}</div>
    <div class="ct-info">
      ${r.slug ? `<a class="ct-name" href="#/produk/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>` : `<span class="ct-name">${esc(r.name)}</span>`}
      <div class="ct-var">${esc(r.color)} • ${esc(r.size)}</div>
      ${!r.active ? `<div class="ct-warn">Produk ini sudah tidak dijual.</div>` : r.stock <= 0 ? `<div class="ct-warn">Stok habis.</div>` : r.over ? `<div class="ct-warn">Stok tinggal ${r.stock}.</div>` : ""}
      <div class="ct-bottom">
        <div class="ct-price">${esc(rupiah(r.price))}</div>
        <div class="ct-act">
          ${r.ok ? `<div class="ct-qty"><button type="button" data-dec aria-label="Kurangi jumlah ${esc(r.name)}" ${r.qty <= 1 ? "disabled" : ""}>−</button><output aria-live="polite">${r.qty}</output><button type="button" data-inc aria-label="Tambah jumlah ${esc(r.name)}" ${r.qty >= r.stock ? "disabled" : ""}>+</button></div>` : ""}
          <button class="ct-del" type="button" data-del aria-label="Hapus ${esc(r.name)} dari keranjang">${TRASH}<span class="ct-del-t">Hapus</span></button>
        </div>
      </div></div></li>`;

  function paint() {
    if (!rows.length) { body.innerHTML = emptyState("Belum ada produk", "Pilih produk favoritmu lalu masukkan ke keranjang.", "#/katalog", "Lihat Koleksi"); return; }
    const over = rows.filter((r) => isSel(r) && r.over), dead = rows.filter((r) => !r.ok);
    const can = okQty() > 0 && !over.length;
    const offAttr = can ? "" : `aria-disabled="true" tabindex="-1" data-off="${okQty() ? "bad" : "empty"}"`;
    body.innerHTML = `
      ${over.length ? `<div class="ct-note" role="alert"><span>Stok beberapa produk berkurang. Sesuaikan jumlahnya sebelum checkout.</span><button class="btn btn-secondary btn-sm" type="button" data-fix>Sesuaikan</button></div>` : ""}
      ${dead.length ? `<div class="ct-note" role="alert"><span>Ada produk yang sudah habis atau tidak dijual. Produk itu tidak ikut checkout; hapus dari keranjang jika tidak diperlukan.</span></div>` : ""}
      <label class="ct-all" id="cSelAllW"><input class="ct-ck" type="checkbox" id="cSelAll" data-selall><span>Pilih semua</span></label>
      <div class="ct-grid">
        <div class="ct-card ct-listcard"><ul class="ct-list">${rows.map(item).join("")}</ul></div>
        <aside class="ct-card ct-sum" aria-label="Ringkasan">
          <h2>Ringkasan</h2>
          <div class="ct-row"><span>Subtotal produk (${okQty()})</span><span>${esc(rupiah(sub()))}</span></div>
          <div class="ct-info-row">${INFO}<span>Ongkir dihitung saat checkout.</span></div>
          <a class="btn btn-accent ct-go" href="#/checkout" ${offAttr}>Checkout (${okQty()}) ${ARROW}</a>
        </aside>
      </div>`;
    syncAll();
  }

  async function load() {
    try {
      rows = await loadCart();
      if (isStale()) return;
      // buang id yang sudah tidak ada di keranjang (mis. sudah dipesan/dihapus)
      const ids = new Set(rows.map((r) => r.id));
      unsel = new Set([...unsel].filter((id) => ids.has(id))); setCartOff(unsel);
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
    const off = e.target.closest("[data-off]"); if (off) { e.preventDefault(); toast(off.dataset.off === "empty" ? "Pilih dulu produk yang mau di-checkout." : "Selesaikan dulu produk yang bermasalah di keranjang.", "warning"); return; }
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
      if (e.target.closest("[data-del]")) { await removeCartItem(r.id); rows = rows.filter((x) => x.id !== r.id); unsel.delete(r.id); setCartOff(unsel); paint(); return; }
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

  // Centang per produk + "Pilih semua"
  root.addEventListener("change", (e) => {
    if (e.target.closest("[data-selall]")) {
      const can = rows.filter((r) => r.ok), allOn = can.every((r) => !unsel.has(r.id));
      can.forEach((r) => (allOn ? unsel.add(r.id) : unsel.delete(r.id)));   // sudah penuh → kosongkan; selain itu → pilih semua
      setCartOff(unsel); paint();
      root.querySelector("[data-selall]")?.focus();
      return;
    }
    const cb = e.target.closest("[data-sel]"); if (!cb) return;
    const li = cb.closest("[data-id]"), r = li && rows.find((x) => x.id === li.dataset.id); if (!r) return;
    if (cb.checked) unsel.delete(r.id); else unsel.add(r.id);
    setCartOff(unsel); paint();
    root.querySelector(`[data-id="${CSS.escape(r.id)}"] [data-sel]`)?.focus();
  }, { signal: ac.signal });

  await load();
  return () => ac.abort();
}