// Moderasi ulasan (Admin). Tabel public.reviews. Admin hanya boleh mengubah is_visible atau menghapus (trigger reviews_guard menolak ubah isi).
// Nama customer diambil dari nama penerima di pesanan terkait (admin tidak membaca tabel profiles).
import { supabase } from "../../assets/js/supabase.js";
import { toast } from "../../assets/js/ui.js";
import { esc, fmtDate, confirmDialog } from "../ad-ui.js";

const PAGE = 20;
const stars = (n) => `<span aria-label="Rating ${n} dari 5" style="color:var(--warning,#B8863A);letter-spacing:1px;white-space:nowrap">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;

export async function init({ root, isStale = () => false }) {
  const listEl = root.querySelector("#list"), pager = root.querySelector("#pager"), info = root.querySelector("#pagerInfo");
  const fRating = root.querySelector("#fRating"), fVisible = root.querySelector("#fVisible");
  const state = { rows: [], total: 0, page: 0, req: 0, busy: false };

  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    const from = state.page * PAGE;
    let q = supabase.from("reviews")
      .select("id, rating, body, is_visible, created_at, products(name), orders(order_no, recipient_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (fRating.value) q = q.eq("rating", Number(fRating.value));
    if (fVisible.value) q = q.eq("is_visible", fVisible.value === "tampil");
    const { data, error, count } = await q;
    if (my !== state.req || isStale()) return;
    if (error) {
      console.error(error);
      pager.hidden = true;
      listEl.innerHTML = `<div class="ad-error" role="alert">Data gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
      return;
    }
    state.rows = data ?? []; state.total = count ?? state.rows.length;
    if (!state.rows.length && state.page > 0) { state.page = Math.max(0, Math.ceil(state.total / PAGE) - 1); return load(); }   // halaman terakhir kosong setelah hapus
    render();
  }

  const who = (r) => r.orders?.recipient_name || "Pembeli";
  const prod = (r) => r.products?.name || "Produk dihapus";
  const badge = (r) => (r.is_visible ? '<span class="ad-badge ad-badge-on">Tampil</span>' : '<span class="ad-badge ad-badge-off">Disembunyikan</span>');
  const body = (r) => (r.body ? `<span style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.body)}</span>` : '<span class="ad-muted">(tanpa teks)</span>');
  const actions = (r) => `
    <button type="button" class="btn btn-secondary btn-sm" data-act="toggle" data-id="${esc(r.id)}">${r.is_visible ? "Sembunyikan" : "Tampilkan"}</button>
    <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${esc(r.id)}">Hapus</button>`;

  function render() {
    const rows = state.rows;
    const filtered = Boolean(fRating.value || fVisible.value);
    if (!rows.length) {
      pager.hidden = true;
      listEl.innerHTML = `<div class="ad-empty">${filtered ? "Tidak ada ulasan yang cocok dengan filter." : "Belum ada ulasan. Ulasan muncul di sini setelah customer menilai pesanan yang selesai."}</div>`;
      return;
    }
    const table = `
      <div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th scope="col">Produk</th><th scope="col">Customer</th><th scope="col">Rating</th><th scope="col">Ulasan</th><th scope="col">Tanggal</th><th scope="col">Status</th><th scope="col" class="ad-th-actions">Aksi</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="ad-name">${esc(prod(r))}</td>
          <td>${esc(who(r))}<div class="ad-meta">${esc(r.orders?.order_no ?? "")}</div></td>
          <td>${stars(r.rating)}</td>
          <td style="max-width:22rem">${body(r)}</td>
          <td>${esc(fmtDate(r.created_at))}</td>
          <td>${badge(r)}</td>
          <td><div class="ad-cell-actions">${actions(r)}</div></td></tr>`).join("")}
        </tbody></table></div>`;
    const cards = `
      <ul class="ad-cards">${rows.map((r) => `<li>
        <div class="ad-card-top"><div style="min-width:0"><div class="ad-name">${esc(prod(r))}</div>${stars(r.rating)}</div>${badge(r)}</div>
        <div style="margin-top:8px">${body(r)}</div>
        <div class="ad-meta">${esc(who(r))} · ${esc(r.orders?.order_no ?? "")} · ${esc(fmtDate(r.created_at))}</div>
        <div class="ad-card-actions">${actions(r)}</div></li>`).join("")}</ul>`;
    listEl.innerHTML = table + cards;

    const a = state.page * PAGE + 1, b = state.page * PAGE + rows.length;
    pager.hidden = state.total <= PAGE;
    info.textContent = `${a}–${b} dari ${state.total} ulasan`;
    pager.querySelector("[data-act=prev]").disabled = state.page === 0;
    pager.querySelector("[data-act=next]").disabled = b >= state.total;
  }

  async function toggle(row) {
    if (state.busy) return;
    state.busy = true;
    const { data, error } = await supabase.from("reviews").update({ is_visible: !row.is_visible }).eq("id", row.id).select("id");
    state.busy = false;
    if (error || !data?.length) { console.error(error); toast("Status ulasan gagal diubah.", "error"); return; }
    toast(row.is_visible ? "Ulasan disembunyikan dari publik." : "Ulasan ditampilkan kembali.", "success");
    load();
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: "Hapus ulasan?", danger: true, confirmLabel: "Hapus",
      message: `Ulasan untuk “${prod(row)}” dari ${who(row)} akan dihapus permanen. Untuk sekadar menyembunyikan dari publik, pilih Sembunyikan.`,
      onConfirm: async () => { const { error } = await supabase.from("reviews").delete().eq("id", row.id); if (error) throw error; },
    });
    if (ok) { toast("Ulasan dihapus.", "success"); load(); }
  }

  const refilter = () => { state.page = 0; load(); };
  fRating.addEventListener("change", refilter);
  fVisible.addEventListener("change", refilter);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const row = state.rows.find((r) => r.id === b.dataset.id);
    switch (b.dataset.act) {
      case "retry": load(); break;
      case "prev": state.page = Math.max(0, state.page - 1); load(); break;
      case "next": state.page += 1; load(); break;
      case "toggle": row && toggle(row); break;
      case "delete": row && remove(row); break;
    }
  });
  return load();
}
