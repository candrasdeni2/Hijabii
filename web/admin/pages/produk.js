// Rute #/produk (daftar), #/produk/baru (produk baru), #/produk/<id> (editor produk + varian + stok).
// Shell memuat ulang halaman ini setiap hash berubah, jadi cukup baca hash saat init.
import { initList } from "../produk-list.js";
import { initEditor } from "../produk-edit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function init({ root, isStale }) {
  const host = root.querySelector("#produkView") ?? root;
  const sub = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split(/[/?]/)[1] ?? "";
  if (!sub) return initList({ root: host, isStale });
  if (sub === "baru") return initEditor({ root: host, isStale, productId: null });
  if (UUID.test(sub)) return initEditor({ root: host, isStale, productId: sub });
  location.replace("#/produk");
}
