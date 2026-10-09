-- =====================================================================
-- Hijabii by Intan — schema.sql (V1)
-- Acuan: PRD v1.2, fitur.md, rulesapp.md
-- Target: Supabase (PostgreSQL 15+). Jalankan di SQL Editor pada project BARU
-- (script ini tidak idempotent: CREATE TYPE/TABLE akan gagal bila dijalankan dua kali).
--
-- Isi:
--   0. Enum & helper umum
--   1. Akun & peran (profiles)
--   2. Katalog (kategori, produk, warna, foto, varian/stok)
--   3. Konten (lookbook, FAQ, pengaturan)
--   4. Keranjang
--   5. Pesanan, item, invoice, riwayat status
--   6. Ulasan
--   7. Notifikasi, push, log aktivitas, antrean hapus file
--   8. Trigger (stok, kunci edit, transisi status, notifikasi)
--   9. RPC (place_order, cancel, revisi invoice, laporan, dsb.)
--  10. RLS (aktif di SEMUA tabel)
--  11. Storage bucket, realtime, seed, catatan operasional
-- =====================================================================


-- =====================================================================
-- 0. ENUM & HELPER UMUM
-- =====================================================================

create schema if not exists private;   -- fungsi internal, TIDAK diekspos ke API

create type user_role           as enum ('customer', 'admin', 'super_admin');
create type product_status      as enum ('draft', 'active', 'archived');
create type order_status        as enum (
  'menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi',
  'diproses', 'dikirim', 'selesai', 'dibatalkan', 'kedaluwarsa'
);
create type payment_status      as enum ('belum_dibayar', 'lunas');          -- hanya pembayaran PRODUK
create type courier_type        as enum ('pos', 'jnt', 'jne');
create type shipping_pay_method as enum ('tf', 'cod');                       -- metode bayar ONGKIR
create type product_pay_method  as enum ('dana', 'bank');                    -- metode bayar PRODUK
create type discount_type       as enum ('percent', 'nominal');
create type order_source        as enum ('website', 'admin');                -- admin = pesanan manual / pre-order
create type cancel_reason       as enum (
  'salah_pilih_produk',   -- salah memilih produk/warna/ukuran/jumlah
  'salah_alamat',         -- salah memasukkan alamat/data pengiriman
  'berubah_pikiran',      -- berubah pikiran/tidak jadi membeli
  'kedaluwarsa',          -- time-out habis (otomatis)
  'dibatalkan_admin'      -- dibatalkan admin (detail di cancel_note)
);
create type notification_type   as enum (
  'order_baru', 'invoice_direvisi', 'diproses', 'dikirim',
  'dibatalkan_customer', 'dibatalkan_admin', 'kedaluwarsa', 'password_diubah'
);

-- updated_at otomatis
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;


-- =====================================================================
-- 1. AKUN & PERAN
-- =====================================================================

create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  full_name                text        not null default '',
  email                    text,
  phone                    text,
  address                  text,
  role                     user_role   not null default 'customer',
  is_active                boolean     not null default true,
  must_change_password     boolean     not null default false,  -- diset Edge Function saat super admin ganti password
  password_reset_notice_at timestamptz,                         -- memicu banner "password diubah super admin"
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where is_active;

-- Profil dibuat otomatis saat user mendaftar (role selalu customer).
-- Admin/super admin dibuat lewat Edge Function (service key), bukan dari klien.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper peran untuk RLS. Hanya akun AKTIF yang punya peran.
create or replace function public.auth_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'super_admin', false)
$$;


-- =====================================================================
-- 2. KATALOG
-- =====================================================================

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name        text not null,
  slug        text not null unique,
  description text,
  price       integer not null check (price >= 0),               -- Rupiah
  weight_gram integer not null check (weight_gram > 0),          -- berat AKTUAL per pcs (gram); diisi admin, tanpa default agar tidak salah hitung ongkir
  status      product_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_status_idx   on public.products (status);

-- Satu produk punya banyak warna. image_path = path di bucket 'hijabii-images'.
create table public.product_colors (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name       text not null,                 -- teks, mis. "Merah"
  hex_code   text,                          -- opsional, untuk bulatan swatch
  image_path text,                          -- foto utama
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, name),
  unique (id, product_id)                   -- target FK komposit dari varian
);

-- Foto tambahan opsional per warna
create table public.product_color_images (
  id         uuid primary key default gen_random_uuid(),
  color_id   uuid not null references public.product_colors(id) on delete cascade,
  image_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_color_images_color_idx on public.product_color_images (color_id);

-- Varian = warna + ukuran, stok dicatat di sini.
-- "Ukuran untuk semua warna" = form admin membuat satu baris per warna;
-- set ukuran boleh berbeda tiap warna.
create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  color_id   uuid not null,
  size       text not null,
  stock      integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (color_id, size),
  foreign key (color_id, product_id)
    references public.product_colors (id, product_id) on delete cascade
);
create index product_variants_product_idx on public.product_variants (product_id);


-- =====================================================================
-- 3. KONTEN & PENGATURAN
-- =====================================================================

create table public.lookbooks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,                 -- mis. Campus, Office
  image_path text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Satu baris saja (singleton)
create table public.settings (
  id                    boolean primary key default true check (id),
  admin_whatsapp        text,                       -- format 62xxxxxxxxxxx
  dana_number           text,
  dana_account_name     text,
  bank_name             text,
  bank_account_number   text,
  bank_account_holder   text,
  default_timeout_hours integer not null default 24 check (default_timeout_hours > 0),
  -- Estimasi ongkir: satu asal kirim utama untuk semua produk + aturan berat kirim
  origin_area_id        text,                       -- id area asal dari API ongkir (Biteship/Komerce); wajib diisi sebelum cek ongkir dipakai
  packaging_buffer_gram integer not null default 100 check (packaging_buffer_gram >= 0),  -- tambahan berat kemasan, sekali per pesanan
  weight_round_gram     integer not null default 100 check (weight_round_gram > 0),      -- pembulatan ke atas berat kirim
  updated_at            timestamptz not null default now()
);


