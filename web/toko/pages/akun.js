// Halaman Akun: kartu profil (avatar inisial, tanpa upload foto) + menu, atau prompt login untuk tamu.
import { signOut } from '../../assets/js/auth.js';
import { ROUTES } from '../../assets/js/routes.js';
import { ICON } from '../tk-lib.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = (name, email) => {
  const src = String(name || '').trim() || String(email || '').split('@')[0] || '?';
  const w = src.split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};
const LOGOUT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/></svg>`;

const CSS = `
.ak{max-width:420px;margin:0 auto;padding:0 16px}
.ak-card{background:var(--paper,#FBF7F1);border:1px solid var(--sand,#E6DACB);border-radius:28px;overflow:hidden;
  box-shadow:0 18px 44px -18px rgba(123,74,74,.35)}
.ak svg{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ak-head{position:relative;text-align:center;padding:36px 24px 8px;background:var(--paper,#FBF7F1)}
.ak-avatar{width:92px;height:92px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;
  font:600 34px/1 var(--font-serif,serif);letter-spacing:.04em;color:var(--cream,#F6F0E7);
  background:linear-gradient(145deg,var(--marsala,#7B4A4A),var(--marsala-dark,#5C3333));
  box-shadow:0 0 0 4px var(--paper,#FBF7F1),0 8px 20px -6px rgba(123,74,74,.55)}
.ak-avatar svg{width:42px;height:42px}
.ak-name{margin:0;font:600 24px/1.2 var(--font-serif,serif);color:var(--ink,#2B211C);overflow-wrap:anywhere}
.ak-mail{margin:6px 0 0;font-size:13px;color:rgba(43,33,28,.65);overflow-wrap:anywhere}
.ak-wave{position:relative;height:76px;margin-top:-2px;background:linear-gradient(100deg,var(--marsala-dark,#5C3333) 0%,var(--marsala,#7B4A4A) 55%,#A87272 100%)}
.ak-wave svg{position:absolute;inset:0;width:100%;height:100%;stroke:none}
.ak-menu{background:var(--cream,#F6F0E7);padding:8px 0}
.ak-link{display:flex;align-items:center;gap:18px;width:100%;padding:16px 28px;border:0;background:none;cursor:pointer;
  font:500 15px/1.2 var(--font-sans,sans-serif);color:var(--ink,#2B211C);text-decoration:none;text-align:left;transition:background .15s}
.ak-link:hover,.ak-link:focus-visible{background:rgba(123,74,74,.09);outline:none}
.ak-link .ak-ico{width:22px;height:22px;flex:none;color:var(--marsala,#7B4A4A)}
.ak-link .ak-go{width:16px;height:16px;margin-left:auto;flex:none;opacity:.45}
.ak-ico svg,.ak-go svg{display:block;width:100%;height:100%}
.ak-foot{border-top:1px solid var(--sand,#E6DACB);background:var(--cream,#F6F0E7)}
.ak-out{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:18px;border:0;background:none;cursor:pointer;
  font:500 14px/1 var(--font-sans,sans-serif);color:rgba(43,33,28,.55);transition:color .15s}
.ak-out:hover,.ak-out:focus-visible{color:var(--error,#9E3D3D);outline:none}
.ak-out svg{width:18px;height:18px}
.ak-guest{padding:8px 28px 28px;background:var(--cream,#F6F0E7);display:grid;gap:10px}
.ak-guest p{margin:0 0 6px;font-size:14px;line-height:1.5;color:rgba(43,33,28,.7);text-align:center}
.ak-guest .btn{width:100%;justify-content:center;text-align:center}
`;

function ensureStyle() {
  if (document.getElementById('akStyle')) return;
  const st = document.createElement('style'); st.id = 'akStyle'; st.textContent = CSS; document.head.appendChild(st);
}

const WAVE = `<svg viewBox="0 0 420 76" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 0H420V6Q210 96 0 6Z" fill="var(--paper,#FBF7F1)"/>
  <path d="M420 30Q330 70 250 60Q340 54 420 14Z" fill="rgba(255,255,255,.16)"/>
</svg>`;

export async function init({ root, profile }) {
  ensureStyle();

  if (!profile) {
    root.innerHTML = `
      <div class="ak"><div class="ak-card">
        <div class="ak-head">
          <div class="ak-avatar" aria-hidden="true">${ICON.user}</div>
          <h1 class="ak-name">Akun</h1>
        </div>
        <div class="ak-wave">${WAVE}</div>
        <div class="ak-guest">
          <p>Masuk atau buat akun untuk melihat pesanan, menyimpan alamat, dan memberikan ulasan.</p>
          <a class="btn btn-primary" id="masukBtn">Masuk</a>
          <a class="btn btn-secondary" id="daftarBtn">Buat Akun</a>
        </div>
      </div></div>`;
    root.querySelector('#masukBtn').href = `${ROUTES.login}?next=${encodeURIComponent(location.pathname + location.hash)}`;
    root.querySelector('#daftarBtn').href = ROUTES.login.replace('login.html', 'daftar.html');
    return;
  }

  root.innerHTML = `
    <div class="ak"><div class="ak-card">
      <div class="ak-head">
        <div class="ak-avatar" aria-hidden="true">${esc(initials(profile.full_name, profile.email))}</div>
        <h1 class="ak-name">${esc(profile.full_name || 'Akun Saya')}</h1>
        <p class="ak-mail">${esc(profile.email)}</p>
      </div>
      <div class="ak-wave">${WAVE}</div>
      <nav class="ak-menu" aria-label="Menu akun">
        <a class="ak-link" href="#/pesanan"><span class="ak-ico">${ICON.receipt}</span>Pesanan Saya<span class="ak-go">${ICON.next}</span></a>
        <a class="ak-link" href="#/profil"><span class="ak-ico">${ICON.user}</span>Profil &amp; Alamat<span class="ak-go">${ICON.next}</span></a>
      </nav>
      <div class="ak-foot">
        <button class="ak-out" id="logoutBtn" type="button">${LOGOUT}Keluar</button>
      </div>
    </div></div>`;

  root.querySelector('#logoutBtn').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await signOut();
    location.replace(`${ROUTES.login}?reason=logout`);
  });
}