// Shell Customer (SPA hash routing seperti admin): halaman katalog bersifat publik; keranjang, checkout, pesanan, dan akun butuh login customer.
// Halaman dimuat dari pages/<nama>.js dan dipanggil init({ root, parts, query, profile, isStale }) -> boleh mengembalikan fungsi pembersih.
import { getProfile, signOut } from "../assets/js/auth.js";
import { ROUTES, roleHome } from "../assets/js/routes.js";
import { ROLE } from "../assets/js/labels.js";
import { supabase, me, isCustomer, goLogin, esc, toast, ICON, refreshCartCount, getSettings, waLink } from "./tk-lib.js";

const view = document.getElementById("view");
const ROUTE = {
  "": { mod: "beranda", title: "Beranda", nav: "home" },
  beranda: { mod: "beranda", title: "Beranda", nav: "home" },
  katalog: { mod: "katalog", title: "Katalog", nav: "home" },
  produk: { mod: "produk", title: "Produk", nav: "home" },
  lookbook: { mod: "lookbook", title: "Lookbook", nav: "home" },
  faq: { mod: "faq", title: "FAQ", nav: "akun" },
  keranjang: { mod: "keranjang", title: "Keranjang", nav: "keranjang", auth: true },
  checkout: { mod: "checkout", title: "Checkout", nav: "checkout", auth: true },
  pesanan: { mod: "pesanan", title: "Pesanan Saya", nav: "pesanan", auth: true },
  akun: { mod: "akun", title: "Akun", nav: "akun", auth: true },
   profil: { mod: "profil", title: "Profil", nav: "akun", auth: true },
   alamat: { mod: "alamat", title: "Alamat", nav: "alamat", auth: true },
  notifikasi: { mod: "notifikasi", title: "Notifikasi", nav: "akun", auth: true },
};
let token = 0, cleanup = null, teardown = [];
// Halaman yang sudah tersedia. Rute lain tampil "segera hadir" sampai berkasnya ditambahkan (daftarkan namanya di sini).
const READY = new Set(["beranda", "keranjang", "lookbook", "produk", "checkout", "pesanan", "katalog", "akun", "profil","alamat","faq","notifikasi"]);

// Ikon filter (dipakai tombol di header; hanya tampil di halaman Katalog pada layar <1024px, lihat shell.css)
const FILTER_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? "", parts: parts.slice(1), query: new URLSearchParams(qs) };
}

