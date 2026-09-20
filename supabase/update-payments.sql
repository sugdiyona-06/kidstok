-- =====================================================================
--  YANGILANISH: to'lovlar (Payme / Click)
--  Agar avval schema.sql ni ishga tushirgan bo'lsangiz, faqat shu faylni ishga tushiring.
--  Qayta ishga tushirish xavfsiz.
-- =====================================================================

-- Buyurtmalar (Pro obuna sotib olish)
create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.profiles (id) on delete cascade,
  plan_days   int  not null check (plan_days > 0),
  amount_uzs  int  not null check (amount_uzs > 0),
  status      text not null default 'new' check (status in ('new', 'paid', 'cancelled')),
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists orders_parent_idx on public.orders (parent_id, created_at desc);

-- To'lov tranzaksiyalari (Payme va Click so'rovlari)
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity unique,
  order_id          uuid not null references public.orders (id) on delete cascade,
  provider          text not null check (provider in ('payme', 'click')),
  provider_trans_id text not null,
  state             int  not null,          -- 1: yaratilgan, 2: bajarilgan, -1: bekor, -2: bajarilgandan keyin bekor
  amount_tiyin      bigint not null,
  provider_time     bigint,
  create_time       bigint not null,
  perform_time      bigint not null default 0,
  cancel_time       bigint not null default 0,
  reason            int,
  unique (provider, provider_trans_id)
);
create index if not exists payments_order_idx on public.payments (order_id);

alter table public.orders   enable row level security;
alter table public.payments enable row level security;

-- Pro muddatini bitta amalda uzaytirish (manfiy kun — qaytarish)
create or replace function public.extend_pro(p_parent uuid, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  result timestamptz;
begin
  update public.profiles
     set pro_until = case
       when p_days >= 0 then greatest(coalesce(pro_until, now()), now()) + make_interval(days => p_days)
       else greatest(now(), coalesce(pro_until, now()) + make_interval(days => p_days))
     end
   where id = p_parent
   returning pro_until into result;
  return result;
end;
$$;

revoke all on function public.extend_pro(uuid, int) from public, anon, authenticated;
grant execute on function public.extend_pro(uuid, int) to service_role;