-- =====================================================================
-- 4. KERANJANG
-- =====================================================================

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  qty        integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, variant_id)
);


-- =====================================================================
-- 5. PESANAN
-- =====================================================================

create sequence public.order_no_seq;

create or replace function public.next_order_no()
returns text language sql as $$
  select 'HJB-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-'
         || repeat('0', greatest(4 - length(n::text), 0)) || n::text
  from (select nextval('public.order_no_seq') as n) s
$$;

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  order_no             text not null unique default public.next_order_no(),

  -- Pemilik. Pesanan manual admin: customer_id NULL, data tersimpan di kolom recipient_* (tidak masuk daftar user)
  customer_id          uuid references public.profiles(id) on delete set null,
  source               order_source not null default 'website',
  created_by           uuid references public.profiles(id) on delete set null,

  -- Data penerima (snapshot; dipakai juga sebagai "customer" di laporan)
  recipient_name       text not null,
  recipient_phone      text not null,
  shipping_address     text not null,
  shipping_city        text,
  shipping_postal_code text,
  destination_area_id  text,                       -- id area dari API ongkir (Biteship/Komerce)

  -- Pengiriman & pembayaran
  courier              courier_type not null default 'pos',   -- pilihan customer (default rekomendasi Pos)
  courier_service      text,
  shipping_cost        integer not null default 0 check (shipping_cost >= 0),
  shipping_pay_method  shipping_pay_method not null,
  product_pay_method   product_pay_method  not null,
  payment_status       payment_status not null default 'belum_dibayar',
  paid_at              timestamptz,
  paid_by              uuid references public.profiles(id) on delete set null,
  note                 text,

  -- Status & time-out
  status               order_status not null default 'menunggu_konfirmasi',
  expires_at           timestamptz not null,
  stock_held           boolean not null default true,          -- true = stok sedang dikunci oleh pesanan ini
  current_revision     integer not null default 0,

  -- Pengiriman aktual (diinput admin)
  tracking_courier     text,
  tracking_no          text,

  -- Jejak waktu
  processed_at         timestamptz,
  shipped_at           timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,                -- juga terisi untuk Kedaluwarsa
  cancel_reason        cancel_reason,
  cancel_note          text,
  cancelled_by         uuid references public.profiles(id) on delete set null,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- alasan batal terisi HANYA pada status final batal/kedaluwarsa
  constraint orders_cancel_reason_ck check (
    (status in ('dibatalkan', 'kedaluwarsa')) = (cancel_reason is not null)
  )
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_idx   on public.orders (status);
create index orders_expiry_idx   on public.orders (expires_at)
  where status in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi');
create index orders_final_idx    on public.orders (completed_at, cancelled_at);

-- Item pesanan: snapshot nama/harga supaya riwayat tetap utuh walau produk diubah/dihapus.
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  variant_id      uuid references public.product_variants(id) on delete set null,
  product_name    text not null,
  color_name      text not null,
  size            text not null,
  qty             integer not null check (qty > 0),
  unit_price      integer not null check (unit_price >= 0),
  discount_type   discount_type not null default 'nominal',
  discount_value  integer not null default 0 check (discount_value >= 0),   -- persen (0-100) atau Rupiah per baris
  -- diskon per baris item (tidak lebih dari subtotal baris)
  discount_amount integer generated always as (
    least(
      case when discount_type = 'percent' then (qty * unit_price * discount_value) / 100 else discount_value end,
      qty * unit_price
    )
  ) stored,
  -- nilai baris setelah diskon, TANPA ongkir (dasar laporan)
  line_total      integer generated always as (
    qty * unit_price - least(
      case when discount_type = 'percent' then (qty * unit_price * discount_value) / 100 else discount_value end,
      qty * unit_price
    )
  ) stored,
  created_at      timestamptz not null default now(),
  constraint order_items_percent_ck check (discount_type <> 'percent' or discount_value <= 100)
);
create index order_items_order_idx   on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index order_items_variant_idx on public.order_items (variant_id);

-- Setiap versi invoice: nomor, nomor revisi, timestamp. Isi lengkap disimpan sebagai snapshot JSON
-- sehingga invoice lama tetap bisa diunduh persis seperti saat dibuat.
create table public.invoices (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  invoice_no  text not null,                 -- sama untuk semua revisi, mis. INV-261006-0001
  revision    integer not null,              -- 0 = invoice awal, 1 = revisi ke-1, dst.
  subtotal    integer not null,              -- jumlah line_total
  shipping_cost integer not null,
  total       integer not null,
  snapshot    jsonb not null,                -- item, penerima, metode bayar, info rekening/DANA saat itu
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (order_id, revision)
);

create table public.order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id);

-- Ringkasan nilai pesanan (mengikuti RLS pemanggil)
create view public.order_totals with (security_invoker = true) as
select o.id as order_id,
       coalesce(sum(oi.line_total), 0)::integer                       as products_total,
       coalesce(sum(oi.qty), 0)::integer                              as total_qty,
       (coalesce(sum(oi.line_total), 0) + o.shipping_cost)::integer   as grand_total
from public.orders o
left join public.order_items oi on oi.order_id = o.id
group by o.id;


-- =====================================================================
-- 6. ULASAN
-- =====================================================================

create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  order_id   uuid not null references public.orders(id)   on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text check (body is null or char_length(body) <= 500),   -- tanpa foto/video
  is_visible boolean not null default true,                           -- moderasi admin
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, product_id)                                        -- satu ulasan per produk per pesanan
);
create index reviews_product_idx on public.reviews (product_id) where is_visible;

