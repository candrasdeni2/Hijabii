// Shell Admin: guard peran, memuat partial (header/sidebar/footer), lalu router hash memuat pages/<nama>.html + .js.
// Halaman yang berkasnya belum ada (404) otomatis tampil sebagai "segera hadir"; begitu pages/<nama>.html dan .js
// ditambahkan, rute itu langsung aktif tanpa mengubah shell.
import { requireAuth, signOut } from "../assets/js/auth.js";
import { supabase } from "../assets/js/supabase.js";
import { ROUTES } from "../assets/js/routes.js";
import { CONFIG } from "../assets/js/config.js";
import { toast } from "../assets/js/ui.js";
import { openModal, esc } from "./ad-ui.js";
import { mountSearch } from "./ad-search.js";
import { mountNotifications, mountOrdersBadge } from "./ad-notif.js";

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
let teardown = []; // fungsi pembersih modul live (pencarian, notifikasi, badge)

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

const firstName = () => (profile.full_name || "").trim().split(/\s+/)[0] || "Admin";

const soonPage = (title, sub = "") => `
  <header class="ad-page-head"><div><h1 class="ad-h1">${esc(title)}</h1>${sub ? `<p class="ad-sub">${esc(sub)}</p>` : ""}</div></header>
  <section class="ad-card"><div class="ad-empty">Halaman ini segera hadir.</div></section>`;

const CAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

/** Tanggal hari ini (WIB) di kanan judul halaman Dashboard. Dipasang shell, jadi berlaku juga untuk pages/dashboard.html nanti
 *  selama halaman itu memakai <header class="ad-page-head">. */
function decorateHead(name) {
  if (name !== DEFAULT_PAGE) return;
  const head = view.querySelector(".ad-page-head");
  if (!head || head.querySelector(".ad-date")) return;
  const now = new Date();
  const fmt = (o) => new Intl.DateTimeFormat("id-ID", { ...o, timeZone: CONFIG.TIMEZONE }).format(now);
  const label = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const short = fmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" }); // layar sempit
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.TIMEZONE }).format(now);
  head.classList.add("has-date");
  head.insertAdjacentHTML("beforeend", `<div class="ad-date">${CAL_ICON}<time datetime="${iso}" aria-label="${esc(label)}"><span class="ad-date-long">${esc(label)}</span><span class="ad-date-short" aria-hidden="true">${esc(short)}</span></time></div>`);
}

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
    if (res.status === 404) {
      view.innerHTML = soonPage(PAGES[name], name === DEFAULT_PAGE ? `Selamat datang kembali, ${firstName()}!` : "");
      decorateHead(name);
      return;
    }
    if (!res.ok) throw new Error(`pages/${name}.html (${res.status})`);
    const [html, mod] = await Promise.all([res.text(), import(`./pages/${name}.js`)]);
    if (my !== token) return;
    view.innerHTML = html;
    await mod.init({ root: view, profile, isStale: () => my !== token });
    if (my !== token) return;
    decorateHead(name);
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

  // Nama depan saja (tanpa email). Kosong -> "Admin". Blok akun ada dua (topbar mobile, bawah sidebar tablet/desktop).
  const first = firstName();
  document.querySelectorAll("[data-ad-avatar]").forEach((el) => { el.textContent = first[0].toUpperCase(); });
  document.querySelectorAll("[data-ad-name]").forEach((el) => { el.textContent = first; });
  document.querySelectorAll("[data-logout]").forEach((b) => b.addEventListener("click", async () => {
    teardown.forEach((fn) => fn());
    await signOut();
    location.replace(`${ROUTES.login}?reason=logout`);
  }));
  $("btnMore").addEventListener("click", openMore);
  wireBadge();

  // Fitur live: pencarian global, lonceng notifikasi, badge pesanan. Listener badge harus terpasang dulu (wireBadge).
  teardown = [
    mountSearch({ supabase, root: document }),
    mountNotifications({ supabase, userId: profile.id, root: document }),
    mountOrdersBadge({ supabase }),
  ];
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
    if (evt === "SIGNED_OUT") { teardown.forEach((fn) => fn()); location.replace(ROUTES.login); }
  });
  window.addEventListener("hashchange", render);
  if (!location.hash) history.replaceState(null, "", `#/${DEFAULT_PAGE}`);
  render();
})().catch((e) => { console.error(e); toast("Terjadi kesalahan saat memuat panel.", "error"); });