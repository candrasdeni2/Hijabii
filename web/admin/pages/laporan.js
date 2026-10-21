// Rute #/laporan (Admin). Isi halaman ada di modul bersama assets/js/report.js (dipakai juga oleh Super Admin).
import { renderReport } from "../../assets/js/report.js";

export function init({ root, isStale }) {
  return renderReport({ root: root.querySelector("#rpRoot"), prefix: "ad", isStale });
}