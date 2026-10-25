// tk-lib.js — pembantu bersama halaman Customer: sesi, data katalog, keranjang, pengaturan, WhatsApp, ikon.
// Semua query mengikuti RLS (anon boleh baca katalog; keranjang/pesanan hanya milik sendiri).
import { supabase, imageUrl } from "../assets/js/supabase.js";
import { ROUTES } from "../assets/js/routes.js";
export { supabase, imageUrl };
export { CONFIG } from "../assets/js/config.js";
export { rupiah, dateTimeWIB, dateWIB, countdown, relativeTime } from "../assets/js/format.js";
export { toast, statusBadge, paymentChip, withLoading, openDialog, skeleton } from "../assets/js/ui.js";
export { esc, copyText, debounce } from "../assets/js/panel-kit.js";
import { esc } from "../assets/js/panel-kit.js";
import { toast } from "../assets/js/ui.js";

/* ---------------- Sesi ---------------- */
export const me = { profile: null };
export const isCustomer = () => me.profile?.role === "customer";
export const loginUrl = () => `${ROUTES.login}?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
export const goLogin = () => location.assign(loginUrl());

/** Galat yang pesannya aman ditampilkan apa adanya ke customer. */
export class UserError extends Error {}
/** Tampilkan galat sebagai toast. Pesan dari RPC (raise exception) berbahasa Indonesia dan boleh tampil; selebihnya generik. */
export function fail(e, fallback = "Terjadi kesalahan. Coba lagi.") {
  if (!(e instanceof UserError)) console.error(e);   // UserError = penolakan wajar (mis. stok kurang), bukan bug
  const m = e instanceof UserError ? e.message : (e?.code && /^P0001$/.test(e.code) ? e.message : null);
  toast(m || fallback, "error", 5000);
}

/* ---------------- Ikon ---------------- */
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICON = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  bag: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>'),
  receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  bell: svg('<path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 004 0"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  order: svg('<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
  cancel: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  box: svg('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
};

/* ---------------- Teks + gambar ---------------- */
export const nl2 = (s) => esc(s);
const HEX = /^#[0-9a-f]{3,8}$/i;
export const hexOk = (h) => (HEX.test(h ?? "") ? h : "var(--mocha)");
export function img(path, alt = "", { eager = false } = {}) {
  const u = imageUrl(path);
  return u
    ? `<img class="tk-img" src="${esc(u)}" alt="${esc(alt)}" ${eager ? "" : 'loading="lazy"'} decoding="async">`
    : `<div class="tk-ph" role="img" aria-label="${esc(alt)}">${esc(String(alt).slice(0, 26) || "foto")}</div>`;
}
export const stars = (n) => { const r = Math.round(Number(n) || 0); return "★".repeat(r) + "☆".repeat(5 - r); };
const one = (x) => (Array.isArray(x) ? x[0] : x) ?? null;
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "ALL SIZE", "ALLSIZE", "ALL"];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(String(s).toUpperCase()); return i < 0 ? 99 : i; };
export const sortSizes = (a) => [...a].sort((x, y) => sizeRank(x.size) - sizeRank(y.size) || String(x.size).localeCompare(String(y.size), "id", { numeric: true }));

/* ---------------- Katalog ---------------- */
export async function loadCategories() {
  const { data, error } = await supabase.from("categories").select("id, name, sort_order").order("sort_order").order("name");
  if (error) throw error;
  return data ?? [];
}

const PRODUCT_SELECT = "id, name, slug, description, price, weight_gram, category_id, created_at, product_colors(id, name, hex_code, image_path, sort_order, product_variants(id, size, stock))";
function normProduct(r) {
  const colors = (r.product_colors ?? []).map((c) => {
    const variants = sortSizes((c.product_variants ?? []).map((v) => ({ id: v.id, size: v.size, stock: Number(v.stock) || 0 })));
    return { id: c.id, name: c.name, hex: c.hex_code, image: c.image_path, sort: c.sort_order ?? 0, variants, stock: variants.reduce((s, v) => s + v.stock, 0) };
  }).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "id"));
  const cover = (colors.find((c) => c.image && c.stock > 0) ?? colors.find((c) => c.image))?.image ?? null;
  return { id: r.id, name: r.name, slug: r.slug, description: r.description ?? "", price: r.price, weight: r.weight_gram, categoryId: r.category_id, createdAt: r.created_at,
    colors, stock: colors.reduce((s, c) => s + c.stock, 0), cover, avg: null, count: 0 };
}
async function attachRatings(list) {
  if (!list.length) return list;
  const { data } = await supabase.from("product_rating_stats").select("product_id, avg_rating, review_count").in("product_id", list.map((p) => p.id));
  const m = new Map((data ?? []).map((x) => [x.product_id, x]));
  list.forEach((p) => { const s = m.get(p.id); if (s) { p.avg = Number(s.avg_rating); p.count = Number(s.review_count); } });
  return list;
}
/** Produk aktif (RLS sudah membatasi). Rating ikut dimuat. */
export async function loadProducts({ categoryId = null, limit = null } = {}) {
  let q = supabase.from("products").select(PRODUCT_SELECT).eq("status", "active").order("created_at", { ascending: false });
  if (categoryId) q = q.eq("category_id", categoryId);
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return attachRatings((data ?? []).map(normProduct));
}
export async function loadProductBySlug(slug) {
  const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).eq("slug", slug).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const p = normProduct(data);
  await attachRatings([p]);
  const ids = p.colors.map((c) => c.id);
  if (ids.length) {
    const { data: ex } = await supabase.from("product_color_images").select("color_id, image_path, sort_order").in("color_id", ids).order("sort_order");
    p.colors.forEach((c) => { c.extra = (ex ?? []).filter((x) => x.color_id === c.id).map((x) => x.image_path); });
  }
  return p;
}
export async function loadReviews(productId, from = 0, to = 9) {
  const { data, error } = await supabase.from("product_reviews_public").select("id, rating, body, created_at, display_name")
    .eq("product_id", productId).order("created_at", { ascending: false }).range(from, to);
  if (error) throw error;
  return data ?? [];
}

/** Kartu produk (katalog + beranda). */
export function productCard(p) {
  const out = p.stock <= 0;
  return `<a class="tk-pcard${out ? " is-out" : ""}" href="#/produk/${encodeURIComponent(p.slug)}">
    <div class="tk-pmedia">${img(p.cover, p.name)}${out ? '<span class="tk-tag is-out">Habis</span>' : ""}</div>
    <h3 class="tk-pname">${esc(p.name)}</h3>
    <div class="tk-price">${esc(rupiahStr(p.price))}</div>
    ${p.count > 0 ? `<div class="tk-rate"><span class="tk-star" aria-hidden="true">★</span><span>${p.avg.toFixed(1)}</span><span class="tk-muted">(${p.count})</span></div>` : ""}
  </a>`;
}
import { rupiah } from "../assets/js/format.js";
const rupiahStr = rupiah;

/* ---------------- Pengaturan publik + WhatsApp ---------------- */
let settingsP = null;
export function getSettings() {
  settingsP ??= supabase.from("settings").select("admin_whatsapp, dana_number, dana_account_name, bank_name, bank_account_number, bank_account_holder, default_timeout_hours").maybeSingle()
    .then(({ data, error }) => { if (error) throw error; return data ?? {}; })
    .catch((e) => { settingsP = null; throw e; });
  return settingsP;
}
export const waNumber = (s) => String(s?.admin_whatsapp ?? "").replace(/\D/g, "").replace(/^0/, "62");
export function waLink(settings, text = "") {
  const n = waNumber(settings);
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}

/* ---------------- Keranjang ---------------- */
export const cart = { count: 0 };
function emitCart() { window.dispatchEvent(new CustomEvent("tk:cart", { detail: cart.count })); }
export async function refreshCartCount() {
  if (!isCustomer()) { cart.count = 0; emitCart(); return 0; }
  const { data, error } = await supabase.from("cart_items").select("qty");
  if (error) { console.error(error); return cart.count; }
  cart.count = (data ?? []).reduce((s, r) => s + r.qty, 0);
  emitCart();
  return cart.count;
}
/** Isi keranjang lengkap dengan data produk + stok terkini. */
export async function loadCart() {
  const { data, error } = await supabase.from("cart_items")
    .select("id, qty, variant_id, product_variants(id, size, stock, product_colors(id, name, hex_code, image_path, products(id, name, slug, price, status)))")
    .order("created_at");
  if (error) throw error;
  const rows = (data ?? []).map((r) => {
    const v = one(r.product_variants), c = one(v?.product_colors), p = one(c?.products);
    const stock = Number(v?.stock) || 0, active = p?.status === "active";
    return { id: r.id, qty: r.qty, variantId: r.variant_id, size: v?.size ?? "-", stock, color: c?.name ?? "-", hex: c?.hex_code, image: c?.image_path,
      productId: p?.id, name: p?.name ?? "Produk tidak tersedia", slug: p?.slug, price: p?.price ?? 0, active,
      ok: active && stock > 0, over: active && stock > 0 && r.qty > stock };
  });
  cart.count = rows.reduce((s, r) => s + r.qty, 0);
  emitCart();
  return rows;
}
/** Validasi stok saat tambah (stok tidak dikunci di keranjang; yang mengunci baru saat Pesan). */
export async function addToCart(variantId, qty) {
  if (!isCustomer()) throw new UserError("Masuk sebagai customer untuk berbelanja.");
  const n = Math.floor(Number(qty));
  if (!(n > 0)) throw new UserError("Jumlah tidak valid.");
  const { data: v, error } = await supabase.from("product_variants").select("id, stock").eq("id", variantId).maybeSingle();
  if (error) throw error;
  if (!v) throw new UserError("Varian produk tidak ditemukan.");
  const { data: cur, error: e2 } = await supabase.from("cart_items").select("id, qty").eq("variant_id", variantId).maybeSingle();
  if (e2) throw e2;
  const have = cur?.qty ?? 0;
  if (v.stock <= 0) throw new UserError("Stok varian ini habis.");
  if (have + n > v.stock) throw new UserError(have ? `Stok tinggal ${v.stock}, dan di keranjang sudah ada ${have}.` : `Stok tinggal ${v.stock}.`);
  const res = cur
    ? await supabase.from("cart_items").update({ qty: have + n }).eq("id", cur.id)
    : await supabase.from("cart_items").insert({ user_id: me.profile.id, variant_id: variantId, qty: n });
  if (res.error) throw res.error;
  await refreshCartCount();
}
export async function setCartQty(id, qty) {
  const { error } = await supabase.from("cart_items").update({ qty }).eq("id", id);
  if (error) throw error;
  await refreshCartCount();
}
export async function removeCartItem(id) {
  const { error } = await supabase.from("cart_items").delete().eq("id", id);
  if (error) throw error;
  await refreshCartCount();
}

/* ---------------- Lain-lain ---------------- */
export const emptyState = (title, text = "", ctaHref = "", ctaLabel = "") => `<div class="tk-empty">
  <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 22h36l-3 32H17z"/><path d="M24 22v-5a8 8 0 0116 0v5"/></svg>
  <strong>${esc(title)}</strong>${text ? `<p style="margin:0">${esc(text)}</p>` : ""}
  ${ctaHref ? `<a class="btn btn-accent" href="${esc(ctaHref)}">${esc(ctaLabel)}</a>` : ""}</div>`;
export const errorBox = (msg = "Gagal memuat. Periksa koneksi lalu coba lagi.") => `<div class="tk-error" role="alert">${esc(msg)}<br><button class="btn btn-secondary btn-sm" type="button" data-retry>Coba lagi</button></div>`;
export const gridSkeleton = (n = 8) => `<div class="tk-grid" aria-hidden="true">${Array.from({ length: n }, () => `<div><div class="skeleton" style="aspect-ratio:4/5;border-radius:16px"></div><div class="skeleton tk-sk" style="width:70%"></div><div class="skeleton tk-sk" style="width:40%"></div></div>`).join("")}</div>`;

export const goBack = (fallback = "#/katalog") => { if (window.__tkNav > 0) history.back(); else location.hash = fallback; };
