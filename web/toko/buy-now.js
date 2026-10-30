// buy-now.js — "Pesan" dari halaman produk: item dibawa ke checkout langsung (sessionStorage), TANPA lewat/mengubah keranjang.
// Checkout (#/checkout?beli=1) membaca item ini; tanpa ?beli=1 checkout memakai keranjang dan membuang sisa data di sini.
import { supabase } from "./tk-lib.js";

const KEY = "tk:buyNow";
const one = (x) => (Array.isArray(x) ? x[0] : x) ?? null;

export function setBuyNow(variantId, qty) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ variantId, qty: Math.max(1, Math.floor(Number(qty)) || 1) })); } catch { /* storage diblokir */ }
}
export function getBuyNow() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; }
}
export function clearBuyNow() {
  try { sessionStorage.removeItem(KEY); } catch { /* abaikan */ }
}

/** Satu baris bentuk loadCart() untuk item beli langsung (stok & harga terkini dari server), atau null bila tidak ada/ tidak ditemukan. */
export async function loadBuyNowRow() {
  const b = getBuyNow();
  if (!b?.variantId) return null;
  const { data, error } = await supabase.from("product_variants")
    .select("id, size, stock, product_colors(id, name, hex_code, image_path, products(id, name, slug, price, status))")
    .eq("id", b.variantId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const c = one(data.product_colors), p = one(c?.products);
  const stock = Number(data.stock) || 0, active = p?.status === "active", qty = Math.max(1, Math.floor(Number(b.qty)) || 1);
  return { id: `buy:${data.id}`, qty, variantId: data.id, size: data.size ?? "-", stock, color: c?.name ?? "-", hex: c?.hex_code, image: c?.image_path,
    productId: p?.id, name: p?.name ?? "Produk tidak tersedia", slug: p?.slug, price: p?.price ?? 0, active,
    ok: active && stock > 0, over: active && stock > 0 && qty > stock };
}