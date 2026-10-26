// Halaman Akun: avatar inisial + menu (Profil, Alamat, Pesanan, Notifikasi, FAQ, Keluar). Polos, mengikuti lebar layar.
import { supabase } from '../../assets/js/supabase.js';
import { signOut } from '../../assets/js/auth.js';
import { unregisterDevice } from '../../assets/js/push.js';
import { ROUTES } from '../../assets/js/routes.js';
import { ensureStyle, esc, IC } from '../acct-ui.js';

const initials = (name, email) => {
  const src = String(name || '').trim() || String(email || '').split('@')[0] || '?';
  const w = src.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};

const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 004 0"/></svg>';
const row = (href, icon, label) =>
  `<a class="ak-link" href="${href}"><span class="ak-ico">${icon}</span>${label}<span class="ak-go">${IC.next}</span></a>`;

export async function init({ root, profile, isStale }) {
  ensureStyle();

  if (!profile) {
    root.innerHTML = `
      <div class="ak">
        <h1 style="position:absolute;left:-999px;width:1px;height:1px;overflow:hidden">Akun</h1>
        <div class="ak-prof">
          <div class="ak-avatar" aria-hidden="true">${IC.user}</div>
          <div class="ak-who"><p class="ak-name">Tamu</p><p class="ak-mail">Belum masuk</p></div>
        </div>
        <div class="ak-guest">
          <p>Masuk atau buat akun untuk melihat pesanan, menyimpan alamat, dan memberikan ulasan.</p>
          <a class="btn btn-primary" id="masukBtn">Masuk</a>
          <a class="btn btn-secondary" id="daftarBtn">Buat Akun</a>
        </div>
      </div>`;
    root.querySelector('#masukBtn').href = `${ROUTES.login}?next=${encodeURIComponent(location.pathname + location.hash)}`;
    root.querySelector('#daftarBtn').href = ROUTES.login.replace('login.html', 'daftar.html');
    return;
  }

  root.innerHTML = `
    <div class="ak">
      <h1 style="position:absolute;left:-999px;width:1px;height:1px;overflow:hidden">Akun</h1>
      <div class="ak-prof">
        <div class="ak-avatar" id="akAv" aria-hidden="true">${esc(initials(profile.full_name, profile.email))}</div>
        <div class="ak-who">
          <p class="ak-name" id="akName">${esc(profile.full_name || 'Akun Saya')}</p>
          <p class="ak-mail" id="akMail">${esc(profile.email)}</p>
        </div>
      </div>
      <nav class="ak-menu" aria-label="Menu akun">
        ${row('#/profil', IC.user, 'Profil')}
        ${row('#/alamat', IC.pin, 'Alamat')}
        ${row('#/pesanan', IC.receipt, 'Pesanan Saya')}
        ${row('#/notifikasi', BELL, 'Notifikasi')}
        ${row('#/faq', IC.faq, 'FAQ')}
        <button class="ak-link out" id="logoutBtn" type="button"><span class="ak-ico">${IC.logout}</span>Keluar</button>
      </nav>
    </div>`;

  root.querySelector('#logoutBtn').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await unregisterDevice(supabase);   // lepas perangkat ini dari akun (maks 2 dtk), sebelum sesi dihapus
    await signOut();
    location.replace(`${ROUTES.login}?reason=logout`);
  });

  // Badge jumlah notifikasi belum dibaca di baris Notifikasi
  supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false).then(({ count }) => {
    if (isStale?.() || !(count > 0)) return;
    const go = root.querySelector('a[href="#/notifikasi"] .ak-go'); if (!go) return;
    go.insertAdjacentHTML('beforebegin', `<span style="margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--marsala);color:var(--cream);font-size:11px;font-weight:600;line-height:20px;text-align:center">${count > 99 ? '99+' : count}</span>`);
    go.style.marginLeft = '-10px';   // jarak ke badge = gap 20px - 10px
  });

  // Segarkan nama/email dari DB (profil di shell bisa belum terbarui setelah diedit di halaman Profil)
  const { data } = await supabase.from('profiles').select('full_name, email').eq('id', profile.id).maybeSingle();
  if (isStale?.() || !data) return;
  root.querySelector('#akName').textContent = data.full_name || 'Akun Saya';
  root.querySelector('#akMail').textContent = data.email || '';
  root.querySelector('#akAv').textContent = initials(data.full_name, data.email);
}