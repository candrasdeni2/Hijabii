// Shell Admin: guard peran, memuat partial (header/sidebar/footer), lalu router hash memuat pages/<nama>.html + .js.
// Halaman yang berkasnya belum ada (404) otomatis tampil sebagai "segera hadir"; begitu pages/<nama>.html dan .js
// ditambahkan, rute itu langsung aktif tanpa mengubah shell.
import { requireAuth, signOut } from "../assets/js/auth.js";
import { supabase } from "../assets/js/supabase.js";
import { ROUTES } from "../assets/js/routes.js";
import { toast } from "../assets/js/ui.js";
import { openModal, esc } from "./ad-ui.js";

const BASE = new URL("./", import.meta.url);
const PAGES = {
  dashboard: "Dashboard", pesanan: "Pesanan", produk: "Produk", kategori: "Kategori", lookbook: "Lookbook",
  faq: "FAQ", ulasan: "Ulasan", laporan: "Laporan", pengaturan: "Pengaturan",
};
const DEFAULT_PAGE = "dashboard";

const $ = (id) => document.getElementById(id);
const view = $("view");
let profile = null;
let token = 0;
let sheet = null;

const fetchRaw = (path) => fetch(new URL(path, BASE), { cache: "no-cache" });
const fetchText = async (path) => {
  const r = await fetchRaw(path);
  if (!r.ok) throw new Error(`${path} (${r.status})`);
  return r.text();
};

const routeName = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split(/[/?]/)[0] || DEFAULT_PAGE;
const moreRoutes = () => [...document.querySelectorAll("#app-sidebar .ad-more-item")].map((a) => a.dataset.route);

function setActive(name) {
  document.querySelectorAll("#app-sidebar [data-route]").forEach((a) => {
    if (a.dataset.route === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  const more = $("btnMore");
  if (more) { if (name && moreRoutes().includes(name)) more.setAttribute("aria-current", "page"); else more.removeAttribute("aria-current"); }
}

const skeleton = () => `<div aria-hidden="true"><div class="ad-skel" style="width:40%;height:36px"></div>
  <div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;

const soonPage = (title) => `
  <header class="ad-page-head"><div><h1 class="ad-h1">${esc(title)}</h1></div></header>
  <section class="ad-card"><div class="ad-empty">Halaman ini segera hadir.</div></section>`;

async function render() {
  const name = routeName();
  const my = ++token;
  sheet?.close();

  if (!PAGES[name]) {
    setActive(null);
    view.innerHTML = `<div class="ad-empty"><h1 class="ad-h1">Halaman tidak ditemukan</h1>
      <p><a href="#/${DEFAULT_PAGE}">Kembali ke Dashboard</a></p></div>`;
    return;
  }
  setActive(name);
  document.title = `${PAGES[name]} — Admin · Hijabii`;
  view.setAttribute("aria-busy", "true");
  view.innerHTML = skeleton();

  try {
    const res = await fetchRaw(`pages/${name}.html`);
    if (my !== token) return;
    if (res.status === 404) { view.innerHTML = soonPage(PAGES[name]); return; }
    if (!res.ok) throw new Error(`pages/${name}.html (${res.status})`);
    const [html, mod] = await Promise.all([res.text(), import(`./pages/${name}.js`)]);
    if (my !== token) return;
    view.innerHTML = html;
    await mod.init({ root: view, profile, isStale: () => my !== token });
    if (my !== token) return;
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    if (my !== token) return;
    view.innerHTML = `<div class="ad-error" role="alert">Halaman gagal dimuat.<br>
      <button class="btn btn-secondary btn-sm" type="button" id="retryPage">Coba lagi</button></div>`;
    $("retryPage")?.addEventListener("click", render);
  } finally {
    if (my === token) view.removeAttribute("aria-busy");
  }
}

/** Sheet "Lainnya" di mobile: tautan diambil dari item menu lanjutan di sidebar (satu sumber). */
function openMore() {
  const cur = routeName();
  const links = [...document.querySelectorAll("#app-sidebar .ad-more-item")].map((a) => `
    <a href="${esc(a.getAttribute("href"))}" data-route="${esc(a.dataset.route)}" ${a.dataset.route === cur ? 'aria-current="page"' : ""}>
      ${a.querySelector("svg").outerHTML}<span>${esc(a.querySelector(".ad-lbl").textContent)}</span></a>`).join("");
  sheet = openModal({ title: "Menu lainnya", size: "sm", html: `<div class="ad-more-grid">${links}</div>` });
  sheet.el.addEventListener("click", (e) => { if (e.target.closest(".ad-more-grid a")) sheet?.close(); });
}

/** Badge angka di menu Pesanan. Dipanggil dari halaman lain: window.dispatchEvent(new CustomEvent("ad:orders-badge", { detail: 3 })). */
function wireBadge() {
  window.addEventListener("ad:orders-badge", (e) => {
    const el = $("navBadgeOrders"); if (!el) return;
    const n = Number(e.detail) || 0;
    el.textContent = n > 99 ? "99+" : String(n);
    el.hidden = n <= 0;
    el.setAttribute("aria-label", `${n} pesanan perlu tindakan`);
  });
}

async function mountPartials() {
  const [h, s, f] = await Promise.all(["partials/header.html", "partials/sidebar.html", "partials/footer.html"].map(fetchText));
  $("app-header").innerHTML = h;
  $("app-sidebar").innerHTML = s;
  $("app-footer").innerHTML = f;

  // Nama depan saja (tanpa email). Kosong -> "Admin".
  const first = (profile.full_name || "").trim().split(/\s+/)[0];
  $("hdrAvatar").textContent = (first[0] || "A").toUpperCase();
  $("hdrGreet").textContent = `Halo, ${first || "Admin"}`;
  $("btnLogout").addEventListener("click", async () => {
    await signOut();
    location.replace(`${ROUTES.login}?reason=logout`);
  });
  $("btnMore").addEventListener("click", openMore);
  wireBadge();
}

(async function boot() {
  profile = await requireAuth({ roles: ["admin"] });
  if (!profile) return; // requireAuth sudah mengalihkan

  try { await mountPartials(); }
  catch (e) {
    console.error(e);
    $("boot").textContent = "Gagal memuat tampilan. Muat ulang halaman.";
    return;
  }
  $("boot").hidden = true;
  $("app").hidden = false;

  supabase.auth.onAuthStateChange((evt) => {
    if (evt === "SIGNED_OUT") location.replace(ROUTES.login);
  });
  window.addEventListener("hashchange", render);
  if (!location.hash) history.replaceState(null, "", `#/${DEFAULT_PAGE}`);
  render();
})().catch((e) => { console.error(e); toast("Terjadi kesalahan saat memuat panel.", "error"); });
