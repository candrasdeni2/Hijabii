// Halaman Pengaturan toko (design.md 9.8). Satu baris tabel `settings` (singleton, id = true).
// Tiga kartu, masing-masing punya tombol Simpan sendiri dan hanya menulis kolomnya sendiri.
import { supabase } from "../../assets/js/supabase.js";
import { toast } from "../../assets/js/ui.js";
import { fmtDate, setBusy } from "../ad-ui.js";
import { mountAreaPicker } from "../../assets/js/area-picker.js";

const digits = (v) => String(v ?? "").replace(/\D/g, "");
const clean = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const orNull = (v) => (v === "" ? null : v);
const isInt = (v, min, max) => /^\d+$/.test(String(v).trim()) && Number(v) >= min && Number(v) <= max;

/** 0812… / 812… / +62812… -> 62812… */
export function normWa(v) {
  let d = digits(v);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}
const WA_OK = /^62\d{8,13}$/;
const COURIERS = ["pos", "jnt", "jne"];

/** Berat kirim = (berat produk + buffer sekali per pesanan), dibulatkan ke atas ke kelipatan `round`. */
export const shippingWeight = (productGram, buffer, round) => Math.ceil((productGram + buffer) / round) * round;

function friendly(err) {
  const m = String(err?.message ?? "");
  if (err?.code === "42501") return "Kamu tidak punya izin mengubah pengaturan.";
  if (/origin_area_label/.test(m)) return "Kolom origin_area_label belum ada. Jalankan migrasi 005.";
  return m || "Gagal menyimpan. Coba lagi.";
}

