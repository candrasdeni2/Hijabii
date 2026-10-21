// Rute #/laporan (Super Admin). Modul bersama dengan Admin. Data lewat RPC report_orders/report_summary yang tidak memuat
// alamat, nomor telepon, maupun ongkir, jadi Super Admin tetap tidak melihat data itu.
import { renderReport } from "../../assets/js/report.js";

export function init({ root, isStale }) {
  return renderReport({ root: root.querySelector("#rpRoot"), prefix: "sa", isStale });
}