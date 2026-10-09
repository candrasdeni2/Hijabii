-- =====================================================================
-- Hijabii by Intan — rls.sql (V1)
-- Acuan: PRD v1.2, fitur.md, rulesapp.md, schema.sql
--
-- Lapisan akses database:
--   1. Row Level Security (RLS) + kebijakan per tabel
--   2. RPC (place_order, cancel_order, alur admin, dsb.)
--   3. View & fungsi laporan
--   4. Hak akses (GRANT/REVOKE) sebagai lapisan pengaman kedua
--   5. Pemeriksaan akhir
--
-- CARA PAKAI
--   Jalankan SETELAH schema.sql (tabel, enum, trigger, dan fungsi internal
--   private.create_order / private.create_invoice harus sudah ada).
--   File ini idempotent: aman dijalankan berulang (create or replace,
--   drop policy if exists). Bagian 9 dan 10 di schema.sql menjadi redundan;
--   bila keduanya dijalankan, versi di file inilah yang berlaku.
--
-- PRINSIP
--   - Customer: hanya data miliknya. Tidak ada INSERT/UPDATE langsung ke
--     pesanan; semua lewat RPC (harga dihitung server).
--   - Admin: operasional harian. Disarankan memakai RPC admin_*; UPDATE
--     langsung ke orders tetap diizinkan RLS tetapi dijaga trigger.
--   - Super Admin: pengawas. TIDAK punya akses ke produk dan pesanan.
--     Laporan lewat view report_lines (tanpa alamat, nomor, dan ongkir).
-- =====================================================================


-- =====================================================================
-- 1. ROW LEVEL SECURITY
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'categories', 'products', 'product_colors', 'product_color_images',
    'product_variants', 'lookbooks', 'faqs', 'settings', 'cart_items',
    'orders', 'order_items', 'invoices', 'order_status_history', 'reviews',
    'notifications', 'push_subscriptions', 'activity_logs', 'storage_delete_queue'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 1.1 profiles
--   Customer/admin: baca dan ubah profil sendiri (kolom sensitif dijaga
--   trigger profiles_protect). Super admin: baca semua, ubah is_active.
--   INSERT/DELETE hanya lewat trigger auth atau Edge Function (service_role).
--   Catatan: super admin membaca kolom phone/address di profiles karena
--   butuh daftar user. Bila ingin disembunyikan, sediakan view daftar user
--   tanpa kolom tersebut.
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_super on public.profiles;
drop policy if exists profiles_update_own   on public.profiles;
drop policy if exists profiles_update_super on public.profiles;

create policy profiles_select_own   on public.profiles for select
  using (id = auth.uid());
create policy profiles_select_super on public.profiles for select
  using (public.is_super_admin());
create policy profiles_update_own   on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_super on public.profiles for update
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- 1.2 Katalog: publik membaca yang aktif, admin mengelola semua
-- ---------------------------------------------------------------------
drop policy if exists categories_read  on public.categories;
drop policy if exists categories_admin on public.categories;
create policy categories_read  on public.categories for select using (true);
create policy categories_admin on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read  on public.products;
drop policy if exists products_admin on public.products;
create policy products_read  on public.products for select
  using (status = 'active' or public.is_admin());
create policy products_admin on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- Sub-tabel mengikuti visibilitas produk (subquery tunduk pada RLS products)
drop policy if exists colors_read  on public.product_colors;
drop policy if exists colors_admin on public.product_colors;
create policy colors_read  on public.product_colors for select
  using (exists (select 1 from public.products p where p.id = product_colors.product_id));
create policy colors_admin on public.product_colors for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists color_images_read  on public.product_color_images;
drop policy if exists color_images_admin on public.product_color_images;
create policy color_images_read  on public.product_color_images for select
  using (exists (select 1 from public.product_colors c where c.id = product_color_images.color_id));
create policy color_images_admin on public.product_color_images for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists variants_read  on public.product_variants;
drop policy if exists variants_admin on public.product_variants;
create policy variants_read  on public.product_variants for select
  using (exists (select 1 from public.products p where p.id = product_variants.product_id));