-- Boleh mengulas hanya bila: pesanan milik sendiri, berstatus Selesai, dan berisi produk tsb.
-- (pesanan manual admin tidak punya customer_id, jadi otomatis tidak bisa diulas)
create or replace function public.can_review(p_order uuid, p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = p_order
      and o.customer_id = auth.uid()
      and o.status = 'selesai'
      and oi.product_id = p_product
  )
$$;

-- Ulasan publik: nama tampil sebagian (nama depan saja). Hanya ulasan yang tampil.
create view public.product_reviews_public as
select r.id, r.product_id, r.rating, r.body, r.created_at,
       coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Pembeli') as display_name
from public.reviews r
join public.profiles p on p.id = r.user_id
where r.is_visible;

-- Rata-rata rating hanya menghitung ulasan yang tampil
create view public.product_rating_stats as
select product_id,
       round(avg(rating)::numeric, 2) as avg_rating,
       count(*)::integer              as review_count
from public.reviews
where is_visible
group by product_id;


-- =====================================================================
-- 7. NOTIFIKASI, PUSH, LOG AKTIVITAS, ANTREAN HAPUS FILE
-- =====================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       notification_type not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,     -- mis. {"order_id": "..."}
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- Langganan Web Push per perangkat
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Log aktivitas akun (tanpa password). Ditulis trigger/Edge Function, dibaca super admin.
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,          -- mis. password_changed, reset_link_sent, admin_created, user_deactivated
  target_type text,
  target_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);

-- Antrean penghapusan file di Storage. Saat produk/warna/lookbook dihapus atau fotonya diganti,
-- path lama masuk antrean; Edge Function (jadwal/webhook) menghapus file lewat Storage API
-- lalu menghapus barisnya. (Menghapus baris storage.objects lewat SQL TIDAK menghapus file fisik.)
create table public.storage_delete_queue (
  id         bigint generated always as identity primary key,
  bucket     text not null default 'hijabii-images',
  path       text not null,
  created_at timestamptz not null default now()
);


-- =====================================================================
-- 8. TRIGGER
-- =====================================================================

-- 8.1 updated_at
do $$
declare t text;
begin
  foreach t in array array['profiles','categories','products','product_variants',
                           'cart_items','reviews','settings'] loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.set_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- 8.2 Lindungi kolom sensitif profil (hanya berlaku untuk sesi user biasa;
--     Edge Function / service_role / SQL editor / RPC definer dilewati)
create or replace function public.profiles_protect()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id or new.role is distinct from old.role then
    raise exception 'Role dan id tidak bisa diubah dari klien (gunakan Edge Function)';
  end if;

  if old.id = auth.uid() then
    -- mengubah akun sendiri: hanya data diri
    if new.is_active is distinct from old.is_active
       or new.must_change_password is distinct from old.must_change_password
       or new.password_reset_notice_at is distinct from old.password_reset_notice_at then
      raise exception 'Kolom ini tidak boleh diubah sendiri';
    end if;
  else
    -- super admin mengubah akun lain: hanya is_active
    if new.full_name is distinct from old.full_name
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.address is distinct from old.address
       or new.must_change_password is distinct from old.must_change_password
       or new.password_reset_notice_at is distinct from old.password_reset_notice_at then
      raise exception 'Super admin hanya boleh mengubah status aktif akun lain';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect_trg before update on public.profiles
  for each row execute function public.profiles_protect();

-- 8.3 Catat penonaktifan/pengaktifan akun ke log aktivitas
create or replace function public.profiles_log_active()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into public.activity_logs (actor_id, action, target_type, target_id, meta)
    values (auth.uid(),
            case when new.is_active then 'user_activated' else 'user_deactivated' end,
            'profile', new.id, jsonb_build_object('role', new.role));
  end if;
  return new;
end $$;
create trigger profiles_log_active_trg after update on public.profiles
  for each row execute function public.profiles_log_active();

-- 8.4 Antrean hapus file saat foto dihapus/diganti
create or replace function public.queue_image_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_path text := to_jsonb(old) ->> 'image_path';
        new_path text := case when tg_op = 'UPDATE' then to_jsonb(new) ->> 'image_path' end;
begin
  if old_path is not null and old_path is distinct from new_path then
    insert into public.storage_delete_queue (path) values (old_path);
  end if;
  return coalesce(new, old);
end $$;
create trigger product_colors_img_trg before delete or update of image_path on public.product_colors
  for each row execute function public.queue_image_delete();
create trigger product_color_images_img_trg before delete or update of image_path on public.product_color_images
  for each row execute function public.queue_image_delete();
create trigger lookbooks_img_trg before delete or update of image_path on public.lookbooks
  for each row execute function public.queue_image_delete();

-- 8.5 Stok: dikunci saat item dibuat, disesuaikan saat admin mengubah qty,
--     dan item terkunci begitu pesanan Diproses.
--     (Pengembalian stok saat Dibatalkan/Kedaluwarsa ada di orders_before_update.)
create or replace function public.order_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select status, stock_held into o from public.orders where id = coalesce(new.order_id, old.order_id);
  if not found then            -- pesanan induk sedang dihapus (cascade)
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if new.order_id is distinct from old.order_id then
      raise exception 'order_id item tidak boleh diubah';
    end if;
    -- perubahan murni akibat FK SET NULL (produk/varian dihapus) tidak dianggap edit
    if (new.qty, new.unit_price, new.discount_type, new.discount_value)
         is not distinct from (old.qty, old.unit_price, old.discount_type, old.discount_value)
       and (new.variant_id is not distinct from old.variant_id or new.variant_id is null) then
      return new;
    end if;
  end if;

  if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi') then
    raise exception 'Item pesanan terkunci (status %)', o.status;
  end if;

  if o.stock_held then
    if tg_op in ('UPDATE', 'DELETE') and old.variant_id is not null then
      update public.product_variants set stock = stock + old.qty where id = old.variant_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.variant_id is not null then
      update public.product_variants set stock = stock - new.qty
       where id = new.variant_id and stock >= new.qty;
      if not found then
        raise exception 'Stok tidak cukup untuk % (% / %)', new.product_name, new.color_name, new.size;
      end if;
    end if;
  end if;

  return coalesce(new, old);
