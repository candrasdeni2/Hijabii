// Gaya & ikon bersama untuk halaman Akun, Profil, dan Alamat (polos, tanpa kartu, mengikuti lebar layar).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const s = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const IC = {
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  receipt: s('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  pin: s('<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  faq: s('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1-1.5 2.2"/><path d="M12 17h.01"/>'),
  logout: s('<path d="M9 4H5v16h4"/><path d="M16 8l4 4-4 4M20 12H9"/>'),
  next: s('<path d="M9 5l7 7-7 7"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
};

const CSS = `
.ac,.ak{--ac-ink:var(--ink,#2B211C)}
.ac svg,.ak svg{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
/* ---- halaman dalam (profil, alamat) ---- */
.ac{max-width:560px;margin:0 auto;padding:8px 20px 56px}
.ac-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;margin-left:-6px;padding-right:8px;font-size:14px;color:rgba(43,33,28,.7);text-decoration:none}
.ac-back svg{width:18px;height:18px}
.ac-title{font-size:32px;line-height:1.15;margin:2px 0 6px}
.ac-sub{margin:0 0 22px;font-size:14px;color:rgba(43,33,28,.65)}
.ac-stack{display:grid;gap:16px}
.ac-note{font-size:12px;color:rgba(43,33,28,.6);margin:2px 0 0}
.ac-sec{margin:12px 0 -4px;padding-top:18px;border-top:1px solid var(--sand,#EBE0D3);font:600 18px/1.2 var(--font-serif,serif)}
.ac-alert{border-radius:12px;padding:.75rem 1rem;font-size:13px;line-height:1.5;margin-bottom:16px}
.ac-alert[data-kind="error"]{background:#FDF0F0;color:var(--error,#9E3D3D);border:1px solid #F5C6C6}
.ac-alert[data-kind="success"]{background:#EFF6F1;color:var(--success,#4E6E58);border:1px solid #B8D9C2}
.ac-alert[data-kind="info"]{background:#EEF3F6;color:var(--info,#4F6B7D);border:1px solid #C9D8E1}
.ac .btn-block{width:100%}
.ac-actions{display:grid;gap:10px;margin-top:6px}
/* ---- daftar alamat ---- */
.ad-list{margin-top:18px;border-top:1px solid var(--sand,#EBE0D3)}
.ad{padding:18px 0;border-bottom:1px solid var(--sand,#EBE0D3)}
.ad-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.ad-label{font-weight:600;font-size:15px}
.ad-badge{background:#EFE3E3;color:var(--marsala,#7B4A4A)}
.ad-name{font-size:14px;font-weight:500}
.ad-text{margin:2px 0 0;font-size:14px;line-height:1.5;color:rgba(43,33,28,.78);overflow-wrap:anywhere}
.ad-row{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:10px}
.ad-row .btn-ghost{min-height:40px;padding-inline:0;font-size:13px}
.ad-row .ad-del{color:var(--error,#9E3D3D)}
.ad-empty{padding:36px 0;text-align:center;color:rgba(43,33,28,.65);font-size:14px}
.ad-form{display:grid;gap:14px}
.ad-form .row2{display:grid;gap:14px}
@media(min-width:520px){.ad-form .row2{grid-template-columns:1fr 1fr}}
.ad-foot{display:grid;gap:10px;margin-top:6px}
@media(min-width:520px){.ad-foot{grid-template-columns:1fr 1fr}}
/* ---- halaman Akun (daftar menu polos) ---- */
.ak{max-width:560px;margin:0 auto;padding:0 20px 40px}
.ak-sr{position:absolute;left:-999px;width:1px;height:1px;overflow:hidden}
.ak-top{display:flex;align-items:center;min-height:44px;margin-bottom:8px}
.ak-top h1{font:600 30px/1.15 var(--font-serif,serif)}
.ak-prof{display:flex;align-items:center;gap:16px;padding:0 0 20px;border-bottom:1px solid var(--sand,#EBE0D3)}
.ak-avatar{flex:none;width:72px;height:72px;border-radius:50%;display:grid;place-items:center;
  font:600 26px/1 var(--font-serif,serif);letter-spacing:.04em;color:var(--cream,#F6F0E7);
  background:linear-gradient(145deg,var(--marsala,#7B4A4A),var(--marsala-dark,#653B3B))}
.ak-avatar svg{width:34px;height:34px}
.ak-who{min-width:0}
.ak-name{margin:0;font:600 17px/1.3 var(--font-sans,sans-serif);overflow-wrap:anywhere}
.ak-mail{margin:3px 0 0;font-size:13px;color:rgba(43,33,28,.6);overflow-wrap:anywhere}
.ak-menu{display:block}
.ak-link{display:flex;align-items:center;gap:20px;width:100%;min-height:58px;padding:14px 2px;border:0;border-bottom:1px solid var(--sand,#EBE0D3);
  background:none;cursor:pointer;font:400 15px/1.2 var(--font-sans,sans-serif);color:var(--ink,#2B211C);text-decoration:none;text-align:left}
.ak-link:hover,.ak-link:focus-visible{color:var(--marsala,#7B4A4A);outline:none}
.ak-ico{width:22px;height:22px;flex:none}
.ak-go{width:16px;height:16px;margin-left:auto;flex:none;opacity:.4}
.ak-ico svg,.ak-go svg{display:block;width:100%;height:100%}
.ak-link.out{border-bottom:0}
.ak-guest{display:grid;gap:10px;padding-top:20px}
.ak-guest p{margin:0 0 6px;font-size:14px;line-height:1.5;color:rgba(43,33,28,.7)}
.ak-guest .btn{width:100%}
`;

export function ensureStyle() {
  if (document.getElementById('acStyle')) return;
  const st = document.createElement('style');
  st.id = 'acStyle';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export const backLink = (label = 'Akun') => `<a class="ac-back" href="#/akun">${IC.back}${esc(label)}</a>`;