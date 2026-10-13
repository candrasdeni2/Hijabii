// Pembantu UI bersama untuk panel (Super Admin: prefiks "sa", Admin: prefiks "ad").
// Fungsi tanpa markup berprefiks diekspor langsung; modal/dialog dibuat lewat createPanelKit(prefiks).
import { toast } from "./ui.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"\u0027]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\u0027": "&#39;" }[c]));

export function fmtDate(v) {
  if (!v) return "–";
  const d = new Date(v);
  if (isNaN(d)) return "–";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.append(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  }
}

export function setBusy(btn, on, text = "Memproses…") {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = text; btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
  else { if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.disabled = false; btn.removeAttribute("aria-busy"); }
}

export function wireCopy(scope, text) {
  scope.querySelector("[data-copy]")?.addEventListener("click", async () => {
    const ok = await copyText(text);
    toast(ok ? "Berhasil disalin." : "Gagal menyalin. Salin manual.", ok ? "success" : "error");
  });
}

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])";

/** p = prefiks kelas CSS panel ("sa" / "ad"). Kelas yang dipakai: .{p}-modal*, .{p}-lock, .{p}-modes, .{p}-secret, .{p}-note, dst. */
export function createPanelKit(p) {
  /** Modal (desktop) / bottom sheet (mobile). Mengembalikan { el, close }. */
  function openModal({ title, html = "", size = "md", dismissible = true, onClose } = {}) {
    const opener = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = `${p}-modal-backdrop`;
    backdrop.innerHTML = `
    <div class="${p}-modal ${p}-modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${p}ModalTitle">
      <div class="${p}-modal-handle" aria-hidden="true"></div>
      <div class="${p}-modal-head">
        <h2 id="${p}ModalTitle">${esc(title)}</h2>
        ${dismissible ? `<button type="button" class="${p}-icon-btn" data-close aria-label="Tutup">×</button>` : ""}
      </div>
      <div class="${p}-modal-body">${html}</div>
    </div>`;
    const el = backdrop.firstElementChild;
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      backdrop.remove();
      if (!document.querySelector(`.${p}-modal-backdrop`)) document.body.classList.remove(`${p}-lock`);
      if (opener && opener.focus && document.contains(opener)) opener.focus();
      onClose?.();
    };
    function onKey(e) {
      if (e.key === "Escape" && dismissible) { e.stopPropagation(); close(); return; }
      if (e.key === "Tab") {
        const f = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    el.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop && dismissible) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.classList.add(`${p}-lock`);
    document.body.append(backdrop);
    (el.querySelector(`.${p}-modal-body ` + FOCUSABLE) || el.querySelector(FOCUSABLE))?.focus();
    return { el, close };
  }

  /** Dialog konfirmasi. onConfirm (opsional) dijalankan saat tombol ditekan; bila melempar error, dialog tetap terbuka. */
  function confirmDialog({ title, message = "", confirmLabel = "Ya, lanjutkan", cancelLabel = "Batal", danger = false, requireText = "", onConfirm } = {}) {
    return new Promise((resolve) => {
      let result = false;
      const m = openModal({
        title, size: "sm",
        html: `
        <p class="${p}-modal-text">${esc(message)}</p>
        ${requireText ? `<div class="field"><label class="label" for="${p}ConfirmInput">Ketik <strong>${esc(requireText)}</strong> untuk melanjutkan</label>
          <input class="input" id="${p}ConfirmInput" autocomplete="off" spellcheck="false" style="font-size:16px"></div>` : ""}
        <div class="${p}-modal-actions">
          <button type="button" class="btn btn-secondary" data-close>${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok ${requireText ? "disabled" : ""}>${esc(confirmLabel)}</button>
        </div>`,
        onClose: () => resolve(result),
      });
      const ok = m.el.querySelector("[data-ok]");
      const cancel = m.el.querySelector(`.${p}-modal-actions [data-close]`);
      const input = m.el.querySelector(`#${p}ConfirmInput`);
      if (input) input.addEventListener("input", () => { ok.disabled = input.value.trim().toLowerCase() !== requireText.toLowerCase(); });
      ok.addEventListener("click", async () => {
        if (onConfirm) {
          setBusy(ok, true); cancel.disabled = true;
          try { await onConfirm(); }
          catch (e) { toast(e.message || "Gagal memproses.", "error"); setBusy(ok, false); cancel.disabled = false; return; }
        }
        result = true; m.close();
      });
    });
  }

  /** Kartu radio (gaya pilihan metode di design.md 5.2). */
  function modeCards(name, items) {
    return `<div class="${p}-modes" role="radiogroup">${items.map((i) => `
    <label class="${p}-mode">
      <input type="radio" name="${esc(name)}" value="${esc(i.v)}" ${i.checked ? "checked" : ""}>
      <span class="${p}-mode-body">
        <span class="${p}-mode-title">${esc(i.t)}${i.tag ? `<em class="${p}-tag">${esc(i.tag)}</em>` : ""}</span>
        <span class="${p}-mode-desc">${esc(i.d)}</span>
      </span>
    </label>`).join("")}</div>`;
  }

  /** Panel kredensial yang ditampilkan sekali saja. */
  function secretPanel({ email, password, note = "" }) {
    return `
    <div class="${p}-secret">
      ${email ? `<div class="${p}-secret-row"><span>Email</span><code>${esc(email)}</code></div>` : ""}
      <div class="${p}-secret-row"><span>Password</span><code>${esc(password)}</code></div>
    </div>
    <p class="${p}-note ${p}-note-warn">Password ini hanya ditampilkan sekali. Salin dan kirim ke pemiliknya lewat jalur yang aman. ${esc(note)}</p>
    <div class="${p}-modal-actions">
      <button type="button" class="btn btn-secondary" data-copy>Salin</button>
      <button type="button" class="btn btn-primary" data-close>Selesai</button>
    </div>`;
  }

  return { openModal, confirmDialog, modeCards, secretPanel, wireCopy };
}