end $$;
create trigger order_items_guard_trg before insert or update or delete on public.order_items
  for each row execute function public.order_items_guard();

-- 8.6 Aturan pesanan: kunci data setelah Diproses, validasi transisi status,
--     jejak waktu, alasan batal, dan pengembalian stok.
create or replace function public.orders_before_update()
returns trigger language plpgsql as $$
declare ok boolean;
begin
  new.updated_at := now();

  -- Setelah Diproses: nominal ongkir dan metode bayar terkunci
  if old.status in ('diproses', 'dikirim', 'selesai', 'dibatalkan', 'kedaluwarsa') then
    if new.shipping_cost is distinct from old.shipping_cost
       or new.shipping_pay_method is distinct from old.shipping_pay_method
       or new.product_pay_method is distinct from old.product_pay_method then
      raise exception 'Data pesanan terkunci setelah Diproses';
    end if;
    if new.payment_status is distinct from old.payment_status then
      raise exception 'Status pembayaran terkunci setelah Diproses';
    end if;
  end if;

  if new.payment_status = 'lunas' and old.payment_status = 'belum_dibayar' then
    new.paid_at := now();
    new.paid_by := auth.uid();
  elsif new.payment_status = 'belum_dibayar' and old.payment_status = 'lunas' then
    new.paid_at := null;
    new.paid_by := null;
  end if;

  if new.status is distinct from old.status then
    ok := case old.status
      when 'menunggu_konfirmasi' then new.status in ('direvisi_admin', 'dikonfirmasi', 'dibatalkan', 'kedaluwarsa')
      when 'direvisi_admin'      then new.status in ('dikonfirmasi', 'dibatalkan', 'kedaluwarsa')
      when 'dikonfirmasi'        then new.status in ('direvisi_admin', 'diproses', 'dibatalkan', 'kedaluwarsa')
      when 'diproses'            then new.status in ('dikirim', 'dibatalkan')   -- admin boleh batal sebelum dikirim
      when 'dikirim'             then new.status = 'selesai'
      else false
    end;
    if not ok then
      raise exception 'Transisi status % -> % tidak diizinkan', old.status, new.status;
    end if;

    if new.status = 'diproses' then
      if new.payment_status <> 'lunas' then
        raise exception 'Pesanan hanya bisa Diproses setelah pembayaran produk Lunas';
      end if;
      new.processed_at := now();

    elsif new.status = 'dikirim' then
      if coalesce(btrim(new.tracking_courier), '') = '' or coalesce(btrim(new.tracking_no), '') = '' then
        raise exception 'Kurir dan nomor resi wajib diisi sebelum Dikirim';
      end if;
      new.shipped_at := now();

    elsif new.status = 'selesai' then
      new.completed_at := now();

    elsif new.status = 'dibatalkan' then
      new.cancel_reason := coalesce(new.cancel_reason, 'dibatalkan_admin');
      if new.cancel_reason = 'kedaluwarsa' then
        raise exception 'Alasan kedaluwarsa hanya untuk status Kedaluwarsa';
      end if;
      if new.cancel_reason = 'dibatalkan_admin' and coalesce(btrim(new.cancel_note), '') = '' then
        raise exception 'Alasan pembatalan oleh admin wajib dicatat';
      end if;
      new.cancelled_at := now();
      new.cancelled_by := auth.uid();

    elsif new.status = 'kedaluwarsa' then
      new.cancel_reason := 'kedaluwarsa';
      new.cancelled_at  := now();
      new.cancelled_by  := null;
    end if;

    -- Stok dikembalikan (sekali saja) saat Dibatalkan/Kedaluwarsa
    if new.status in ('dibatalkan', 'kedaluwarsa') and old.stock_held then
      update public.product_variants v
         set stock = v.stock + oi.qty
        from public.order_items oi
       where oi.order_id = new.id and oi.variant_id = v.id;
      new.stock_held := false;
    end if;
  end if;

  return new;
end $$;
create trigger orders_before_update_trg before update on public.orders
  for each row execute function public.orders_before_update();

-- 8.7 Notifikasi internal (dipakai trigger & RPC). Push dikirim oleh Edge Function
--     lewat Database Webhook pada INSERT ke tabel notifications.
create or replace function private.notify(
  p_user uuid, p_type notification_type, p_title text, p_body text, p_data jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, data)
  select p_user, p_type, p_title, p_body, p_data
  where p_user is not null
$$;

create or replace function private.notify_admins(
  p_type notification_type, p_title text, p_body text, p_data jsonb default '{}'
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, title, body, data)
  select id, p_type, p_title, p_body, p_data
  from public.profiles where role = 'admin' and is_active
$$;

