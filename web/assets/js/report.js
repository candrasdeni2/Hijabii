// Halaman Laporan, DIPAKAI BERSAMA Admin dan Super Admin (rulesapp 16, fitur.md "Laporan").
// Data dari RPC report_orders / report_summary: hanya pesanan final (Selesai + Dibatalkan, termasuk Kedaluwarsa),
// nilai = nilai produk TANPA ongkir, periode dari tanggal selesai/dibatalkan zona WIB, minggu mulai Senin.
// RPC tidak mengembalikan alamat, nomor telepon, maupun ongkir, jadi aman untuk Super Admin (yang tidak punya akses tabel pesanan).
//
// Pemakaian:  renderReport({ root, prefix: "ad" | "sa", isStale })
// prefix menentukan kelas bawaan shell (ad-card, sa-card, dst.). Gaya (prefiks rp-) dan export Excel/PDF ada di file ini juga, jadi tidak perlu file lain.
import { supabase } from "./supabase.js";
import { CONFIG } from "./config.js";
import { rupiah } from "./format.js";
import { esc } from "./panel-kit.js";
import { toast, statusBadge, withLoading } from "./ui.js";
import { CANCEL_REASON } from "./labels.js";

const PAGE = 20;
const FETCH_SIZE = 1000; // batas baris per permintaan PostgREST
const STATUS_OPTS = [["semua", "Semua pesanan"], ["selesai", "Selesai"], ["dibatalkan", "Dibatalkan"]];
const PERIODS = [["hari", "Hari"], ["minggu", "Minggu"], ["bulan", "Bulan"], ["tahun", "Tahun"]];
const PERIOD_NAME = { hari: "Harian", minggu: "Mingguan", bulan: "Bulanan", tahun: "Tahunan" };

/* ---------- Tanggal WIB (string YYYY-MM-DD, dihitung di klien) ---------- */
const todayWIB = () => new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.TIMEZONE }).format(new Date());
const parse = (s) => new Date(`${s}T12:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * 864e5));
const fmt = (s, o) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", ...o }).format(parse(s));
export const fmtDay = (s) => (s ? fmt(s, { day: "numeric", month: "short", year: "numeric" }) : "");

function rangeOf(period, ref) {
  const d = parse(ref), y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (period === "hari") return { from: ref, to: ref };
  if (period === "minggu") { const from = addDays(ref, -((d.getUTCDay() + 6) % 7)); return { from, to: addDays(from, 6) }; } // Senin..Minggu
  if (period === "bulan") return { from: iso(new Date(Date.UTC(y, m, 1, 12))), to: iso(new Date(Date.UTC(y, m + 1, 0, 12))) };
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
function shiftRef(period, ref, dir) {
  const d = parse(ref), y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (period === "hari") return addDays(ref, dir);
  if (period === "minggu") return addDays(ref, 7 * dir);
  if (period === "bulan") return iso(new Date(Date.UTC(y, m + dir, 1, 12)));
  return `${y + dir}-01-01`;
}
function rangeLabel(period, ref) {
  const r = rangeOf(period, ref);
  if (period === "hari") return fmt(ref, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (period === "minggu") return `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
  if (period === "bulan") return fmt(ref, { month: "long", year: "numeric" });
  return String(parse(ref).getUTCFullYear());
}
function inputSpec(period, ref) {
  if (period === "bulan") return { type: "month", value: ref.slice(0, 7), extra: 'placeholder="2026-10"' };
  if (period === "tahun") return { type: "number", value: ref.slice(0, 4), extra: 'min="2020" max="2100" step="1" inputmode="numeric"' };
  return { type: "date", value: ref, extra: "" };
}
function readInput(period, v) {
  v = String(v ?? "").trim();
  if (period === "bulan") return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : null;
  if (period === "tahun") return /^\d{4}$/.test(v) && +v >= 2000 && +v <= 2100 ? `${v}-01-01` : null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v).getTime()) ? v : null;
}