/* ---------------- Kerangka ---------------- */
function paintShell() {
  const p = me.profile, customer = isCustomer();
  const menu = [["#/", "Home", "home"], ["#/katalog", "Katalog", "katalog"], ["#/lookbook", "Lookbook", "lookbook"], ["#/faq", "FAQ", "faq"], ["#/pesanan", "Pesanan", "pesanan"]]
    .map(([h, t, k]) => `<a href="${h}" data-menu="${k}">${t}</a>`).join("");
  const searchForm = (id, cls) => `<form class="${cls}" role="search" data-search><label class="sr-only" for="${id}">Cari produk</label>
    ${cls === "tk-search" ? ICON.search : ""}<input id="${id}" type="search" placeholder="Cari produk…" autocomplete="off" enterkeyhint="search" maxlength="60"></form>`;
  document.getElementById("tkTop").innerHTML = p && !customer
    ? `<div class="tk-strip">Anda masuk sebagai ${esc(ROLE[p.role] ?? p.role)}. Akun ini tidak bisa berbelanja. <a href="${esc(roleHome(p.role))}">Buka panel</a></div>` : "";
  // Ikon di samping kolom cari: lonceng (semua ukuran, hanya customer), keranjang dan akun (≥1024px; di bawah itu ada di bottom nav).
  document.getElementById("tkHeadSlot").innerHTML = `
  <header class="tk-header"><div class="tk-wrap">
    <div class="tk-bar">
      <a class="tk-logo" href="#/" aria-label="Hijabii, ke beranda">Hijabii</a>
      <nav class="tk-menu" aria-label="Menu utama">${menu}</nav>
      <div class="tk-actions">
        ${searchForm("tkQ", "tk-search")}
        <button type="button" class="tk-ico tk-only-search-m" id="tkSearchBtn" aria-label="Cari produk" aria-expanded="false">${ICON.search}</button>
        <button type="button" class="tk-ico tk-filter-btn" id="tkFilterBtn" aria-label="Filter kategori">${FILTER_ICON}</button>
        ${customer ? `<span class="tk-bell" id="tkBell"></span>` : ""}
        <a class="tk-ico tk-cart-ico tk-only-d" href="#/keranjang" id="tkCartLink" aria-label="Keranjang">${ICON.bag}<span class="tk-nbadge" id="tkCartN" hidden>0</span></a>
        ${p ? `<a class="tk-ico tk-only-d" href="#/akun" aria-label="Akun">${ICON.user}</a>` : `<span class="tk-login"><a href="${esc(ROUTES.login)}?next=${encodeURIComponent(location.pathname)}">Masuk</a><a class="is-fill tk-reg" href="${esc(ROUTES.login.replace("login.html", "daftar.html"))}">Daftar</a></span>`}
      </div>
    </div>
    <div class="tk-searchbar" id="tkSearchbar">${searchForm("tkQm", "tk-sbf")}</div>
  </div></header>`;
  document.getElementById("tkFootSlot").innerHTML = `
  <a class="tk-wa" id="tkWa" href="#" target="_blank" rel="noopener" hidden aria-label="Chat WhatsApp admin">${ICON.chat}<span>Chat admin</span></a>
  <nav class="bottom-nav" aria-label="Navigasi utama">
    <a href="#/" data-nav="home">${ICON.home}<span>Home</span></a>
    <a href="#/keranjang" data-nav="keranjang">${ICON.bag}<span>Keranjang</span><span class="tk-nbadge" id="tkNavCart" hidden></span></a>
    <a href="#/pesanan" data-nav="pesanan">${ICON.receipt}<span>Pesanan</span></a>
    <a href="#/akun" data-nav="akun">${ICON.user}<span>Akun</span></a>
  </nav>`;

  // pencarian: desktop + baris di bawah header (mobile)
  const sb = document.getElementById("tkSearchbar"), btn = document.getElementById("tkSearchBtn");
  btn.addEventListener("click", () => {
    const open = !sb.classList.contains("is-open");
    sb.classList.toggle("is-open", open); btn.setAttribute("aria-expanded", String(open));
    if (open) document.getElementById("tkQm").focus();
  });
  document.querySelectorAll("[data-search]").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = f.querySelector("input").value.trim().slice(0, 60);
    sb.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false");
    location.hash = q ? `#/katalog?q=${encodeURIComponent(q)}` : "#/katalog";
  }));
  document.getElementById("tkFilterBtn").addEventListener("click", () => window.dispatchEvent(new CustomEvent("tk:filter")));   // dipasang oleh pages/katalog.js
  window.addEventListener("tk:cart", (e) => {
    const n = Number(e.detail) || 0, t = n > 99 ? "99+" : String(n);
    const c = document.getElementById("tkCartN"); c.textContent = t; c.hidden = n <= 0;
    document.getElementById("tkCartLink").setAttribute("aria-label", n > 0 ? `Keranjang, ${n} barang` : "Keranjang");
    const b = document.getElementById("tkNavCart"); b.textContent = t; b.hidden = n <= 0;
    b.setAttribute("aria-label", `${n} barang di keranjang`);
  });
  getSettings().then((s) => {
    const a = document.getElementById("tkWa"), url = waLink(s, "Halo Hijabii, saya mau tanya.");
    if (url) { a.href = url; a.hidden = false; }
  }).catch(() => {});
}

