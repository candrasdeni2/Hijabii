// Halaman Kategori (Admin): tambah, ubah, hapus, dan urutan tampil.
// Tabel: public.categories (name unik, sort_order). RLS: semua boleh membaca, hanya admin yang menulis.
// Menghapus kategori TIDAK menghapus produk: products.category_id menjadi kosong (on delete set null).
// Semua listener dipasang pada elemen di dalam halaman (bukan pada #view yang dipakai ulang antar rute),
// supaya tidak menumpuk setiap kali halaman dibuka lagi.
import { supabase } from "../../assets/js/supabase.js";
import { toast } from "../../assets/js/ui.js";
import { esc, fmtDate, openModal, confirmDialog, setBusy } from "../ad-ui.js";

const NAME_MAX = 60;
const ARROW_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

const normName = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
const productCount = (r) => Number(r.products?.[0]?.count ?? 0);

export async function init({ root, isStale = () => false }) {
  const listEl = root.querySelector("#list");
  const btnCreate = root.querySelector("#btnCreate");
  const state = { rows: [], req: 0, busy: false };

  /* ---------- Muat & render ---------- */
  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    const { data, error } = await supabase.from("categories")
      .select("id, name, sort_order, created_at, products(count)")
      .order("sort_order").order("name");
    if (my !== state.req || isStale()) return;

    if (error) {
      console.error(error);
      listEl.innerHTML = `<div class="ad-error" role="alert">Data gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
      return;
    }
    state.rows = data ?? [];
    render();
  }

  const orderButtons = (r, i, n) => `
    <div class="ad-order">
      <button type="button" data-act="up" data-id="${esc(r.id)}" aria-label="Naikkan urutan ${esc(r.name)}" ${i === 0 ? "disabled" : ""}>${ARROW_UP}</button>
      <button type="button" data-act="down" data-id="${esc(r.id)}" aria-label="Turunkan urutan ${esc(r.name)}" ${i === n - 1 ? "disabled" : ""}>${ARROW_DOWN}</button>
    </div>`;

  const actions = (r) => `
    <button type="button" class="btn btn-secondary btn-sm" data-act="edit" data-id="${esc(r.id)}">Edit</button>
    <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${esc(r.id)}">Hapus</button>`;

  function render() {
    const rows = state.rows, n = rows.length;
    if (!n) {
      listEl.innerHTML = `<div class="ad-empty">Belum ada kategori. Tambahkan yang pertama untuk mengelompokkan produk.<br>
        <button type="button" class="btn btn-primary btn-sm" data-act="create" style="margin-top:12px">+ Tambah Kategori</button></div>`;
      return;
    }
    const table = `
      <div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th scope="col">Urutan</th><th scope="col">Nama</th><th scope="col">Produk</th><th scope="col">Dibuat</th><th scope="col" class="ad-th-actions">Aksi</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td>${orderButtons(r, i, n)}</td>
          <td class="ad-name">${esc(r.name)}</td>
          <td>${productCount(r)}</td>
          <td>${esc(fmtDate(r.created_at))}</td>
          <td><div class="ad-cell-actions">${actions(r)}</div></td></tr>`).join("")}
        </tbody></table></div>`;
    const cards = `
      <ul class="ad-cards">${rows.map((r, i) => `<li>
        <div class="ad-card-top"><div class="ad-name">${esc(r.name)}</div>${orderButtons(r, i, n)}</div>
        <div class="ad-meta">${productCount(r)} produk · Dibuat ${esc(fmtDate(r.created_at))}</div>
        <div class="ad-card-actions">${actions(r)}</div></li>`).join("")}</ul>`;
    listEl.innerHTML = table + cards;
  }

  /* ---------- Urutan ---------- */
  // Nomor urut dirapikan ulang (0..n-1) agar tidak ada nilai kembar, lalu hanya baris yang berubah yang ditulis.
  async function move(id, dir) {
    if (state.busy) return;
    const rows = state.rows;
    const i = rows.findIndex((r) => r.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    const changes = next.map((r, n) => ({ id: r.id, n })).filter(({ id: rid, n }) => rows.find((r) => r.id === rid).sort_order !== n);

    state.busy = true;
    listEl.querySelectorAll(".ad-order button").forEach((b) => { b.disabled = true; });
    const results = await Promise.all(changes.map((c) => supabase.from("categories").update({ sort_order: c.n }).eq("id", c.id)));
    state.busy = false;
    if (results.some((r) => r.error)) { console.error(results.find((r) => r.error).error); toast("Urutan gagal disimpan.", "error"); }
    load();
  }

  /* ---------- Tambah / ubah ---------- */
  function formDialog(row) {
    const editing = Boolean(row);
    const m = openModal({
      title: editing ? "Ubah kategori" : "Tambah kategori",
      size: "sm",
      html: `
        <form id="catForm" novalidate>
          <div class="field"><label class="label" for="catName">Nama kategori <span class="req">*</span></label>
            <input class="input" id="catName" autocomplete="off" maxlength="${NAME_MAX}" style="font-size:16px" value="${esc(row?.name ?? "")}">
            <span class="field-error" id="catNameErr"></span></div>
          <div class="ad-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="catSubmit">${editing ? "Simpan" : "Tambah"}</button>
          </div>
        </form>`,
    });
    const q = (s) => m.el.querySelector(s);
    const showErr = (t) => { q("#catNameErr").textContent = t; };

    q("#catForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = normName(q("#catName").value);
      showErr("");
      if (!name) { showErr("Nama kategori wajib diisi."); return; }
      const dupe = state.rows.some((r) => r.id !== row?.id && r.name.toLowerCase() === name.toLowerCase());
      if (dupe) { showErr("Nama kategori sudah dipakai."); return; }
      if (editing && name === row.name) { m.close(); return; }

      const btn = q("#catSubmit");
      setBusy(btn, true);
      const nextOrder = state.rows.reduce((mx, r) => Math.max(mx, r.sort_order ?? 0), -1) + 1;
      const { error } = editing
        ? await supabase.from("categories").update({ name }).eq("id", row.id)
        : await supabase.from("categories").insert({ name, sort_order: nextOrder });
      if (error) {
        setBusy(btn, false);
        if (error.code === "23505") showErr("Nama kategori sudah dipakai.");
        else { console.error(error); toast(error.message || "Gagal menyimpan kategori.", "error"); }
        return;
      }
      toast(editing ? "Kategori diperbarui." : "Kategori ditambahkan.", "success");
      m.close();
      load();
    });
  }

  /* ---------- Hapus ---------- */
  async function remove(row) {
    // Hitung langsung dari tabel produk agar angkanya akurat saat konfirmasi.
    const { count, error: cErr } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", row.id);
    const n = cErr ? productCount(row) : (count ?? 0);
    const ok = await confirmDialog({
      title: "Hapus kategori?",
      message: n > 0
        ? `Kategori “${row.name}” dipakai ${n} produk. Produknya tidak ikut terhapus, tetapi akan menjadi tanpa kategori.`
        : `Kategori “${row.name}” akan dihapus.`,
      confirmLabel: "Hapus",
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("categories").delete().eq("id", row.id);
        if (error) throw error;
      },
    });
    if (ok) { toast("Kategori dihapus.", "success"); load(); }
  }

  /* ---------- Event ---------- */
  listEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const row = state.rows.find((r) => r.id === b.dataset.id);
    switch (b.dataset.act) {
      case "retry": load(); break;
      case "create": formDialog(null); break;
      case "up": move(b.dataset.id, -1); break;
      case "down": move(b.dataset.id, 1); break;
      case "edit": row && formDialog(row); break;
      case "delete": row && remove(row); break;
    }
  });
  btnCreate?.addEventListener("click", () => formDialog(null));

  return load();
}