/* ---------- Data ---------- */
async function fetchAllOrders(args) {
  const out = [];
  for (let from = 0; ; from += FETCH_SIZE) {
    const { data, error } = await supabase.rpc("report_orders", args).range(from, from + FETCH_SIZE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < FETCH_SIZE) break;
  }
  return out;
}
function summarize(rows) {
  const s = { selesai: { count: 0, value: 0 }, dibatalkan: { count: 0, value: 0 }, reasons: [] };
  const byReason = new Map();
  for (const r of rows) {
    const g = s[r.report_status];
    if (!g || r.report_status === "reasons") continue;
    g.count += Number(r.order_count ?? 0); g.value += Number(r.total_value ?? 0);
    if (r.report_status === "dibatalkan") {
      const k = r.reason ?? "lainnya", cur = byReason.get(k) ?? { reason: k, count: 0, value: 0 };
      cur.count += Number(r.order_count ?? 0); cur.value += Number(r.total_value ?? 0); byReason.set(k, cur);
    }
  }
  s.reasons = [...byReason.values()].sort((a, b) => b.count - a.count).map((x) => ({ ...x, label: CANCEL_REASON[x.reason] ?? "Lainnya" }));
  return s;
}
const mapRow = (r) => ({
  id: r.order_id, no: r.order_no, date: r.final_date, customer: r.customer_name ?? "–", products: r.products ?? "–",
  qty: Number(r.total_qty ?? 0), value: Number(r.product_value ?? 0), status: r.report_status,
  statusLabel: r.report_status === "selesai" ? "Selesai" : "Dibatalkan",
  reason: r.report_status === "dibatalkan" ? (CANCEL_REASON[r.reason] ?? "") : "",
});

