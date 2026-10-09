-- Keluarkan semua sesi user (dipakai Edge Function akun). Hanya service_role.
create or replace function public.revoke_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user;  -- refresh_tokens ikut terhapus (cascade)
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