create policy variants_admin on public.product_variants for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 1.3 Konten & pengaturan
--   settings dibaca publik (nomor WA, info bayar tampil di checkout/invoice),
--   hanya admin yang boleh mengubah. Satu baris (singleton): tanpa INSERT/DELETE.
-- ---------------------------------------------------------------------
drop policy if exists lookbooks_read  on public.lookbooks;
drop policy if exists lookbooks_admin on public.lookbooks;
create policy lookbooks_read  on public.lookbooks for select
  using (is_active or public.is_admin());
create policy lookbooks_admin on public.lookbooks for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists faqs_read  on public.faqs;
drop policy if exists faqs_admin on public.faqs;
create policy faqs_read  on public.faqs for select
  using (is_active or public.is_admin());
create policy faqs_admin on public.faqs for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read  on public.settings;
drop policy if exists settings_admin on public.settings;
create policy settings_read  on public.settings for select using (true);
create policy settings_admin on public.settings for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 1.4 Keranjang: hanya milik sendiri, hanya customer, hanya varian yang
--     terlihat (varian produk draft/arsip tidak bisa dimasukkan)
-- ---------------------------------------------------------------------
drop policy if exists cart_own    on public.cart_items;
drop policy if exists cart_select on public.cart_items;
drop policy if exists cart_insert on public.cart_items;
drop policy if exists cart_update on public.cart_items;
drop policy if exists cart_delete on public.cart_items;

create policy cart_select on public.cart_items for select
  using (user_id = auth.uid());
create policy cart_insert on public.cart_items for insert
  with check (
    user_id = auth.uid()
    and public.auth_role() = 'customer'
    and exists (select 1 from public.product_variants v where v.id = cart_items.variant_id)
  );
create policy cart_update on public.cart_items for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.product_variants v where v.id = cart_items.variant_id)
  );
create policy cart_delete on public.cart_items for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 1.5 Pesanan
--   Customer: baca pesanan sendiri. Admin: baca dan ubah semua.
--   Super admin: TIDAK ada policy (tidak bisa melihat pesanan sama sekali).
--   Tidak ada policy INSERT/DELETE: pesanan dibuat lewat RPC.
--   Invoice dan riwayat status hanya ditulis fungsi/trigger.
-- ---------------------------------------------------------------------
drop policy if exists orders_select       on public.orders;
drop policy if exists orders_admin_update on public.orders;
create policy orders_select on public.orders for select
  using (customer_id = auth.uid() or public.is_admin());
create policy orders_admin_update on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

-- Subquery ke orders tunduk pada RLS orders, jadi item/invoice/riwayat
-- otomatis mengikuti: customer hanya melihat miliknya.
drop policy if exists order_items_select on public.order_items;
drop policy if exists order_items_admin  on public.order_items;
create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy order_items_admin on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select
  using (exists (select 1 from public.orders o where o.id = invoices.order_id));

drop policy if exists history_select on public.order_status_history;
create policy history_select on public.order_status_history for select
  using (exists (select 1 from public.orders o where o.id = order_status_history.order_id));

-- ---------------------------------------------------------------------
-- 1.6 Ulasan
--   Publik membaca lewat view product_reviews_public (nama depan saja).
--   Customer: tulis hanya untuk pesanan Selesai miliknya (can_review),
--   ubah/hapus miliknya. Admin: baca semua, sembunyikan/tampilkan, hapus.
--   Pembagian kolom yang boleh diubah dijaga trigger reviews_guard.
-- ---------------------------------------------------------------------
drop policy if exists reviews_select_own   on public.reviews;
drop policy if exists reviews_select_admin on public.reviews;
drop policy if exists reviews_insert       on public.reviews;
drop policy if exists reviews_update_own   on public.reviews;
drop policy if exists reviews_delete_own   on public.reviews;
drop policy if exists reviews_update_admin on public.reviews;
drop policy if exists reviews_delete_admin on public.reviews;

create policy reviews_select_own   on public.reviews for select using (user_id = auth.uid());
create policy reviews_select_admin on public.reviews for select using (public.is_admin());
create policy reviews_insert       on public.reviews for insert
  with check (user_id = auth.uid() and public.can_review(order_id, product_id));
