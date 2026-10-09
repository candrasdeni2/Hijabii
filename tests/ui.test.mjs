import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body><button id="t">pemicu</button></body>', { url:'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { statusBadge, paymentChip, toast, openDialog, withLoading, skeleton } = await import('../web/assets/js/ui.js');
const { rupiah, countdown, escapeHtml } = await import('../web/assets/js/format.js');
let fails = 0; const t = (n, c) => { console.log(c ? 'ok  ' : 'GAGAL', n); if (!c) fails++; };

t('badge punya teks label', statusBadge('menunggu_konfirmasi').includes('Menunggu Konfirmasi'));
t('badge slug asing tidak crash', statusBadge('aneh').includes('aneh'));
t('chip lunas', paymentChip('lunas').includes('Lunas'));
t('rupiah 42000', /Rp\s?42\.000/.test(rupiah(42000)));
t('countdown lewat -> null', countdown(new Date(Date.now()-1000).toISOString()) === null);
t('escapeHtml XSS', escapeHtml('<img onerror=x>') === '&lt;img onerror=x&gt;');

toast('halo', 'success', 50);
t('toast ada & aria-live', document.querySelector('.toast-region[aria-live="polite"] .toast[data-kind="success"]')?.textContent === 'halo');

const trigger = document.getElementById('t'); trigger.focus();
let closed = false;
const d = openDialog({ title:'<b>x</b>', html:'<button id="in">dalam</button>', onClose:()=>{closed=true} });
t('dialog role+aria-modal', document.querySelector('[role=dialog][aria-modal=true]') !== null);
t('judul di-escape', !document.querySelector('.dialog h2 b'));
t('scroll terkunci', document.body.classList.contains('scroll-lock'));
t('fokus pindah ke dalam dialog', document.activeElement.id === 'in');
document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key:'Escape' }));
t('Esc menutup + onClose', closed && !document.querySelector('.overlay'));
t('scroll lock dilepas', !document.body.classList.contains('scroll-lock'));
t('fokus kembali ke pemicu', document.activeElement === trigger);

const b = document.createElement('button'); b.textContent = 'Simpan'; document.body.appendChild(b);
const p = withLoading(b, () => new Promise(r => setTimeout(() => r(7), 30)));
t('tombol disabled saat loading', b.disabled && b.textContent.includes('Memproses'));
t('withLoading mengembalikan hasil', (await p) === 7);
t('tombol pulih', !b.disabled && b.textContent === 'Simpan');
process.exit(fails ? 1 : 0);
