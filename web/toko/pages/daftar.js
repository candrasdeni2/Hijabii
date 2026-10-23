// Daftar akun customer baru.
import { supabase } from '../../assets/js/supabase.js';
import { toast } from '../../assets/js/ui.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function init({ root }) {
  root.innerHTML = `
    <div class="tk-auth">
      <div class="tk-auth-logo">HIJABII</div>
      <div class="tk-auth-card">
        <h2>Buat Akun</h2>
        <div id="regAlert" hidden></div>
        <form id="regForm" class="tk-auth-form" novalidate>
          <div class="field">
            <label class="label" for="regName">Nama lengkap <span class="req">*</span></label>
            <input class="input" id="regName" autocomplete="name" placeholder="Nama Anda">
            <span class="field-error" id="regNameErr"></span>
          </div>
          <div class="field">
            <label class="label" for="regEmail">Email <span class="req">*</span></label>
            <input class="input" id="regEmail" type="email" autocomplete="email" inputmode="email" placeholder="nama@email.com">
            <span class="field-error" id="regEmailErr"></span>
          </div>
          <div class="field">
            <label class="label" for="regPass">Password <span class="req">*</span></label>
            <input class="input" id="regPass" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter">
            <span class="field-error" id="regPassErr"></span>
          </div>
          <button type="submit" class="btn btn-primary" id="regBtn" style="width:100%;margin-top:4px">Buat Akun</button>
        </form>
        <div class="tk-auth-links" style="justify-content:center">
          Sudah punya akun? <a href="#/login">Masuk</a>
        </div>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const showAlert = (msg, kind = 'error') => {
    const el = $('#regAlert'); el.className = `tk-alert tk-alert-${kind}`; el.textContent = msg; el.hidden = false;
  };
  const setErr = (id, t) => { $(id).textContent = t; };

  $('#regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['#regNameErr','#regEmailErr','#regPassErr'].forEach((i) => setErr(i, ''));
    $('#regAlert').hidden = true;
    const name  = $('#regName').value.trim();
    const email = $('#regEmail').value.trim().toLowerCase();
    const pass  = $('#regPass').value;
    let bad = false;
    if (!name) { setErr('#regNameErr', 'Nama wajib diisi.'); bad = true; }
    if (!EMAIL_RE.test(email)) { setErr('#regEmailErr', 'Email tidak valid.'); bad = true; }
    if (pass.length < 8) { setErr('#regPassErr', 'Password minimal 8 karakter.'); bad = true; }
    if (bad) return;

    const btn = $('#regBtn'); btn.disabled = true; btn.textContent = 'Memproses…';
    const { error } = await supabase.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name } },
    });
    btn.disabled = false; btn.textContent = 'Buat Akun';

    if (error) {
      const msg = error.message.includes('already registered') ? 'Email sudah terdaftar. Coba masuk.' : error.message;
      showAlert(msg, 'error'); return;
    }
    showAlert('Akun berhasil dibuat! Cek email Anda untuk verifikasi.', 'success');
    setTimeout(() => { location.hash = '#/login'; }, 2500);
  });
  $('#regName').focus();
}
