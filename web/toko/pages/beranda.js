// Beranda (publik): hero, tentang, koleksi (produk asli dari Supabase), alasan memilih Hijabii, Find Your Color, FAQ, ajakan belanja.
// Gaya ada di pages/beranda.css (semua selector berawalan .bd- supaya tidak bentrok dengan shell.css).
// Pengunjung yang belum login melihat ajakan Masuk/Daftar; login baru dibutuhkan saat keranjang/checkout (diatur shell.js).
import { loadProducts, productCard, gridSkeleton, errorBox, img, hexOk, esc } from "../tk-lib.js";
import { ROUTES } from "../../assets/js/routes.js";

const IMG_DIR = "../assets/img/";   // relatif terhadap toko/index.html
const HERO = [["hero-01", "72% center"], ["hero-02", "68% center"], ["hero-03", "75% center"]];
const EXTS = ["png", "jpg", "jpeg", "webp"];
const FAQ = [
  ["Bagaimana cara order?", "Pilih produk, warna, dan ukuran, lalu masukkan ke keranjang. Saat checkout kamu diminta masuk atau daftar dulu. Setelah pesanan dibuat, kirim ke WhatsApp admin untuk konfirmasi stok dan total. Pembayaran lewat DANA atau transfer rekening, lalu pesanan diproses."],
  ["Bagaimana pengiriman ke luar kota?", "Pesanan dikirim dari Lebak, Banten, lewat Kantor Pos, J&T, atau JNE. Estimasi tiba tergantung kota tujuan."],
  ["Apa ukuran produknya?", "Pasmina berukuran 170 × 80 cm. Bergo tersedia ukuran M dan L. Warna di foto bisa sedikit berbeda karena pencahayaan."],
  ["Bagaimana kebijakan retur dan penukaran?", "Retur dan penukaran hanya untuk produk rusak (sobek), cacat, atau salah kirim. Sertakan video unboxing dan ajukan maksimal 2×24 jam setelah barang diterima. Produk yang sudah dibeli tidak dapat dikembalikan."],
  ["Bagaimana cara merawat hijab?", "Jangan menyikat atau memeras terlalu keras, hindari jarum pentul untuk hijab viscose, hindari panas berlebih saat menjemur dan menyetrika, dan simpan di tempat bersih dan kering."],
];
const IG = "https://instagram.com/Hijabii_official";
const TT = "https://www.tiktok.com/@Hijabi_official";   // ejaan mengikuti landing lama, cek lagi ke klien

const reduceMotion = () => matchMedia("(prefers-reduced-motion:reduce)").matches;

