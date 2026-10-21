// Dashboard Admin (#/dashboard). Layout mengikuti mockup: banner sapaan, 3 kartu ringkasan (omzet, pesanan masuk, stok menipis),
// tren penjualan, perlu tindakan, stok menipis, pesanan terbaru. Tiap blok dimuat sendiri, jadi satu yang gagal tidak menjatuhkan yang lain.
import { supabase, imageUrl } from "../../assets/js/supabase.js";
import { CONFIG } from "../../assets/js/config.js";
import { statusBadge } from "../../assets/js/ui.js";
import { rupiah } from "../../assets/js/format.js";
import { esc, fmtDate } from "../ad-ui.js";
import { itemsSummary, lineTotal } from "../order-utils.js";

const LOW_STOCK = 5;   // design.md 5.4 / 9.4: stok <= 5 kuning, 0 merah
const LOW_SHOWN = 5;
const RECENT = 5;
const FILTER_KEY = "ad.orders.filters"; // sama dengan order-list.js

const ICON = {
  trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  bag: '<path d="M6 8h12l1 12H5z"/><path d="M9 8a3 3 0 016 0"/>',
  box: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.500" r="1.500"/><circle cx="17" cy="17.500" r="1.500"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
};
const svg = (k, cls = "") => `<svg viewBox="0 0 24 24" ${cls ? `class="${cls}"` : ""} aria-hidden="true">${ICON[k]}</svg>`;
const icoBox = (k) => `<span class="dh-ico">${svg(k)}</span>`;
const retry = (what) => `<div class="ad-error" role="alert">${esc(what)} gagal dimuat.<br><button type="button" class="btn btn-secondary btn-sm" data-retry>Coba lagi</button></div>`;

