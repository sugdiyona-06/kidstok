-- =====================================================================
--  YANGILANISH: sayt faqat vertikal (9:16) Shorts videolar bilan ishlaydi
--  Avval schema.sql ni ishga tushirgan bo'lsangiz, faqat shu faylni ishga tushiring.
--  Qayta ishga tushirish xavfsiz. Mavjud videolar o'chmaydi: hammasi Shorts bo'ladi.
-- =====================================================================
alter table public.videos add column if not exists format text not null default 'short';
alter table public.videos alter column format set default 'short';
update public.videos set format = 'short' where format <> 'short';
alter table public.videos drop constraint if exists videos_format_check;
alter table public.videos add constraint videos_format_check check (format in ('long', 'short'));
