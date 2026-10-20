// Daftar pesanan (Admin): filter status, cari nama/nomor, tabel di desktop + kartu di HP, 20 per halaman.
import { supabase } from "../assets/js/supabase.js";
import { statusBadge, paymentChip } from "../assets/js/ui.js";
import { rupiah, countdown } from "../assets/js/format.js";
import { esc, fmtDate, debounce } from "./ad-ui.js";
import { STATUS_FILTERS, NEED_ACTION, EDITABLE, orderTotals, itemsSummary, sanitizeSearch } from "./order-utils.js";

const PAGE = 20, KEY = "ad.orders.filters";
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* abaikan */ } };

export async function renderList({ pg, isStale = () => false }) {
  const saved = load();
  const state = { rows: [], total: 0, page: Number(saved.page) || 0, status: saved.status ?? "", search: saved.search ?? "", req: 0 };

  pg.innerHTML = `
    <header class="ad-page-head"><div><h1 class="ad-h1">Pesanan</h1>
      <p class="ad-sub">Kelola pesanan dari konfirmasi sampai selesai.</p></div>
      <a class="btn btn-primary" href="#/pesanan/baru">+ Pesanan Manual</a></header>
    <section class="ad-card" aria-label="Daftar pesanan">
      <div class="ad-toolbar">
        <input class="input ad-search" id="oSearch" type="search" placeholder="Cari nama atau nomor pesanan" aria-label="Cari pesanan" autocomplete="off" maxlength="40" value="${esc(state.search)}">
        <select class="input" id="oStatus" aria-label="Filter status">${STATUS_FILTERS.map((f) => `<option value="${esc(f.v)}" ${f.v === state.status ? "selected" : ""}>${esc(f.t)}</option>`).join("")}</select>
      </div>
      <div id="oList" aria-live="polite"></div>
      <div class="ad-pager" id="oPager" hidden>
        <span id="oPagerInfo"></span>
        <div class="ad-pager-btns">
          <button type="button" class="btn btn-secondary btn-sm" data-act="prev">Sebelumnya</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="next">Berikutnya</button>
        </div>
      </div>
    </section>`;
  const listEl = pg.querySelector("#oList"), pager = pg.querySelector("#oPager"), info = pg.querySelector("#oPagerInfo");
  const fSearch = pg.querySelector("#oSearch"), fStatus = pg.querySelector("#oStatus");

  async function fetchRows() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    const from = state.page * PAGE;
    let q = supabase.from("orders")
      .select("id, order_no, recipient_name, status, payment_status, shipping_cost, expires_at, created_at, order_items(product_name, color_name, size, qty, line_total)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (state.status === "perlu") q = q.in("status", NEED_ACTION);
    else if (state.status) q = q.eq("status", state.status);
    const s = sanitizeSearch(state.search);
    if (s) q = q.or(`order_no.ilike.%${s}%,recipient_name.ilike.%${s}%`);
    const { data, error, count } = await q;
    if (my !== state.req || isStale()) return;
    if (error) {
      console.error(error); pager.hidden = true;
      listEl.innerHTML = `<div class="ad-error" role="alert">Data gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
      return;
    }
    state.rows = data ?? []; state.total = count ?? state.rows.length;
    if (!state.rows.length && state.page > 0) { state.page = Math.max(0, Math.ceil(state.total / PAGE) - 1); return fetchRows(); }
    render();
  }

  const waiting = (o) => {
    if (!EDITABLE.includes(o.status) || o.payment_status !== "belum_dibayar") return "";
    const left = countdown(o.expires_at);
    return `<div class="ad-meta">${left ? `Sisa ${esc(left)}` : "Waktu habis"}</div>`;
  };
  const totalOf = (o) => orderTotals(o.order_items, o.shipping_cost).total;
  const detailLink = (o) => `<a class="btn btn-secondary btn-sm" href="#/pesanan/${esc(o.id)}">Lihat Detail →</a>`;

  function render() {
    save({ status: state.status, search: state.search, page: state.page });
    const rows = state.rows;
    if (!rows.length) {
      pager.hidden = true;
      const filtered = state.status || sanitizeSearch(state.search);
      listEl.innerHTML = `<div class="ad-empty">${filtered ? "Tidak ada pesanan yang cocok dengan filter." : "Belum ada pesanan."}</div>`;
      return;
    }
    const table = `
      <div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th scope="col">Nomor</th><th scope="col">Tanggal</th><th scope="col">Customer</th><th scope="col">Produk</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col" class="ad-th-actions">Aksi</th></tr></thead>
        <tbody>${rows.map((o) => `<tr>
          <td style="font-family:ui-monospace,Consolas,monospace;white-space:nowrap">${esc(o.order_no)}</td>
          <td style="white-space:nowrap">${esc(fmtDate(o.created_at))}</td>
          <td class="ad-name">${esc(o.recipient_name)}</td>
          <td style="max-width:18rem">${esc(itemsSummary(o.order_items))}</td>
          <td style="white-space:nowrap">${esc(rupiah(totalOf(o)))}</td>
          <td>${statusBadge(o.status)}<div style="margin-top:4px">${paymentChip(o.payment_status)}</div>${waiting(o)}</td>
          <td><div class="ad-cell-actions">${detailLink(o)}</div></td></tr>`).join("")}
        </tbody></table></div>`;
    const cards = `
      <ul class="ad-cards">${rows.map((o) => `<li>
        <div class="ad-card-top"><div style="min-width:0"><div class="ad-name" style="font-family:ui-monospace,Consolas,monospace">${esc(o.order_no)}</div>
          <div class="ad-email">${esc(o.recipient_name)}</div></div>${statusBadge(o.status)}</div>
        <div class="ad-meta">${esc(itemsSummary(o.order_items))}</div>
        <div class="ad-meta">${esc(fmtDate(o.created_at))} · ${esc(rupiah(totalOf(o)))} ${paymentChip(o.payment_status)}</div>${waiting(o)}
        <div class="ad-card-actions">${detailLink(o)}</div></li>`).join("")}</ul>`;
    listEl.innerHTML = table + cards;
    const a = state.page * PAGE + 1, b = state.page * PAGE + rows.length;
    pager.hidden = state.total <= PAGE;
    info.textContent = `${a}–${b} dari ${state.total} pesanan`;
    pager.querySelector("[data-act=prev]").disabled = state.page === 0;
    pager.querySelector("[data-act=next]").disabled = b >= state.total;
  }

  const refilter = () => { state.page = 0; fetchRows(); };
  fStatus.addEventListener("change", () => { state.status = fStatus.value; refilter(); });
  fSearch.addEventListener("input", debounce(() => { state.search = fSearch.value; refilter(); }, 350));
  pg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    if (b.dataset.act === "retry") fetchRows();
    else if (b.dataset.act === "prev") { state.page = Math.max(0, state.page - 1); fetchRows(); }
    else if (b.dataset.act === "next") { state.page += 1; fetchRows(); }
  });
  return fetchRows();
}