/** Muat beranda.css sekali (dibiarkan terpasang setelahnya agar kunjungan berikutnya tanpa kedip). */
function loadCss() {
  const old = document.querySelector("link[data-bd]");
  if (old) return Promise.resolve();
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

export async function init({ root, profile, isStale }) {
  await loadCss();
  if (isStale()) return;

  const guest = !profile;
  const next = encodeURIComponent(location.pathname);
  const loginHref = `${ROUTES.login}?next=${next}`;
  const regHref = `${ROUTES.login.replace("login.html", "daftar.html")}?next=${next}`;

  root.innerHTML = `
  <div class="tk-wrap bd">
    <section class="bd-hero" aria-label="Hijabii">
      <div class="bd-slides" aria-hidden="true">
        ${HERO.map(([n, pos], i) => `<div class="bd-slide${i === 0 ? " on" : ""}" data-img="${n}" data-pos="${pos}"></div>`).join("")}
      </div>
      <div class="bd-hero-in">
        <h1 class="bd-brand">Hijabii</h1>
        <p class="bd-tag">Pretty with hijab, pretty with Hijabii.</p>
        <p class="bd-lead">Hijab nyaman, berkualitas, dan terjangkau untuk setiap langkahmu.</p>
        <div class="bd-btns">
          <a class="btn btn-primary" href="#/katalog">Belanja sekarang</a>
          <a class="btn btn-secondary" href="#bd-warna" data-jump="bd-warna">Find Your Color</a>
        </div>
        ${guest ? `<p class="bd-guest">Sudah punya akun? <a href="${esc(loginHref)}">Masuk</a> atau <a href="${esc(regHref)}">daftar</a> untuk checkout.</p>` : ""}
        <div class="bd-dots" role="group" aria-label="Pilih foto">
          ${HERO.map((_, i) => `<button type="button" data-d="${i}" aria-label="Foto ${i + 1}" aria-pressed="${i === 0}"></button>`).join("")}
        </div>
      </div>
    </section>

    <section class="bd-sec bd-about" aria-labelledby="bdAbout">
      <div>
        <h2 class="bd-h2" id="bdAbout">Hijabku, identitasku.</h2>
        <p class="bd-p">Hijabii lahir dari keresahan sederhana: sulit menemukan hijab yang nyaman dan berkualitas dengan harga terjangkau. Dari beberapa pasmina, kami tumbuh bersama kepercayaan customer hingga punya pilihan bahan, warna, dan model.</p>
        <p class="bd-p">Nama Hijabii berasal dari “hijab” dan “lii” yang berarti “milikku”. Bagi kami, hijab adalah bagian dari identitas seorang Muslimah.</p>
      </div>
      <div class="bd-about-img">
        <div class="bd-ph" style="aspect-ratio:4/5" data-img="about-model" data-alt="Model memakai hijab Hijabii"></div>
        <div class="bd-ph" style="aspect-ratio:1;margin-top:56px" data-img="about-bahan" data-alt="Bahan hijab Hijabii"></div>
      </div>
    </section>

    <section class="bd-sec" id="bd-koleksi" aria-labelledby="bdKoleksi">
      <div class="bd-sec-head">
        <h2 class="bd-h2" id="bdKoleksi">Koleksi Hijabii</h2>
        <a class="btn btn-ghost" href="#/katalog">Lihat semua</a>
      </div>
      <div id="bdProducts">${gridSkeleton(6)}</div>
    </section>

    <section class="bd-sec bd-panel bd-sand" aria-labelledby="bdWhy">
      <h2 class="bd-h2" id="bdWhy" style="max-width:20ch">Nyaman, terjangkau, tetap bergaya.</h2>
      <div class="bd-why">
        <div><h3>Bahan nyaman</h3><p>Adem dipakai seharian, jatuhnya flowly dan mudah dibentuk.</p></div>
        <div><h3>Harga terjangkau</h3><p>Bahan berkualitas mulai dari Rp 15.000.</p></div>
        <div><h3>Mengikuti tren</h3><p>Warna, bahan, dan model yang sesuai gaya Muslimah masa kini.</p></div>
      </div>
      <div class="bd-stats">
        <div><b data-count="1878">1.878</b><span>produk terjual</span></div>
        <div id="bdStatTypes" hidden><b data-count="0">0</b><span>jenis produk</span></div>
        <div><b>2025</b><span>mulai berdiri</span></div>
      </div>
    </section>

    <section class="bd-sec bd-color" id="bd-warna" aria-labelledby="bdColor" hidden>
      <div>
        <h2 class="bd-h2" id="bdColor">Find your color.</h2>
        <p class="bd-p">Pilih warna favoritmu, lihat tampilannya, lalu buka produknya.</p>
        <div class="bd-sws" id="bdSws" role="group" aria-label="Pilih warna"></div>
        <p class="bd-cname" id="bdCname" aria-live="polite"></p>
        <a class="btn btn-primary" id="bdCbtn" href="#/katalog">Lihat produk</a>
      </div>
      <div class="bd-cimg" id="bdCimg"></div>
    </section>

    <section class="bd-sec" aria-labelledby="bdFaq">
      <h2 class="bd-h2" id="bdFaq">Pertanyaan umum</h2>
      <div class="tk-faq" id="bdFaqList" style="margin-top:20px">
        ${FAQ.map(([q, a], i) => `<div class="tk-q">
          <button type="button" aria-expanded="false" aria-controls="bdA${i}"><span>${esc(q)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="tk-q-a" id="bdA${i}" role="region"><div><p>${esc(a)}</p></div></div></div>`).join("")}
      </div>
    </section>

    <section class="bd-cta" aria-labelledby="bdCta">
      <div class="bd-cta-bg" data-img="cta-banner" data-pos="100% 28%" aria-hidden="true"></div>
      <div class="bd-cta-in">
        <h2 id="bdCta">Be you.<br>Be Hijabii.</h2>
        <p>Temukan warna dan model yang paling kamu banget.</p>
        <div class="bd-btns">
          <a class="btn tk-btn-light" href="#/katalog">Belanja sekarang</a>
          ${guest ? `<a class="btn bd-btn-line" href="${esc(regHref)}">Daftar gratis</a>` : ""}
        </div>
      </div>
    </section>

    <footer class="bd-foot">
      <div><p class="bd-flogo">Hijabii</p><p>Hijabii by Intan<br>Pretty with hijab, pretty with Hijabii.</p></div>
      <div><p class="bd-fh">Kontak</p><p>hijabiibyintan@gmail.com<br>Kp. Pasir Bedil, Desa Cempaka, Kec. Warunggunung, Lebak, Banten</p></div>
      <div><p class="bd-fh">Pembayaran &amp; pengiriman</p><p>DANA, transfer bank<br>Kantor Pos, J&amp;T, JNE</p></div>
      <div><p class="bd-fh">Ikuti kami</p><p><a href="${IG}" target="_blank" rel="noopener">Instagram @Hijabii_official</a><br><a href="${TT}" target="_blank" rel="noopener">TikTok @Hijabi_official</a></p></div>
    </footer>
  </div>`;

  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const timers = [];
  let io = null, dead = false;

  /* ---- foto statis ---- */
  $$("[data-img]").forEach(loadStatic);

  /* ---- hero: crossfade + titik ---- */
  const slides = $$(".bd-slide"), dots = $$(".bd-dots button");
  let si = 0, auto = null;
  const show = (i) => {
    si = i;
    slides.forEach((s, j) => s.classList.toggle("on", j === i));
    dots.forEach((d, j) => d.setAttribute("aria-pressed", String(j === i)));
  };
  if (!reduceMotion()) { auto = setInterval(() => show((si + 1) % slides.length), 6000); timers.push(auto); }
  $(".bd-dots").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    show(+b.dataset.d); clearInterval(auto);
  });

  /* ---- lompat ke bagian di halaman yang sama (hash dipakai router, jadi tidak pakai href #id) ---- */
  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-jump]"); if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.jump)?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  });

  /* ---- FAQ ---- */
  $("#bdFaqList").addEventListener("click", (e) => {
    const b = e.target.closest(".tk-q button"); if (!b) return;
    b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"));
  });

  /* ---- angka berjalan ---- */
  const fmt = (n) => n.toLocaleString("id-ID");
  function count(el) {
    const to = +el.dataset.count || 0;
    if (reduceMotion()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    (function f(t) {
      if (dead) return;
      const k = Math.min((t - t0) / 1400, 1);
      el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }
  function watchCounts() {
    if (!("IntersectionObserver" in window)) { $$("[data-count]").forEach((el) => { el.textContent = fmt(+el.dataset.count || 0); }); return; }
    io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      count(e.target); io.unobserve(e.target);
    }), { threshold: 0.4 });
    $$("[data-count]").forEach((el) => io.observe(el));
  }

  /* ---- Find Your Color: warna diambil dari produk aktif ---- */
  function paintColors(list) {
    const seen = new Map();
    for (const p of list) for (const c of p.colors) {
      const k = String(c.name).trim().toLowerCase();
      if ((c.image || c.hex) && !seen.has(k)) seen.set(k, { name: c.name, hex: c.hex, image: c.image, slug: p.slug, product: p.name });
    }
    const cols = [...seen.values()].slice(0, 8);
    if (!cols.length) return;
    const box = $("#bdCimg"), sws = $("#bdSws");
    sws.innerHTML = cols.map((c, i) => c.hex
      ? `<button type="button" data-c="${i}" aria-pressed="false" aria-label="${esc(c.name)}" style="background:${hexOk(c.hex)}"></button>`
      : `<button type="button" data-c="${i}" aria-pressed="false" aria-label="${esc(c.name)}" class="has-thumb">${img(c.image, c.name)}</button>`).join("");
    const pick = (i) => {
      const c = cols[i];
      $$("#bdSws button").forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
      $("#bdCname").textContent = c.name;
      box.innerHTML = img(c.image, `${c.product} warna ${c.name}`);
      box.style.boxShadow = c.hex ? `0 0 0 10px ${hexOk(c.hex)}` : "none";
      const a = $("#bdCbtn");
      a.href = `#/produk/${encodeURIComponent(c.slug)}`;
      a.textContent = `Lihat ${c.product}`;
    };
    sws.addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (b) pick(+b.dataset.c); });
    pick(0);
    $("#bd-warna").hidden = false;
  }

  /* ---- produk + data turunannya ---- */
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
      watchCounts();
      return;
    }
    if (isStale() || dead) return;
    list = list.sort((a, b) => (a.stock <= 0) - (b.stock <= 0));
    if (!list.length) {
      $("#bd-koleksi").hidden = true;
    } else {
      holder.innerHTML = `<div class="bd-grid">${list.slice(0, 6).map(productCard).join("")}</div>`;
      const t = $("#bdStatTypes"); t.querySelector("b").dataset.count = String(list.length); t.hidden = false;
      paintColors(list);
    }
    watchCounts();
  }
  loadData();

  return () => {
    dead = true;
    timers.forEach(clearInterval);
    io?.disconnect();
  };
}