-- 8.8 Riwayat status + notifikasi dari perubahan pesanan
create or replace function public.orders_after_write()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare d jsonb := jsonb_build_object('order_id', new.id, 'order_no', new.order_no);
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), 'Pesanan dibuat');
    perform private.notify_admins('order_baru', 'Pesanan baru ' || new.order_no,
      new.recipient_name || ' membuat pesanan baru.', d);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(), coalesce(new.cancel_note, null));

    case new.status
      when 'diproses' then
        perform private.notify(new.customer_id, 'diproses', 'Pesanan diproses',
          'Pembayaran ' || new.order_no || ' sudah diverifikasi. Barang sedang disiapkan.', d);
      when 'dikirim' then
        perform private.notify(new.customer_id, 'dikirim', 'Pesanan dikirim',
          'Kurir ' || new.tracking_courier || ', resi ' || new.tracking_no || '.',
          d || jsonb_build_object('courier', new.tracking_courier, 'tracking_no', new.tracking_no));
      when 'dibatalkan' then
        if new.cancelled_by is not null and new.cancelled_by is not distinct from new.customer_id then
          perform private.notify_admins('dibatalkan_customer', 'Pesanan ' || new.order_no || ' dibatalkan customer',
            'Alasan: ' || new.cancel_reason::text, d || jsonb_build_object('reason', new.cancel_reason));
        else
          perform private.notify(new.customer_id, 'dibatalkan_admin', 'Pesanan dibatalkan',
            'Pesanan ' || new.order_no || ' dibatalkan admin.', d);
        end if;
      when 'kedaluwarsa' then
        perform private.notify(new.customer_id, 'kedaluwarsa', 'Pesanan kedaluwarsa',
          'Waktu pembayaran ' || new.order_no || ' habis. Stok dikembalikan.', d);
      else null;
    end case;
  end if;
  return new;
end $$;
create trigger orders_after_write_trg after insert or update on public.orders
  for each row execute function public.orders_after_write();

-- 8.9 Customer diberi tahu setiap invoice direvisi (revisi >= 1)
create or replace function public.invoices_after_insert()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare o record;
begin
  if new.revision > 0 then
    select customer_id, order_no into o from public.orders where id = new.order_id;
    perform private.notify(o.customer_id, 'invoice_direvisi', 'Invoice direvisi',
      'Invoice ' || new.invoice_no || ' direvisi (revisi ke-' || new.revision || ').',
      jsonb_build_object('order_id', new.order_id, 'order_no', o.order_no, 'revision', new.revision));
  end if;
  return new;
end $$;
create trigger invoices_after_insert_trg after insert on public.invoices
  for each row execute function public.invoices_after_insert();

-- 8.10 Moderasi ulasan: customer hanya boleh ubah rating/teks; admin hanya boleh ubah is_visible
create or replace function public.reviews_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.product_id is distinct from old.product_id
     or new.user_id is distinct from old.user_id
     or new.order_id is distinct from old.order_id then
    raise exception 'Produk, pemilik, dan pesanan ulasan tidak boleh diubah';
  end if;
  if public.is_admin() then
    if new.rating is distinct from old.rating or new.body is distinct from old.body then
      raise exception 'Admin hanya boleh menyembunyikan/menampilkan ulasan';
    end if;
  elsif new.is_visible is distinct from old.is_visible then
    raise exception 'Hanya admin yang boleh mengubah status tampil ulasan';
  end if;
  return new;
end $$;
create trigger reviews_guard_trg before update on public.reviews
  for each row execute function public.reviews_guard();


-- =====================================================================
-- 9. RPC & FUNGSI INTERNAL
-- =====================================================================

-- 9.1 Buat snapshot invoice baru (revisi 0 saat pesanan dibuat, berikutnya +1)
create or replace function private.create_invoice(p_order uuid, p_by uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; s public.settings%rowtype;
        v_rev integer; v_sub integer; v_items jsonb; v_inv uuid; v_no text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  select * into s from public.settings;

  select coalesce(sum(line_total), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'product_name', product_name, 'color', color_name, 'size', size, 'qty', qty,
           'unit_price', unit_price, 'discount_type', discount_type, 'discount_value', discount_value,
           'discount_amount', discount_amount, 'line_total', line_total) order by product_name, color_name, size), '[]'::jsonb)
    into v_sub, v_items
    from public.order_items where order_id = p_order;

  select coalesce(max(revision) + 1, 0) into v_rev from public.invoices where order_id = p_order;
  v_no := 'INV-' || substr(o.order_no, 5);

  insert into public.invoices (order_id, invoice_no, revision, subtotal, shipping_cost, total, snapshot, created_by)
  values (p_order, v_no, v_rev, v_sub, o.shipping_cost, v_sub + o.shipping_cost,
    jsonb_build_object(
      'order_no', o.order_no,
      'recipient', jsonb_build_object('name', o.recipient_name, 'phone', o.recipient_phone,
                                      'address', o.shipping_address, 'city', o.shipping_city),
      'courier', o.courier, 'courier_service', o.courier_service,
      'shipping_pay_method', o.shipping_pay_method,
      'product_pay_method', o.product_pay_method,
      'payment', case o.product_pay_method
        when 'dana' then jsonb_build_object('type', 'dana', 'number', s.dana_number, 'name', s.dana_account_name)
        else jsonb_build_object('type', 'bank', 'bank', s.bank_name, 'number', s.bank_account_number, 'holder', s.bank_account_holder)
      end,
      'items', v_items),
    p_by)
  returning id into v_inv;

  update public.orders set current_revision = v_rev where id = p_order;
  return v_inv;
end $$;

