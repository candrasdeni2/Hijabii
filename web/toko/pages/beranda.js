// Beranda (publik): hero, Koleksi Hijabii (produk asli dari Supabase), dan Lookbook di bawah produk (semua ukuran layar).
// Gaya ada di pages/beranda.css (selector berawalan .bd-, tidak bentrok dengan shell.css).
import { supabase, img, esc, loadProducts, productCard, gridSkeleton, errorBox } from "../tk-lib.js";

const IMG_DIR = "../assets/img/";   // relatif terhadap toko/index.html
const HERO = [["hero-01", "72% center"], ["hero-02", "68% center"], ["hero-03", "75% center"]];
const EXTS = ["png", "jpg", "jpeg", "webp"];
const reduceMotion = () => matchMedia("(prefers-reduced-motion:reduce)").matches;

/** Muat beranda.css sekali (dibiarkan terpasang agar kunjungan berikutnya tanpa kedip). */
function loadCss() {
  if (document.querySelector("link[data-bd]")) return Promise.resolve();
  return new Promise((done) => {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.dataset.bd = "1";
    l.href = new URL("./beranda.css", import.meta.url).href;
    l.onload = l.onerror = () => done();
    document.head.append(l);
  });
}

/** Foto statis dari assets/img/<nama>.(png|jpg|jpeg|webp); belum ada -> tetap placeholder. */
function loadStatic(el) {
  const n = el.dataset.img, im = new Image();
  let i = 0;
  im.alt = el.dataset.alt ?? "";
  im.decoding = "async";
  im.style.objectPosition = el.dataset.pos || "center";
  const next = () => { if (i < EXTS.length) im.src = `${IMG_DIR}${n}.${EXTS[i++]}`; };
  im.onload = () => { el.prepend(im); el.classList.add("has-img"); };
  im.onerror = next;
  next();
}

export async function init({ root, isStale }) {
  await loadCss();
  if (isStale()) return;

  root.innerHTML = `
  <div class="tk-wrap bd">
    <section class="bd-hero" aria-label="Hijabii">
      <div class="bd-slides" aria-hidden="true">
        ${HERO.map(([n, pos], i) => `<div class="bd-slide${i === 0 ? " on" : ""}" data-img="${n}" data-pos="${pos}"></div>`).join("")}
      </div>
      <div class="bd-hero-in">
        <h1 class="bd-tag">Pretty with <em>hijab</em>,<br>pretty with Hijabii.</h1>
        <p class="bd-lead">Hijab nyaman, berkualitas, dan terjangkau untuk setiap langkahmu.</p>
        <div class="bd-dots" role="group" aria-label="Pilih foto">
          ${HERO.map((_, i) => `<button type="button" data-d="${i}" aria-label="Foto ${i + 1}" aria-pressed="${i === 0}"></button>`).join("")}
        </div>
      </div>
    </section>

    <section class="bd-sec" aria-labelledby="bdKoleksi" id="bdKoleksiSec">
      <div class="bd-sec-head">
        <h2 class="bd-h2" id="bdKoleksi">Koleksi Hijabii</h2>
        <a class="bd-all" href="#/katalog">Lihat Semua <span aria-hidden="true">→</span></a>
      </div>
      <div id="bdProducts">${gridSkeleton(6)}</div>
    </section>

    <section class="bd-sec bd-lbsec" aria-labelledby="bdLb" id="bdLbSec" hidden>
      <div class="bd-sec-head">
        <h2 class="bd-h2" id="bdLb">Lookbook</h2>
        <a class="bd-all" href="#/lookbook">Lihat Semua <span aria-hidden="true">→</span></a>
      </div>
      <div class="bd-lbrow" id="bdLbRow"></div>
    </section>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  let dead = false, auto = null;

  $$("[data-img]").forEach(loadStatic);

  /* hero: crossfade + titik */
  const slides = $$(".bd-slide"), dots = $$(".bd-dots button");
  let si = 0;
  const show = (i) => {
    si = i;
    slides.forEach((s, j) => s.classList.toggle("on", j === i));
    dots.forEach((d, j) => d.setAttribute("aria-pressed", String(j === i)));
  };
  if (!reduceMotion()) auto = setInterval(() => show((si + 1) % slides.length), 6000);
  $(".bd-dots").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    show(+b.dataset.d); clearInterval(auto);
  });

  /* koleksi: 6 produk aktif, yang stoknya habis di belakang */
  const holder = $("#bdProducts");
  async function loadData() {
    holder.innerHTML = gridSkeleton(6);
    let list;
    try { list = await loadProducts({ limit: 12 }); }
    catch (e) {
      console.error(e);
      if (isStale() || dead) return;
      holder.innerHTML = errorBox();
      holder.querySelector("[data-retry]").addEventListener("click", loadData);
      return;
    }
    if (isStale() || dead) return;
    list.sort((a, b) => (a.stock <= 0) - (b.stock <= 0));
    if (!list.length) { $("#bdKoleksiSec").hidden = true; return; }
    holder.innerHTML = `<div class="bd-grid">${list.slice(0, 6).map(productCard).join("")}</div>`;
  }
  loadData();

  /* lookbook: di bawah produk; kosong/gagal -> seksi tetap tersembunyi */
  async function loadLookbook() {
    const { data, error } = await supabase.from("lookbooks").select("id, title, image_path")
      .eq("is_active", true).order("sort_order").order("created_at").limit(8);
    if (isStale() || dead) return;
    if (error) { console.error(error); return; }
    if (!data?.length) return;
    $("#bdLbRow").innerHTML = data.map((l) => `<a class="bd-lbc" href="#/lookbook" aria-label="${esc(l.title)}">${img(l.image_path, l.title)}<span>${esc(l.title)}</span></a>`).join("");
    $("#bdLbSec").hidden = false;
  }
  loadLookbook();

  return () => { dead = true; clearInterval(auto); };
}