const CSS = `
/* report.css — gaya halaman Laporan (dipakai bersama Admin dan Super Admin). Prefiks rp-. Memakai token dari tokens.css. */
.rp-export{display:flex;flex-wrap:wrap;gap:8px}

/* Filter */
.rp-filters{display:grid;gap:16px;margin-bottom:16px}
.rp-grid{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}
@media(min-width:640px){.rp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.rp-period{display:grid;gap:12px;align-items:center}
@media(min-width:900px){.rp-period{grid-template-columns:auto auto minmax(0,1fr);gap:16px}}
.rp-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:4px;border:1px solid var(--sand);border-radius:999px;background:var(--cream)}
@media(min-width:640px){.rp-seg{display:inline-flex;width:fit-content}}
.rp-seg button{min-height:36px;padding:0 16px;border:0;border-radius:999px;background:transparent;color:var(--ink);font:500 14px var(--font-sans);cursor:pointer;transition:background .25s,color .25s}
.rp-seg button:hover{background:var(--sand)}
.rp-seg button[aria-pressed="true"]{background:var(--ink);color:var(--cream)}
.rp-nav{display:flex;align-items:center;gap:8px}
.rp-nav .input{flex:1 1 auto;width:auto;min-width:0}
@media(min-width:900px){.rp-nav .input{flex:0 0 auto;width:11rem}}
.rp-step{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:50%;border:1px solid var(--sand);background:var(--paper);color:var(--ink);cursor:pointer;transition:background .25s}
.rp-step:hover:not(:disabled){background:var(--sand)}
.rp-step:disabled{opacity:.4;cursor:not-allowed}
.rp-step svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.rp-range{margin:0;font-family:var(--font-serif);font-size:20px;font-weight:500;line-height:1.25;overflow-wrap:anywhere}

/* Ringkasan */
.rp-sum{display:grid;gap:12px;margin-bottom:16px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:1024px){.rp-sum{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}}
.rp-stat{min-width:0;padding:16px;border:1px solid var(--sand);border-radius:16px;background:var(--paper);box-shadow:var(--shadow-sm)}
.rp-stat--wide{grid-column:1/-1}
@media(min-width:1024px){.rp-stat--wide{grid-column:auto}}
.rp-lbl{font-size:12px;font-weight:600;color:rgba(43,33,28,.7)}
.rp-val{margin-top:4px;font-family:var(--font-serif);font-size:38px;font-weight:500;line-height:1.1}
.rp-sub{margin-top:2px;font-size:14px;color:rgba(43,33,28,.8);overflow-wrap:anywhere}
.rp-stat.is-off{background:transparent;box-shadow:none}
.rp-stat.is-off .rp-val,.rp-stat.is-off .rp-sub{color:rgba(43,33,28,.5)}
.rp-reasons{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}
.rp-reasons li{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding-bottom:8px;border-bottom:1px solid rgba(235,224,211,.8);font-size:13px}
.rp-reasons li:last-child{border-bottom:0;padding-bottom:0}
.rp-reasons b{font-weight:500;text-align:right}
.rp-empty-s{margin-top:10px;font-size:13px;color:rgba(43,33,28,.65)}
.rp-skel{height:104px;margin:0}
.rp-note{margin:-4px 0 16px;padding:10px 14px;border:1px solid rgba(184,134,58,.35);border-radius:12px;background:#FDF3E3;font-size:13px;color:rgba(43,33,28,.85)}

/* Tabel + kartu HP */
.rp-table th.rp-r,.rp-table td.rp-r{text-align:right}
.rp-table td{vertical-align:top}
.rp-mono{font-family:ui-monospace,Consolas,monospace;font-size:13px;white-space:nowrap}
.rp-nowrap{white-space:nowrap}
.rp-cust{font-weight:600;overflow-wrap:anywhere}
.rp-prod{max-width:24rem;font-size:13px;line-height:1.5;color:rgba(43,33,28,.85);overflow-wrap:anywhere}
.rp-why{max-width:14rem;font-size:13px;color:rgba(43,33,28,.75)}
.rp-reason{margin-top:6px;font-size:12px;color:var(--error)}
.rp-cards li{display:grid;gap:6px}
.rp-top{align-items:center;flex-wrap:wrap}
.rp-meta{font-size:13px;color:rgba(43,33,28,.75)}
.rp-meta b{color:var(--ink);font-weight:600}
@media(max-width:639px){
  .rp-val{font-size:32px}
  .rp-range{font-size:18px}
  .rp-export{width:100%}
  .rp-export .btn{flex:1 1 0}
}
`;
function ensureCss() {
  if (document.getElementById("rp-css")) return;
  const s = document.createElement("style"); s.id = "rp-css"; s.textContent = CSS; document.head.append(s);
}

const loadSaved = (p) => { try { return JSON.parse(sessionStorage.getItem(`rp.filters.${p}`)) ?? {}; } catch { return {}; } };
const saveSaved = (p, v) => { try { sessionStorage.setItem(`rp.filters.${p}`, JSON.stringify(v)); } catch { /* abaikan */ } };

