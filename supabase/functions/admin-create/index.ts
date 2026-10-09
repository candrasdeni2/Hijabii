import { handle, strictKeys } from '../_shared/http.ts';
import { HttpError } from '../_shared/auth.ts';
import { checkPassword, generatePassword } from '../_shared/password.ts';

handle(['super_admin'], async ({ body, admin, user }) => {
  strictKeys(body, ['email', 'full_name', 'phone', 'temp_password']);
  const email = String(body.email ?? '').trim().toLowerCase();
  const full_name = String(body.full_name ?? '').trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new HttpError(422, 'invalid_input', 'Email tidak valid.');
  if (full_name.length < 2 || full_name.length > 100)
    throw new HttpError(422, 'invalid_input', 'Nama harus 2 sampai 100 karakter.');
  const temp = body.temp_password ? checkPassword(body.temp_password) : generatePassword();

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: temp, email_confirm: true, user_metadata: { full_name, phone },
  });
  if (error || !created.user) {
    if (/already|registered|exists/i.test(error?.message ?? ''))
      throw new HttpError(409, 'email_taken', 'Email sudah dipakai.');
    console.error('createUser failed:', error?.message);
    throw new HttpError(500, 'internal', 'Gagal membuat akun.');
  }
  const uid = created.user.id;

  // trigger handle_new_user membuat profil customer -> naikkan jadi admin
  const { error: upErr } = await admin.from('profiles')
    .update({ role: 'admin', must_change_password: true }).eq('id', uid);
  if (upErr) {
    await admin.auth.admin.deleteUser(uid); // rollback agar tidak tertinggal akun customer
    console.error('promote failed:', upErr.message);
    throw new HttpError(500, 'internal', 'Gagal membuat akun admin.');
  }

  await admin.from('activity_logs').insert({
    actor_id: user.id, action: 'admin_created', target_type: 'profile', target_id: uid, meta: {},
  });
  return { user_id: uid, temp_password: temp }; // tampil sekali
});
