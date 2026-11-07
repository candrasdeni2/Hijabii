-- 010_customer_complete_order.sql
-- Customer menekan "Pesanan Diterima": Dikirim -> Selesai.
-- Aman dijalankan sendiri: hanya menambah satu fungsi, tidak mengubah trigger yang ada.
-- Trigger orders_before_update (001) sudah mengizinkan Dikirim -> Selesai dan mengisi completed_at.

create or replace function public.complete_my_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;

  select * into o from public.orders
   where id = p_order
     and customer_id = auth.uid()
     and public.auth_role() = 'customer'
   for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;

  if o.status <> 'dikirim' then
    raise exception 'Hanya pesanan Dikirim yang bisa dikonfirmasi diterima (status sekarang: %)', o.status;
  end if;

  update public.orders set status = 'selesai' where id = p_order;
end $$;

revoke all on function public.complete_my_order(uuid) from public, anon;
grant execute on function public.complete_my_order(uuid) to authenticated;
