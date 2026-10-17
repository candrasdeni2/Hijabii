// Pembantu daftar berurutan (Lookbook, FAQ): tombol naik/turun dan penyimpanan urutan.
export const ARROW_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
export const ARROW_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/** Tombol naik/turun untuk baris ke-i dari n. label dipakai untuk aria-label. */
export const orderButtons = (r, i, n, label) => `
  <div class="ad-order">
    <button type="button" data-act="up" data-id="${esc(r.id)}" aria-label="Naikkan urutan ${esc(label)}" ${i === 0 ? "disabled" : ""}>${ARROW_UP}</button>
    <button type="button" data-act="down" data-id="${esc(r.id)}" aria-label="Turunkan urutan ${esc(label)}" ${i === n - 1 ? "disabled" : ""}>${ARROW_DOWN}</button>
  </div>`;

export const nextOrder = (rows) => rows.reduce((mx, r) => Math.max(mx, r.sort_order ?? 0), -1) + 1;

/**
 * Tukar baris `id` dengan tetangganya (dir = -1 naik, +1 turun). Nomor urut dirapikan ulang (0..n-1) supaya tidak ada nilai kembar,
 * dan hanya baris yang berubah yang ditulis. Kembalian: { moved, error }.
 */
export async function reorder(supabase, table, rows, id, dir) {
  const i = rows.findIndex((r) => r.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return { moved: false, error: null };
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  const changes = next.map((r, n) => ({ id: r.id, n })).filter((c) => rows.find((r) => r.id === c.id).sort_order !== c.n);
  const results = await Promise.all(changes.map((c) => supabase.from(table).update({ sort_order: c.n }).eq("id", c.id)));
  return { moved: true, error: results.find((r) => r.error)?.error ?? null };
}
