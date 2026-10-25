// Profil: ubah nama, nomor HP, email (wajib konfirmasi lewat email), dan password.
import { supabase } from '../../assets/js/supabase.js';
import { toast, withLoading } from '../../assets/js/ui.js';
import { ensureStyle, backLink } from '../acct-ui.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{9,15}$/;

export async function init({ root, profile, isStale }) {
  ensureStyle();
  root.innerHTML = `
    <div class="ac">
      ${backLink()}
      <h1 class="ac-title">Profil</h1>
      <p class="ac-sub">Data diri yang dipakai untuk akunmu.</p>
      <div id="pfAlert" class="ac-alert" hidden role="status"></div>
      <form id="pfForm" class="ac-stack" novalidate>
        <div class="field">
          <label class="label" for="pfName">Nama lengkap <span class="req">*</span></label>
          <input class="input" id="pfName" autocomplete="name" placeholder="Nama Anda">
          <span class="field-error" id="pfNameErr"></span>
        </div>
        <div class="field">
          <label class="label" for="pfPhone">Nomor HP (WhatsApp)</label>
          <input class="input" id="pfPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="08xx atau +628xx">
          <span class="field-error" id="pfPhoneErr"></span>
        </div>
        <div class="field">
          <label class="label" for="pfEmail">Email <span class="req">*</span></label>
          <input class="input" id="pfEmail" type="email" autocomplete="email" placeholder="nama@email.com">
          <span class="ac-note">Mengganti email butuh konfirmasi: kami kirim tautan ke email baru, dan email baru baru aktif setelah tautannya dibuka.</span>
          <span class="field-error" id="pfEmailErr"></span>
        </div>
        <h2 class="ac-sec">Ganti password</h2>
        <div class="field">
          <label class="label" for="pfPass">Password baru</label>
          <input class="input" id="pfPass" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter (kosongkan jika tidak diganti)">
          <span class="field-error" id="pfPassErr"></span>
        </div>
        <div class="ac-actions">
          <button class="btn btn-primary btn-block" id="pfBtn" type="submit">Simpan</button>
        </div>
      </form>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const alertBox = (msg, kind = 'info') => { const el = $('#pfAlert'); el.dataset.kind = kind; el.textContent = msg; el.hidden = false; };

  const [{ data: row }, { data: au }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone, email').eq('id', profile.id).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (isStale?.()) return;
  let currentEmail = row?.email || au?.user?.email || profile.email || '';
  $('#pfName').value = row?.full_name ?? '';
  $('#pfPhone').value = row?.phone ?? '';
  $('#pfEmail').value = currentEmail;
  if (au?.user?.new_email) alertBox(`Menunggu konfirmasi: tautan sudah dikirim ke ${au.user.new_email}. Email baru aktif setelah tautannya dibuka.`, 'info');

  $('#pfForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['pfNameErr', 'pfPhoneErr', 'pfEmailErr', 'pfPassErr'].forEach((id) => { $('#' + id).textContent = ''; });
    $('#pfAlert').hidden = true;

    const name = $('#pfName').value.trim();
    const phone = $('#pfPhone').value.replace(/[\s-]/g, '');
    const email = $('#pfEmail').value.trim().toLowerCase();
    const pass = $('#pfPass').value;

    let bad = false;
    if (!name) { $('#pfNameErr').textContent = 'Nama wajib diisi.'; bad = true; }
    if (phone && !PHONE_RE.test(phone)) { $('#pfPhoneErr').textContent = 'Nomor HP tidak valid (9–15 angka).'; bad = true; }
    if (!EMAIL_RE.test(email)) { $('#pfEmailErr').textContent = 'Email tidak valid.'; bad = true; }
    if (pass && pass.length < 8) { $('#pfPassErr').textContent = 'Password minimal 8 karakter.'; bad = true; }
    if (bad) return;

    await withLoading($('#pfBtn'), async () => {
      // 1. Data diri
      const { error: e1 } = await supabase.from('profiles')
        .update({ full_name: name, phone: phone || null }).eq('id', profile.id);
      if (e1) { alertBox(e1.message || 'Gagal menyimpan profil.', 'error'); return; }

      // 2. Email / password lewat Supabase Auth
      const authPatch = {};
      const emailChanged = email !== String(currentEmail).toLowerCase();
      if (emailChanged) authPatch.email = email;
      if (pass) authPatch.password = pass;
      if (Object.keys(authPatch).length) {
        const { error: e2 } = await supabase.auth.updateUser(authPatch);
        if (e2) {
          const m = String(e2.message || '');
          const msg = /already (been )?registered|already exists/i.test(m) ? 'Email itu sudah dipakai akun lain.'
            : /rate limit|too many/i.test(m) ? 'Terlalu sering meminta. Coba lagi beberapa menit lagi.'
            : /same password|different from the old/i.test(m) ? 'Password baru harus berbeda dari yang lama.'
            : m || 'Gagal memperbarui akun.';
          alertBox(`Nama dan nomor HP tersimpan, tetapi ${msg}`, 'error');
          return;
        }
        if (pass) { $('#pfPass').value = ''; supabase.rpc('clear_password_flags').then(() => {}, () => {}); }
      }

      if (emailChanged) {
        $('#pfEmail').value = currentEmail;   // tampilkan email aktif sampai konfirmasi selesai
        alertBox(`Profil tersimpan. Kami mengirim tautan konfirmasi ke ${email}. Buka tautannya agar email baru aktif (bila diminta, konfirmasi juga dari email lama).`, 'success');
        toast('Cek email untuk konfirmasi.', 'info');
      } else {
        alertBox('Profil tersimpan.', 'success');
        toast('Profil disimpan.', 'success');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 'Menyimpan…');
  });
}
