import { loadLogs, ACTION_LABELS } from "../log-utils.js";
import { esc, fmtDate } from "../sa-ui.js";

const PAGE_SIZE = 20;

export function init({ root }) {
  const listEl = root.querySelector("#list"), pagerEl = root.querySelector("#pager"), sel = root.querySelector("#action");
  sel.insertAdjacentHTML("beforeend", Object.entries(ACTION_LABELS).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join(""));
  const state = { page: 0, req: 0 };

  async function load() {
    const my = ++state.req;
    listEl.innerHTML = `<div aria-hidden="true"><div class="sa-skel"></div><div class="sa-skel"></div><div class="sa-skel"></div></div>`;
    pagerEl.innerHTML = "";
    const from = state.page * PAGE_SIZE;
    try {
      const { rows, total } = await loadLogs({ from, to: from + PAGE_SIZE - 1, action: sel.value });
      if (my !== state.req) return;
      if (!rows.length) { listEl.innerHTML = `<div class="sa-empty">Belum ada aktivitas.</div>`; return; }
      listEl.innerHTML = `
        <div class="sa-table-wrap"><table class="sa-table">
          <thead><tr><th scope="col">Waktu</th><th scope="col">Pelaku</th><th scope="col">Aksi</th><th scope="col">Target</th><th scope="col">Detail</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td style="white-space:nowrap">${esc(fmtDate(r.when))}</td><td>${esc(r.actor)}</td>
            <td class="sa-act">${esc(r.actionLabel)}</td><td>${esc(r.target)}</td><td class="sa-detail">${esc(r.detail) || "–"}</td></tr>`).join("")}</tbody>
        </table></div>
        <ul class="sa-cards">${rows.map((r) => `<li>
          <div class="sa-act">${esc(r.actionLabel)}</div>
          <div class="sa-email">${esc(r.actor)} → ${esc(r.target)}</div>
          ${r.detail ? `<div class="sa-detail">${esc(r.detail)}</div>` : ""}
          <div class="sa-meta">${esc(fmtDate(r.when))}</div></li>`).join("")}</ul>`;
      const pages = Math.ceil(total / PAGE_SIZE);
      pagerEl.innerHTML = `<span>Menampilkan ${from + 1}–${from + rows.length} dari ${total}</span>
        <div class="sa-pager-btns">
          <button type="button" class="btn btn-secondary btn-sm" data-act="prev" ${state.page === 0 ? "disabled" : ""}>Sebelumnya</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="next" ${state.page + 1 >= pages ? "disabled" : ""}>Berikutnya</button>
        </div>`;
    } catch (e) {
      console.error(e);
      if (my !== state.req) return;
      listEl.innerHTML = `<div class="sa-error" role="alert">Log gagal dimuat.<br><button class="btn btn-secondary btn-sm" type="button" data-act="retry">Coba lagi</button></div>`;
    }
  }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "retry") load();
    if (b.dataset.act === "prev" && state.page > 0) { state.page--; load(); }
    if (b.dataset.act === "next") { state.page++; load(); }
  });
  sel.addEventListener("change", () => { state.page = 0; load(); });
  return load();
}
