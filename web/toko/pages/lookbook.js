// Lookbook (Customer): foto + judul dari public.lookbooks yang aktif (diisi lewat admin), urut sort_order.
// Desktop: panel melebar saat hover/klik. Mobile: grid 2 kolom, ketuk untuk memperbesar jadi selebar layar.
import { supabase, img, esc, errorBox, emptyState } from "../tk-lib.js";

const CSS = `
.lk-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.lk-i{position:relative;aspect-ratio:3/4;border-radius:16px;overflow:hidden;cursor:pointer;background:linear-gradient(135deg,#E8DCCD,#D8C6B5);
  outline-offset:3px;-webkit-tap-highlight-color:transparent}
.lk-i.on{grid-column:1/-1;aspect-ratio:4/5}
.lk-i .tk-img,.lk-i .tk-ph{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 1.1s var(--ease,ease)}
.lk-i:hover .tk-img{transform:scale(1.04)}
.lk-cap{position:absolute;left:12px;bottom:12px;z-index:1;max-width:calc(100% - 24px);padding:6px 16px;border-radius:999px;background:var(--cream,#F6F0E7);
  font-size:13px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(min-width:768px){
  .lk-grid{display:flex;height:min(520px,70vh);gap:12px}
  .lk-i{flex:1;aspect-ratio:auto;transition:flex .9s var(--ease,ease)}
  .lk-i.on{grid-column:auto;aspect-ratio:auto}
  .lk-i:hover,.lk-i.on{flex:2.6}
}
.lk-cta{margin-top:28px;text-align:center}
@media(prefers-reduced-motion:reduce){.lk-i,.lk-i .tk-img{transition:none}}
`;

export async function init({ root, isStale }) {
  if (!document.getElementById("lkStyle")) {
    const st = document.createElement("style"); st.id = "lkStyle"; st.textContent = CSS; document.head.appendChild(st);
  }
  root.innerHTML = `<div class="tk-wrap"><div class="tk-head"><div><h1 class="tk-h1">One hijab. Different stories.</h1>
      <p class="tk-muted tk-small" style="margin:6px 0 0">Satu hijab, banyak cara bergaya.</p></div></div>
    <div id="lkBody"><div class="lk-grid" aria-hidden="true">${Array.from({ length: 4 }, () => `<div class="lk-i skeleton"></div>`).join("")}</div></div></div>`;
  const body = root.querySelector("#lkBody");
  const ac = new AbortController();

  async function load() {
    const { data, error } = await supabase.from("lookbooks").select("id, title, image_path")
      .eq("is_active", true).order("sort_order").order("created_at");
    if (isStale()) return;
    if (error) {
      console.error(error);
      body.innerHTML = errorBox();
      body.querySelector("[data-retry]").addEventListener("click", load, { signal: ac.signal });
      return;
    }
    if (!data?.length) { body.innerHTML = emptyState("Lookbook belum tersedia", "Nantikan inspirasi gaya dari Hijabii.", "#/katalog", "Lihat Koleksi"); return; }
    body.innerHTML = `<div class="lk-grid" id="lkGrid">${data.map((l) => `
      <div class="lk-i" role="button" tabindex="0" aria-pressed="false" aria-label="${esc(l.title)}">
        ${img(l.image_path, l.title)}<span class="lk-cap">${esc(l.title)}</span></div>`).join("")}</div>
      <div class="lk-cta"><a class="btn btn-secondary" href="#/katalog">Lihat Koleksi</a></div>`;
    const grid = body.querySelector("#lkGrid");
    const toggle = (el) => {
      const was = el.classList.contains("on");
      grid.querySelectorAll(".lk-i").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
      if (!was) { el.classList.add("on"); el.setAttribute("aria-pressed", "true"); }
    };
    grid.addEventListener("click", (e) => { const el = e.target.closest(".lk-i"); if (el) toggle(el); }, { signal: ac.signal });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target.closest(".lk-i"); if (!el) return;
      e.preventDefault(); toggle(el);
    }, { signal: ac.signal });
  }
  await load();
  return () => ac.abort();
}
