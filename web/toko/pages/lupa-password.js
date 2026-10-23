// Kirim link reset password ke email.
import { supabase } from '../../assets/js/supabase.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function init({ root }) {
  root.innerHTML = `
    <div class="tk-auth">
      <div class="tk-auth-logo">HIJABII</div>
      <div class="tk-auth-card">
        <h2>Lupa Password</h2>
        <p style="font-size:13px;color:rgba(43,33,28,.7);margin:0 0 16px">Masukkan email Anda dan kami akan mengirim link untuk mengatur ulang password.</p>
        <div id="fpAlert" hidden></div>
        <form id="fpForm" class="tk-auth-form" novalidate>
          <div class="field">
            <label class="label" for="fpEmail">Email <span class="req">*</span></label>
            <input class="input" id="fpEmail" type="email" autocomplete="email" inputmode="email" placeholder="nama@email.com">
            <span class="field-error" id="fpEmailErr"></span>
          </div>
          <button type="submit" class="btn btn-primary" id="fpBtn" style="width:100%;margin-top:4px">Kirim Link Reset</button>
        </form>
        <div class="tk-auth-links" style="justify-content:center"><a href="#/login">← Kembali ke login</a></div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  $('#fpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#fpEmailErr').textContent = ''; $('#fpAlert').hidden = true;
    const email = $('#fpEmail').value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { $('#fpEmailErr').textContent = 'Email tidak valid.'; return; }
    const btn = $('#fpBtn'); btn.disabled = true; btn.textContent = 'Mengirim…';
    // Selalu tampil pesan berhasil agar tidak bocorkan apakah email terdaftar
    await supabase.auth.resetPasswordForEmail(email);
    btn.disabled = false; btn.textContent = 'Kirim Link Reset';
    const el = $('#fpAlert'); el.className = 'tk-alert tk-alert-success';
    el.textContent = 'Jika email terdaftar, link reset sudah dikirim. Cek inbox atau spam Anda.'; el.hidden = false;
  });
  $('#fpEmail').focus();
}
