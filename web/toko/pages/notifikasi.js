// Notifikasi (halaman penuh, dari menu Akun): daftar semua notifikasi + tandai dibaca + pengaturan push perangkat ini.
// Daftar ikut realtime; lonceng di header ikut tersinkron karena membaca perubahan tabel yang sama.
import { supabase, esc, ICON, relativeTime, toast, errorBox } from "../tk-lib.js";
import { mountPush } from "../../assets/js/push.js";
import { TYPE_ICON, targetOf } from "../bell.js";

const LIMIT = 100;

export async function init({ root, profile, isStale }) {
  const uid = profile.id;
  root.innerHTML = `<div style="max-width:640px;margin:0 auto;padding:0 16px 24px">
    <a class="tk-back" href="#/akun" style="margin-left:-6px">${ICON.back}Akun</a>
    <div class="tk-head" style="margin:6px 0 14px"><h1 class="tk-h1" style="margin:0">Notifikasi</h1>
      <button type="button" class="tk-linkbtn" id="nfAll" hidden>Tandai semua dibaca</button></div>
    <div id="nfBody"><div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:64px;margin-top:8px"></div></div>
    <div id="nfPush" style="margin-top:20px"></div></div>`;
  const $ = (s) => root.querySelector(s);
  const body = $("#nfBody");
  let items = [], alive = true;
  const ac = new AbortController();

  function paint() {
    const unread = items.filter((i) => !i.is_read).length;
    $("#nfAll").hidden = unread === 0;
    body.innerHTML = items.length
      ? `<ul class="tk-bell-list" style="padding:0">${items.map((n) => `<li><button type="button" class="tk-nt${n.is_read ? "" : " is-unread"}" data-id="${esc(n.id)}">
          <span class="tk-nt-ico">${TYPE_ICON[n.type] ?? ICON.bell}</span>
          <span style="min-width:0;flex:1"><span class="tk-nt-t">${esc(n.title)}</span>${n.body ? `<span class="tk-nt-b">${esc(n.body)}</span>` : ""}<span class="tk-nt-w">${esc(relativeTime(n.created_at))}</span></span>
          ${n.is_read ? "" : '<span class="tk-nt-dot" aria-hidden="true"></span>'}</button></li>`).join("")}</ul>`
      : `<div class="tk-bell-empty">Belum ada notifikasi.</div>`;
  }

  async function load() {
    const { data, error } = await supabase.from("notifications").select("id, type, title, body, data, is_read, created_at")
      .order("created_at", { ascending: false }).limit(LIMIT);
    if (!alive || isStale()) return;
    if (error) { console.error(error); body.innerHTML = errorBox(); body.querySelector("[data-retry]").addEventListener("click", load); return; }
    items = data ?? []; paint();
  }

  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return;
    const n = items.find((i) => i.id === b.dataset.id); if (!n) return;
    if (!n.is_read) {
      n.is_read = true; paint();
      supabase.from("notifications").update({ is_read: true }).eq("id", n.id).then(({ error }) => { if (error) console.error(error); });
    }
    location.hash = targetOf(n);
  }, { signal: ac.signal });

  $("#nfAll").addEventListener("click", async () => {
    items.forEach((i) => { i.is_read = true; }); paint();
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
    if (error) { console.error(error); toast("Gagal menandai dibaca.", "error"); load(); }
  }, { signal: ac.signal });

  // realtime: notifikasi baru muncul langsung di daftar
  const filter = `user_id=eq.${uid}`;
  const ch = supabase.channel(`tk-notif-page-${uid}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, ({ new: n }) => {
      if (!alive || !n || items.some((i) => i.id === n.id)) return;
      items.unshift(n); items = items.slice(0, LIMIT); paint();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, ({ new: n }) => {
      const it = n && items.find((i) => i.id === n.id);
      if (it) { Object.assign(it, n); paint(); }
    })
    .subscribe();

  const stopPush = mountPush({ supabase, container: $("#nfPush"), audience: "customer" });
  await load();
  return () => { alive = false; ac.abort(); stopPush?.(); supabase.removeChannel(ch); };
}