create policy reviews_update_own   on public.reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete_own   on public.reviews for delete using (user_id = auth.uid());
create policy reviews_update_admin on public.reviews for update
  using (public.is_admin()) with check (public.is_admin());
create policy reviews_delete_admin on public.reviews for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 1.7 Notifikasi, push, log aktivitas, antrean hapus file
-- ---------------------------------------------------------------------
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- user hanya boleh mengubah kolom is_read
revoke update on public.notifications from authenticated;
grant  update (is_read) on public.notifications to authenticated;

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs for select
  using (public.is_super_admin());

-- storage_delete_queue: RLS aktif TANPA policy -> hanya service_role

-- ---------------------------------------------------------------------
-- 1.8 Storage bucket 'hijabii-images': baca publik, tulis hanya admin
-- ---------------------------------------------------------------------
drop policy if exists "hijabii images read"   on storage.objects;
drop policy if exists "hijabii images insert" on storage.objects;
drop policy if exists "hijabii images update" on storage.objects;
drop policy if exists "hijabii images delete" on storage.objects;

create policy "hijabii images read"   on storage.objects for select
  using (bucket_id = 'hijabii-images');
create policy "hijabii images insert" on storage.objects for insert
  with check (bucket_id = 'hijabii-images' and public.is_admin());
create policy "hijabii images update" on storage.objects for update
  using (bucket_id = 'hijabii-images' and public.is_admin());
create policy "hijabii images delete" on storage.objects for delete
  using (bucket_id = 'hijabii-images' and public.is_admin());


-- =====================================================================
-- 2. RPC
--    Semua fungsi SECURITY DEFINER memeriksa peran sendiri di dalam
--    fungsi (is_admin / auth_role), bukan mengandalkan GRANT saja.
-- =====================================================================

