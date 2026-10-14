// Pencarian global di topbar (tablet/desktop): pesanan (no. pesanan, nama & HP penerima) dan produk (nama, slug).
// Hasil mengikuti RLS: admin boleh membaca orders dan products. Ongkir sengaja tidak ditampilkan (rulesapp 5.6).
// Tautan hasil: #/pesanan/<id> dan #/produk/<id>. Halaman itu yang membaca sisa hash-nya saat sudah dibuat.
import { esc, debounce } from "./ad-ui.js";
import { rupiah } from "../assets/js/format.js";
import { statusBadge } from "../assets/js/ui.js";
import { PRODUCT_STATUS } from "../assets/js/labels.js";

const MIN_CHARS = 2;
const LIMIT = 5;

/** Buang karakter yang memecah sintaks filter PostgREST (, ( ) \ * " ' %) dan rapikan spasi. */
const clean = (s) => String(s ?? "").replace(/[%,()\\*"']/g, " ").replace(/\s+/g, " ").trim();

export function mountSearch({ supabase, root = document }) {
  const box = root.querySelector("#adSearch");
  if (!box) return () => {};
  const input = box.querySelector("#adSearchInput");
  const panel = box.querySelector("#adSearchPanel");

  let seq = 0;      // penjaga respons basi
  let options = []; // elemen <a role="option"> yang sedang tampil
  let active = -1;

  const setExpanded = (on) => {
    panel.hidden = !on;
    input.setAttribute("aria-expanded", String(on));
    if (!on) { active = -1; input.removeAttribute("aria-activedescendant"); }
  };

  const setActive = (i) => {
    options.forEach((el, n) => el.setAttribute("aria-selected", String(n === i)));
    active = i;
    if (i >= 0) {
      input.setAttribute("aria-activedescendant", options[i].id);
      options[i].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };

  const message = (html) => { options = []; active = -1; panel.innerHTML = `<div class="ad-gs-msg" role="status">${html}</div>`; setExpanded(true); };

  function render(term, orders, products) {
    if (!orders.length && !products.length) {
      message(`Tidak ada hasil untuk “${esc(term)}”.`);
      return;
    }
    let n = 0;
    const opt = (href, inner) => `<a class="ad-gs-item" role="option" id="adgs-${n++}" href="${href}" aria-selected="false">${inner}</a>`;

    const orderRows = orders.map((o) => opt(`#/pesanan/${esc(o.id)}`, `
      <span class="ad-gs-main">
        <span class="ad-gs-title ad-gs-mono">${esc(o.order_no)}</span>
        <span class="ad-gs-sub">${esc(o.recipient_name)}</span>
      </span>${statusBadge(o.status)}`)).join("");

    const productRows = products.map((p) => opt(`#/produk/${esc(p.id)}`, `
      <span class="ad-gs-main">
        <span class="ad-gs-title">${esc(p.name)}</span>
        <span class="ad-gs-sub">${esc(rupiah(p.price))} · ${esc(PRODUCT_STATUS[p.status] ?? p.status)}</span>
      </span>`)).join("");

    panel.innerHTML = `<div role="listbox" aria-label="Hasil pencarian">
      ${orders.length ? `<div class="ad-gs-group" role="presentation">Pesanan</div>${orderRows}` : ""}
      ${products.length ? `<div class="ad-gs-group" role="presentation">Produk</div>${productRows}` : ""}
    </div>`;
    options = [...panel.querySelectorAll('[role="option"]')];
    active = -1;
    setExpanded(true);
  }

  async function run(raw) {
    const term = clean(raw);
    const my = ++seq;
    if (term.length < MIN_CHARS) { options = []; panel.innerHTML = ""; setExpanded(false); return; }

    message(`<span class="ad-skel" style="height:44px;display:block;margin:0 0 6px"></span><span class="ad-skel" style="height:44px;display:block;margin:0"></span>`);
    try {
      const like = `%${term}%`;
      const [o, p] = await Promise.all([
        supabase.from("orders")
          .select("id, order_no, recipient_name, status, created_at")
          .or(`order_no.ilike.${like},recipient_name.ilike.${like},recipient_phone.ilike.${like}`)
          .order("created_at", { ascending: false }).limit(LIMIT),
        supabase.from("products")
          .select("id, name, price, status")
          .or(`name.ilike.${like},slug.ilike.${like}`)
          .order("name").limit(LIMIT),
      ]);
      if (my !== seq) return;
      if (o.error || p.error) throw o.error || p.error;
      render(term, o.data ?? [], p.data ?? []);
    } catch (err) {
      if (my !== seq) return;
      console.error(err);
      message("Pencarian gagal. Periksa koneksi lalu coba lagi.");
    }
  }

  const runDebounced = debounce(run, 250);
  const go = (href) => { location.hash = href; };
  const reset = () => { seq++; input.value = ""; options = []; panel.innerHTML = ""; setExpanded(false); };

  input.addEventListener("input", () => runDebounced(input.value));
  input.addEventListener("focus", () => { if (options.length && clean(input.value).length >= MIN_CHARS) setExpanded(true); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!panel.hidden) { e.preventDefault(); setExpanded(false); } else if (input.value) { reset(); }
      return;
    }
    if (panel.hidden || !options.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((active + 1) % options.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active <= 0 ? options.length - 1 : active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); go((options[active >= 0 ? active : 0]).getAttribute("href")); }
  });

  panel.addEventListener("click", (e) => { if (e.target.closest(".ad-gs-item")) setExpanded(false); });
  panel.addEventListener("mousemove", (e) => {
    const i = options.indexOf(e.target.closest(".ad-gs-item"));
    if (i >= 0 && i !== active) setActive(i);
  });

  const onDocDown = (e) => { if (!box.contains(e.target)) setExpanded(false); };
  const onHash = () => reset();
  document.addEventListener("pointerdown", onDocDown);
  window.addEventListener("hashchange", onHash);

  return () => {
    document.removeEventListener("pointerdown", onDocDown);
    window.removeEventListener("hashchange", onHash);
  };
}
