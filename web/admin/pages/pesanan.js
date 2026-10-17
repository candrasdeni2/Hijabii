// Halaman Pesanan (Admin). Rute: #/pesanan = daftar, #/pesanan/<id> = detail, #/pesanan/<id>/edit = edit invoice.
// Shell memuat ulang halaman ini tiap hash berubah.
import { renderList } from "../order-list.js";
import { renderDetail } from "../order-detail.js";
import { renderEdit } from "../order-edit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function init({ root, isStale = () => false }) {
  const pg = root.querySelector("#pg");
  const [, id = "", sub = ""] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
  if (!UUID.test(id)) return renderList({ pg, isStale });
  return sub === "edit" ? renderEdit({ pg, id, isStale }) : renderDetail({ pg, id, isStale });
}