-- 9.2 Pembuatan pesanan inti (dipakai place_order & admin_create_order)
create or replace function private.create_order(
  p_customer_id uuid, p_source order_source, p_created_by uuid,
  p_recipient_name text, p_recipient_phone text, p_shipping_address text,
  p_courier courier_type, p_shipping_cost integer,
  p_shipping_pay_method shipping_pay_method, p_product_pay_method product_pay_method,
  p_items jsonb,
  p_shipping_city text, p_shipping_postal_code text, p_destination_area_id text,
  p_courier_service text, p_note text
) returns uuid language plpgsql security definer set search_path = public, private as $$
declare v_order uuid; v_hours integer; it jsonb; r record;
        v_qty integer; v_price integer; v_dtype discount_type; v_dval integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pesanan harus berisi minimal satu item';
  end if;
  if coalesce(btrim(p_recipient_name), '') = ''
     or coalesce(btrim(p_recipient_phone), '') = ''
     or coalesce(btrim(p_shipping_address), '') = '' then
    raise exception 'Nama, kontak, dan alamat penerima wajib diisi';
  end if;
  if p_shipping_cost is null or p_shipping_cost < 0 then
    raise exception 'Ongkir tidak valid';
  end if;

  select default_timeout_hours into v_hours from public.settings;

  insert into public.orders (
    customer_id, source, created_by,
    recipient_name, recipient_phone, shipping_address, shipping_city, shipping_postal_code, destination_area_id,
    courier, courier_service, shipping_cost, shipping_pay_method, product_pay_method,
    note, expires_at)
  values (
    p_customer_id, p_source, p_created_by,
    btrim(p_recipient_name), btrim(p_recipient_phone), btrim(p_shipping_address),
    p_shipping_city, p_shipping_postal_code, p_destination_area_id,
    p_courier, p_courier_service, p_shipping_cost, p_shipping_pay_method, p_product_pay_method,
    p_note, now() + make_interval(hours => coalesce(v_hours, 24)))
  returning id into v_order;

  for it in select value from jsonb_array_elements(p_items) loop
    v_qty := (it ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah item tidak valid'; end if;

    select v.id as variant_id, v.size, c.name as color_name,
           p.id as product_id, p.name as product_name, p.price, p.status as product_status
      into r
      from public.product_variants v
      join public.product_colors c on c.id = v.color_id
      join public.products p       on p.id = v.product_id
     where v.id = (it ->> 'variant_id')::uuid;
    if not found then raise exception 'Varian produk tidak ditemukan'; end if;
    if p_source = 'website' and r.product_status <> 'active' then
      raise exception 'Produk % tidak tersedia', r.product_name;
    end if;

    if p_source = 'admin' then       -- admin boleh menentukan harga/diskon sejak awal (grosir, pre-order)
      v_price := coalesce((it ->> 'unit_price')::integer, r.price);
      v_dtype := coalesce((it ->> 'discount_type')::discount_type, 'nominal');
      v_dval  := coalesce((it ->> 'discount_value')::integer, 0);
    else                             -- customer selalu memakai harga katalog (server-side)
      v_price := r.price; v_dtype := 'nominal'; v_dval := 0;
    end if;

    -- trigger order_items_guard mengunci stok; gagal bila stok tidak cukup
    insert into public.order_items (order_id, product_id, variant_id, product_name, color_name, size,
                                    qty, unit_price, discount_type, discount_value)
    values (v_order, r.product_id, r.variant_id, r.product_name, r.color_name, r.size,
            v_qty, v_price, v_dtype, v_dval);
  end loop;

  perform private.create_invoice(v_order, p_created_by);
  return v_order;
end $$;

-- 9.3 Customer menekan "Pesan". Harga dihitung server dari katalog.
--     Estimasi ongkir berasal dari Edge Function cek ongkir; admin memverifikasi/mengubahnya
--     lewat edit invoice sebelum konfirmasi.
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

-- 9.4 Admin membuat pesanan manual (pre-order / pesanan lewat chat). Tanpa akun customer.
--     Item boleh membawa unit_price, discount_type, discount_value.
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

-- 9.5 Customer membatalkan pesanan sendiri (hanya sebelum Diproses, wajib pilih alasan)
create or replace function public.cancel_my_order(p_order uuid, p_reason cancel_reason)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if p_reason not in ('salah_pilih_produk', 'salah_alamat', 'berubah_pikiran') then
    raise exception 'Alasan pembatalan tidak valid';
  end if;
  select * into o from public.orders where id = p_order and customer_id = auth.uid() for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi') then
    raise exception 'Pesanan sudah diproses dan tidak bisa dibatalkan lewat website';
  end if;
  update public.orders set status = 'dibatalkan', cancel_reason = p_reason where id = p_order;
end $$;

-- 9.6 Admin: generate ulang invoice setelah mengedit qty/harga/diskon/ongkir
create or replace function public.revise_invoice(p_order uuid)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype; v_inv uuid;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status not in ('menunggu_konfirmasi', 'direvisi_admin', 'dikonfirmasi') then
    raise exception 'Invoice tidak bisa direvisi setelah Diproses';
  end if;
  v_inv := private.create_invoice(p_order, auth.uid());
  if o.status <> 'direvisi_admin' then
    update public.orders set status = 'direvisi_admin' where id = p_order;
  end if;
  return v_inv;
end $$;

-- 9.7 Admin: perpanjang time-out stok per pesanan
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

-- 9.8 Kedaluwarsakan pesanan yang time-out-nya habis tanpa pembayaran.
--     Dijalankan terjadwal (pg_cron, lihat bagian 11). Tidak bisa dipanggil dari API.
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

-- 9.9 User menutup kewajiban ganti password / banner (dipanggil setelah user mengganti password)
create or replace function public.clear_password_flags()
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set must_change_password = false
   where id = auth.uid()
$$;
create or replace function public.dismiss_password_notice()
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set password_reset_notice_at = null
   where id = auth.uid()
$$;

-- 9.10 Laporan (admin & super admin). Hanya pesanan final; periode berdasarkan tanggal selesai /
--      dibatalkan dalam WIB; TANPA ongkir, alamat, dan nomor customer.
--      p_status: 'semua' | 'selesai' | 'dibatalkan' (Kedaluwarsa dihitung dibatalkan).
--      Filter kategori/produk hanya menghitung baris item yang cocok.
--      Minggu mulai Senin: hitung p_from/p_to di klien memakai date_trunc('week', ...).
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
) language sql stable security definer set search_path = public as $$
  select o.id,
         o.order_no,
         (f.final_at at time zone 'Asia/Jakarta')::date,
         o.recipient_name,
         string_agg(oi.product_name || ' ' || oi.color_name || '/' || oi.size || ' x' || oi.qty,
                    ', ' order by oi.product_name, oi.color_name, oi.size),
         sum(oi.qty)::bigint,
         sum(oi.line_total)::bigint,
         case when o.status = 'selesai' then 'selesai' else 'dibatalkan' end,
         o.cancel_reason
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.products p on p.id = oi.product_id
  cross join lateral (
    select case when o.status = 'selesai' then o.completed_at else o.cancelled_at end as final_at
  ) f
  where (public.is_admin() or public.is_super_admin())
    and o.status in ('selesai', 'dibatalkan', 'kedaluwarsa')
    and (p_status = 'semua'
         or (p_status = 'selesai'    and o.status = 'selesai')
         or (p_status = 'dibatalkan' and o.status in ('dibatalkan', 'kedaluwarsa')))
    and (f.final_at at time zone 'Asia/Jakarta')::date between p_from and p_to
    and (p_category_id is null or p.category_id = p_category_id)
    and (p_product_id  is null or oi.product_id = p_product_id)
  group by o.id, o.order_no, o.recipient_name, o.status, o.cancel_reason, f.final_at
  order by f.final_at
