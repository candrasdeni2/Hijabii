import { ORDER_STATUS, PAYMENT_STATUS } from './labels.js';
import { escapeHtml } from './format.js';

/* ---------- Badge ---------- */
const badge = (map, key) => {
  const s = map[key] ?? { label: key ?? '-', bg:'#F1ECE6', fg:'#8A7A6E' };
  return `<span class="badge" style="background:${s.bg};color:${s.fg}">${escapeHtml(s.label)}</span>`;
};
export const statusBadge  = (status) => badge(ORDER_STATUS, status);   // selalu ada teks, bukan warna saja
export const paymentChip  = (status) => badge(PAYMENT_STATUS, status);

/* ---------- Skeleton ---------- */
export const skeleton = (h = 16, w = '100%') =>
  `<div class="skeleton" style="height:${h}px;width:${w}" aria-hidden="true"></div>`;

/* ---------- Toast ---------- */
let region;
function toastRegion() {
  if (region) return region;
  region = document.createElement('div');
  region.className = 'toast-region';
  region.setAttribute('aria-live', 'polite');
  document.body.appendChild(region);
  return region;
}
/** toast('Tersimpan', 'success' | 'error' | 'warning' | 'info') — hilang otomatis 4 detik. */
export function toast(message, kind = 'info', ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast'; el.dataset.kind = kind; el.textContent = message;
  toastRegion().appendChild(el);
  setTimeout(() => el.remove(), ms);
}
window.addEventListener('offline', () => toast('Tidak ada koneksi', 'warning'));

/* ---------- Modal / bottom sheet ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/**
 * openDialog({ title, html | node, onClose }) -> { close, el }
 * Desktop: modal; mobile: bottom sheet (diatur CSS). Esc/klik backdrop menutup, scroll body dikunci,
 * fokus terperangkap lalu dikembalikan ke pemicu.
 */
export function openDialog({ title = '', html = '', node = null, onClose } = {}) {
  const trigger = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <button class="dialog-close" aria-label="Tutup" type="button">&times;</button>
    ${title ? `<h2 style="font-size:22px;margin-bottom:1rem">${escapeHtml(title)}</h2>` : ''}
    <div class="dialog-body"></div></div>`;
  const dialog = overlay.querySelector('.dialog');
  const body = overlay.querySelector('.dialog-body');
  if (node) body.appendChild(node); else body.innerHTML = html;
  document.body.appendChild(overlay);
  document.body.classList.add('scroll-lock');

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.classList.remove('scroll-lock');
    trigger?.focus?.();
    onClose?.();
  };
  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.dialog-close').addEventListener('click', close);
  const firstInBody = body.querySelector(FOCUSABLE);   // fokus awal: kontrol pertama di isi dialog, bukan tombol tutup
  (firstInBody ?? dialog.querySelector('.dialog-close')).focus();
  return { close, el: dialog };
}

/* ---------- Tombol loading ---------- */
/** Jalankan fn() sambil menonaktifkan tombol + spinner; label kembali setelah selesai. */
export async function withLoading(button, fn, label = 'Memproses…') {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapeHtml(label)}`;
  try { return await fn(); }
  finally { button.disabled = false; button.innerHTML = original; }
}

/* ---------- Placeholder gambar ---------- */
export const placeholder = (text = 'foto', ratio = '4/5') =>
  `<div class="ph" style="aspect-ratio:${ratio}">${escapeHtml(text)}</div>`;