/* ---------- Tanggal WIB (laporan: zona WIB, minggu mulai Senin) ---------- */
const wibDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.TIMEZONE }).format(d);
const addDays = (iso, n) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const shortDay = (iso) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: CONFIG.TIMEZONE }).format(new Date())) % 24;
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}
function monthRanges(today) {
  const [y, m, d] = today.split("-").map(Number);
  const start = `${today.slice(0, 8)}01`;
  const prevStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const prevLast = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prevEnd = `${prevStart.slice(0, 8)}${String(Math.min(d, prevLast)).padStart(2, "0")}`; // periode sama bulan lalu
  return { start, prevStart, prevEnd };
}
const compact = (n) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}jt` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n);
function niceMax(v) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* ---------- Data penjualan: pesanan Selesai (nilai produk tanpa ongkir) ---------- */
async function fetchSales(today, from) {
  const { data, error } = await supabase.rpc("report_orders", { p_from: from, p_to: today, p_status: "selesai" });
  if (error) throw error;
  const byDay = new Map();
  for (const r of data ?? []) {
    const cur = byDay.get(r.final_date) ?? { value: 0, count: 0 };
    cur.value += Number(r.product_value ?? 0); cur.count += 1;
    byDay.set(r.final_date, cur);
  }
  return byDay;
}
const sumRange = (byDay, from, to) => { let value = 0, count = 0; for (const [d, x] of byDay) if (d >= from && d <= to) { value += x.value; count += x.count; } return { value, count }; };
const dayValues = (byDay, today, n) => Array.from({ length: n }, (_, i) => { const d = addDays(today, i - (n - 1)); return { day: d, value: byDay.get(d)?.value ?? 0 }; });

function renderOmzet(box, byDay, today) {
  const r = monthRanges(today);
  const cur = sumRange(byDay, r.start, today), prev = sumRange(byDay, r.prevStart, r.prevEnd);
  let note = `${cur.count} pesanan selesai bulan ini`;
  if (prev.value > 0) {
    const pct = Math.round(((cur.value - prev.value) / prev.value) * 100);
    note = `${pct >= 0 ? "↑" : "↓"} ${Math.abs(pct)}% dibanding periode sama bulan lalu`;
  }
  box.innerHTML = `${icoBox("trend")}
    <div class="dh-lbl">Omzet bulan ini</div>
    <div class="dh-val dh-val--money">${esc(rupiah(cur.value))}</div>
    <div class="dh-note">${esc(note)}</div>
    <a class="dh-go" href="#/laporan">Lihat laporan penjualan →</a>`;
}

/* ---------- Tren penjualan (batang per hari) ---------- */
function renderTrend(box, sub, byDay, today, n) {
  const days = dayValues(byDay, today, n);
  const top = niceMax(Math.max(...days.map((d) => d.value)));
  const ticks = [4, 3, 2, 1, 0].map((i) => (top / 4) * i);
  const step = n > 7 ? 5 : 1;
  sub.textContent = `Omzet ${n} hari terakhir`;
  box.innerHTML = `<div class="dh-chart" role="img" aria-label="Grafik omzet ${n} hari terakhir, total ${esc(rupiah(days.reduce((s, d) => s + d.value, 0)))}">
    <div class="dh-y">${ticks.map((t) => `<span style="bottom:${(t / top) * 100}%">${t === 0 ? "0" : compact(t)}</span>`).join("")}</div>
    <div class="dh-plot">${ticks.map((t) => `<div class="dh-line" style="bottom:${(t / top) * 100}%"></div>`).join("")}
      <div class="dh-bars">${days.map((d) => `<div class="dh-slot" title="${esc(shortDay(d.day))}: ${esc(rupiah(d.value))}"><div class="dh-bar" style="height:${(d.value / top) * 100}%"></div></div>`).join("")}</div></div>
    <div class="dh-x">${days.map((d, i) => `<span>${(n - 1 - i) % step === 0 ? esc(shortDay(d.day)) : ""}</span>`).join("")}</div></div>`;
}

/* ---------- Hitungan pesanan & stok ---------- */
async function orderCount(status) {
  const { count, error } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", status);
  if (error) throw error;
  return count ?? 0;
}

async function fetchLowRows() {
  const { data, error } = await supabase.from("product_variants")
    .select("id, size, stock, product_colors!inner(name, image_path, products!inner(id, name, status))")
    .lte("stock", LOW_STOCK).eq("product_colors.products.status", "active")
    .order("stock", { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []).map((v) => ({ stock: v.stock, size: v.size, color: v.product_colors?.name, img: v.product_colors?.image_path, pid: v.product_colors?.products?.id, name: v.product_colors?.products?.name }));
}

function renderIncoming(box, waiting, today) {
  box.innerHTML = `${icoBox("bag")}
    <div class="dh-lbl">Pesanan masuk</div>
    <div class="dh-val">${waiting}</div>
    <div class="dh-note">${waiting ? `<span class="dh-dot"></span>Perlu konfirmasi` : "Tidak ada yang menunggu"}${today ? ` · ${today} baru hari ini` : ""}</div>
    <a class="dh-go" href="#/pesanan" data-filter="${waiting ? "menunggu_konfirmasi" : ""}">Lihat semua pesanan →</a>`;
}

function renderStockCard(box, rows) {
  const out = rows.filter((r) => r.stock === 0).length;
  box.innerHTML = `${icoBox("box")}
    <div class="dh-lbl">Stok menipis</div>
    <div class="dh-val">${rows.length}</div>
    <div class="dh-note">${out ? `${out} varian sudah habis` : "Belum ada varian yang habis"}</div>
    <a class="dh-go" href="#/produk">Cek stok produk →</a>`;
}

function renderLowList(box, rows) {
  if (!rows.length) { box.innerHTML = `<div class="dh-empty">Semua stok aman. Tidak ada varian dengan stok ${LOW_STOCK} atau kurang.</div>`; return; }
  const shown = rows.slice(0, LOW_SHOWN);
  box.innerHTML = `<ul class="dh-lowlist">${shown.map((r) => {
    const url = r.img ? imageUrl(r.img) : null;
    return `<li>${url ? `<img class="dh-th" src="${esc(url)}" alt="${esc(r.name)} warna ${esc(r.color)}" loading="lazy" width="44" height="56">` : `<span class="dh-th" aria-hidden="true"></span>`}
      <div style="min-width:0"><a href="#/produk/${esc(r.pid)}">${esc(r.name)}</a><small>${esc(r.color)} / ${esc(r.size)}</small></div>
      <span class="dh-pill ${r.stock === 0 ? "dh-pill--out" : "dh-pill--low"} ">${r.stock === 0 ? "Habis" : `Sisa ${r.stock}`}</span></li>`;
  }).join("")}</ul>${rows.length > shown.length ? `<p class="dh-subline" style="margin:8px 0 0">+${rows.length - shown.length} varian lain di menu Produk.</p>` : ""}`;
}

function renderTodo(box, countEl, c) {
  const items = [
    { n: c.waiting, k: "bag", t: "Konfirmasi pesanan", d: `${c.waiting} pesanan menunggu konfirmasi`, f: "menunggu_konfirmasi", href: "#/pesanan" },
    { n: c.confirmed, k: "card", t: "Verifikasi pembayaran", d: `${c.confirmed} pesanan menunggu bukti bayar`, f: "dikonfirmasi", href: "#/pesanan" },
    { n: c.processing, k: "truck", t: "Proses dan kirim", d: `${c.processing} pesanan siap dikirim`, f: "diproses", href: "#/pesanan" },
    { n: c.out, k: "box", t: "Periksa stok produk", d: `${c.out} varian sudah habis`, f: "", href: "#/produk" },
  ].filter((i) => i.n > 0);
  countEl.hidden = !items.length; countEl.textContent = items.length;
  box.innerHTML = items.length
    ? `<div class="dh-todo">${items.map((i) => `<a href="${i.href}" ${i.f ? `data-filter="${i.f}"` : ""}>${icoBox(i.k)}<span><b>${esc(i.t)}</b><small>${esc(i.d)}</small></span>${svg("chev", "dh-chev")}</a>`).join("")}</div>`
    : `<div class="dh-empty">Semua beres. Tidak ada pesanan yang menunggu tindakan.</div>`;
}

/* ---------- Pesanan terbaru ---------- */
// Nominal ongkir tidak diambil: hanya tampil di detail invoice (rulesapp 5.6). Kolom Total = nilai produk.
async function loadRecent(box) {
  const { data, error } = await supabase.from("orders")
    .select("id, order_no, recipient_name, status, created_at, order_items(variant_id, product_name, color_name, size, qty, line_total)")
    .order("created_at", { ascending: false }).limit(RECENT);
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) { box.innerHTML = `<div class="dh-empty">Belum ada pesanan. Pesanan dari website atau pesanan manual akan muncul di sini.</div>`; return; }

  // Foto kecil dari varian item pertama. Gagal/dihapus -> placeholder.
  const thumbs = new Map();
  const ids = [...new Set(rows.map((o) => o.order_items?.[0]?.variant_id).filter(Boolean))];
  if (ids.length) {
    const { data: vs } = await supabase.from("product_variants").select("id, product_colors(image_path)").in("id", ids);
    (vs ?? []).forEach((v) => { const p = v.product_colors?.image_path; if (p) thumbs.set(v.id, imageUrl(p)); });
  }
  const thumb = (o, sm = false) => { const u = thumbs.get(o.order_items?.[0]?.variant_id); return u ? `<img class="dh-th${sm ? " dh-th--sm" : ""}" src="${esc(u)}" alt="" loading="lazy" width="34" height="42">` : `<span class="dh-th${sm ? " dh-th--sm" : ""}" aria-hidden="true"></span>`; };
  const value = (o) => (o.order_items ?? []).reduce((s, it) => s + lineTotal(it), 0);
  const link = (o) => `<a class="btn btn-secondary btn-sm" href="#/pesanan/${esc(o.id)}">Lihat detail</a>`;

  box.innerHTML = `
    <div class="ad-table-wrap"><table class="ad-table">
      <thead><tr><th scope="col">Nomor</th><th scope="col">Tanggal</th><th scope="col">Pelanggan</th><th scope="col">Produk</th><th scope="col">Total produk</th><th scope="col">Status</th><th scope="col"><span class="ad-sr">Aksi</span></th></tr></thead>
      <tbody>${rows.map((o) => `<tr>
        <td><div class="dh-no">${thumb(o, true)}${esc(o.order_no)}</div></td>
        <td style="white-space:nowrap;font-size:13px">${esc(fmtDate(o.created_at))}</td>
        <td class="ad-name" style="font-size:14px">${esc(o.recipient_name)}</td>
        <td style="max-width:15rem;font-size:13px">${esc(itemsSummary(o.order_items))}</td>
        <td style="white-space:nowrap">${esc(rupiah(value(o)))}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${link(o)}</td></tr>`).join("")}</tbody></table></div>
    <ul class="ad-cards">${rows.map((o) => `<li>
      <div class="ad-card-top"><div class="dh-no" style="min-width:0">${thumb(o, true)}<span>${esc(o.order_no)}</span></div>${statusBadge(o.status)}</div>
      <div class="ad-email" style="margin-top:8px">${esc(o.recipient_name)}</div>
      <div class="ad-meta">${esc(itemsSummary(o.order_items))}</div>
      <div class="ad-meta">${esc(fmtDate(o.created_at))} · ${esc(rupiah(value(o)))}</div>
      <div class="ad-card-actions">${link(o)}</div></li>`).join("")}</ul>`;
}

export async function init({ root, profile, isStale = () => false }) {
  const $ = (s) => root.querySelector(s);
  const first = (profile?.full_name || "").trim().split(/\s+/)[0];
  $("#dhHello").textContent = first ? `${greeting()}, ${first}` : greeting();

  const today = wibDay();
  let sales = null; // Map hari -> {value,count}; dipakai omzet, sparkline, dan tren
  const rangeEl = $("#dhRange");
  const drawTrend = () => sales && renderTrend($("#dhTrend"), $("#dhTrendSub"), sales, today, Number(rangeEl.value));

  const blocks = [
    { name: "Omzet", boxes: ["#dhOmzet", "#dhTrend"], run: async () => {
      sales = await fetchSales(today, monthRanges(today).prevStart > addDays(today, -29) ? addDays(today, -29) : monthRanges(today).prevStart);
      if (isStale()) return;
      renderOmzet($("#dhOmzet"), sales, today); drawTrend();
    } },
    { name: "Ringkasan stok & pesanan", boxes: ["#dhIn", "#dhOut", "#dhLow", "#dhAct"], run: async () => {
      const startToday = `${today}T00:00:00+07:00`;
      const [waiting, confirmed, processing, fresh, low] = await Promise.all([
        orderCount("menunggu_konfirmasi"), orderCount("dikonfirmasi"), orderCount("diproses"),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startToday),
        fetchLowRows(),
      ]);
      if (isStale()) return;
      if (fresh.error) throw fresh.error;
      renderIncoming($("#dhIn"), waiting, fresh.count ?? 0);
      renderStockCard($("#dhOut"), low);
      renderLowList($("#dhLow"), low);
      renderTodo($("#dhAct"), $("#dhActCount"), { waiting, confirmed, processing, out: low.filter((r) => r.stock === 0).length });
    } },
    { name: "Pesanan terbaru", boxes: ["#dhRecent"], run: () => loadRecent($("#dhRecent")) },
  ];

  async function loadAll() {
    await Promise.all(blocks.map(async (b) => {
      try { await b.run(); }
      catch (e) {
        console.error(e);
        if (isStale()) return;
        b.boxes.forEach((id, i) => { $(id).innerHTML = i === 0 ? retry(b.name) : ""; });
      }
    }));
  }

  rangeEl.addEventListener("change", drawTrend);
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-retry]")) { loadAll(); return; }
    const f = e.target.closest("[data-filter]");
    if (f) { try { sessionStorage.setItem(FILTER_KEY, JSON.stringify({ status: f.dataset.filter, search: "", page: 0 })); } catch { /* abaikan */ } }
  });

  // Segarkan saat realtime/polling badge pesanan memberi sinyal; berhenti sendiri begitu halaman diganti.
  let timer;
  const onBadge = () => {
    if (isStale()) { window.removeEventListener("ad:orders-badge", onBadge); return; }
    clearTimeout(timer); timer = setTimeout(() => !isStale() && loadAll(), 1200);
  };
  window.addEventListener("ad:orders-badge", onBadge);

  return loadAll();
}