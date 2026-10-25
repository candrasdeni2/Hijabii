// Alamat: daftar alamat pengiriman (lebih dari satu), tambah/ubah/hapus, dan tetapkan alamat utama.
import { supabase } from '../../assets/js/supabase.js';
import { toast, withLoading, openDialog } from '../../assets/js/ui.js';
import { mountAreaPicker, pretty } from '../../assets/js/area-picker.js';
import { ensureStyle, esc, backLink, IC } from '../acct-ui.js';

const PHONE_RE = /^\+?\d{9,12}$/;
const COLS = 'id, label, recipient_name, recipient_phone, destination_area_id, area_label, address_line, postal_code, is_primary, created_at';
const MAX = 10;

export async function init({ root, profile, isStale }) {
  ensureStyle();
  root.innerHTML = `
    <div class="ac">
      ${backLink()}
      <h1 class="ac-title">Alamat</h1>
      <p class="ac-sub">Simpan beberapa alamat pengiriman dan pilih satu sebagai alamat utama.</p>
      <div id="adAlert" class="ac-alert" hidden role="status"></div>
      <button class="btn btn-primary btn-block" id="adAdd" type="button">${IC.plus.replace('<svg', '<svg width="18" height="18"')}Tambah alamat</button>
      <div id="adList" class="ad-list"><div class="ad-empty">Memuat…</div></div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  let items = [];

  const showAlert = (msg, kind = 'error') => { const el = $('#adAlert'); el.dataset.kind = kind; el.textContent = msg; el.hidden = false; };

  function paint() {
    $('#adAdd').disabled = items.length >= MAX;
    if (!items.length) {
      $('#adList').innerHTML = `<div class="ad-empty">Belum ada alamat. Tambahkan alamat pertamamu agar checkout lebih cepat.</div>`;
      return;
    }
    $('#adList').innerHTML = items.map((a) => `
      <article class="ad" data-id="${esc(a.id)}">
        <div class="ad-top">
          <span class="ad-label">${esc(a.label)}</span>
          ${a.is_primary ? '<span class="badge ad-badge">Utama</span>' : ''}
        </div>
        <div class="ad-name">${esc(a.recipient_name)} · ${esc(a.recipient_phone)}</div>
        <p class="ad-text">${esc(a.address_line)}</p>
        <p class="ad-text">${esc(pretty(a.area_label))}${a.postal_code ? ` · ${esc(a.postal_code)}` : ''}</p>
        <div class="ad-row">
          ${a.is_primary ? '' : '<button class="btn btn-ghost" data-act="primary" type="button">Jadikan utama</button>'}
          <button class="btn btn-ghost" data-act="edit" type="button">Ubah</button>
          <button class="btn btn-ghost ad-del" data-act="del" type="button">Hapus</button>
        </div>
      </article>`).join('');
  }

  async function load() {
    const { data, error } = await supabase.from('addresses').select(COLS)
      .eq('user_id', profile.id).order('is_primary', { ascending: false }).order('created_at', { ascending: false });
    if (isStale?.()) return;
    if (error) { $('#adList').innerHTML = ''; showAlert(error.message || 'Gagal memuat alamat.'); return; }
    items = data ?? [];
    paint();
  }

  // ---------- Form tambah / ubah ----------
  function openForm(existing = null) {
    const a = existing;
    const node = document.createElement('form');
    node.className = 'ad-form';
    node.noValidate = true;
    node.innerHTML = `
      <div class="field">
        <label class="label" for="afLabel">Label alamat <span class="req">*</span></label>
        <input class="input" id="afLabel" maxlength="30" placeholder="Rumah, Kantor, Kos…" value="${esc(a?.label ?? (items.length ? '' : 'Rumah'))}">
        <span class="field-error" data-e="label"></span>
      </div>
      <div class="row2">
        <div class="field">
          <label class="label" for="afName">Nama penerima <span class="req">*</span></label>
          <input class="input" id="afName" maxlength="80" autocomplete="name" value="${esc(a?.recipient_name ?? profile.full_name ?? '')}">
          <span class="field-error" data-e="name"></span>
        </div>
        <div class="field">
          <label class="label" for="afPhone">Nomor HP penerima <span class="req">*</span></label>
          <input class="input" id="afPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="08xx" value="${esc(a?.recipient_phone ?? '')}">
          <span class="field-error" data-e="phone"></span>
        </div>
      </div>
      <div class="field">
        <label class="label" for="afArea">Kelurahan / kecamatan / kota <span class="req">*</span></label>
        <div id="afAreaBox"></div>
        <span class="field-error" data-e="area"></span>
      </div>
      <div class="field">
        <label class="label" for="afLine">Alamat lengkap <span class="req">*</span></label>
        <textarea class="input" id="afLine" rows="3" maxlength="300" placeholder="Jalan, nomor rumah, RT/RW, patokan">${esc(a?.address_line ?? '')}</textarea>
        <span class="field-error" data-e="line"></span>
      </div>
      <div class="field">
        <label class="label" for="afPost">Kode pos</label>
        <input class="input" id="afPost" inputmode="numeric" maxlength="5" placeholder="5 angka" value="${esc(a?.postal_code ?? '')}">
        <span class="field-error" data-e="post"></span>
      </div>
      <div class="ad-foot">
        <button class="btn btn-primary" id="afSave" type="submit">Simpan</button>
        <button class="btn btn-secondary" id="afCancel" type="button">Batal</button>
      </div>`;

    const dlg = openDialog({ title: a ? 'Ubah alamat' : 'Tambah alamat', node });
    const q = (s) => node.querySelector(s);
    const setE = (k, t) => { q(`[data-e="${k}"]`).textContent = t; };
    const picker = mountAreaPicker({
      root: q('#afAreaBox'),
      value: a ? { id: a.destination_area_id, label: a.area_label } : null,
      inputId: 'afArea',
    });
    q('#afCancel').addEventListener('click', () => { picker.destroy(); dlg.close(); });

    node.addEventListener('submit', async (e) => {
      e.preventDefault();
      ['label', 'name', 'phone', 'area', 'line', 'post'].forEach((k) => setE(k, ''));
      const label = q('#afLabel').value.trim();
      const name = q('#afName').value.trim();
      const phone = q('#afPhone').value.replace(/[\s-]/g, '');
      const line = q('#afLine').value.trim();
      const post = q('#afPost').value.trim();
      const area = picker.get();

      let bad = false;
      if (!label) { setE('label', 'Label wajib diisi.'); bad = true; }
      if (!name) { setE('name', 'Nama penerima wajib diisi.'); bad = true; }
      if (!PHONE_RE.test(phone)) { setE('phone', 'Nomor HP tidak valid (9–15 angka).'); bad = true; }
      if (!area) { setE('area', 'Pilih area dari hasil pencarian.'); bad = true; }
      if (line.length < 5) { setE('line', 'Alamat lengkap minimal 5 karakter.'); bad = true; }
      if (post && !/^\d{5}$/.test(post)) { setE('post', 'Kode pos harus 5 angka.'); bad = true; }
      if (bad) return;

      const payload = {
        label, recipient_name: name, recipient_phone: phone,
        destination_area_id: area.id, area_label: area.label ?? '',
        address_line: line, postal_code: post || null,
      };
      await withLoading(q('#afSave'), async () => {
        const { error } = a
          ? await supabase.from('addresses').update(payload).eq('id', a.id)
          : await supabase.from('addresses').insert({ ...payload, user_id: profile.id });
        if (error) { toast(/Maksimal 10/.test(error.message) ? 'Maksimal 10 alamat.' : (error.message || 'Gagal menyimpan alamat.'), 'error'); return; }
        picker.destroy(); dlg.close();
        toast(a ? 'Alamat diperbarui.' : 'Alamat ditambahkan.', 'success');
        await load();
      }, 'Menyimpan…');
    });
  }

  function confirmDelete(a) {
    const node = document.createElement('div');
    node.innerHTML = `
      <p style="margin:0 0 1rem;font-size:14px;line-height:1.5">Hapus alamat <b>${esc(a.label)}</b> (${esc(a.recipient_name)})?${a.is_primary && items.length > 1 ? ' Alamat terbaru lainnya akan otomatis jadi alamat utama.' : ''}</p>
      <div class="ad-foot">
        <button class="btn btn-danger" id="dlYes" type="button">Hapus</button>
        <button class="btn btn-secondary" id="dlNo" type="button">Batal</button>
      </div>`;
    const dlg = openDialog({ title: 'Hapus alamat', node });
    node.querySelector('#dlNo').addEventListener('click', dlg.close);
    node.querySelector('#dlYes').addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
      const { error } = await supabase.from('addresses').delete().eq('id', a.id);
      if (error) { toast(error.message || 'Gagal menghapus.', 'error'); return; }
      dlg.close(); toast('Alamat dihapus.', 'success'); await load();
    }, 'Menghapus…'));
  }

  $('#adAdd').addEventListener('click', () => openForm());
  $('#adList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const a = items.find((x) => x.id === btn.closest('[data-id]').dataset.id);
    if (!a) return;
    if (btn.dataset.act === 'edit') openForm(a);
    else if (btn.dataset.act === 'del') confirmDelete(a);
    else if (btn.dataset.act === 'primary') {
      await withLoading(btn, async () => {
        const { error } = await supabase.rpc('set_primary_address', { p_id: a.id });
        if (error) { toast(error.message || 'Gagal menetapkan alamat utama.', 'error'); return; }
        toast('Alamat utama diubah.', 'success');
        await load();
      }, 'Menyimpan…');
    }
  });

  await load();
}
