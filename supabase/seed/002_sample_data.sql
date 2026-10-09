-- 002_sample_data.sql — tugas 0.5: DATA CONTOH untuk pengembangan (bukan data asli klien).
-- 2 kategori, 2 produk, masing-masing 2 warna x beberapa ukuran. Harga dari brief klien.
-- BERAT (weight_gram) di sini hanya ANGKA CONTOH — ganti dengan berat asli dari klien sebelum go-live.
-- Foto (image_path) sengaja kosong: UI memakai swatch hex / placeholder.
-- Hapus sebelum go-live: delete from public.categories where name in ('Pasmina','Segi Empat');  (cascade ke produk)

do $$
declare
  c_pasmina uuid; c_segi uuid;
  p_tancel uuid;   p_bamboo uuid;
  col uuid;
begin
  insert into public.categories (name, sort_order) values ('Pasmina', 1) returning id into c_pasmina;
  insert into public.categories (name, sort_order) values ('Segi Empat', 2) returning id into c_segi;

  -- Produk 1: Pasmina Tancel — Rp 42.000
  insert into public.products (category_id, name, slug, description, price, weight_gram, status)
  values (c_pasmina, 'Pasmina Tancel', 'pasmina-tancel',
          '[CONTOH] Pasmina tancel jatuh dan ringan, nyaman dipakai seharian.', 42000, 120, 'active')
  returning id into p_tancel;

  insert into public.product_colors (product_id, name, hex_code, sort_order) values (p_tancel, 'Mocha', '#A98B7C', 1) returning id into col;
  insert into public.product_variants (product_id, color_id, size, stock) values
    (p_tancel, col, 'All Size', 25);
  insert into public.product_colors (product_id, name, hex_code, sort_order) values (p_tancel, 'Marsala', '#7B4A4A', 2) returning id into col;
  insert into public.product_variants (product_id, color_id, size, stock) values
    (p_tancel, col, 'All Size', 3);   -- stok menipis (<= 5), untuk uji peringatan

  -- Produk 2: Viscose Bamboo — Rp 56.000
  insert into public.products (category_id, name, slug, description, price, weight_gram, status)
  values (c_segi, 'Viscose Bamboo', 'viscose-bamboo',
          '[CONTOH] Segi empat viscose bamboo, adem dan mudah dibentuk.', 56000, 90, 'active')
  returning id into p_bamboo;

  insert into public.product_colors (product_id, name, hex_code, sort_order) values (p_bamboo, 'Cream', '#F6F0E7', 1) returning id into col;
  insert into public.product_variants (product_id, color_id, size, stock) values
    (p_bamboo, col, '110 cm', 15),
    (p_bamboo, col, '120 cm', 10);
  insert into public.product_colors (product_id, name, hex_code, sort_order) values (p_bamboo, 'Olive', '#6B6A47', 2) returning id into col;
  insert into public.product_variants (product_id, color_id, size, stock) values
    (p_bamboo, col, '110 cm', 0);     -- stok habis, untuk uji tampilan "Habis"
end $$;

select p.name, c.name as warna, v.size, v.stock
  from public.product_variants v
  join public.product_colors c on c.id = v.color_id
  join public.products p on p.id = v.product_id
 order by p.name, c.sort_order, v.size;
