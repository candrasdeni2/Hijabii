// Profil: ubah nama, nomor kontak, dan alamat pengiriman default.
import { supabase } from '../../assets/js/supabase.js';
import { toast } from '../../assets/js/ui.js';

export async function init({ root, profile, isStale }) {
  root.innerHTML = `
    <div class="tk-page" style="max-width:520px">
      <a class="tk-back" href="#/akun" style="display:inline-block;margin-bottom:12px;font-size:14px;color:rgba(43,33,28,.7);text-decoration:none">← Kembali</a>
      <header class="tk-page-head"><h1 class="tk-h1">Profil & Alamat</h1></header>
      <div id="profAlert" hidden></div>
      <form id="profForm" class="tk-acct-form" novalidate>
        <div class="field">
          <label class="label" for="pfName">Nama lengkap <span class="req">*</span></label>
          <input class="input" id="pfName" autocomplete="name" value="">
          <span class="field-error" id="pfNameErr"></span>
        </div>
        <div class="field">
          <label class="label" for="pfPhone">Nomor HP (WhatsApp)</label>
          <input class="input" id="pfPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="08xx…">
        </div>
        <div class="field">
          <label class="label" for="pfAddr">Alamat lengkap</label>
          <textarea class="input" id="pfAddr" rows="3" placeholder="Jalan, no. rumah, RT/RW, kelurahan, kecamatan, kota, kode pos"></textarea>
        </div>
        <div id="pwSection">
          <p style="font-weight:500;font-size:13px;margin:8px 0 10px">Ganti Password <span style="font-weight:400;color:rgba(43,33,28,.6)">(kosongkan jika tidak ingin ganti)</span></p>
          <div class="field">
            <label class="label" for="pfPass">Password baru</label>
            <input class="input" id="pfPass" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter">
            <span class="field-error" id="pfPassErr"></span>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" id="pfBtn">Simpan</button>
      </form>
    </div>`;

  const $ = (s) => root.querySelector(s);

  // Isi dari data profil yang sudah ada
  const { data, error } = await supabase.from('profiles')
    .select('full_name, phone, address').eq('id', profile.id).single();
  if (isStale()) return;
  if (!error && data) {
    $('#pfName').value  = data.full_name ?? '';
    $('#pfPhone').value = data.phone ?? '';
    $('#pfAddr').value  = data.address ?? '';
  }

  const showAlert = (msg, kind = 'error') => {
    const el = $('#profAlert'); el.className = `tk-alert tk-alert-${kind}`; el.textContent = msg; el.hidden = false;
  };

  $('#profForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#pfNameErr').textContent = ''; $('#pfPassErr').textContent = ''; $('#profAlert').hidden = true;
    const name  = $('#pfName').value.trim();
    const phone = $('#pfPhone').value.trim();
    const addr  = $('#pfAddr').value.trim();
    const pass  = $('#pfPass').value;
    if (!name) { $('#pfNameErr').textContent = 'Nama wajib diisi.'; return; }
    if (pass && pass.length < 8) { $('#pfPassErr').textContent = 'Minimal 8 karakter.'; return; }

    const btn = $('#pfBtn'); btn.disabled = true; btn.textContent = 'Menyimpan…';
    const updates = [];
    updates.push(supabase.from('profiles').update({
      full_name: name,
      phone: phone || null,
      address: addr || null,
    }).eq('id', profile.id));
    if (pass) updates.push(supabase.auth.updateUser({ password: pass }));

    const results = await Promise.all(updates);
    btn.disabled = false; btn.textContent = 'Simpan';
    const failed = results.find((r) => r.error);
    if (failed) { showAlert(failed.error.message || 'Gagal menyimpan.', 'error'); return; }
    toast('Profil disimpan.', 'success');
    location.hash = '#/akun';
  });
}
