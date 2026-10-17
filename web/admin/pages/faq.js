// Halaman FAQ (Admin): pertanyaan + jawaban, urutan, tampil/sembunyikan. Tabel public.faqs (question, answer, sort_order, is_active).
import { supabase } from "../../assets/js/supabase.js";
import { toast } from "../../assets/js/ui.js";
import { esc, openModal, confirmDialog, setBusy } from "../ad-ui.js";
import { orderButtons, reorder, nextOrder } from "../list-utils.js";

const Q_MAX = 200, A_MAX = 1000;
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ");
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export async function init({ root, isStale = () => false }) {
  const listEl = root.querySelector("#list");
  const btnCreate = root.querySelector("#btnCreate");
  const state = { rows: [], req: 0, busy: false };

  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
    const { data, error } = await supabase.from("faqs")
      .select("id, question, answer, sort_order, is_active, created_at")
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

  const badge = (r) => (r.is_active ? '<span class="ad-badge ad-badge-on">Tampil</span>' : '<span class="ad-badge ad-badge-off">Disembunyikan</span>');
  const actions = (r) => `
    <button type="button" class="btn btn-secondary btn-sm" data-act="toggle" data-id="${esc(r.id)}">${r.is_active ? "Sembunyikan" : "Tampilkan"}</button>
    <button type="button" class="btn btn-secondary btn-sm" data-act="edit" data-id="${esc(r.id)}">Edit</button>
    <button type="button" class="btn btn-danger-outline btn-sm" data-act="delete" data-id="${esc(r.id)}">Hapus</button>`;

  function render() {
    const rows = state.rows, n = rows.length;
    if (!n) {
      listEl.innerHTML = `<div class="ad-empty">Belum ada FAQ. Tambahkan pertanyaan pertama yang sering ditanyakan customer.<br>
        <button type="button" class="btn btn-primary btn-sm" data-act="create" style="margin-top:12px">+ Tambah FAQ</button></div>`;
      return;
    }
    const table = `
      <div class="ad-table-wrap"><table class="ad-table">
        <thead><tr><th scope="col">Urutan</th><th scope="col">Pertanyaan</th><th scope="col">Status</th><th scope="col" class="ad-th-actions">Aksi</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td>${orderButtons(r, i, n, r.question)}</td>
          <td><div class="ad-name">${esc(r.question)}</div><div class="ad-meta">${esc(clip(r.answer, 110))}</div></td>
          <td>${badge(r)}</td>
          <td><div class="ad-cell-actions">${actions(r)}</div></td></tr>`).join("")}
        </tbody></table></div>`;
    const cards = `
      <ul class="ad-cards">${rows.map((r, i) => `<li>
        <div class="ad-card-top"><div style="min-width:0"><div class="ad-name">${esc(r.question)}</div>${badge(r)}</div>${orderButtons(r, i, n, r.question)}</div>
        <div class="ad-meta">${esc(clip(r.answer, 110))}</div>
        <div class="ad-card-actions">${actions(r)}</div></li>`).join("")}</ul>`;
    listEl.innerHTML = table + cards;
  }

  async function toggle(row) {
    const { data, error } = await supabase.from("faqs").update({ is_active: !row.is_active }).eq("id", row.id).select("id");
    if (error || !data?.length) { console.error(error); toast("Status gagal diubah.", "error"); return; }
    toast(row.is_active ? "FAQ disembunyikan." : "FAQ ditampilkan.", "success");
    load();
  }

  async function move(id, dir) {
    if (state.busy) return;
    state.busy = true;
    listEl.querySelectorAll(".ad-order button").forEach((b) => { b.disabled = true; });
    const { error } = await reorder(supabase, "faqs", state.rows, id, dir);
    state.busy = false;
    if (error) { console.error(error); toast("Urutan gagal disimpan.", "error"); }
    load();
  }

  function formDialog(row) {
    const editing = Boolean(row);
    const m = openModal({
      title: editing ? "Ubah FAQ" : "Tambah FAQ",
      html: `
        <form id="faqForm" novalidate>
          <div class="field"><label class="label" for="faqQ">Pertanyaan <span class="req">*</span></label>
            <input class="input" id="faqQ" autocomplete="off" maxlength="${Q_MAX}" style="font-size:16px" value="${esc(row?.question ?? "")}">
            <span class="field-error" id="faqQErr"></span></div>
          <div class="field"><label class="label" for="faqA">Jawaban <span class="req">*</span></label>
            <textarea class="input" id="faqA" rows="5" maxlength="${A_MAX}" style="font-size:16px;resize:vertical">${esc(row?.answer ?? "")}</textarea>
            <span class="field-error" id="faqAErr"></span></div>
          <label style="display:flex;gap:10px;align-items:center;min-height:44px;cursor:pointer">
            <input type="checkbox" id="faqActive" style="width:20px;height:20px;accent-color:var(--marsala)" ${row?.is_active === false ? "" : "checked"}>
            <span>Tampilkan di landing page</span></label>
          <div class="ad-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="faqSubmit">${editing ? "Simpan" : "Tambah"}</button>
          </div>
        </form>`,
    });
    const q = (s) => m.el.querySelector(s);
    q("#faqForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      q("#faqQErr").textContent = ""; q("#faqAErr").textContent = "";
      const question = norm(q("#faqQ").value);
      const answer = q("#faqA").value.trim();         // jawaban boleh berbaris-baris, jadi baris baru dipertahankan
      let bad = false;
      if (!question) { q("#faqQErr").textContent = "Pertanyaan wajib diisi."; bad = true; }
      if (!answer) { q("#faqAErr").textContent = "Jawaban wajib diisi."; bad = true; }
      if (bad) { (q("#faqQErr").textContent ? q("#faqQ") : q("#faqA")).focus(); return; }

      const is_active = q("#faqActive").checked;
      const btn = q("#faqSubmit");
      setBusy(btn, true);
      const { error } = editing
        ? await supabase.from("faqs").update({ question, answer, is_active }).eq("id", row.id)
        : await supabase.from("faqs").insert({ question, answer, is_active, sort_order: nextOrder(state.rows) });
      if (error) { setBusy(btn, false); console.error(error); toast(error.message || "Gagal menyimpan FAQ.", "error"); return; }
      toast(editing ? "FAQ diperbarui." : "FAQ ditambahkan.", "success");
      m.close();
      load();
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({
      title: "Hapus FAQ?", danger: true, confirmLabel: "Hapus",
      message: `“${clip(row.question, 80)}” akan dihapus dari landing page. Untuk sementara saja, pilih Sembunyikan.`,
      onConfirm: async () => { const { error } = await supabase.from("faqs").delete().eq("id", row.id); if (error) throw error; },
    });
    if (ok) { toast("FAQ dihapus.", "success"); load(); }
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
