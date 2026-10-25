// bell.js — Lonceng notifikasi Customer: daftar + penanda belum dibaca + realtime (Supabase), dan Web Push.
// Push: mountPush menyelaraskan langganan otomatis tiap halaman dibuka bila izin sudah diberikan; bila belum, tombol "Aktifkan" ada di panel ini
// (izin notifikasi wajib dari gestur pengguna). Logout: lihat unregisterDevice di pages/akun.js.
import { esc, ICON, relativeTime, toast } from "./tk-lib.js";
import { mountPush } from "../assets/js/push.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_ICON = {
  invoice_direvisi: ICON.receipt, diproses: ICON.order, dikirim: ICON.box,
  dibatalkan_admin: ICON.cancel, dibatalkan_customer: ICON.cancel, kedaluwarsa: ICON.cancel, password_diubah: ICON.user,
};
/** Tujuan saat notifikasi diklik: invoice direvisi -> halaman invoice, lainnya -> detail pesanan. */
const targetOf = (n) => {
  const id = String(n.data?.order_id ?? "");
  if (UUID.test(id)) return n.type === "invoice_direvisi" ? `#/pesanan/${id}/invoice` : `#/pesanan/${id}`;
  return n.type === "password_diubah" ? "#/profil" : "#/pesanan";
};

export function mountBell({ host, supabase, profile }) {
  const uid = profile.id;
  host.innerHTML = `
    <button type="button" class="tk-ico tk-bell-btn" aria-label="Notifikasi" aria-haspopup="dialog" aria-expanded="false">${ICON.bell}<span class="tk-nbadge" hidden>0</span></button>
    <div class="tk-bell-panel" role="dialog" aria-label="Notifikasi" hidden>
      <div class="tk-bell-head"><h2>Notifikasi</h2><button type="button" class="tk-linkbtn" data-all hidden>Tandai semua dibaca</button></div>
      <div class="tk-bell-body" data-body><div class="tk-bell-empty">Memuat…</div></div>
      <div data-push></div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const btn = $(".tk-bell-btn"), panel = $(".tk-bell-panel"), body = $("[data-body]");
  let items = [], unread = 0, alive = true;
  const ac = new AbortController();

  function paint() {
    const b = $(".tk-nbadge");
    b.hidden = unread <= 0; b.textContent = unread > 99 ? "99+" : String(unread);
    btn.setAttribute("aria-label", unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi");
    $("[data-all]").hidden = unread <= 0;
    body.innerHTML = items.length
      ? `<ul class="tk-bell-list">${items.map((n) => `<li><button type="button" class="tk-nt${n.is_read ? "" : " is-unread"}" data-id="${esc(n.id)}">
          <span class="tk-nt-ico">${TYPE_ICON[n.type] ?? ICON.bell}</span>
          <span style="min-width:0;flex:1"><span class="tk-nt-t">${esc(n.title)}</span>${n.body ? `<span class="tk-nt-b">${esc(n.body)}</span>` : ""}<span class="tk-nt-w">${esc(relativeTime(n.created_at))}</span></span>
          ${n.is_read ? "" : '<span class="tk-nt-dot" aria-hidden="true"></span>'}</button></li>`).join("")}</ul>`
      : `<div class="tk-bell-empty">Belum ada notifikasi.</div>`;
  }

  async function load() {
    const [list, cnt] = await Promise.all([
      supabase.from("notifications").select("id, type, title, body, data, is_read, created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
    ]);
    if (!alive) return;
    if (list.error) { console.error(list.error); body.innerHTML = `<div class="tk-bell-empty">Notifikasi gagal dimuat.</div>`; return; }
    items = list.data ?? [];
    unread = cnt.error ? items.filter((i) => !i.is_read).length : (cnt.count ?? 0);
    paint();
  }

  /* ---- buka/tutup ---- */
  function setOpen(v) {
    panel.hidden = !v; btn.setAttribute("aria-expanded", String(v));
    if (v) paint();   // segarkan teks waktu relatif
  }
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(panel.hidden); }, { signal: ac.signal });
  document.addEventListener("click", (e) => { if (!panel.hidden && !host.contains(e.target)) setOpen(false); }, { signal: ac.signal });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); } }, { signal: ac.signal });
  window.addEventListener("hashchange", () => setOpen(false), { signal: ac.signal });

  /* ---- klik notifikasi: tandai dibaca lalu buka ---- */
  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const n = items.find((i) => i.id === b.dataset.id); if (!n) return;
    setOpen(false);
    if (!n.is_read) {
      n.is_read = true; unread = Math.max(0, unread - 1); paint();
      supabase.from("notifications").update({ is_read: true }).eq("id", n.id).then(({ error }) => { if (error) console.error(error); });
    }
    location.hash = targetOf(n);
  }, { signal: ac.signal });

  $("[data-all]").addEventListener("click", async () => {
    items.forEach((i) => { i.is_read = true; }); unread = 0; paint();
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
    if (error) { console.error(error); toast("Gagal menandai dibaca.", "error"); load(); }
  }, { signal: ac.signal });

  /* ---- realtime ---- */
  const filter = `user_id=eq.${uid}`;
  const ch = supabase.channel(`tk-notif-${uid}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, ({ new: n }) => {
      if (!alive || !n || items.some((i) => i.id === n.id)) return;
      items.unshift(n); items = items.slice(0, 30);
      if (!n.is_read) unread += 1;
      paint();
      if (document.visibilityState === "visible") toast(n.title, "info", 5000);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, ({ new: n }) => {
      if (!alive || !n) return;
      const it = items.find((i) => i.id === n.id);
      if (!it) { load(); return; }
      if (it.is_read !== n.is_read) unread = Math.max(0, unread + (n.is_read ? -1 : 1));
      Object.assign(it, n); paint();
    })
    .subscribe();

  /* ---- push: selaras otomatis saat login + tombol aktifkan ---- */
  const stopPush = mountPush({ supabase, container: $("[data-push]"), audience: "customer" });

  load();
  return () => { alive = false; ac.abort(); stopPush?.(); supabase.removeChannel(ch); };
}