function setActive(r, name) {
  document.body.dataset.route = name || "beranda";
  document.querySelectorAll(".bottom-nav [data-nav]").forEach((a) => {
    if (a.dataset.nav === r?.nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tk-menu [data-menu]").forEach((a) => {
    const k = name === "" || name === "beranda" ? "home" : name;
    if (a.dataset.menu === k) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

const skeleton = () => `<div class="tk-wrap" aria-hidden="true"><div class="skeleton" style="height:40px;width:45%;margin:6px 0 20px"></div>
  <div class="skeleton tk-sk"></div><div class="skeleton tk-sk"></div><div class="skeleton tk-sk" style="width:60%"></div></div>`;
const notice = (title, text, href, label) => `<div class="tk-wrap"><div class="tk-empty"><strong>${esc(title)}</strong><p style="margin:0">${esc(text)}</p><a class="btn btn-accent" href="${esc(href)}">${esc(label)}</a></div></div>`;

/* ---------------- Router ---------------- */
async function render() {
  const { name, parts, query } = parseHash();
  const r = ROUTE[name];
  const my = ++token;
  try { await cleanup?.(); } catch (e) { console.error(e); }
  cleanup = null;
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  document.body.classList.remove("scroll-lock");

  if (!r) {
    setActive(null, name);
    view.innerHTML = notice("Halaman tidak ditemukan", "Alamat yang Anda buka tidak ada.", "#/", "Ke beranda");
    document.title = "Tidak ditemukan — Hijabii";
    return;
  }
  setActive(r, name);
  document.title = `${r.title} — Hijabii by Intan`;
  if (r.auth) {
    if (!me.profile) { goLogin(); return; }
    if (!isCustomer()) {
      view.innerHTML = notice("Khusus customer", "Akun admin tidak bisa berbelanja atau memesan. Gunakan akun customer untuk mencoba alur belanja.", roleHome(me.profile.role), "Buka panel");
      return;
    }
  }
  if (!READY.has(r.mod)) {
    view.innerHTML = notice(`${r.title} segera hadir`, "Halaman ini sedang disiapkan.", "#/keranjang", "Ke keranjang");
    return;
  }
  view.setAttribute("aria-busy", "true");
  view.innerHTML = skeleton();
  try {
    const mod = await import(`./pages/${r.mod}.js`);
    if (my !== token) return;
    view.innerHTML = "";
    const out = await mod.init({ root: view, parts, query, profile: me.profile, isStale: () => my !== token });
    if (my !== token) { try { await out?.(); } catch { /* abaikan */ } return; }
    cleanup = typeof out === "function" ? out : null;
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    if (my !== token) return;
    view.innerHTML = `<div class="tk-wrap"><div class="tk-error" role="alert">Halaman gagal dimuat. Periksa koneksi lalu coba lagi.<br>
      <button class="btn btn-secondary btn-sm" type="button" id="retryPage">Coba lagi</button></div></div>`;
    document.getElementById("retryPage")?.addEventListener("click", render);
  } finally {
    if (my === token) view.removeAttribute("aria-busy");
  }
}

/* ---------------- Boot ---------------- */
(async function boot() {
  if (!supabase) { view.innerHTML = notice("Belum dikonfigurasi", "Isi SUPABASE_URL dan SUPABASE_ANON_KEY di config.js.", "#/", "Muat ulang"); return; }
  const profile = await getProfile().catch(() => null);
  if (profile) {
    if (!profile.is_active) { await signOut(); location.replace(`${ROUTES.login}?reason=nonaktif`); return; }
    if (profile.must_change_password) { location.replace(ROUTES.changePassword); return; }   // wajib ganti password: tidak bisa dilewati
    me.profile = profile;
  }
  // gambar yang gagal dimuat -> placeholder (layout tidak melompat)
  window.addEventListener("error", (e) => {
    const el = e.target;
    if (el?.tagName === "IMG" && el.classList.contains("tk-img")) {
      const ph = Object.assign(document.createElement("div"), { className: "tk-ph", textContent: (el.alt || "foto").slice(0, 26) });
      el.replaceWith(ph);
    }
  }, true);

  paintShell();
  if (isCustomer()) {
    refreshCartCount();
    // Lonceng realtime + push (langganan push diselaraskan otomatis di sini bila izin sudah ada). Gagal dimuat tidak boleh merusak toko.
    import("./bell.js")
      .then(({ mountBell }) => teardown.push(mountBell({ host: document.getElementById("tkBell"), supabase, profile: me.profile })))
      .catch((e) => console.error(e));
  }
  supabase.auth.onAuthStateChange((evt) => {
    if (evt === "SIGNED_OUT" && me.profile) { teardown.forEach((f) => f?.()); location.replace(ROUTES.home.customer); }
  });
  window.__tkNav = 0;   // jumlah perpindahan halaman internal (untuk tombol Kembali)
  window.addEventListener("hashchange", () => { window.__tkNav += 1; render(); });
  window.addEventListener("pageshow", (e) => { if (e.persisted) refreshCartCount(); });
  await render();
})().catch((e) => { console.error(e); toast("Terjadi kesalahan saat memuat toko.", "error"); });