// FAQ (Customer): membaca public.faqs yang dibuat dari admin (hanya is_active, urut sort_order). Akordeon polos, jawaban mempertahankan baris baru.
import { supabase, esc, errorBox } from "../tk-lib.js";

const TTL = 60_000;
let cache = null; // { t, rows }

async function loadFaqs(force = false) {
  if (!force && cache && Date.now() - cache.t < TTL) return cache.rows;
  const { data, error } = await supabase.from("faqs")
    .select("id, question, answer")
    .eq("is_active", true)
    .order("sort_order").order("created_at");
  if (error) throw error;
  cache = { t: Date.now(), rows: data ?? [] };
  return cache.rows;
}

const CSS = `
.fq{max-width:720px;margin:0 auto;padding:0 16px 56px}
.fq-item{border-bottom:1px solid var(--sand,#EBE0D3)}
.fq-item:first-child{border-top:1px solid var(--sand,#EBE0D3)}
.fq-item summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:16px;min-height:60px;padding:16px 2px;
  font:500 16px/1.4 var(--font-sans,sans-serif);color:var(--ink,#2B211C)}
.fq-item summary::-webkit-details-marker{display:none}
.fq-item summary:hover{color:var(--marsala,#7B4A4A)}
.fq-item summary:focus-visible{outline:2px solid var(--marsala,#7B4A4A);outline-offset:2px;border-radius:6px}
.fq-q{flex:1;min-width:0;overflow-wrap:anywhere}
.fq-ic{flex:none;width:18px;height:18px;fill:none;stroke:var(--marsala,#7B4A4A);stroke-width:1.8;stroke-linecap:round;transition:transform .25s var(--ease,ease)}
.fq-item[open] .fq-ic{transform:rotate(45deg)}
.fq-a{padding:0 2px 20px;font-size:15px;line-height:1.65;color:rgba(43,33,28,.78);white-space:pre-line;overflow-wrap:anywhere}
.fq-empty{padding:40px 0;text-align:center;color:rgba(43,33,28,.65);font-size:14px}
`;

export async function init({ root, isStale }) {
  if (!document.getElementById("fqStyle")) {
    const st = document.createElement("style");
    st.id = "fqStyle"; st.textContent = CSS; document.head.appendChild(st);
  }
  root.innerHTML = `<div class="tk-wrap"><div class="fq">
    <div class="tk-head"><div><h1 class="tk-h1">FAQ</h1>
      <p class="tk-muted tk-small" style="margin:6px 0 0">Pertanyaan yang sering ditanyakan.</p></div></div>
    <div id="fqBody" aria-live="polite"><div aria-hidden="true">
      <div class="skeleton" style="height:56px;margin-bottom:10px"></div><div class="skeleton" style="height:56px;margin-bottom:10px"></div><div class="skeleton" style="height:56px"></div>
    </div></div></div></div>`;
  const body = root.querySelector("#fqBody");

  async function run(force = false) {
    let rows;
    try { rows = await loadFaqs(force); }
    catch (e) {
      console.error(e);
      if (isStale()) return;
      body.innerHTML = errorBox();
      body.querySelector("[data-retry]").addEventListener("click", () => run(true));
      return;
    }
    if (isStale()) return;
    if (!rows.length) { body.innerHTML = `<div class="fq-empty">Belum ada FAQ.</div>`; return; }
    body.innerHTML = rows.map((r) => `<details class="fq-item">
      <summary><span class="fq-q">${esc(r.question)}</span>
        <svg class="fq-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></summary>
      <div class="fq-a">${esc(r.answer)}</div></details>`).join("");
  }
  await run();
}
