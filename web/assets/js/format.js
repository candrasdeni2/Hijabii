import { CONFIG } from './config.js';
const idr = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 });
export const rupiah = (n) => idr.format(Number(n ?? 0)).replace(/\s/g, ' ');
export const dateTimeWIB = (iso) => iso ? new Intl.DateTimeFormat('id-ID',
  { dateStyle:'medium', timeStyle:'short', timeZone:CONFIG.TIMEZONE }).format(new Date(iso)) : '';
export const dateWIB = (iso) => iso ? new Intl.DateTimeFormat('id-ID',
  { dateStyle:'medium', timeZone:CONFIG.TIMEZONE }).format(new Date(iso)) : '';
/** "2 jam lagi" / "5 menit lalu" */
export function relativeTime(iso, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000, abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('id-ID', { numeric:'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff/60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff/3600), 'hour');
  return rtf.format(Math.round(diff/86400), 'day');
}
/** Sisa waktu "23j 59m" untuk hitung mundur expires_at; null bila sudah lewat. */
export function countdown(iso, now = Date.now()) {
  const s = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return null;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return `${h}j ${String(m).padStart(2,'0')}m`;
}
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
