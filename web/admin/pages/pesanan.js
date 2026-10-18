// Halaman Pesanan (Admin). Rute: #/pesanan = daftar, #/pesanan/<id> = detail, #/pesanan/<id>/edit = edit invoice,
// #/pesanan/<id>/invoice[/<revisi>] = tampilan invoice + unduh PDF. Shell memuat ulang halaman ini tiap hash berubah.
import { renderList } from "../order-list.js";
import { renderDetail } from "../order-detail.js";
import { renderEdit } from "../order-edit.js";
import { renderInvoice } from "../order-invoice.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function init({ root, isStale = () => false }) {
  const pg = root.querySelector("#pg");
  const [, id = "", sub = "", rev = ""] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
  if (!UUID.test(id)) return renderList({ pg, isStale });
  if (sub === "edit") return renderEdit({ pg, id, isStale });
  if (sub === "invoice") return renderInvoice({ pg, id, rev, isStale });
  return renderDetail({ pg, id, isStale });
}