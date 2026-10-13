// Shell Super Admin: guard peran, memuat partial (header/sidebar/footer), lalu router hash memuat pages/<nama>.html + .js
import { requireAuth, signOut } from "../assets/js/auth.js";
import { supabase } from "../assets/js/supabase.js";
import { ROUTES } from "../assets/js/routes.js";
import { toast } from "../assets/js/ui.js";

const BASE = new URL("./", import.meta.url);
const PAGES = { dashboard: "Dashboard", admin: "Kelola Admin", user: "Kelola User", log: "Log Aktivitas" };
const DEFAULT_PAGE = "dashboard";

const $ = (id) => document.getElementById(id);
const view = $("view");
let profile = null;
let token = 0;

const fetchText = async (path) => {
  const r = await fetch(new URL(path, BASE), { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path} (${r.status})`);
  return r.text();
};

const routeName = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split(/[/?]/)[0] || DEFAULT_PAGE;

function setActive(name) {
  document.querySelectorAll("#app-sidebar [data-route]").forEach((a) => {
    if (a.dataset.route === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

const skeleton = () => `<div aria-hidden="true"><div class="sa-skel" style="width:40%;height:36px"></div>
  <div class="sa-skel"></div><div class="sa-skel"></div><div class="sa-skel"></div></div>`;

async function render() {
  const name = routeName();
  const my = ++token;

  if (!PAGES[name]) {
    setActive(null);
    view.innerHTML = `<div class="sa-empty"><h1 class="sa-h1">Halaman tidak ditemukan</h1>
      <p><a href="#/${DEFAULT_PAGE}">Kembali ke Dashboard</a></p></div>`;
    return;
  }
  setActive(name);
  document.title = `${PAGES[name]} — Super Admin · Hijabii`;
  view.setAttribute("aria-busy", "true");
  view.innerHTML = skeleton();

  try {
    const [html, mod] = await Promise.all([fetchText(`pages/${name}.html`), import(`./pages/${name}.js`)]);
    if (my !== token) return;
    view.innerHTML = html;
    await mod.init({ root: view, profile, isStale: () => my !== token });
    if (my !== token) return;
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    if (my !== token) return;
    view.innerHTML = `<div class="sa-error" role="alert">Halaman gagal dimuat.<br>
      <button class="btn btn-secondary btn-sm" type="button" id="retryPage">Coba lagi</button></div>`;
    $("retryPage")?.addEventListener("click", render);
  } finally {
    if (my === token) view.removeAttribute("aria-busy");
  }
}

async function mountPartials() {
  const [h, s, f] = await Promise.all(["partials/header.html", "partials/sidebar.html", "partials/footer.html"].map(fetchText));
  $("app-header").innerHTML = h;
  $("app-sidebar").innerHTML = s;
  $("app-footer").innerHTML = f;

  // Header sengaja tidak menampilkan email/nama akun.
  $("hdrAvatar").textContent = "S";
  $("hdrGreet").textContent = "Halo, Super Admin";
  $("btnLogout").addEventListener("click", async () => {
    await signOut();
    location.replace(`${ROUTES.login}?reason=logout`);
  });
}

(async function boot() {
  profile = await requireAuth({ roles: ["super_admin"] });
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