export async function init({ root, isStale }) {
  if (!supabase) throw new Error("Aplikasi belum dikonfigurasi.");
  const { data, error } = await supabase.from("settings").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Pengaturan toko belum ada di database.");
  if (isStale?.()) return;

  let row = data;
  const hasLabel = "origin_area_label" in row;
  const hasCourier = "default_courier" in row;
  const $ = (s) => root.querySelector(s);
  const inp = (form, name) => form.querySelector(`[name="${name}"]`);

  const refreshMeta = () => { $("#setUpdated").textContent = row.updated_at ? `Terakhir diperbarui ${fmtDate(row.updated_at)}.` : ""; };
  refreshMeta();

  function clearErrors(form) {
    form.querySelectorAll("[data-err]").forEach((e) => (e.textContent = ""));
    form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
  }
  function showErrors(form, errs) {
    for (const [k, msg] of Object.entries(errs)) {
      const slot = form.querySelector(`[data-err="${k}"]`); if (slot) slot.textContent = msg;
      inp(form, k)?.setAttribute("aria-invalid", "true");
    }
  }

  /** Pasang perilaku kartu: tombol Simpan aktif hanya bila ada perubahan, validasi, simpan, toast. */
  function wireCard(form, { vals, validate, patch, onSaved, focusKey }) {
    const btn = form.querySelector("[data-save]");
    let base = JSON.stringify(vals());
    const sync = () => { btn.disabled = JSON.stringify(vals()) === base; };
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors(form);
      const v = vals();
      const errs = validate(v);
      const keys = Object.keys(errs);
      if (keys.length) { showErrors(form, errs); (inp(form, keys[0]) ?? focusKey?.(keys[0]))?.focus(); return; }
      setBusy(btn, true, "Menyimpan…");
      try {
        const { data: saved, error: err } = await supabase.from("settings").update(patch(v)).eq("id", true).select().maybeSingle();
        if (err) throw err;
        if (!saved) throw new Error("Tidak ada yang tersimpan. Pastikan kamu masuk sebagai admin.");
        row = saved; refreshMeta();
        onSaved?.(v);
        base = JSON.stringify(vals());
        toast("Pengaturan disimpan.", "success");
      } catch (ex) {
        toast(friendly(ex), "error");
      } finally {
        setBusy(btn, false); sync();
      }
    });
    sync();
    return { rebase() { base = JSON.stringify(vals()); sync(); } };
  }

  // ---------- Kartu 1: kontak & pembayaran ----------
  const fK = $("#cardKontak");
  const fillKontak = () => {
    inp(fK, "wa").value = row.admin_whatsapp ?? "";
    inp(fK, "dana_number").value = row.dana_number ?? "";
    inp(fK, "dana_name").value = row.dana_account_name ?? "";
    inp(fK, "bank_name").value = row.bank_name ?? "";
    inp(fK, "bank_number").value = row.bank_account_number ?? "";
    inp(fK, "bank_holder").value = row.bank_account_holder ?? "";
  };
  fillKontak();
  const kVals = () => ({
    wa: normWa(inp(fK, "wa").value),
    dana_number: digits(inp(fK, "dana_number").value),
    dana_name: clean(inp(fK, "dana_name").value),
    bank_name: clean(inp(fK, "bank_name").value),
    bank_number: digits(inp(fK, "bank_number").value),
    bank_holder: clean(inp(fK, "bank_holder").value),
  });
  const payWarn = () => { $("#payWarn").hidden = !!(row.dana_number || row.bank_account_number); };
  payWarn();
  inp(fK, "wa").addEventListener("blur", (e) => { const n = normWa(e.target.value); if (n) e.target.value = n; });
  wireCard(fK, {
    vals: kVals,
    validate(v) {
      const e = {};
      if (!WA_OK.test(v.wa)) e.wa = "Gunakan format 62 diikuti nomor, contoh 6281234567890.";
      // Grup DANA/bank hanya diperiksa bila isinya diubah, supaya data awal yang belum lengkap tidak menghalangi simpan WhatsApp.
      const danaChanged = v.dana_number !== digits(row.dana_number) || v.dana_name !== clean(row.dana_account_name);
      if (danaChanged && (v.dana_number || v.dana_name)) {
        if (v.dana_number.length < 8 || v.dana_number.length > 15) e.dana_number = "Nomor DANA 8 sampai 15 digit.";
        if (!v.dana_name) e.dana_name = "Isi atas nama DANA.";
      }
      const bankChanged = v.bank_name !== clean(row.bank_name) || v.bank_number !== digits(row.bank_account_number) || v.bank_holder !== clean(row.bank_account_holder);
      if (bankChanged && (v.bank_name || v.bank_number || v.bank_holder)) {
        if (v.bank_name.length < 2) e.bank_name = "Isi nama bank.";
        if (v.bank_number.length < 5 || v.bank_number.length > 25) e.bank_number = "Nomor rekening 5 sampai 25 digit.";
        if (!v.bank_holder) e.bank_holder = "Isi atas nama rekening.";
      }
      return e;
    },
    patch: (v) => ({
      admin_whatsapp: v.wa,
      dana_number: orNull(v.dana_number), dana_account_name: orNull(v.dana_name),
      bank_name: orNull(v.bank_name), bank_account_number: orNull(v.bank_number), bank_account_holder: orNull(v.bank_holder),
    }),
    onSaved: () => { fillKontak(); payWarn(); },
  });

  // ---------- Kartu 2: stok ----------
  const fS = $("#cardStok");
  inp(fS, "hours").value = String(row.default_timeout_hours ?? 24);
  fS.querySelectorAll("[data-hours]").forEach((b) => b.addEventListener("click", () => {
    inp(fS, "hours").value = b.dataset.hours;
    fS.dispatchEvent(new Event("input"));
  }));
  wireCard(fS, {
    vals: () => ({ hours: digits(inp(fS, "hours").value) }),
    validate: (v) => (isInt(v.hours, 1, 720) ? {} : { hours: "Isi 1 sampai 720 jam." }),
    patch: (v) => ({ default_timeout_hours: Number(v.hours) }),
  });

  // ---------- Kartu 3: pengiriman ----------
  const fP = $("#cardKirim");
  let origin = row.origin_area_id ? { id: String(row.origin_area_id), label: hasLabel ? (row.origin_area_label ?? "") : "" } : null;
  inp(fP, "buffer").value = String(row.packaging_buffer_gram ?? 100);
  inp(fP, "round").value = String(row.weight_round_gram ?? 100);
  $("#labelWarn").hidden = hasLabel;
  const courierEls = [...fP.querySelectorAll('[name="courier"]')];
  const getCourier = () => courierEls.find((r) => r.checked)?.value ?? "";
  if (hasCourier) {
    const cur = COURIERS.includes(row.default_courier) ? row.default_courier : "jnt";
    courierEls.forEach((r) => { r.checked = r.value === cur; });
  } else {
    courierEls.forEach((r) => { r.disabled = true; });
    $("#courierWarn").hidden = false;
  }
  const originWarn = () => { $("#originWarn").hidden = !!row.origin_area_id; };
  originWarn();

  const hint = () => {
    const b = Number(digits(inp(fP, "buffer").value) || 0), r = Number(digits(inp(fP, "round").value) || 0);
    $("#weightHint").textContent = r > 0
      ? `Berat kirim = berat produk + buffer kemasan (sekali per pesanan), dibulatkan ke atas. Contoh: produk 430 g + ${b} g = ${430 + b} g, dihitung ${shippingWeight(430, b, r)} g.`
      : "";
  };
  hint();
  fP.addEventListener("input", hint);

  const picker = mountAreaPicker({
    root: $("#originPicker"), value: origin, inputId: "originInput",
    onChange: (s) => { origin = s; fP.dispatchEvent(new Event("input")); },
  });
  const card = wireCard(fP, {
    vals: () => ({ origin: origin?.id ?? "", buffer: digits(inp(fP, "buffer").value), round: digits(inp(fP, "round").value), ...(hasCourier ? { courier: getCourier() } : {}) }),
    validate(v) {
      const e = {};
      if (!isInt(v.buffer, 0, 5000)) e.buffer = "Isi 0 sampai 5000 gram.";
      if (!isInt(v.round, 1, 1000)) e.round = "Isi 1 sampai 1000 gram.";
      if (hasCourier && !COURIERS.includes(v.courier)) e.courier = "Pilih kurir utama.";
      return e;
    },
    patch: (v) => ({
      origin_area_id: orNull(v.origin),
      ...(hasLabel ? { origin_area_label: origin?.label || null } : {}),
      packaging_buffer_gram: Number(v.buffer), weight_round_gram: Number(v.round),
      ...(hasCourier ? { default_courier: v.courier } : {}),
    }),
    onSaved: () => { originWarn(); hint(); },
    focusKey: (k) => (k === "origin" ? { focus: () => picker.focus() } : null),
  });
  void card;
}