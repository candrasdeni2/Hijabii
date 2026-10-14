// Lonceng notifikasi admin (tablet/desktop) + badge angka di menu Pesanan.
// Sumber data: tabel public.notifications (RLS: hanya milik sendiri; update hanya kolom is_read).
// Jalur utama real-time (Supabase Realtime); polling 60 dtk sebagai cadangan bila Replication belum aktif.
import { esc, debounce } from "./ad-ui.js";
import { relativeTime } from "../assets/js/format.js";
import { toast } from "../assets/js/ui.js";

const PAGE_SIZE = 20;
const POLL_MS = 60_000;
const UUID = /^[0-9a-f-]{36}$/i;

/** Status pesanan yang menunggu tindakan admin: baru masuk, dan sudah dibayar (siap diproses & dikirim). */
const ACTION_STATUSES = ["menunggu_konfirmasi", "diproses"];

const ICONS = {
  order:  '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  cancel: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  bell:   '<path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 004 0"/>',
};
const iconKind = (type) =>
  type === "order_baru" ? "order"
  : ["dibatalkan_customer", "dibatalkan_admin", "kedaluwarsa"].includes(type) ? "cancel"
  : "bell";

const linkFor = (n) => (UUID.test(n?.data?.order_id ?? "") ? `#/pesanan/${n.data.order_id}` : "");

export function mountNotifications({ supabase, userId, root = document }) {
  const wrap = root.querySelector("#adBell");
  if (!wrap) return () => {};
  const btn = wrap.querySelector("#adBellBtn");
  const dot = wrap.querySelector("#adBellDot");
  const panel = wrap.querySelector("#adBellPanel");
  const body = wrap.querySelector("#adBellBody");
  const readAll = wrap.querySelector("#adBellReadAll");

  let items = [];
  let unread = 0;
  let state = "loading"; // loading | ready | error

  function render() {
    dot.hidden = unread <= 0;
    btn.setAttribute("aria-label", unread > 0 ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi");
    readAll.hidden = unread <= 0;

    if (state === "loading") {
      body.innerHTML = `<div class="ad-bell-pad"><div class="ad-skel"></div><div class="ad-skel"></div><div class="ad-skel"></div></div>`;
      return;
    }
    if (state === "error") {
      body.innerHTML = `<div class="ad-bell-empty" role="alert">Notifikasi gagal dimuat.<br>
        <button type="button" class="ad-linkbtn" data-retry>Coba lagi</button></div>`;
      return;
    }
    if (!items.length) {
      body.innerHTML = `<div class="ad-bell-empty">Belum ada notifikasi.</div>`;
      return;
    }
    body.innerHTML = `<ul class="ad-bell-list">${items.map((n) => {
      const href = linkFor(n);
      const cls = `ad-nt-item${n.is_read ? "" : " is-unread"}`;
      const inner = `
        <span class="ad-nt-ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[iconKind(n.type)]}</svg></span>
        <span class="ad-nt-body">
          <span class="ad-nt-title">${esc(n.title)}</span>
          ${n.body ? `<span class="ad-nt-text">${esc(n.body)}</span>` : ""}
          <span class="ad-nt-time">${esc(relativeTime(n.created_at))}</span>
        </span>
        ${n.is_read ? "" : '<span class="ad-nt-dot" role="img" aria-label="Belum dibaca"></span>'}`;
      return `<li>${href
        ? `<a class="${cls}" data-id="${esc(n.id)}" href="${esc(href)}">${inner}</a>`
        : `<button type="button" class="${cls}" data-id="${esc(n.id)}">${inner}</button>`}</li>`;
    }).join("")}</ul>`;
  }

  async function load(silent = false) {
    if (!silent) { state = "loading"; render(); }
    try {
      const [list, count] = await Promise.all([
        supabase.from("notifications").select("id, type, title, body, data, is_read, created_at")
          .order("created_at", { ascending: false }).limit(PAGE_SIZE),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
      ]);
      if (list.error) throw list.error;
      if (count.error) throw count.error;
      items = list.data ?? [];
      unread = count.count ?? 0;
      state = "ready";
    } catch (err) {
      console.error(err);
      if (silent && state === "ready") return; // polling gagal: biarkan data lama
      state = "error";
    }
    render();
  }

  async function markRead(id) {
    const n = items.find((x) => x.id === id);
    if (!n || n.is_read) return;
    n.is_read = true; unread = Math.max(0, unread - 1); render();
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
    if (error) { console.error(error); toast("Gagal menandai dibaca.", "error"); load(true); }
  }

  async function markAllRead() {
    readAll.disabled = true;
    const { error } = await supabase.from("notifications").update({ is_read: true })
      .eq("user_id", userId).eq("is_read", false);
    readAll.disabled = false;
    if (error) { console.error(error); toast("Gagal menandai semua dibaca.", "error"); return; }
    items.forEach((n) => { n.is_read = true; });
    unread = 0; render();
  }

  function onInsert(n) {
    if (!n || items.some((x) => x.id === n.id)) return;
    items = [n, ...items].slice(0, PAGE_SIZE);
    unread += 1;
    if (state === "ready") render(); else load(true);
    toast(n.title, "info");
  }

  const isOpen = () => !panel.hidden;
  function setOpen(on, { restoreFocus = false } = {}) {
    panel.hidden = !on;
    btn.setAttribute("aria-expanded", String(on));
    if (on) { render(); load(true); } else if (restoreFocus) btn.focus();
  }

  btn.addEventListener("click", () => setOpen(!isOpen()));
  readAll.addEventListener("click", markAllRead);
  body.addEventListener("click", (e) => {
    if (e.target.closest("[data-retry]")) { load(); return; }
    const item = e.target.closest(".ad-nt-item");
    if (!item) return;
    markRead(item.dataset.id);
    setOpen(false);
  });
  const onDocDown = (e) => { if (isOpen() && !wrap.contains(e.target)) setOpen(false); };
  const onKey = (e) => { if (e.key === "Escape" && isOpen()) { e.preventDefault(); setOpen(false, { restoreFocus: true }); } };
  document.addEventListener("pointerdown", onDocDown);
  document.addEventListener("keydown", onKey);

  // Real-time: notifikasi baru milik admin ini.
  const channel = supabase.channel(`ad-notif-${userId}`)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onInsert(payload.new))
    .subscribe();

  // Cadangan: polling saat tab terlihat, dan segarkan begitu tab aktif lagi.
  const poll = setInterval(() => { if (document.visibilityState === "visible") load(true); }, POLL_MS);
  const onVisible = () => { if (document.visibilityState === "visible") load(true); };
  document.addEventListener("visibilitychange", onVisible);

  load();

  return () => {
    clearInterval(poll);
    document.removeEventListener("pointerdown", onDocDown);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}

/** Badge angka di menu Pesanan: jumlah pesanan yang menunggu tindakan admin. Lewat event "ad:orders-badge" (lihat shell.js). */
export function mountOrdersBadge({ supabase }) {
  const refresh = async () => {
    const { count, error } = await supabase.from("orders")
      .select("id", { count: "exact", head: true }).in("status", ACTION_STATUSES);
    if (error) { console.error(error); return; }
    window.dispatchEvent(new CustomEvent("ad:orders-badge", { detail: count ?? 0 }));
  };
  const refreshSoon = debounce(refresh, 800);

  const channel = supabase.channel("ad-orders-badge")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refreshSoon)
    .subscribe();
  const poll = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
  const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
  document.addEventListener("visibilitychange", onVisible);

  refresh();

  return () => {
    clearInterval(poll);
    document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}
