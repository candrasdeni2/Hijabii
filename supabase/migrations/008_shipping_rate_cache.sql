-- Cache tarif ongkir: key = asal + tujuan + berat (kelipatan pembulatan, mis. 100 g) + kurir.
-- Hanya Edge Function (service role) yang boleh membaca/menulis. JALANKAN DI SQL EDITOR (bukan supabase db push).
create table if not exists public.shipping_rate_cache (
  origin_area_id      text    not null,
  destination_area_id text    not null,
  weight_gram         integer not null check (weight_gram > 0),
  courier             text    not null check (courier in ('pos', 'jnt', 'jne')),
  services            jsonb   not null,                 -- [{service, description, cost, etd}]
  fetched_at          timestamptz not null default now(),
  primary key (origin_area_id, destination_area_id, weight_gram, courier)
);
alter table public.shipping_rate_cache enable row level security;      -- tanpa policy = tertutup untuk anon/authenticated
revoke all on public.shipping_rate_cache from anon, authenticated;
create index if not exists shipping_rate_cache_fetched_idx on public.shipping_rate_cache (fetched_at);
comment on table public.shipping_rate_cache is 'Cache hasil cek ongkir RajaOngkir (hemat kuota 100 hit/hari). Hanya diakses Edge Function shipping-cost.';