-- Helper internal: pastikan pemanggil admin, lalu kunci baris pesanan.
create or replace function private.admin_lock_order(p_order uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  return o;
end $$;

-- ---------------------------------------------------------------------
-- 2.1 CUSTOMER
-- ---------------------------------------------------------------------

-- Customer menekan "Pesan". Harga dihitung server dari katalog; stok
-- dikunci; invoice revisi 0 dibuat; keranjang dibersihkan.
create or replace function public.place_order(
  p_recipient_name text, p_recipient_phone text, p_shipping_address text,
  p_courier courier_type, p_shipping_cost integer,
  p_shipping_pay_method shipping_pay_method, p_product_pay_method product_pay_method,
  p_items jsonb,
  p_shipping_city text default null, p_shipping_postal_code text default null,
  p_destination_area_id text default null, p_courier_service text default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public, private as $$
declare v_order uuid;
begin
  if auth.uid() is null or public.auth_role() is distinct from 'customer' then
    raise exception 'Hanya customer yang bisa membuat pesanan sendiri';
  end if;

  v_order := private.create_order(auth.uid(), 'website', auth.uid(),
    p_recipient_name, p_recipient_phone, p_shipping_address, p_courier, p_shipping_cost,
    p_shipping_pay_method, p_product_pay_method, p_items,
    p_shipping_city, p_shipping_postal_code, p_destination_area_id, p_courier_service, p_note);

  delete from public.cart_items
   where user_id = auth.uid()
     and variant_id in (select (value ->> 'variant_id')::uuid from jsonb_array_elements(p_items));
  return v_order;
end $$;

-- Pembatalan oleh customer ATAU admin (satu pintu).
--   Customer : hanya pesanan sendiri, hanya sebelum Diproses, wajib pilih
--              salah satu dari tiga alasan.
--   Admin    : pesanan apa pun yang belum Dikirim, alasan otomatis
--              'dibatalkan_admin', catatan (p_note) wajib.
-- Stok dikembalikan dan notifikasi dikirim oleh trigger orders.
create or replace function public.cancel_order(
  p_order uuid,
  p_reason cancel_reason default null,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_admin boolean; v_reason cancel_reason; v_note text;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  v_admin := public.is_admin();

  select * into o from public.orders
   where id = p_order
     and (v_admin or (customer_id = auth.uid() and public.auth_role() = 'customer'))
   for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;

  if v_admin then
    if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi', 'diproses') then
      raise exception 'Pesanan berstatus % tidak bisa dibatalkan', o.status;
    end if;
    v_note := btrim(coalesce(p_note, ''));
    if v_note = '' then raise exception 'Alasan pembatalan oleh admin wajib dicatat'; end if;
    v_reason := 'dibatalkan_admin';
  else
    if p_reason is null or p_reason not in ('salah_pilih_produk', 'salah_alamat', 'berubah_pikiran') then
      raise exception 'Pilih salah satu alasan pembatalan';
    end if;
    if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi') then
      raise exception 'Pesanan sudah diproses dan tidak bisa dibatalkan lewat website';
    end if;
    v_reason := p_reason;
    v_note := null;
  end if;

  update public.orders
     set status = 'dibatalkan', cancel_reason = v_reason, cancel_note = v_note
   where id = p_order;
end $$;

-- Alias lama (dipakai schema.sql dan dokumen): pembatalan oleh customer.
create or replace function public.cancel_my_order(p_order uuid, p_reason cancel_reason)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.cancel_order(p_order, p_reason, null);
end $$;

-- Tutup kewajiban ganti password / banner (dipanggil setelah user ganti password)
create or replace function public.clear_password_flags()
returns void language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

create or replace function public.dismiss_password_notice()
returns void language sql security definer set search_path = public as $$
  update public.profiles set password_reset_notice_at = null where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 2.2 ADMIN: membuat dan mengubah pesanan
-- ---------------------------------------------------------------------

-- Pesanan manual (pre-order / lewat chat). Tanpa akun customer. Item boleh
-- membawa unit_price, discount_type, discount_value.
create or replace function public.admin_create_order(
  p_recipient_name text, p_recipient_phone text, p_shipping_address text,
  p_courier courier_type, p_shipping_cost integer,
  p_shipping_pay_method shipping_pay_method, p_product_pay_method product_pay_method,
  p_items jsonb,
  p_shipping_city text default null, p_shipping_postal_code text default null,
  p_destination_area_id text default null, p_courier_service text default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang bisa membuat pesanan manual';
  end if;
  return private.create_order(null, 'admin', auth.uid(),
    p_recipient_name, p_recipient_phone, p_shipping_address, p_courier, p_shipping_cost,
    p_shipping_pay_method, p_product_pay_method, p_items,
    p_shipping_city, p_shipping_postal_code, p_destination_area_id, p_courier_service, p_note);
end $$;

-- Edit invoice dalam satu langkah atomik: ubah item, ongkir, ekspedisi,
-- lalu generate revisi baru dan set status Direvisi Admin.
--   p_items: [{"id": "<order_item_id>", "qty": 3, "unit_price": 40000,
--              "discount_type": "percent", "discount_value": 10,
--              "remove": false}, ...]  (semua field selain id opsional)
-- Stok disesuaikan otomatis oleh trigger order_items_guard.
-- Hanya sebelum Diproses. Mengembalikan id invoice revisi baru.
create or replace function public.admin_edit_order(
  p_order uuid,
  p_items jsonb default null,
  p_shipping_cost integer default null,
  p_courier courier_type default null,
  p_courier_service text default null
) returns uuid language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype; it jsonb; v_item_id uuid; v_left integer; v_inv uuid;
begin
  o := private.admin_lock_order(p_order);
  if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi') then
    raise exception 'Pesanan berstatus % terkunci dan tidak bisa diedit', o.status;
  end if;
  if p_items is null and p_shipping_cost is null and p_courier is null and p_courier_service is null then
    raise exception 'Tidak ada perubahan yang diberikan';
  end if;

  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then raise exception 'p_items harus berupa array'; end if;
    for it in select value from jsonb_array_elements(p_items) loop
      select id into v_item_id from public.order_items
       where id = (it ->> 'id')::uuid and order_id = p_order;
      if not found then raise exception 'Item tidak ditemukan pada pesanan ini'; end if;

      if coalesce((it ->> 'remove')::boolean, false) then
        delete from public.order_items where id = v_item_id;
      else
        update public.order_items set
          qty            = coalesce((it ->> 'qty')::integer, qty),
          unit_price     = coalesce((it ->> 'unit_price')::integer, unit_price),
          discount_type  = coalesce((it ->> 'discount_type')::discount_type, discount_type),
          discount_value = coalesce((it ->> 'discount_value')::integer, discount_value)
         where id = v_item_id;
      end if;
    end loop;

    select count(*) into v_left from public.order_items where order_id = p_order;
    if v_left = 0 then raise exception 'Pesanan harus memiliki minimal satu item'; end if;
  end if;

  update public.orders
     set shipping_cost   = coalesce(p_shipping_cost, shipping_cost),
         courier         = coalesce(p_courier, courier),
         courier_service = coalesce(p_courier_service, courier_service)
   where id = p_order;

  v_inv := private.create_invoice(p_order, auth.uid());
  if o.status <> 'direvisi_admin' then
    update public.orders set status = 'direvisi_admin' where id = p_order;
  end if;
  return v_inv;
end $$;

-- Generate ulang invoice tanpa mengubah data (mis. setelah edit langsung)
create or replace function public.revise_invoice(p_order uuid)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype; v_inv uuid;
begin
  o := private.admin_lock_order(p_order);
  if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi') then
    raise exception 'Invoice tidak bisa direvisi setelah Diproses';
  end if;
  v_inv := private.create_invoice(p_order, auth.uid());
  if o.status <> 'direvisi_admin' then
    update public.orders set status = 'direvisi_admin' where id = p_order;
  end if;
  return v_inv;
end $$;

-- Perpanjang time-out stok per pesanan (sebelum Diproses)
create or replace function public.admin_extend_timeout(p_order uuid, p_hours integer)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_new timestamptz;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  if p_hours is null or p_hours <= 0 then raise exception 'Durasi tidak valid'; end if;
  update public.orders
     set expires_at = greatest(expires_at, now()) + make_interval(hours => p_hours)
   where id = p_order and status in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi')
  returning expires_at into v_new;
  if v_new is null then raise exception 'Time-out hanya bisa diperpanjang sebelum Diproses'; end if;
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- 2.3 ADMIN: alur status pesanan
--     Menunggu Konfirmasi / Direvisi Admin -> Dikonfirmasi -> Diproses
--     -> Dikirim -> Selesai   (batal: cancel_order)
-- ---------------------------------------------------------------------

-- Invoice final disepakati dengan customer (via WhatsApp)
create or replace function public.admin_confirm_order(p_order uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype;
begin
  o := private.admin_lock_order(p_order);
  if o.status not in ('menunggu_konfirmasi', 'direvisi_admin') then
    raise exception 'Hanya pesanan Menunggu Konfirmasi/Direvisi Admin yang bisa dikonfirmasi (status sekarang: %)', o.status;
  end if;
  update public.orders set status = 'dikonfirmasi' where id = p_order;
end $$;

-- Verifikasi bukti bayar: tandai Lunas sekaligus ubah status ke Diproses.
-- Setelah ini data pesanan terkunci.
create or replace function public.admin_verify_payment(p_order uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype;
begin
  o := private.admin_lock_order(p_order);
  if o.status <> 'dikonfirmasi' then
    raise exception 'Pesanan harus Dikonfirmasi dulu sebelum pembayaran diverifikasi (status sekarang: %)', o.status;
  end if;
  update public.orders set payment_status = 'lunas', status = 'diproses' where id = p_order;
end $$;

-- Serahkan ke kurir: kurir dan nomor resi wajib diisi
create or replace function public.admin_ship_order(p_order uuid, p_courier text, p_tracking_no text)
returns void language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype;
begin
  o := private.admin_lock_order(p_order);
  if o.status <> 'diproses' then
    raise exception 'Hanya pesanan Diproses yang bisa dikirim (status sekarang: %)', o.status;
  end if;
  if coalesce(btrim(p_courier), '') = '' or coalesce(btrim(p_tracking_no), '') = '' then
    raise exception 'Kurir dan nomor resi wajib diisi';
  end if;
  update public.orders
     set tracking_courier = btrim(p_courier), tracking_no = btrim(p_tracking_no), status = 'dikirim'
   where id = p_order;
end $$;

-- Barang sudah diterima customer
create or replace function public.admin_complete_order(p_order uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype;
begin
  o := private.admin_lock_order(p_order);
  if o.status <> 'dikirim' then
    raise exception 'Hanya pesanan Dikirim yang bisa diselesaikan (status sekarang: %)', o.status;
  end if;
  update public.orders set status = 'selesai' where id = p_order;
end $$;

-- ---------------------------------------------------------------------
-- 2.4 SISTEM: time-out otomatis (dijadwalkan pg_cron, bukan dari API)
-- ---------------------------------------------------------------------
create or replace function public.expire_overdue_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.orders
     set status = 'kedaluwarsa'
   where status in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi')
     and payment_status = 'belum_dibayar'
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;


-- =====================================================================
-- 3. VIEW & FUNGSI LAPORAN (Admin dan Super Admin)
--    Aturan (rulesapp.md bagian 16):
--    - hanya pesanan final: Selesai dan Dibatalkan (Kedaluwarsa dihitung Dibatalkan)
--    - periode dari tanggal selesai/dibatalkan, zona WIB, minggu mulai Senin
--    - nilai produk = line_total setelah diskon, TANPA ongkir
--    - filter kategori/produk hanya menghitung baris item yang cocok
--    - TIDAK menampilkan ongkir, alamat, dan nomor customer
-- =====================================================================

-- View dasar: satu baris per item pesanan final. Dijalankan dengan hak
-- pemilik view (melewati RLS orders) sehingga super admin bisa membaca
-- laporan tanpa akses ke tabel pesanan; akses dibatasi oleh WHERE di
-- bawah. security_barrier mencegah filter pemanggil bocor sebelum WHERE.
create or replace view public.report_lines with (security_barrier = true) as
select o.id                                              as order_id,
       o.order_no,
       f.final_at,
       (f.final_at at time zone 'Asia/Jakarta')::date    as final_date,
       o.recipient_name                                  as customer_name,
       case when o.status = 'selesai' then 'selesai' else 'dibatalkan' end as report_status,
       o.status                                          as order_status,   -- membedakan Kedaluwarsa
       o.cancel_reason                                   as reason,
       oi.id                                             as item_id,
       oi.product_id,
       p.category_id,
       oi.product_name,
       oi.color_name,
       oi.size,
       oi.qty,
       oi.line_total
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.products p on p.id = oi.product_id
cross join lateral (
  select case when o.status = 'selesai' then o.completed_at else o.cancelled_at end as final_at
) f
where (public.is_admin() or public.is_super_admin())
  and o.status in ('selesai', 'dibatalkan', 'kedaluwarsa');

-- Rentang tanggal untuk filter Hari / Minggu / Bulan / Tahun (WIB, minggu mulai Senin)
create or replace function public.report_period(p_period text, p_ref date default null)
returns table (date_from date, date_to date)
language plpgsql stable as $$
declare d date := coalesce(p_ref, (now() at time zone 'Asia/Jakarta')::date);
begin
  case lower(p_period)
    when 'hari'   then date_from := d;                                   date_to := d;
    when 'minggu' then date_from := date_trunc('week',  d::timestamp)::date;
                       date_to   := date_from + 6;
    when 'bulan'  then date_from := date_trunc('month', d::timestamp)::date;
                       date_to   := (date_from + interval '1 month - 1 day')::date;
    when 'tahun'  then date_from := date_trunc('year',  d::timestamp)::date;
                       date_to   := (date_from + interval '1 year - 1 day')::date;
    else raise exception 'Periode tidak dikenal: % (hari | minggu | bulan | tahun)', p_period;
  end case;
  return next;
end $$;

-- Tabel laporan: satu baris per pesanan.
--   p_status: 'semua' | 'selesai' | 'dibatalkan'
create or replace function public.report_orders(
  p_from date, p_to date,
  p_status text default 'semua',
  p_category_id uuid default null,
  p_product_id uuid default null
) returns table (
  order_id      uuid,
  order_no      text,
  final_date    date,
  customer_name text,
  products      text,
  total_qty     bigint,
  product_value bigint,
  report_status text,
  reason        cancel_reason
) language sql stable as $$
  select l.order_id,
         l.order_no,
         l.final_date,
         l.customer_name,
         string_agg(l.product_name || ' ' || l.color_name || '/' || l.size || ' x' || l.qty,
                    ', ' order by l.product_name, l.color_name, l.size),
         sum(l.qty)::bigint,
         sum(l.line_total)::bigint,
         l.report_status,
         l.reason
  from public.report_lines l
  where l.final_date between p_from and p_to
    and (p_status = 'semua' or p_status = l.report_status)
    and (p_category_id is null or l.category_id = p_category_id)
    and (p_product_id  is null or l.product_id  = p_product_id)
  group by l.order_id, l.order_no, l.final_date, l.customer_name,
           l.report_status, l.reason, l.final_at
  order by l.final_at, l.order_no
$$;

-- Ringkasan: jumlah dan nilai per kelompok status + rincian alasan batal
create or replace function public.report_summary(
  p_from date, p_to date,
  p_status text default 'semua',
  p_category_id uuid default null,
  p_product_id uuid default null
) returns table (report_status text, reason cancel_reason, order_count bigint, total_value bigint)
language sql stable as $$
  select r.report_status, r.reason, count(*), coalesce(sum(r.product_value), 0)::bigint
  from public.report_orders(p_from, p_to, p_status, p_category_id, p_product_id) r
  group by r.report_status, r.reason
$$;


-- =====================================================================
-- 4. HAK AKSES (GRANT / REVOKE) — lapisan pengaman kedua di bawah RLS
-- =====================================================================

-- 4.1 EXECUTE fungsi: hanya user login. Fungsi sistem: hanya service_role/pg_cron.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'place_order', 'cancel_order', 'cancel_my_order',
        'clear_password_flags', 'dismiss_password_notice',
        'admin_create_order', 'admin_edit_order', 'revise_invoice', 'admin_extend_timeout',
        'admin_confirm_order', 'admin_verify_payment', 'admin_ship_order', 'admin_complete_order',
        'report_period', 'report_orders', 'report_summary',
        'expire_overdue_orders'
      ])
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    if f.proname = 'expire_overdue_orders' then
      execute format('revoke all on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- 4.2 Schema private: tidak bisa dipakai lewat API
revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- 4.3 Tabel: anon tidak boleh menyentuh data pribadi/transaksi
revoke all on
  public.profiles, public.cart_items, public.orders, public.order_items,
  public.invoices, public.order_status_history, public.reviews,
  public.notifications, public.push_subscriptions, public.activity_logs,
  public.storage_delete_queue
from anon;

-- anon hanya membaca katalog dan konten, tidak menulis
revoke insert, update, delete on
  public.categories, public.products, public.product_colors,
  public.product_color_images, public.product_variants,
  public.lookbooks, public.faqs, public.settings
from anon;

-- Tabel yang hanya ditulis RPC/trigger/service_role: tutup tulis langsung
revoke insert, delete on public.orders, public.profiles, public.notifications, public.settings from authenticated;
revoke insert, update, delete on public.invoices, public.order_status_history, public.activity_logs from authenticated;
revoke all on public.storage_delete_queue from authenticated;

-- 4.4 View
revoke all on public.report_lines from anon;
grant select on public.report_lines to authenticated;
revoke all on public.order_totals from anon;
grant select on public.product_reviews_public, public.product_rating_stats to anon, authenticated;


-- =====================================================================
-- 5. PEMERIKSAAN AKHIR
--    Gagal (exception) bila ada tabel di schema public tanpa RLS.
-- =====================================================================
do $$
declare t text;
begin
  select string_agg(tablename, ', ') into t
    from pg_tables
   where schemaname = 'public' and not rowsecurity;
  if t is not null then
    raise exception 'Tabel tanpa RLS: %', t;
  end if;
end $$;
