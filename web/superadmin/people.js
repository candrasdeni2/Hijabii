// Halaman daftar akun (dipakai Kelola Admin dan Kelola User). Operasi sensitif lewat Edge Function.
import { supabase } from "../assets/js/supabase.js";
import { toast } from "../assets/js/ui.js";
import { callFn } from "./api.js";
import { esc, fmtDate, debounce, openModal, confirmDialog, modeCards, secretPanel, wireCopy, setBusy } from "./sa-ui.js";

const PAGE_SIZE = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initPeoplePage({ root, role, noun, canCreate = false, canDelete = false }) {
  const $ = (s) => root.querySelector(s);
  const listEl = $("#list"), pagerEl = $("#pager"), search = $("#q"), statusSel = $("#status");
  const state = { page: 0, total: 0, rows: new Map(), req: 0 };
  const display = (r) => r.full_name || r.email || "(tanpa nama)";

  /* ---------- Muat & render ---------- */
  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="sa-skel"></div><div class="sa-skel"></div><div class="sa-skel"></div></div>`;
    pagerEl.innerHTML = "";
    const from = state.page * PAGE_SIZE, to = from + PAGE_SIZE - 1;

    const build = (ordered) => {
      let q = supabase.from("profiles").select("*", { count: "exact" }).eq("role", role);
      const term = search.value.trim().replace(/[%,()*\\]/g, " ").trim();
      if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
      if (statusSel.value === "active") q = q.eq("is_active", true);
      if (statusSel.value === "inactive") q = q.eq("is_active", false);
      if (ordered) q = q.order("created_at", { ascending: false });
      return q.range(from, to);
    };
    let res = await build(true);
    if (res.error && res.error.code === "42703") res = await build(false);
    if (my !== state.req) return;

    if (res.error) {
      console.error(res.error);
      listEl.innerHTML = `<div class="sa-error" role="alert">Data gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
      return;
    }
    state.total = res.count ?? res.data.length;
    state.rows = new Map(res.data.map((r) => [r.id, r]));
    if (!res.data.length) {
      listEl.innerHTML = `<div class="sa-empty">${search.value.trim() || statusSel.value ? "Tidak ada hasil yang cocok." : `Belum ada ${esc(noun)}.`}</div>`;
      return;
    }
    listEl.innerHTML = renderTable(res.data) + renderCards(res.data);
    renderPager(from, res.data.length);
  }

  const badge = (r) => r.is_active === false
    ? `<span class="sa-badge sa-badge-off">Nonaktif</span>` : `<span class="sa-badge sa-badge-on">Aktif</span>`;

  const actions = (r, small = true) => `
    <button type="button" class="btn btn-secondary ${small ? "btn-sm" : ""}" data-act="edit" data-id="${esc(r.id)}">Edit</button>
    ${canDelete ? `<button type="button" class="btn btn-danger-outline ${small ? "btn-sm" : ""}" data-act="delete" data-id="${esc(r.id)}">Hapus</button>` : ""}`;

  const renderTable = (rows) => `
    <div class="sa-table-wrap"><table class="sa-table">
      <thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Dibuat</th><th scope="col" class="sa-th-actions">Aksi</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td class="sa-name">${esc(display(r))}</td><td>${esc(r.email)}</td><td>${badge(r)}</td>
        <td>${esc(fmtDate(r.created_at))}</td><td><div class="sa-cell-actions">${actions(r)}</div></td></tr>`).join("")}
      </tbody></table></div>`;

  const renderCards = (rows) => `
    <ul class="sa-cards">${rows.map((r) => `<li>
      <div class="sa-card-top"><div><div class="sa-name">${esc(display(r))}</div><div class="sa-email">${esc(r.email)}</div></div>${badge(r)}</div>
      <div class="sa-meta">Dibuat ${esc(fmtDate(r.created_at))}</div>
      <div class="sa-card-actions">${actions(r)}</div></li>`).join("")}</ul>`;

  function renderPager(from, n) {
    const last = from + n;
    const pages = Math.ceil(state.total / PAGE_SIZE);
    pagerEl.innerHTML = `<span>Menampilkan ${from + 1}–${last} dari ${state.total}</span>
      <div class="sa-pager-btns">
        <button type="button" class="btn btn-secondary btn-sm" data-act="prev" ${state.page === 0 ? "disabled" : ""}>Sebelumnya</button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="next" ${state.page + 1 >= pages ? "disabled" : ""}>Berikutnya</button>
      </div>`;
  }

  /* ---------- Aksi ---------- */
  async function remove(r) {
    const ok = await confirmDialog({
      title: `Hapus ${noun}?`,
      message: `Akun ${display(r)} akan dihapus permanen dan tidak bisa dikembalikan. Bila hanya ingin menutup akses, gunakan Nonaktifkan.`,
      confirmLabel: "Hapus permanen",
      danger: true,
      requireText: r.email,
      onConfirm: () => callFn("delete_user", { user_id: r.id }),
    });
    if (ok) { toast("Akun dihapus.", "success"); if (state.rows.size === 1 && state.page > 0) state.page--; load(); }
  }

  function editDialog(r) {
    const wasActive = r.is_active !== false;
    const m = openModal({
      title: `Edit ${noun}`,
      html: `
        <form id="edForm" novalidate>
          <div class="field"><label class="label" for="edName">Nama lengkap <span class="req">*</span></label>
            <input class="input" id="edName" autocomplete="off" maxlength="100" style="font-size:16px" value="${esc(r.full_name || "")}"><span class="field-error" id="edNameErr"></span></div>
          <div class="field"><label class="label" for="edEmail">Email <span class="req">*</span></label>
            <input class="input" id="edEmail" type="email" autocomplete="off" style="font-size:16px" value="${esc(r.email || "")}"><span class="field-error" id="edEmailErr"></span></div>
          <div class="field"><label class="label" for="edPass">Password baru</label>
            <input class="input" id="edPass" type="text" autocomplete="off" spellcheck="false" style="font-size:16px" placeholder="Kosongkan bila tidak diganti"><span class="field-error" id="edPassErr"></span></div>
          <div class="field"><label class="label" for="edStatus">Status</label>
            <select class="input" id="edStatus" style="font-size:16px">
              <option value="active" ${wasActive ? "selected" : ""}>Aktif</option>
              <option value="inactive" ${wasActive ? "" : "selected"}>Nonaktif</option>
            </select></div>
          <p class="sa-note">Akun nonaktif langsung kehilangan semua akses. Bila password diganti, pengguna wajib menggantinya saat masuk berikutnya.</p>
          <p class="sa-note sa-note-warn" id="edMsg" role="alert" hidden></p>
          <div class="sa-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="edSubmit">Simpan</button>
          </div>
        </form>`,
    });
    const q = (id) => m.el.querySelector(id);
    const set = (id, t) => (q(id).textContent = t);
    q("#edForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = q("#edName").value.trim();
      const email = q("#edEmail").value.trim().toLowerCase();
      const pass = q("#edPass").value;
      const wantActive = q("#edStatus").value === "active";
      set("#edNameErr", ""); set("#edEmailErr", ""); set("#edPassErr", ""); q("#edMsg").hidden = true;
      let bad = false;
      if (!name) { set("#edNameErr", "Nama wajib diisi."); bad = true; }
      if (!EMAIL_RE.test(email)) { set("#edEmailErr", "Email tidak valid."); bad = true; }
      if (pass && pass.length < 8) { set("#edPassErr", "Minimal 8 karakter."); bad = true; }
      if (bad) return;

      const profileChanged = name !== (r.full_name || "") || email !== (r.email || "").toLowerCase();
      if (!profileChanged && !pass && wantActive === wasActive) { m.close(); return; }

      const btn = q("#edSubmit");
      setBusy(btn, true);
      let saved = false;
      try {
        if (profileChanged) { await callFn("update_profile", { user_id: r.id, full_name: name, email }); saved = true; }
        if (pass) { await callFn("set_password", { user_id: r.id, generate: false, password: pass }); saved = true; }
        if (wantActive !== wasActive) { await callFn("set_active", { user_id: r.id, active: wantActive }); saved = true; }
        toast("Perubahan disimpan.", "success");
        m.close(); load();
      } catch (ex) {
        q("#edMsg").textContent = (saved ? "Sebagian perubahan sudah tersimpan, sisanya gagal: " : "") + ex.message;
        q("#edMsg").hidden = false;
        setBusy(btn, false);
        if (saved) load();
      }
    });
  }

  function createDialog() {
    let created = false;
    const m = openModal({
      title: "Tambah admin",
      onClose: () => { if (created) load(); },
      html: `
        <form id="crForm" novalidate>
          <div class="field"><label class="label" for="crName">Nama lengkap <span class="req">*</span></label>
            <input class="input" id="crName" autocomplete="off" maxlength="100" style="font-size:16px"><span class="field-error" id="crNameErr"></span></div>
          <div class="field"><label class="label" for="crEmail">Email <span class="req">*</span></label>
            <input class="input" id="crEmail" type="email" autocomplete="off" style="font-size:16px"><span class="field-error" id="crEmailErr"></span></div>
          ${modeCards("cmode", [
            { v: "auto", t: "Buat password otomatis", checked: true, d: "Password acak ditampilkan sekali setelah akun dibuat." },
            { v: "manual", t: "Tentukan sendiri", d: "Ketik password sementara (minimal 8 karakter)." },
          ])}
          <div class="field" id="crManualWrap" hidden><label class="label" for="crPass">Password sementara</label>
            <input class="input" id="crPass" type="text" autocomplete="off" spellcheck="false" style="font-size:16px"><span class="field-error" id="crPassErr"></span></div>
          <p class="sa-note">Admin baru wajib mengganti password saat pertama kali masuk.</p>
          <div class="sa-modal-actions">
            <button type="button" class="btn btn-secondary" data-close>Batal</button>
            <button type="submit" class="btn btn-primary" id="crSubmit">Buat akun</button>
          </div>
        </form>`,
    });
    const form = m.el.querySelector("#crForm");
    form.addEventListener("change", () => { m.el.querySelector("#crManualWrap").hidden = form.cmode.value !== "manual"; });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = m.el.querySelector("#crName").value.trim();
      const email = m.el.querySelector("#crEmail").value.trim().toLowerCase();
      const md = form.cmode.value;
      const pass = m.el.querySelector("#crPass").value;
      const set = (id, t) => (m.el.querySelector(id).textContent = t);
      set("#crNameErr", ""); set("#crEmailErr", ""); set("#crPassErr", "");
      let bad = false;
      if (!name) { set("#crNameErr", "Nama wajib diisi."); bad = true; }
      if (!EMAIL_RE.test(email)) { set("#crEmailErr", "Email tidak valid."); bad = true; }
      if (md === "manual" && pass.length < 8) { set("#crPassErr", "Minimal 8 karakter."); bad = true; }
      if (bad) return;

      const btn = m.el.querySelector("#crSubmit");
      setBusy(btn, true);
      try {
        const out = await callFn("create_admin", { full_name: name, email, generate: md === "auto", password: md === "manual" ? pass : undefined });
        created = true;
        const shown = md === "auto" ? out.password : pass;
        m.el.querySelector(".sa-modal-head h2").textContent = "Admin berhasil dibuat";
        m.el.querySelector(".sa-modal-body").innerHTML = secretPanel({ email, password: shown, note: "Admin wajib menggantinya saat masuk pertama kali." });
        wireCopy(m.el, `Email: ${email}\nPassword: ${shown}`);
      } catch (ex) {
        toast(ex.message, "error");
        setBusy(btn, false);
      }
    });
  }

  /* ---------- Event ---------- */
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const r = state.rows.get(b.dataset.id);
    switch (b.dataset.act) {
      case "retry": load(); break;
      case "prev": if (state.page > 0) { state.page--; load(); } break;
      case "next": state.page++; load(); break;
      case "edit": r && editDialog(r); break;
      case "delete": r && remove(r); break;
    }
  });
  search.addEventListener("input", debounce(() => { state.page = 0; load(); }, 300));
  statusSel.addEventListener("change", () => { state.page = 0; load(); });
  if (canCreate) $("#btnCreate")?.addEventListener("click", createDialog);

  return load();
}
