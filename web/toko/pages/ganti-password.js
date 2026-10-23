// Ganti password — wajib setelah super admin mengatur ulang password akun.
import { supabase } from '../../assets/js/supabase.js';
import { toast } from '../../assets/js/ui.js';

export async function init({ root, profile }) {
  const isMustChange = profile?.must_change_password;
  root.innerHTML = `
    <div class="tk-auth">
      <div class="tk-auth-logo">HIJABII</div>
      <div class="tk-auth-card">
        <h2>${isMustChange ? 'Buat Password Baru' : 'Ganti Password'}</h2>
        ${isMustChange ? '<div class="tk-alert tk-alert-warn" style="margin-bottom:16px">Password Anda telah diatur ulang. Buat password baru untuk melanjutkan.</div>' : ''}
        <div id="cpAlert" hidden></div>
        <form id="cpForm" class="tk-auth-form" novalidate>
          <div class="field">
            <label class="label" for="cpNew">Password baru <span class="req">*</span></label>
            <input class="input" id="cpNew" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter">
            <span class="field-error" id="cpNewErr"></span>
          </div>
          <div class="field">
            <label class="label" for="cpConf">Konfirmasi password <span class="req">*</span></label>
            <input class="input" id="cpConf" type="password" autocomplete="new-password" placeholder="Ulangi password baru">
            <span class="field-error" id="cpConfErr"></span>
          </div>
          <button type="submit" class="btn btn-primary" id="cpBtn" style="width:100%;margin-top:4px">Simpan Password</button>
        </form>
      </div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const showAlert = (msg, kind = 'error') => {
    const el = $('#cpAlert'); el.className = `tk-alert tk-alert-${kind}`; el.textContent = msg; el.hidden = false;
  };
  $('#cpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    ['#cpNewErr','#cpConfErr'].forEach((i) => $(i).textContent = ''); $('#cpAlert').hidden = true;
    const pw = $('#cpNew').value, conf = $('#cpConf').value;
    let bad = false;
    if (pw.length < 8) { $('#cpNewErr').textContent = 'Minimal 8 karakter.'; bad = true; }
    if (pw !== conf) { $('#cpConfErr').textContent = 'Password tidak cocok.'; bad = true; }
    if (bad) return;

    const btn = $('#cpBtn'); btn.disabled = true; btn.textContent = 'Menyimpan…';
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { showAlert(error.message, 'error'); btn.disabled = false; btn.textContent = 'Simpan Password'; return; }
    // Tandai wajib ganti sudah selesai
    await supabase.rpc('clear_password_flags').catch(() => {});
    toast('Password berhasil diubah.', 'success');
    location.hash = '#/beranda';
  });
  $('#cpNew').focus();
}