export async function renderReport({ root, prefix: p = "ad", isStale = () => false }) {
  ensureCss();
  const saved = loadSaved(p), today = todayWIB();
  const state = {
    status: STATUS_OPTS.some(([v]) => v === saved.status) ? saved.status : "semua",
    period: PERIODS.some(([v]) => v === saved.period) ? saved.period : "bulan",
    ref: readInput("hari", saved.ref) ?? today,
    category: saved.category || "", product: saved.product || "",
    rows: [], summary: null, page: 0, req: 0, loading: true, error: false,
    categories: [], products: [],
  };

  root.innerHTML = `
    <header class="${p}-page-head">
      <div><h1 class="${p}-h1">Laporan</h1>
        <p class="${p}-sub">Pesanan yang sudah final (Selesai dan Dibatalkan, termasuk Kedaluwarsa). Nilai produk tanpa ongkir; alamat dan nomor customer tidak ditampilkan.</p></div>
      <div class="rp-export">
        <button type="button" class="btn btn-secondary btn-sm" data-act="xlsx" disabled>Export Excel</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="pdf" disabled>Export PDF</button>
      </div>
    </header>

    <section class="${p}-card rp-filters" aria-label="Filter laporan">
      <div class="rp-grid">
        <div class="field"><label class="label" for="rpStatus">Status pesanan</label>
          <select class="input" id="rpStatus">${STATUS_OPTS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></div>
        <div class="field"><label class="label" for="rpCat">Kategori</label>
          <select class="input" id="rpCat"><option value="">Semua kategori</option></select></div>
        <div class="field"><label class="label" for="rpProd">Produk</label>
          <select class="input" id="rpProd"><option value="">Semua produk</option></select></div>
      </div>
      <div class="rp-period">
        <div class="rp-seg" role="group" aria-label="Periode">${PERIODS.map(([v, t]) => `<button type="button" data-period="${v}" aria-pressed="false">${esc(t)}</button>`).join("")}</div>
        <div class="rp-nav">
          <button type="button" class="rp-step" data-act="prev" aria-label="Periode sebelumnya"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
          <input class="input" id="rpDate" aria-label="Pilih tanggal periode">
          <button type="button" class="rp-step" data-act="next" aria-label="Periode berikutnya"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
        </div>
        <p class="rp-range" id="rpRange" aria-live="polite"></p>
      </div>
    </section>

    <section class="rp-sum" id="rpSum" aria-label="Ringkasan" aria-live="polite"></section>
    <p class="rp-note" id="rpNote" hidden></p>

    <section class="${p}-card" aria-label="Tabel laporan">
      <div id="rpTable" aria-live="polite"></div>
      <div class="${p}-pager" id="rpPager" hidden></div>
    </section>`;

  const $ = (s) => root.querySelector(s);
  const el = { status: $("#rpStatus"), cat: $("#rpCat"), prod: $("#rpProd"), date: $("#rpDate"), range: $("#rpRange"), sum: $("#rpSum"), note: $("#rpNote"), table: $("#rpTable"), pager: $("#rpPager"),
    xlsx: $('[data-act="xlsx"]'), pdf: $('[data-act="pdf"]'), next: $('[data-act="next"]') };

  /* ---------- Kontrol filter ---------- */
  function syncControls() {
    el.status.value = state.status;
    root.querySelectorAll("[data-period]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.period === state.period)));
    const spec = inputSpec(state.period, state.ref);
    el.date.type = spec.type; el.date.value = spec.value;
    ["placeholder", "min", "max", "step", "inputmode"].forEach((a) => el.date.removeAttribute(a));
    spec.extra.replace(/(\w+)="([^"]*)"/g, (_, k, v) => { el.date.setAttribute(k, v); return ""; });
    el.range.textContent = rangeLabel(state.period, state.ref);
    el.next.disabled = rangeOf(state.period, state.ref).to >= today; // tidak ada laporan untuk masa depan
  }
  function fillProducts() {
    const list = state.category ? state.products.filter((x) => x.category_id === state.category) : state.products;
    if (state.product && !list.some((x) => x.id === state.product)) state.product = "";
    el.prod.innerHTML = `<option value="">Semua produk</option>${list.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}`;
    el.prod.value = state.product;
  }
  async function loadFilterOptions() {
    const [c, pr] = await Promise.all([
      supabase.from("categories").select("id, name").order("sort_order").order("name"),
      supabase.from("products").select("id, name, category_id").order("name").limit(1000),
    ]);
    if (isStale()) return;
    state.categories = c.data ?? []; state.products = pr.data ?? [];
    el.cat.innerHTML = `<option value="">Semua kategori</option>${state.categories.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}`;
    if (state.category && !state.categories.some((x) => x.id === state.category)) state.category = "";
    el.cat.value = state.category; fillProducts();
  }

  /* ---------- Ringkasan ---------- */
  const periodTitle = () => `${PERIOD_NAME[state.period]} · ${rangeLabel(state.period, state.ref)}`;
  function renderSummary() {
    if (state.loading) { el.sum.innerHTML = `<div class="${p}-skel rp-skel"></div><div class="${p}-skel rp-skel"></div><div class="${p}-skel rp-skel"></div>`; el.note.hidden = true; return; }
    if (state.error || !state.summary) { el.sum.innerHTML = ""; el.note.hidden = true; return; }
    const s = state.summary;
    const stat = (title, key, inc) => `<div class="rp-stat ${inc ? "" : "is-off"}">
      <div class="rp-lbl">${esc(title)}</div>
      <div class="rp-val">${inc ? s[key].count : "–"}</div>
      <div class="rp-sub">${inc ? esc(rupiah(s[key].value)) : "Tidak termasuk filter status"}</div></div>`;
    const incDone = state.status !== "dibatalkan", incCancel = state.status !== "selesai";
    const reasons = !incCancel ? `<div class="rp-empty-s">Tidak termasuk filter status</div>`
      : s.reasons.length ? `<ul class="rp-reasons">${s.reasons.map((r) => `<li><span>${esc(r.label)}</span><b>${r.count} pesanan · ${esc(rupiah(r.value))}</b></li>`).join("")}</ul>`
      : `<div class="rp-empty-s">Tidak ada pembatalan pada periode ini.</div>`;
    el.sum.innerHTML = `${stat("Pesanan selesai", "selesai", incDone)}${stat("Pesanan dibatalkan", "dibatalkan", incCancel)}
      <div class="rp-stat rp-stat--wide"><div class="rp-lbl">Alasan pembatalan</div>${reasons}</div>`;
    const filtered = state.category || state.product;
    el.note.hidden = !filtered;
    if (filtered) el.note.textContent = "Filter kategori atau produk aktif: jumlah, qty, dan nilai hanya menghitung baris produk yang cocok, jadi satu pesanan bisa muncul di lebih dari satu laporan kategori.";
  }

  /* ---------- Tabel ---------- */
  function renderTable() {
    el.pager.hidden = true;
    if (state.loading) { el.table.innerHTML = `<div aria-hidden="true"><div class="${p}-skel"></div><div class="${p}-skel"></div><div class="${p}-skel"></div></div>`; return; }
    if (state.error) { el.table.innerHTML = `<div class="${p}-error" role="alert">Laporan gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`; return; }
    if (!state.rows.length) { el.table.innerHTML = `<div class="${p}-empty">Tidak ada pesanan final yang cocok dengan filter pada periode ini.</div>`; return; }
    const from = state.page * PAGE, rows = state.rows.slice(from, from + PAGE);
    const badge = (r) => `${statusBadge(r.status)}${r.reason ? `<div class="rp-reason">${esc(r.reason)}</div>` : ""}`;
    el.table.innerHTML = `
      <div class="${p}-table-wrap"><table class="${p}-table rp-table">
        <thead><tr><th scope="col">No. pesanan</th><th scope="col">Tanggal</th><th scope="col">Customer</th><th scope="col">Produk</th><th scope="col" class="rp-r">Qty</th><th scope="col" class="rp-r">Nilai produk</th><th scope="col">Status</th><th scope="col">Alasan batal</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="rp-mono">${esc(r.no)}</td><td class="rp-nowrap">${esc(fmtDay(r.date))}</td><td class="rp-cust">${esc(r.customer)}</td>
          <td class="rp-prod">${esc(r.products)}</td><td class="rp-r">${r.qty}</td><td class="rp-r rp-nowrap">${esc(rupiah(r.value))}</td>
          <td>${statusBadge(r.status)}</td><td class="rp-why">${esc(r.reason) || "–"}</td></tr>`).join("")}</tbody></table></div>
      <ul class="${p}-cards rp-cards">${rows.map((r) => `<li>
        <div class="${p}-card-top rp-top"><span class="rp-mono">${esc(r.no)}</span>${statusBadge(r.status)}</div>
        <div class="rp-cust">${esc(r.customer)}</div>
        <div class="rp-prod">${esc(r.products)}</div>
        <div class="rp-meta">${esc(fmtDay(r.date))} · ${r.qty} pcs · <b>${esc(rupiah(r.value))}</b></div>
        ${r.reason ? `<div class="rp-reason">${esc(r.reason)}</div>` : ""}</li>`).join("")}</ul>`;
    const pages = Math.ceil(state.rows.length / PAGE);
    el.pager.hidden = pages <= 1;
    el.pager.innerHTML = `<span>Menampilkan ${from + 1}–${from + rows.length} dari ${state.rows.length} pesanan</span>
      <div class="${p}-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" data-act="pg-prev" ${state.page === 0 ? "disabled" : ""}>Sebelumnya</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="pg-next" ${state.page + 1 >= pages ? "disabled" : ""}>Berikutnya</button>
      </div>`;
  }

  /* ---------- Muat data ---------- */
  async function load() {
    const my = ++state.req;
    saveSaved(p, { status: state.status, period: state.period, ref: state.ref, category: state.category, product: state.product });
    syncControls();
    state.loading = true; state.error = false; state.page = 0;
    el.xlsx.disabled = el.pdf.disabled = true;
    renderSummary(); renderTable();
    const { from, to } = rangeOf(state.period, state.ref);
    const args = { p_from: from, p_to: to, p_status: state.status, p_category_id: state.category || null, p_product_id: state.product || null };
    try {
      const [rows, sum] = await Promise.all([fetchAllOrders(args), supabase.rpc("report_summary", args)]);
      if (my !== state.req || isStale()) return;
      if (sum.error) throw sum.error;
      state.rows = rows.map(mapRow); state.summary = summarize(sum.data ?? []);
    } catch (e) {
      console.error(e);
      if (my !== state.req || isStale()) return;
      state.error = true; state.rows = []; state.summary = null;
    }
    state.loading = false;
    renderSummary(); renderTable();
    el.xlsx.disabled = el.pdf.disabled = state.error || !state.rows.length;
  }

  /* ---------- Export (mengikuti filter aktif; semua baris, bukan hanya halaman ini) ---------- */
  function exportMeta() {
    const { from, to } = rangeOf(state.period, state.ref);
    const name = (list, id, all) => (id ? list.find((x) => x.id === id)?.name ?? all : all);
    const stLabel = STATUS_OPTS.find(([v]) => v === state.status)[1];
    const s = state.summary;
    return {
      title: "Laporan Pesanan",
      filters: [
        `Status: ${stLabel}`,
        `Kategori: ${name(state.categories, state.category, "Semua kategori")}`,
        `Produk: ${name(state.products, state.product, "Semua produk")}`,
        `Periode: ${periodTitle()} (${fmtDay(from)} – ${fmtDay(to)})`,
      ],
      printedAt: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: CONFIG.TIMEZONE }).format(new Date()) + " WIB",
      summary: {
        done: state.status !== "dibatalkan" ? { count: s.selesai.count, value: s.selesai.value } : null,
        cancelled: state.status !== "selesai" ? { count: s.dibatalkan.count, value: s.dibatalkan.value } : null,
        reasons: state.status !== "selesai" ? s.reasons : [],
      },
      rows: state.rows,
      fileBase: `Laporan-Hijabii_${state.status}_${from}_${to}`,
    };
  }
  const doExport = (btn, fn, label) => withLoading(btn, async () => {
    try { await fn(exportMeta()); } catch (e) { console.error(e); toast(`Export ${label} gagal. Periksa koneksi internet lalu coba lagi.`, "error"); }
  }, "Menyiapkan…");

  /* ---------- Event ---------- */
  el.status.addEventListener("change", () => { state.status = el.status.value; load(); });
  el.cat.addEventListener("change", () => { state.category = el.cat.value; fillProducts(); load(); });
  el.prod.addEventListener("change", () => { state.product = el.prod.value; load(); });
  el.date.addEventListener("change", () => {
    const v = readInput(state.period, el.date.value);
    if (!v) { syncControls(); return; }
    state.ref = v; load();
  });
  root.addEventListener("click", (e) => {
    const per = e.target.closest("[data-period]");
    if (per) { state.period = per.dataset.period; load(); return; }
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case "prev": state.ref = shiftRef(state.period, state.ref, -1); load(); break;
      case "next": state.ref = shiftRef(state.period, state.ref, +1); load(); break;
      case "retry": load(); break;
      case "pg-prev": if (state.page > 0) { state.page--; renderTable(); } break;
      case "pg-next": state.page++; renderTable(); break;
      case "xlsx": doExport(b, exportExcel, "Excel"); break;
      case "pdf": doExport(b, exportPdf, "PDF"); break;
    }
  });

  syncControls();
  await loadFilterOptions();
  if (isStale()) return;
  return load();
}

/* ================= Export (Excel & PDF) ================= */
// Library dimuat dari CDN hanya saat tombol export ditekan. Isi mengikuti filter aktif, TANPA ongkir, alamat, dan nomor customer.
const EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
const JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
const AUTOTABLE = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js";

const loaded = new Map();
function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = Object.assign(document.createElement("script"), { src, async: true });
      s.onload = resolve;
      s.onerror = () => { loaded.delete(src); s.remove(); reject(new Error(`Gagal memuat ${src}`)); };
      document.head.append(s);
    }));
  }
  return loaded.get(src);
}

const dayText = (s) => (s ? new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${s}T12:00:00Z`)) : "");
const summaryLines = (sum) => {
  const out = [];
  if (sum.done) out.push(`Pesanan selesai: ${sum.done.count} pesanan, nilai produk ${rupiah(sum.done.value)}`);
  if (sum.cancelled) out.push(`Pesanan dibatalkan: ${sum.cancelled.count} pesanan, nilai produk ${rupiah(sum.cancelled.value)}`);
  if (sum.cancelled && sum.reasons.length) out.push("Alasan pembatalan: " + sum.reasons.map((r) => `${r.label} (${r.count} pesanan, ${rupiah(r.value)})`).join("; "));
  return out;
};
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ================= Excel ================= */
export async function exportExcel(meta) {
  await loadScript(EXCELJS);
  const wb = new window.ExcelJS.Workbook();
  wb.creator = "Hijabii by Intan"; wb.created = new Date();
  const ws = wb.addWorksheet("Laporan", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const COLS = 8;
  ws.columns = [{ width: 22 }, { width: 15 }, { width: 26 }, { width: 54 }, { width: 8 }, { width: 18 }, { width: 14 }, { width: 34 }];

  let r = 1;
  const line = (text, font = {}) => {
    const row = ws.getRow(r);
    row.getCell(1).value = text;
    row.getCell(1).font = { name: "Calibri", size: 11, ...font };
    row.getCell(1).alignment = { vertical: "top", wrapText: true };
    ws.mergeCells(r, 1, r, COLS);
    r += 1;
  };
  line("Hijabii by Intan", { bold: true, size: 11, color: { argb: "FF7B4A4A" } });
  line(meta.title, { bold: true, size: 16 });
  meta.filters.forEach((f) => line(f));
  line(`Dicetak: ${meta.printedAt}`, { color: { argb: "FF6B6B6B" } });
  r += 1;
  line("Ringkasan", { bold: true, size: 12 });
  const sl = summaryLines(meta.summary);
  (sl.length ? sl : ["Tidak ada data ringkasan."]).forEach((t) => line(t));
  r += 1;

  const headRow = r;
  const head = ws.getRow(headRow);
  ["No. pesanan", "Tanggal", "Customer", "Produk", "Qty", "Nilai produk (Rp)", "Status", "Alasan batal"].forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFF6F0E7" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7B4A4A" } };
    c.alignment = { vertical: "middle", horizontal: i === 4 || i === 5 ? "right" : "left", wrapText: true };
  });
  head.height = 22;
  r += 1;

  meta.rows.forEach((x, i) => {
    const row = ws.getRow(r);
    [x.no, dayText(x.date), x.customer, x.products, x.qty, x.value, x.statusLabel, x.reason || ""].forEach((v, k) => {
      const c = row.getCell(k + 1);
      c.value = v; // string biasa: nama customer tidak pernah dianggap rumus
      c.alignment = { vertical: "top", wrapText: true, horizontal: k === 4 || k === 5 ? "right" : "left" };
      c.border = { bottom: { style: "thin", color: { argb: "FFEBE0D3" } } };
      if (i % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBF8F3" } };
    });
    row.getCell(6).numFmt = '"Rp" #,##0';
    r += 1;
  });
  if (meta.rows.length) ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow + meta.rows.length, column: COLS } };
  ws.views = [{ state: "frozen", ySplit: headRow }];

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${meta.fileBase}.xlsx`);
}

/* ================= PDF ================= */
// Font bawaan PDF hanya mendukung Latin: buang karakter di luar itu (mis. emoji pada nama customer) agar tidak jadi sampah.
const pdfText = (s) => String(s ?? "").replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, "").trim();

export async function exportPdf(meta) {
  await loadScript(JSPDF);
  await loadScript(AUTOTABLE);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const M = 36, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = 44;

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(123, 74, 74);
  doc.text("HIJABII BY INTAN", M, y); y += 20;
  doc.setFontSize(18); doc.setTextColor(43, 33, 28);
  doc.text(pdfText(meta.title), M, y); y += 18;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(60, 52, 48);
  [...meta.filters, `Dicetak: ${meta.printedAt}`].forEach((t) => {
    doc.splitTextToSize(pdfText(t), W - 2 * M).forEach((ln) => { doc.text(ln, M, y); y += 13; });
  });
  y += 6;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(43, 33, 28);
  doc.text("Ringkasan", M, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(60, 52, 48);
  const sl = summaryLines(meta.summary);
  (sl.length ? sl : ["Tidak ada data ringkasan."]).forEach((t) => {
    doc.splitTextToSize(pdfText(t), W - 2 * M).forEach((ln) => { doc.text(ln, M, y); y += 13; });
  });
  y += 8;

  doc.autoTable({
    startY: y,
    margin: { left: M, right: M, bottom: 36 },
    head: [["No. pesanan", "Tanggal", "Customer", "Produk", "Qty", "Nilai produk", "Status", "Alasan batal"]],
    body: meta.rows.map((x) => [pdfText(x.no), dayText(x.date), pdfText(x.customer), pdfText(x.products), String(x.qty), rupiah(x.value), x.statusLabel, pdfText(x.reason) || "-"]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: [43, 33, 28], lineColor: [235, 224, 211], lineWidth: 0.4, valign: "top" },
    headStyles: { fillColor: [123, 74, 74], textColor: [246, 240, 231], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [251, 248, 243] },
    columnStyles: {
      0: { cellWidth: 90 }, 1: { cellWidth: 62 }, 2: { cellWidth: 110 }, 3: { cellWidth: 230 },
      4: { cellWidth: 34, halign: "right" }, 5: { cellWidth: 80, halign: "right" }, 6: { cellWidth: 62 }, 7: { cellWidth: 102 },
    },
    showHead: "everyPage",
  });

  const pages = doc.internal.getNumberOfPages();
  doc.setFontSize(8); doc.setTextColor(120, 110, 104);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Hijabii by Intan - ${pdfText(meta.title)}`, M, H - 18);
    doc.text(`Halaman ${i} dari ${pages}`, W - M, H - 18, { align: "right" });
  }
  doc.save(`${meta.fileBase}.pdf`);
}
