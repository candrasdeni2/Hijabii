// Memuat dan merapikan activity_logs. Dibuat toleran terhadap nama kolom; password/token tidak pernah ditampilkan.
import { supabase } from "../assets/js/supabase.js";

export const ACTION_LABELS = {
  admin_created: "Menambah admin",
  user_deactivated: "Menonaktifkan akun",
  user_activated: "Mengaktifkan akun",
  user_deleted: "Menghapus akun",
  password_changed: "Mengganti password",
  reset_link_sent: "Mengirim link reset password",
  profile_updated: "Mengubah data akun",
};

export const actionLabel = (a) => ACTION_LABELS[a] || String(a || "–").replace(/_/g, " ");

const SENSITIVE = /pass|token|secret|key/i;
const HIDDEN_KEYS = new Set(["target_name", "target_email"]);

function parseDetail(raw) {
  if (!raw) return {};
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return { catatan: raw }; } }
  return typeof raw === "object" ? raw : {};
}

function detailText(d) {
  const labels = { metode: "Metode", role: "Peran" };
  return Object.entries(d)
    .filter(([k, v]) => !SENSITIVE.test(k) && !HIDDEN_KEYS.has(k) && v !== null && v !== "")
    .map(([k, v]) => `${labels[k] || k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" · ");
}

export async function loadLogs({ from = 0, to = 19, action = "" } = {}) {
  let q = supabase.from("activity_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (action) q = q.eq("action", action);
  let res = await q;
  if (res.error && res.error.code === "42703") { // kolom created_at tidak ada
    let q2 = supabase.from("activity_logs").select("*", { count: "exact" }).range(from, to);
    if (action) q2 = q2.eq("action", action);
    res = await q2;
  }
  if (res.error) throw res.error;

  const rows = res.data || [];
  const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.target_id]).filter(Boolean))];
  const people = new Map();
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    (data || []).forEach((p) => people.set(p.id, p));
  }
  const who = (id) => { const p = people.get(id); return p ? (p.full_name || p.email) : null; };

  return {
    total: res.count ?? rows.length,
    rows: rows.map((r) => {
      const d = parseDetail(r.meta);
      return {
        id: r.id,
        when: r.created_at ?? r.at ?? null,
        actor: who(r.actor_id) || "–",
        action: r.action,
        actionLabel: actionLabel(r.action),
        target: who(r.target_id) || d.target_name || d.target_email || "–",
        detail: detailText(d),
      };
    }),
  };
}
