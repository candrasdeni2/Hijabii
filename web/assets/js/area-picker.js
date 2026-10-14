// Pemilih area ongkir (combobox): dipakai untuk asal kirim (Pengaturan admin) dan tujuan kirim (checkout customer).
// mountAreaPicker({ root, value:{id,label}|null, onChange(sel|null) }) -> { get, set, focus, destroy }
// Pencarian lewat Edge Function shipping-area-search (minimal 3 huruf, ditunda 450 ms agar hemat jatah API).
import { searchAreas } from "./shipping.js";
import { esc } from "./panel-kit.js";

const CSS = `
.ap{position:relative}
.ap-selected{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--sand);background:var(--paper);border-radius:12px;padding:8px 8px 8px 14px;min-height:48px}
.ap-sel-label{font-weight:500;font-size:14px;overflow-wrap:anywhere}
.ap-link{background:none;border:0;padding:0 8px;font:inherit;font-size:13px;color:var(--marsala);text-decoration:underline;text-underline-offset:4px;cursor:pointer;min-height:44px;flex:none}
.ap-list{list-style:none;margin:6px 0 0;padding:6px;border:1px solid var(--sand);background:var(--paper);border-radius:12px;box-shadow:0 8px 24px rgba(43,33,28,.06);max-height:min(320px,50vh);overflow:auto}
.ap-opt{padding:10px 12px;border-radius:8px;cursor:pointer;font-size:14px;line-height:1.35}
.ap-opt small{display:block;color:rgba(43,33,28,.65);font-size:12px}
.ap-opt[aria-selected="true"],.ap-opt:hover{background:var(--sand)}
.ap-status{margin:6px 2px 0;font-size:13px;color:rgba(43,33,28,.7);min-height:18px}
.ap-status.err{color:var(--error,#9E3D3D)}
.ap-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
`;
let styled = false;
function ensureStyles() {
  if (styled || typeof document === "undefined") return;
  const s = document.createElement("style");
  s.setAttribute("data-area-picker", "");
  s.textContent = CSS;
  document.head.append(s);
  styled = true;
}

