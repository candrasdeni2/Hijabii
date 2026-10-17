// Halaman Lookbook (Admin): foto + judul, urutan, tampil/sembunyikan. Tabel public.lookbooks (title, image_path, sort_order, is_active).
// Foto diunggah lewat komponen photo-upload (WebP <= 2 MB). Foto lama yang tergantikan/terhapus masuk antrean hapus lewat trigger database.
import { supabase, imageUrl } from "../../assets/js/supabase.js";
import { toast } from "../../assets/js/ui.js";
import { mountPhotoUpload } from "../../assets/js/photo-upload.js";
import { esc, openModal, confirmDialog, setBusy } from "../ad-ui.js";
import { orderButtons, reorder, nextOrder } from "../list-utils.js";

const TITLE_MAX = 40;
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");

export async function init({ root, isStale = () => false }) {
  const listEl = root.querySelector("#list");
  const btnCreate = root.querySelector("#btnCreate");
  const state = { rows: [], req: 0, busy: false };

  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    const { data, error } = await supabase.from("lookbooks")
      .select("id, title, image_path, sort_order, is_active, created_at")
      .order("sort_order").order("created_at");
    if (my !== state.req || isStale()) return;
    if (error) {
      console.error(error);
      listEl.innerHTML = `<div class="ad-error" role="alert">Data gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
      return;
    }
    state.rows = data ?? [];
    render();
  }

  const thumb = (r) => `<img src="${esc(imageUrl(r.image_path))}" alt="${esc(r.title)}" loading="lazy" width="56" height="70" style="width:56px;height:70px;object-fit:cover;border-radius:8px;background:var(--sand);flex:none">`;
  const badge = (r) => (r.is_active ? '<span class="ad-badge ad-badge-on">Tampil</span>' : '<span class="ad-badge ad-badge-off">Disembunyikan</span>');
  const actions = (r) => `
    <button type="button" class="btn btn-secondary btn-sm" data-act="toggle" data-id="${esc(r.id)}">${r.is_active ? "Sembunyikan" : "Tampilkan"}</button>
    <button type="button" class="btn btn-secondary btn-sm" data-act="edit" data-id="${esc(r.id)}">Edit</button>
    <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${esc(r.id)}">Hapus</button>`;

  function render() {
    const rows = state.rows, n = rows.length;
    if (!n) {
      listEl.innerHTML = `<div class="ad-empty">Belum ada foto lookbook. Tambahkan yang pertama untuk landing page.<br>
        <button type="button" class="btn btn-primary btn-sm" data-act="create" style="margin-top:12px">+ Tambah Lookbook</button></div>`;
      return;
    }
    const table = `
      <div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th scope="col">Urutan</th><th scope="col">Foto</th><th scope="col">Judul</th><th scope="col">Status</th><th scope="col" class="ad-th-actions">Aksi</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td>${orderButtons(r, i, n, r.title)}</td>
          <td>${thumb(r)}</td>
          <td class="ad-name">${esc(r.title)}</td>
          <td>${badge(r)}</td>
          <td><div class="ad-cell-actions">${actions(r)}</div></td></tr>`).join("")}
        </tbody></table></div>`;
    const cards = `
      <ul class="ad-cards">${rows.map((r, i) => `<li>
        <div class="ad-card-top"><div style="display:flex;gap:12px;align-items:center;min-width:0">${thumb(r)}<div><div class="ad-name">${esc(r.title)}</div>${badge(r)}</div></div>${orderButtons(r, i, n, r.title)}</div>
        <div class="ad-card-actions">${actions(r)}</div></li>`).join("")}</ul>`;
    listEl.innerHTML = table + cards;
  }

  async function toggle(row) {
    const { data, error } = await supabase.from("lookbooks").update({ is_active: !row.is_active }).eq("id", row.id).select("id");
    if (error || !data?.length) { console.error(error); toast("Status gagal diubah.", "error"); return; }
    toast(row.is_active ? "Lookbook disembunyikan." : "Lookbook ditampilkan.", "success");
    load();
  }

  async function move(id, dir) {
    if (state.busy) return;
    state.busy = true;
    listEl.querySelectorAll(".ad-order button").forEach((b) => { b.disabled = true; });
    const { error } = await reorder(supabase, "lookbooks", state.rows, id, dir);
    state.busy = false;
    if (error) { console.error(error); toast("Urutan gagal disimpan.", "error"); }
    load();
  }

  function formDialog(row) {
    const editing = Boolean(row);
    let pu = null, saved = false;
    const m = openModal({
      title: editing ? "Ubah lookbook" : "Tambah lookbook",
      onClose: () => { if (!saved) pu?.discardUnsaved(); pu?.destroy(); },   // unggahan yang tak jadi dipakai dibersihkan
      html: `
        <form id="lbForm" novalidate>
          <div class="field"><span class="label" id="lbPhotoLabel">Foto <span class="req">*</span></span>
            <div id="lbPhoto" role="group" aria-labelledby="lbPhotoLabel"></div>
            <span class="field-error" id="lbPhotoErr"></span></div>
          <div class="field"><label class="label" for="lbTitle">Judul <span class="req">*</span></label>
            <input class="input" id="lbTitle" autocomplete="off" maxlength="${TITLE_MAX}" style="font-size:16px" placeholder="Campus, Office, Casual…" value="${esc(row?.title ?? "")}">
            <span class="field-error" id="lbTitleErr"></span></div>
          <label style="display:flex;gap:10px;align-items:center;min-height:44px;cursor:pointer">
            <input type="checkbox" id="lbActive" style="width:20px;height:20px;accent-color:var(--marsala)" ${row?.is_active === false ? "" : "checked"}>
            <span>Tampilkan di landing page</span></label>
          <div class="ad-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="lbSubmit">${editing ? "Simpan" : "Tambah"}</button>
          </div>
        </form>`,
    });
    const q = (s) => m.el.querySelector(s);
    const submit = q("#lbSubmit");
    pu = mountPhotoUpload({
      root: q("#lbPhoto"), folder: "lookbook", value: row?.image_path ?? null, label: "Foto lookbook", aspect: "4 / 5",
      onChange: () => { q("#lbPhotoErr").textContent = ""; },
      onBusyChange: (b) => { submit.disabled = b; },     // tombol simpan mati selama foto diproses/diunggah
    });

    q("#lbForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      q("#lbPhotoErr").textContent = ""; q("#lbTitleErr").textContent = "";
      if (pu.isBusy()) { toast("Tunggu unggahan foto selesai.", "error"); return; }
      const path = pu.get(), title = norm(q("#lbTitle").value);
      let bad = false;
      if (!path) { q("#lbPhotoErr").textContent = "Foto wajib diisi."; bad = true; }
      if (!title) { q("#lbTitleErr").textContent = "Judul wajib diisi."; bad = true; }
      else if (title.length > TITLE_MAX) { q("#lbTitleErr").textContent = `Judul maksimal ${TITLE_MAX} karakter.`; bad = true; }
      if (bad) return;

      const is_active = q("#lbActive").checked;
      setBusy(submit, true);
      const { error } = editing
        ? await supabase.from("lookbooks").update({ title, is_active, ...(path !== row.image_path ? { image_path: path } : {}) }).eq("id", row.id)
        : await supabase.from("lookbooks").insert({ title, image_path: path, is_active, sort_order: nextOrder(state.rows) });
      if (error) { setBusy(submit, false); console.error(error); toast(error.message || "Gagal menyimpan lookbook.", "error"); return; }
      pu.markSaved(); saved = true;
      toast(editing ? "Lookbook diperbarui." : "Lookbook ditambahkan.", "success");
      m.close();
      load();
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: "Hapus lookbook?", danger: true, confirmLabel: "Hapus",
      message: `“${row.title}” akan dihapus dari landing page, dan fotonya ikut dihapus dari penyimpanan.`,
      onConfirm: async () => { const { error } = await supabase.from("lookbooks").delete().eq("id", row.id); if (error) throw error; },
    });
    if (ok) { toast("Lookbook dihapus.", "success"); load(); }
  }

  listEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const row = state.rows.find((r) => r.id === b.dataset.id);
    switch (b.dataset.act) {
      case "retry": load(); break;
      case "create": formDialog(null); break;
      case "up": move(b.dataset.id, -1); break;
      case "down": move(b.dataset.id, 1); break;
      case "toggle": row && toggle(row); break;
      case "edit": row && formDialog(row); break;
      case "delete": row && remove(row); break;
    }
  });
  btnCreate?.addEventListener("click", () => formDialog(null));
  return load();
}