$$;

-- Ringkasan: jumlah & nilai per kelompok status, dan rincian alasan batal
create or replace function public.report_summary(
  p_from date, p_to date,
  p_status text default 'semua',
  p_category_id uuid default null,
  p_product_id uuid default null
) returns table (report_status text, reason cancel_reason, order_count bigint, total_value bigint)
language sql stable security definer set search_path = public as $$
  select r.report_status, r.reason, count(*), coalesce(sum(r.product_value), 0)::bigint
  from public.report_orders(p_from, p_to, p_status, p_category_id, p_product_id) r
  group by r.report_status, r.reason
$$;

-- Hak eksekusi: RPC hanya untuk user login; fungsi terjadwal hanya untuk sistem
revoke all on function public.place_order(text, text, text, courier_type, integer, shipping_pay_method, product_pay_method, jsonb, text, text, text, text, text) from public, anon;
revoke all on function public.admin_create_order(text, text, text, courier_type, integer, shipping_pay_method, product_pay_method, jsonb, text, text, text, text, text) from public, anon;
revoke all on function public.cancel_my_order(uuid, cancel_reason)     from public, anon;
revoke all on function public.revise_invoice(uuid)                     from public, anon;
revoke all on function public.admin_extend_timeout(uuid, integer)      from public, anon;
revoke all on function public.clear_password_flags()                   from public, anon;
revoke all on function public.dismiss_password_notice()                from public, anon;
revoke all on function public.report_orders(date, date, text, uuid, uuid)  from public, anon;
revoke all on function public.report_summary(date, date, text, uuid, uuid) from public, anon;
revoke all on function public.expire_overdue_orders()                  from public, anon, authenticated;
grant execute on function public.place_order(text, text, text, courier_type, integer, shipping_pay_method, product_pay_method, jsonb, text, text, text, text, text) to authenticated;
grant execute on function public.admin_create_order(text, text, text, courier_type, integer, shipping_pay_method, product_pay_method, jsonb, text, text, text, text, text) to authenticated;
grant execute on function public.cancel_my_order(uuid, cancel_reason)     to authenticated;
grant execute on function public.revise_invoice(uuid)                     to authenticated;
grant execute on function public.admin_extend_timeout(uuid, integer)      to authenticated;
grant execute on function public.clear_password_flags()                   to authenticated;
grant execute on function public.dismiss_password_notice()                to authenticated;
grant execute on function public.report_orders(date, date, text, uuid, uuid)  to authenticated;
grant execute on function public.report_summary(date, date, text, uuid, uuid) to authenticated;


-- =====================================================================
-- 10. ROW LEVEL SECURITY (aktif di semua tabel)
-- Prinsip: customer hanya data sendiri; admin = operasional; super admin = pengawas
-- (TIDAK punya akses tulis/baca ke produk-pesanan; laporan lewat report_orders()).
-- Customer tidak punya policy INSERT/UPDATE pada pesanan: semua lewat RPC.
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_colors       enable row level security;
alter table public.product_color_images enable row level security;
alter table public.product_variants     enable row level security;
alter table public.lookbooks            enable row level security;
alter table public.faqs                 enable row level security;
alter table public.settings             enable row level security;
alter table public.cart_items           enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.invoices             enable row level security;
alter table public.order_status_history enable row level security;
alter table public.reviews              enable row level security;
alter table public.notifications        enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.activity_logs        enable row level security;
alter table public.storage_delete_queue enable row level security;   -- tanpa policy: hanya service_role

-- profiles
create policy profiles_select_own   on public.profiles for select using (id = auth.uid());
create policy profiles_select_super on public.profiles for select using (public.is_super_admin());
create policy profiles_update_own   on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_super on public.profiles for update using (public.is_super_admin()) with check (public.is_super_admin());
-- INSERT/DELETE profil: hanya trigger auth / Edge Function (service_role)

-- katalog: publik membaca yang aktif, admin mengelola semua
create policy categories_read  on public.categories for select using (true);
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy products_read  on public.products for select using (status = 'active' or public.is_admin());
create policy products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());

-- sub-tabel mengikuti visibilitas produk (subquery tunduk pada RLS products)
create policy colors_read  on public.product_colors for select
  using (exists (select 1 from public.products p where p.id = product_id));
create policy colors_admin on public.product_colors for all using (public.is_admin()) with check (public.is_admin());

create policy color_images_read  on public.product_color_images for select
  using (exists (select 1 from public.product_colors c where c.id = color_id));