/** "CIJORO LEBAK" -> "Cijoro Lebak" (API mengirim huruf kapital semua). */
export const pretty = (s) => String(s ?? "").toLowerCase().replace(/(^|[\s,.\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function mountAreaPicker({ root, value = null, onChange = () => {}, inputId = "areaInput", placeholder = "Ketik kelurahan, kecamatan, atau kota…", minChars = 3 } = {}) {
  ensureStyles();
  let sel = value && value.id ? { id: String(value.id), label: value.label ?? "" } : null;
  let results = [], active = -1, seq = 0, timer = null, lastQ = "";
  let mode = sel ? "selected" : "search";
  const listId = `${inputId}-list`;

  root.classList.add("ap");
  root.innerHTML = `
    <div class="ap-selected" data-sel hidden>
      <span class="ap-sel-label" data-sel-label></span>
      <button type="button" class="ap-link" data-change>Ganti</button>
    </div>
    <div data-search hidden>
      <input class="input" id="${esc(inputId)}" type="text" role="combobox" aria-expanded="false" aria-controls="${esc(listId)}"
        aria-autocomplete="list" autocomplete="off" spellcheck="false" maxlength="60" style="font-size:16px" placeholder="${esc(placeholder)}">
      <ul class="ap-list" id="${esc(listId)}" role="listbox" hidden></ul>
      <div class="ap-foot">
        <p class="ap-status" data-status role="status" aria-live="polite"></p>
        <button type="button" class="ap-link" data-retry hidden>Coba lagi</button>
        <button type="button" class="ap-link" data-cancel hidden>Batal</button>
      </div>
    </div>`;
  const q = (s) => root.querySelector(s);
  const box = q("[data-sel]"), selLabel = q("[data-sel-label]"), searchBox = q("[data-search]");
  const input = q("input"), list = q("ul"), status = q("[data-status]");
  const retryBtn = q("[data-retry]"), cancelBtn = q("[data-cancel]");

  function setStatus(text, isErr = false) {
    status.textContent = text;
    status.classList.toggle("err", isErr);
    retryBtn.hidden = !isErr;
  }
  function paintMode() {
    box.hidden = mode !== "selected";
    searchBox.hidden = mode !== "search";
    cancelBtn.hidden = !(mode === "search" && sel);
    if (mode === "selected") selLabel.textContent = sel.label ? pretty(sel.label) : `Area terpilih (ID ${sel.id})`;
  }
  function renderList() {
    active = -1;
    input.setAttribute("aria-expanded", String(results.length > 0));
    input.removeAttribute("aria-activedescendant");
    list.hidden = results.length === 0;
    list.innerHTML = results.map((a, i) => {
      const main = [a.subdistrict, a.district].filter(Boolean).join(", ") || a.label;
      const sub = [a.city, a.province].filter(Boolean).join(", ") + (a.postal_code ? ` · ${a.postal_code}` : "");
      return `<li class="ap-opt" role="option" id="${esc(listId)}-${i}" data-i="${i}" aria-selected="false">${esc(pretty(main))}<small>${esc(pretty(sub))}</small></li>`;
    }).join("");
  }
  function highlight(i) {
    const opts = [...list.children];
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach((o, n) => o.setAttribute("aria-selected", String(n === active)));
    input.setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView?.({ block: "nearest" });
  }
  function choose(i) {
    const a = results[i];
    if (!a) return;
    sel = { id: String(a.id), label: a.label };
    mode = "selected"; results = []; renderList(); input.value = ""; paintMode();
    onChange(sel);
    q("[data-change]").focus();
  }
  async function run(text) {
    const my = ++seq;
    setStatus("Mencari…");
    results = []; renderList();
    try {
      const areas = await searchAreas(text, 10);
      if (my !== seq) return;           // jawaban lama diabaikan bila sudah ada pencarian baru
      results = areas; renderList();
      setStatus(areas.length ? `${areas.length} area ditemukan. Pilih salah satu.` : "Area tidak ditemukan. Coba nama kecamatan atau kota.");
    } catch (e) {
      if (my !== seq) return;
      results = []; renderList();
      setStatus(e?.message || "Pencarian gagal. Coba lagi.", true);
    }
  }
  function onInput() {
    clearTimeout(timer);
    const text = input.value.trim().replace(/\s+/g, " ");
    lastQ = text;
    if (text.length < minChars) { seq++; results = []; renderList(); setStatus(text ? `Ketik minimal ${minChars} huruf.` : ""); return; }
    setStatus("Mencari…");
    timer = setTimeout(() => run(text), 450);
  }

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (active >= 0) choose(active); }
    else if (e.key === "Escape") {
      if (results.length) { e.stopPropagation(); results = []; renderList(); }
      else if (sel) { e.stopPropagation(); cancelBtn.click(); }
    }
  });
  list.addEventListener("mousedown", (e) => e.preventDefault());   // jaga fokus tetap di input
  list.addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) choose(Number(li.dataset.i)); });
  q("[data-change]").addEventListener("click", () => { mode = "search"; paintMode(); setStatus(""); input.focus(); });
  cancelBtn.addEventListener("click", () => { mode = "selected"; results = []; renderList(); input.value = ""; setStatus(""); paintMode(); q("[data-change]").focus(); });
  retryBtn.addEventListener("click", () => { if (lastQ.length >= minChars) run(lastQ); });

  paintMode();
  return {
    get: () => sel,
    set(v) {
      sel = v && v.id ? { id: String(v.id), label: v.label ?? "" } : null;
      mode = sel ? "selected" : "search"; results = []; renderList(); input.value = ""; setStatus(""); paintMode();
    },
    focus: () => (mode === "selected" ? q("[data-change]") : input).focus(),
    destroy() { clearTimeout(timer); seq++; root.innerHTML = ""; root.classList.remove("ap"); },
  };
}
