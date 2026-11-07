-- 011_admin_reopen_order.sql
-- Admin mengembalikan pesanan Selesai -> Dikirim (mis. customer salah menekan "Pesanan Diterima").
-- PERHATIAN: file ini mengganti dua fungsi trigger dari 001 (orders_before_update, orders_after_write).
-- Jalankan 010 dulu, dan tes di database dev sebelum produksi.
-- Perubahan dibanding 001 hanya pada baris yang diberi tanda  -- [011].

-- 1. Aturan transisi: Selesai -> Dikirim boleh, tapi hanya admin.
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
      when 'selesai'             then new.status = 'dikirim'                    -- [011] hanya admin, dijaga di bawah
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
      if old.status = 'selesai' then                                            -- [011]
        if not public.is_admin() then                                           -- [011]
          raise exception 'Hanya admin yang bisa mengembalikan pesanan ke Dikirim';  -- [011]
        end if;                                                                 -- [011]
        new.completed_at := null;                                               -- [011] shipped_at tetap
      else                                                                      -- [011]
        new.shipped_at := now();
      end if;                                                                   -- [011]

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

-- 2. Riwayat + notifikasi: catatan alasan ikut tersimpan, dan customer tidak diberi
--    notifikasi "Pesanan dikirim" lagi saat admin hanya mengembalikan status.
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
    values (new.id, old.status, new.status, auth.uid(),
            coalesce(new.cancel_note, nullif(current_setting('app.status_note', true), '')));   -- [011]

    case new.status
      when 'diproses' then
        perform private.notify(new.customer_id, 'diproses', 'Pesanan diproses',
          'Pembayaran ' || new.order_no || ' sudah diverifikasi. Barang sedang disiapkan.', d);
      when 'dikirim' then
        if old.status is distinct from 'selesai' then                                           -- [011]
          perform private.notify(new.customer_id, 'dikirim', 'Pesanan dikirim',
            'Kurir ' || new.tracking_courier || ', resi ' || new.tracking_no || '.',
            d || jsonb_build_object('courier', new.tracking_courier, 'tracking_no', new.tracking_no));
        end if;                                                                                 -- [011]
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

-- 3. RPC admin: kembalikan Selesai -> Dikirim, alasan wajib dicatat di riwayat.
create or replace function public.admin_reopen_order(p_order uuid, p_note text)
returns void language plpgsql security definer set search_path = public, private as $$
declare o public.orders%rowtype; v_note text;
begin
  o := private.admin_lock_order(p_order);
  if o.status <> 'selesai' then
    raise exception 'Hanya pesanan Selesai yang bisa dikembalikan ke Dikirim (status sekarang: %)', o.status;
  end if;
  v_note := btrim(coalesce(p_note, ''));
  if v_note = '' then raise exception 'Alasan wajib dicatat'; end if;

  perform set_config('app.status_note', 'Dikembalikan ke Dikirim: ' || v_note, true);   -- hanya berlaku di transaksi ini
  update public.orders set status = 'dikirim' where id = p_order;
end $$;

revoke all on function public.admin_reopen_order(uuid, text) from public, anon;
grant execute on function public.admin_reopen_order(uuid, text) to authenticated;
