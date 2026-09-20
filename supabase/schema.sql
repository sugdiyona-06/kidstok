-- =====================================================================
--  Nurchashma — Supabase sxemasi (bolalar uchun video platforma)
--  Supabase Dashboard → SQL Editor ga to'liq nusxalab, "Run" bosing.
--  Qayta ishga tushirish xavfsiz: eski versiyadan ham yangilaydi.
-- =====================================================================

-- 0) Eski (maqolalar) versiyasidan qolgan narsalarni tozalash ---------
drop table if exists public.posts cascade;

-- 1) Ota-ona akkauntlari ---------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists pro_until timestamptz;
-- Eski versiyadagi ochiq o'qish siyosatini olib tashlaymiz (jadval endi albatta mavjud)
drop policy if exists profiles_select_own on public.profiles;

-- Ota-ona PIN-kodi (faqat hash saqlanadi; brauzer bu jadvalni umuman o'qiy olmaydi)
create table if not exists public.parent_pins (
  parent_id  uuid primary key references public.profiles (id) on delete cascade,
  pin_hash   text not null,
  pin_salt   text not null,
  updated_at timestamptz not null default now()
);

-- 2) Bola profillari --------------------------------------------------
create table if not exists public.child_profiles (
  id                  uuid primary key default gen_random_uuid(),
  parent_id           uuid not null references public.profiles (id) on delete cascade,
  name                text not null,
  avatar              text not null default 'bear',
  age                 smallint not null check (age between 2 and 6),
  daily_limit_minutes int check (daily_limit_minutes is null or daily_limit_minutes between 5 and 480),
  created_at          timestamptz not null default now()
);
create index if not exists child_profiles_parent_idx on public.child_profiles (parent_id);

-- 3) Kontent: bo'limlar, kanallar, videolar ---------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  emoji      text not null default '🎬',
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  avatar_path text,
  created_at  timestamptz not null default now()
);

create table if not exists public.videos (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  channel_id       uuid references public.channels (id) on delete set null,
  category_id      uuid references public.categories (id) on delete set null,
  video_path       text not null,
  thumb_path       text,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  min_age          smallint not null default 2 check (min_age between 2 and 6),
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- Format: 'long' — oddiy uzun video (16:9), 'short' — vertikal qisqa video (Shorts / Reels)
alter table public.videos add column if not exists format text not null default 'long';
alter table public.videos drop constraint if exists videos_format_check;
alter table public.videos add constraint videos_format_check check (format in ('long', 'short'));

create index if not exists videos_created_idx  on public.videos (created_at desc);
create index if not exists videos_format_idx   on public.videos (format, created_at desc);
create index if not exists videos_category_idx on public.videos (category_id);
create index if not exists videos_channel_idx  on public.videos (channel_id);

-- 4) Bola faoliyati: like, obuna, ijro ro'yxatlari, tarix -------------
create table if not exists public.likes (
  child_id   uuid not null references public.child_profiles (id) on delete cascade,
  video_id   uuid not null references public.videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (child_id, video_id)
);

create table if not exists public.channel_follows (
  child_id   uuid not null references public.child_profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (child_id, channel_id)
);

create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.child_profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists playlists_child_idx on public.playlists (child_id);

create table if not exists public.playlist_items (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  video_id    uuid not null references public.videos (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, video_id)
);

create table if not exists public.watch_history (
  child_id        uuid not null references public.child_profiles (id) on delete cascade,
  video_id        uuid not null references public.videos (id) on delete cascade,
  last_watched_at timestamptz not null default now(),
  total_seconds   int not null default 0,
  primary key (child_id, video_id)
);
create index if not exists watch_history_recent_idx on public.watch_history (child_id, last_watched_at desc);

create table if not exists public.daily_usage (
  child_id uuid not null references public.child_profiles (id) on delete cascade,
  day      date not null,
  seconds  int  not null default 0,
  primary key (child_id, day)
);

-- 5) Tomosha vaqtini bitta amalda yozish (tarix + kunlik limit) -------
create or replace function public.record_watch(p_child uuid, p_video uuid, p_day date, p_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
begin
  insert into public.watch_history (child_id, video_id, last_watched_at, total_seconds)
  values (p_child, p_video, now(), p_seconds)
  on conflict (child_id, video_id) do update
    set last_watched_at = now(),
        total_seconds   = public.watch_history.total_seconds + excluded.total_seconds;

  insert into public.daily_usage (child_id, day, seconds)
  values (p_child, p_day, p_seconds)
  on conflict (child_id, day) do update
    set seconds = public.daily_usage.seconds + excluded.seconds
  returning seconds into total;

  return total;
end;
$$;

revoke all on function public.record_watch(uuid, uuid, date, int) from public, anon, authenticated;
grant execute on function public.record_watch(uuid, uuid, date, int) to service_role;

-- 6) Yangi foydalanuvchi ro'yxatdan o'tganda profil avtomatik yaratiladi
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) Xavfsizlik: RLS hamma jadvalda yoqiladi, siyosat YO'Q -------------
-- Brauzerdagi anon/authenticated kalitlar jadvallardan hech narsa o'qiy olmaydi.
-- Barcha ma'lumot serverdan (service_role) o'tadi va u yerda tekshiriladi.
alter table public.profiles        enable row level security;
alter table public.parent_pins     enable row level security;
alter table public.child_profiles  enable row level security;
alter table public.categories      enable row level security;
alter table public.channels        enable row level security;
alter table public.videos          enable row level security;
alter table public.likes           enable row level security;
alter table public.channel_follows enable row level security;
alter table public.playlists       enable row level security;
alter table public.playlist_items  enable row level security;
alter table public.watch_history   enable row level security;
alter table public.daily_usage     enable row level security;

-- 8) Fayl saqlash (Storage) -------------------------------------------
-- videos: PRIVATE (faqat Pro obunachiga server vaqtinchalik havola beradi)
-- thumbnails: ochiq (muqova rasmlari va kanal rasmlari)
-- Eslatma: bepul tarifda umumiy fayl limiti 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('videos',     'videos',     false, 52428800, array['video/mp4', 'video/webm']),
  ('thumbnails', 'thumbnails', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 9) Boshlang'ich bo'limlar --------------------------------------------
insert into public.categories (name, emoji, sort_order) values
  ('Multfilmlar', '🎬', 1),
  ('Ta''limiy',   '🔤', 2),
  ('Ertaklar',    '📖', 3),
  ('Qo''shiqlar', '🎵', 4)
on conflict (name) do nothing;

-- 10) Birinchi adminni tayinlash ----------------------------------------
-- Avval saytda ro'yxatdan o'ting, so'ng emailingizni yozib, ALOHIDA so'rov sifatida ishga tushiring:
--
--   update public.profiles set role = 'admin' where email = 'sizning@emailingiz.uz';