create policy color_images_admin on public.product_color_images for all using (public.is_admin()) with check (public.is_admin());

create policy variants_read  on public.product_variants for select
  using (exists (select 1 from public.products p where p.id = product_id));
create policy variants_admin on public.product_variants for all using (public.is_admin()) with check (public.is_admin());

-- konten
create policy lookbooks_read  on public.lookbooks for select using (is_active or public.is_admin());
create policy lookbooks_admin on public.lookbooks for all using (public.is_admin()) with check (public.is_admin());
create policy faqs_read       on public.faqs for select using (is_active or public.is_admin());
create policy faqs_admin      on public.faqs for all using (public.is_admin()) with check (public.is_admin());

-- pengaturan: dibaca publik (nomor WA, info bayar tampil di invoice/checkout), diubah admin
create policy settings_read  on public.settings for select using (true);
create policy settings_admin on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- keranjang
create policy cart_own on public.cart_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- pesanan
create policy orders_select on public.orders for select
  using (customer_id = auth.uid() or public.is_admin());
create policy orders_admin_update on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

create policy order_items_select on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id));      -- mengikuti RLS orders
create policy order_items_admin  on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

create policy invoices_select on public.invoices for select
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy history_select  on public.order_status_history for select
  using (exists (select 1 from public.orders o where o.id = order_id));
-- invoice & riwayat ditulis hanya oleh fungsi/trigger

-- ulasan
create policy reviews_select_own on public.reviews for select using (user_id = auth.uid());
create policy reviews_select_admin on public.reviews for select using (public.is_admin());
create policy reviews_insert on public.reviews for insert
  with check (user_id = auth.uid() and public.can_review(order_id, product_id));
create policy reviews_update_own on public.reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete_own on public.reviews for delete using (user_id = auth.uid());
create policy reviews_update_admin on public.reviews for update
  using (public.is_admin()) with check (public.is_admin());
create policy reviews_delete_admin on public.reviews for delete using (public.is_admin());

-- notifikasi: dibuat oleh trigger/Edge Function; user hanya membaca & menandai dibaca
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated;
grant  update (is_read) on public.notifications to authenticated;

create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- log aktivitas: hanya super admin yang membaca
create policy activity_logs_select on public.activity_logs for select using (public.is_super_admin());

-- view publik (ulasan tampil + rata-rata rating)
grant select on public.product_reviews_public, public.product_rating_stats to anon, authenticated;


-- =====================================================================
-- 11. STORAGE, REALTIME, SEED, CATATAN OPERASIONAL
-- =====================================================================

-- Bucket foto: baca publik, tulis hanya admin. Batas 2 MB, hanya WebP (hasil kompres browser).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hijabii-images', 'hijabii-images', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

create policy "hijabii images read"   on storage.objects for select
  using (bucket_id = 'hijabii-images');
create policy "hijabii images insert" on storage.objects for insert
  with check (bucket_id = 'hijabii-images' and public.is_admin());
create policy "hijabii images update" on storage.objects for update
  using (bucket_id = 'hijabii-images' and public.is_admin());
create policy "hijabii images delete" on storage.objects for delete
  using (bucket_id = 'hijabii-images' and public.is_admin());

-- Realtime: notifikasi di dalam web (jalur utama) + pesanan untuk dashboard
do $$
begin
  alter publication supabase_realtime add table public.notifications, public.orders;
exception when others then
  raise notice 'Publikasi supabase_realtime tidak tersedia, aktifkan lewat Dashboard > Database > Replication';
end $$;

-- Seed: satu baris pengaturan (isi nomor DANA/rekening lewat dashboard admin)
insert into public.settings (id, admin_whatsapp, bank_name, default_timeout_hours)
values (true, '6285892052182', 'BSI', 24);

-- ---------------------------------------------------------------------
-- CATATAN OPERASIONAL (jalankan manual sesuai kebutuhan)
--
-- 1) Akun Super Admin pertama: daftar lewat website/Auth, lalu jalankan di SQL Editor:
--      update public.profiles set role = 'super_admin' where email = 'email-pemilik@contoh.com';
--    Akun admin berikutnya dibuat super admin lewat Edge Function (service key).
--
-- 2) Time-out otomatis (pg_cron, aktifkan extension di Dashboard > Database > Extensions):
--      select cron.schedule('expire-orders', '*/10 * * * *', $$select public.expire_overdue_orders()$$);
--
-- 3) Mencegah auto-pause project gratis: panggil endpoint REST sederhana seminggu sekali
--    (mis. GitHub Actions / cron Vercel ke /rest/v1/settings?select=id).
--
-- 4) Push notification: buat Database Webhook pada INSERT tabel public.notifications
--    yang memanggil Edge Function pengirim Web Push (membaca push_subscriptions).
--    Kunci VAPID & service key hanya di Edge Function.
--
-- 5) Nonaktifkan akun: selain is_active = false, Edge Function sebaiknya mem-ban user di
--    Supabase Auth (ban_duration) agar sesi aktif ikut berhenti.
--
-- 6) Ganti password oleh super admin: Edge Function memverifikasi pemanggil super admin,
--    set password, set profiles.must_change_password = true dan password_reset_notice_at = now(),
--    sign-out semua sesi, insert notifications ('password_diubah') + kirim email,
--    dan insert activity_logs ('password_changed', tanpa password).
--
-- 7) Hapus file Storage: Edge Function terjadwal membaca storage_delete_queue,
--    menghapus file via Storage API, lalu menghapus baris antrean.
--
-- 8) Super admin membaca tabel profiles (daftar user). Alamat & nomor customer di pesanan/laporan
--    tidak terlihat karena super admin tidak punya policy pada orders dan report_orders()
--    tidak mengembalikan kolom tersebut.
-- ---------------------------------------------------------------------
