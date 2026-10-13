import { supabase } from "../../assets/js/supabase.js";
import { loadLogs } from "../log-utils.js";
import { esc, fmtDate } from "../sa-ui.js";

const count = (role, active) =>
  supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", role).eq("is_active", active);

export async function init({ root, profile }) {
  const $ = (s) => root.querySelector(s);
  const first = (profile.full_name || "").trim().split(/\s+/)[0];
  $("#dashSub").textContent = first ? `Selamat datang, ${first}. Ini ringkasan akun dan aktivitas.` : "Ringkasan akun dan aktivitas.";

  const [a, u, ia, iu] = await Promise.all([count("admin", true), count("customer", true), count("admin", false), count("customer", false)]);
  const n = (r) => (r.error ? null : r.count ?? 0);
  $("#stAdmin").textContent = n(a) ?? "–";
  $("#stUser").textContent = n(u) ?? "–";
  $("#stOff").textContent = n(ia) === null || n(iu) === null ? "–" : n(ia) + n(iu);

  const box = $("#recent");
  try {
    const { rows } = await loadLogs({ from: 0, to: 4 });
    box.innerHTML = rows.length
      ? `<ul class="sa-list">${rows.map((r) => `<li>
          <div class="sa-act">${esc(r.actionLabel)}</div>
          <div class="sa-email">${esc(r.actor)}${r.target !== "–" ? " → " + esc(r.target) : ""}</div>
          <div class="sa-meta">${esc(fmtDate(r.when))}</div></li>`).join("")}</ul>`
      : `<div class="sa-empty">Belum ada aktivitas.</div>`;
  } catch (e) {
    console.error(e);
    box.innerHTML = `<div class="sa-empty">Log aktivitas belum bisa dimuat.</div>`;
  }
}
