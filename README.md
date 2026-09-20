# Nurchashma

2–6 yoshli bolalar uchun xavfsiz video sayti (o‘zbek tilida). Node.js + Express + Supabase.

**Asosiy g‘oya:** videolarni faqat admin yuklaydi; tomosha qilish uchun ota-ona akkauntida **Pro obuna** faol bo‘lishi kerak. Ota-ona akkaunt ichida bola profillarini yaratadi va nazorat qiladi (PIN-kod, yosh filtri, kunlik vaqt limiti, tarix).

## Imkoniyatlar

| Kim | Nima qila oladi |
|---|---|
| **Mehmon** | Bosh sahifadagi lentada videolar muqovasini (qulf bilan) ko‘radi, lekin ijro eta olmaydi |
| **Ota-ona** | Ro‘yxatdan o‘tadi, PIN o‘rnatadi, 6 tagacha bola profili yaratadi (ism, yosh 2–6, rasm, kunlik limit), bola tarixini ko‘radi |
| **Bola** (ota-ona akkaunti ichida) | Tik (9:16) qisqa videolarni Instagram Reels / YouTube Shorts kabi lentada ko‘radi (surib yoki ikki marta bosib yoqtiradi); ijro ro‘yxati tuzadi, kanallarga obuna bo‘ladi |
| **Admin** | Video/kanal/bo‘lim qo‘shadi, Pro obunani beradi yoki bekor qiladi, rollarni boshqaradi |

**Sayt faqat tik (9:16) qisqa videolar bilan ishlaydi** (gorizontal 16:9 video yo‘q).

Menyu: **Asosiy · Shorts · Qidiruv · Profil** (telefonda ekran pastida, katta tugmalar bilan).

- **Asosiy:** kirishingiz bilan tepada so‘nggi videolar lentasi ochiladi (Instagram Reels kabi): telefonda butun ekran, kompyuterda o‘rtada tik ustun. Surganda video bittadan “yopishadi”, ko‘rinib turgani o‘zi ijro bo‘ladi, tugagach keyingisiga o‘tadi; ikki marta bosish — yoqtirish. Lentaning oxirida (yoki “Bo‘limlar ⬇” tugmasi bilan) pastdagi bo‘limlarga o‘tiladi: bo‘limlar, yaqinda ko‘rilganlar, kanallar, yangi videolar.
- **Shorts:** to‘liq (cheksiz) lenta.
- Kompyuterda ↑ ↓ tugmalari yoki klaviatura strelkalari ham ishlaydi.

Ota-ona nazorati: 4 xonali PIN (5 marta xato → 5 daqiqa qulf), yoshga mos videolar, kunlik tomosha limiti (O‘zbekiston vaqti bilan), tarix.

## Talablar

- Node.js **24.21.0** (`.nvmrc` da yozilgan)
- Supabase loyihasi (bepul tarif yetadi)

## 1. Supabase'ni sozlash

1. [supabase.com](https://supabase.com) da yangi loyiha yarating.
2. **SQL Editor** → yangi so‘rov → `supabase/schema.sql` faylining hammasini joylab **Run** bosing.
   Bu jadvallarni, xavfsizlik qoidalarini, `videos` (yopiq) va `thumbnails` (ochiq) fayl bucketlarini va 4 ta boshlang‘ich bo‘limni yaratadi. Qayta ishga tushirish xavfsiz.
   > Eski “maqolalar” versiyasidan yangilayotgan bo‘lsangiz, `posts` jadvali o‘chiriladi.

   **Shorts qo‘shilishidan oldin o‘rnatgan bo‘lsangiz** (videolar jadvali bor, `format` ustuni yo‘q), faqat shu yangilashni ishga tushiring:
   ```sql
   alter table public.videos add column if not exists format text not null default 'long';
   alter table public.videos drop constraint if exists videos_format_check;
   alter table public.videos add constraint videos_format_check check (format in ('long', 'short'));
   create index if not exists videos_format_idx on public.videos (format, created_at desc);
   notify pgrst, 'reload schema';
   ```
   Mavjud videolar avtomatik “oddiy video” bo‘lib qoladi.
3. **Project Settings → API Keys** bo‘limidan uchta narsani oling: `Project URL`, `anon`/`publishable` kalit, `service_role`/`secret` kalit.
4. **Authentication → Sign In / Providers → Email** da “Confirm email” yoqilgan bo‘lsa, foydalanuvchilar pochtani tasdiqlaydi. Sinash paytida o‘chirib qo‘ysangiz qulay.
5. Fayl limiti: bepul tarifda umumiy limit odatda 50 MB (**Storage → Settings**). Videolar shu chegaradan oshmasin.

## 2. Kompyuterda ishga tushirish

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# .env ichiga Supabase qiymatlarini yozing
npm run dev               # http://localhost:3000
```

`.env` fayli nomi aynan `.env` bo‘lishi kerak (`.env.txt` emas). Tekshirish:
`node --env-file=.env -e "console.log(process.env.SUPABASE_URL)"`

## 3. Birinchi adminni tayinlash

Saytda ro‘yxatdan o‘ting (`/profile`), so‘ng Supabase **SQL Editor** da alohida so‘rov sifatida:

```sql
update public.profiles set role = 'admin' where email = 'sizning@emailingiz.uz';
```

Profil sahifasida **Admin panel** tugmasi paydo bo‘ladi (`/admin`).

## 4. Kontent qo‘shish

Admin panelda: **Kanallar** → kanal yarating (ixtiyoriy) → **Videolar** → **Yangi video**.

- **Video:** faqat **tik (9:16)** video: MP4 (H.264) yoki WebM, 50 MB gacha, 15–90 soniya tavsiya etiladi. Davomiyligi avtomatik aniqlanadi. Gorizontal video yuklansa, admin panel ogohlantiradi (baribir ishlaydi, lekin kichik ko‘rinadi).
- **Muqova:** tik (9:16) rasm, JPG/PNG/WebP, 5 MB gacha (o‘zingiz yuklaysiz).
- **Yosh:** “qaysi yoshdan boshlab” — bola yoshi bundan kichik bo‘lsa, video unga ko‘rinmaydi.

Tik videoni yengil qilish uchun ([ffmpeg](https://ffmpeg.org)), 480×854:

```bash
ffmpeg -i asl.mov -vf "scale=480:854:force_original_aspect_ratio=increase,crop=480:854" -c:v libx264 -crf 26 -preset slow -c:a aac -b:a 96k -movflags +faststart short.mp4
```

60 soniyalik shunday video taxminan 5–10 MB bo‘ladi.

**Eski (gorizontal) videolar bo‘lsa:** `supabase/update-shorts-only.sql` ni ishga tushiring: mavjud videolar o‘chmaydi, hammasi Shorts formatiga o‘tadi.

## 5. Pro obunani berish

Online to‘lov ulanmagan bo‘lsa (yoki boshqa yo‘l bilan to‘lov olsangiz) to‘lovni o‘zingiz qabul qilib, admin paneldagi **Foydalanuvchilar** bo‘limida ota-ona qatoridan “+30 / +90 / +365 kun” ni tanlaysiz (yangi muddat amaldagi obuna tugagach davom etadi; “Bekor qilish” obunani darrov to‘xtatadi).

`PRO_CONTACT_URL` (masalan, `https://t.me/sizning_akkaunt`) ni kiritsangiz, `/pro` sahifasida “Obunani faollashtirish” tugmasi shu havolaga olib boradi.

## 6. Render.com'ga joylash

1. Loyihani GitHub'ga yuklang (`.env` va `node_modules` `.gitignore` da, ular yuklanmaydi).
2. Render → **New +** → **Blueprint** → repozitoriyni tanlang. `render.yaml` hammasini o‘zi sozlaydi.
   (Qo‘lda: **New + → Web Service**, Build: `npm ci`, Start: `npm start`, Health check: `/api/health`.)
3. **Environment** bo‘limida qiymatlarni kiriting: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, xohlasangiz `PRO_CONTACT_URL`. `NODE_VERSION=24.21.0` va `NODE_ENV=production` `render.yaml` da bor.
4. Deploy tugagach Render bergan manzilni (`https://nurchashma.onrender.com`) Supabase → **Authentication → URL Configuration** dagi **Site URL** va **Redirect URLs** ga qo‘shing (aks holda tasdiqlash xatidagi havola ishlamaydi).
5. Render'da ham ro‘yxatdan o‘tib, 3-bo‘limdagi SQL bilan adminni tayinlang.

**Bilib qo‘ying:**
- Render‘ning bepul tarifi 15 daqiqa faolsizlikdan keyin “uxlaydi”, birinchi ochilish 30–60 soniya olishi mumkin. Doimiy foydalanish uchun pullik tarifga o‘ting.
- Supabase bepul loyihalari uzoq vaqt faolsizlikdan keyin pauza qilinishi mumkin; shartlarni Supabase narxlar sahifasida tekshiring.
- PIN xatolari hisobi serverning xotirasida turadi: server qayta ishga tushsa nolga tushadi. Bitta server nusxasi uchun bu yetarli.

## Online to‘lov (Payme va Click)

Sayt to‘lovni **o‘zi qabul qiladi**: ota-ona `/pro` sahifasida reja (1 oy, 3 oy, 1 yil) va usulni (Payme yoki Click) tanlaydi, to‘lagach Pro obuna **avtomatik** faollashadi. Qo‘lda berish (admin panel → Foydalanuvchilar) ham ishlayveradi.

**Muhim:** bu qism yozilgan va sinalgan, lekin sizning Payme/Click akkauntingiz bilan **hali sinalmagan** (kalitlar sizda bo‘ladi). Avval albatta test rejimida sinang.

### Sozlash

1. **Narxlar** (so‘mda): Render → Environment → `PRICE_30`, `PRICE_90`, `PRICE_365`. Bo‘sh qoldirsangiz, namuna narxlar (29 000 / 79 000 / 249 000) ishlaydi, ularni o‘zgartiring.
2. `SITE_URL` = sayt manzili, masalan `https://kidstok.onrender.com`.
3. **Payme:** [Payme Business](https://business.paycom.uz) kabinetida kassa oching, keyin:
   - **Endpoint URL:** `https://SAYT/api/payments/payme`
   - **Merchant ID** → `PAYME_MERCHANT_ID`, **kalit (Key)** → `PAYME_KEY`
   - **Hisob maydoni:** nomi `order_id`
   - Sinov: kabinetdagi *Sandbox* / test kassa kaliti bilan `PAYME_TEST=true` qo‘ying va Payme’ning “Test” bo‘limidagi tekshiruvlarni ishga tushiring. Hammasi o‘tgach, haqiqiy kalit bilan `PAYME_TEST=false`.
4. **Click:** [Click Merchant](https://merchant.click.uz) kabinetida xizmat oching, keyin:
   - **Prepare URL:** `https://SAYT/api/payments/click/prepare`
   - **Complete URL:** `https://SAYT/api/payments/click/complete`
   - `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` qiymatlarini kiriting.
5. Bazaga yangilanishni qo‘shing: agar oldin `schema.sql` ishga tushirgan bo‘lsangiz, faqat `supabase/update-payments.sql` faylini SQL Editor’da ishga tushiring (yangi jadvallar: `orders`, `payments`).
6. Render’da o‘zgaruvchilarni saqlagach, sayt qayta ishga tushadi. `/pro` sahifasida narxlar va “Payme/Click bilan to‘lash” tugmalari paydo bo‘ladi (kalit kiritilmagan usulning tugmasi ko‘rinmaydi).

To‘lovlarni admin panelda **To‘lovlar** bo‘limida ko‘rasiz.

### Qanday ishlaydi (xavfsizlik)

- Summa va reja **serverda** belgilanadi, brauzerdan kelgan narxga ishonilmaydi.
- Payme (`Basic` avtorizatsiya) va Click (imzo `md5`) so‘rovlari tekshiriladi, imzosi noto‘g‘ri so‘rov Pro bermaydi.
- Bir to‘lov ikki marta hisoblanmaydi (takroriy so‘rovlar xavfsiz). Payme to‘lovni qaytarsa, Pro kunlari ayiriladi.
- Yangi obuna amaldagisi tugagach davom etadi (kunlar qo‘shiladi).

## Ko‘p foydalanuvchi bo‘lganda

- So‘rovlar limiti: kirgan foydalanuvchi o‘z tokeni bo‘yicha, kirmaganlar IP bo‘yicha hisoblanadi (mobil operatorlarda ko‘pchilik bitta IP orqali chiqadi, shuning uchun IP bo‘yicha limit begunoh odamlarni to‘sib qo‘yardi). Kerak bo‘lsa `RATE_LIMIT_MAX` (15 daqiqadagi so‘rovlar soni, standart 1200) ni Render’da o‘zgartiring.

## Xavfsizlik modeli

- Barcha jadvallarda RLS yoqilgan va **hech qanday siyosat yo‘q**: brauzerdagi `anon` kalit bazadan hech narsa o‘qiy olmaydi va yoza olmaydi. Ma’lumot faqat server (`service_role`) orqali o‘tadi va u yerda tekshiriladi.
- Videolar yopiq bucketda. Ijro havolasi 1 soatga beriladi va faqat: Pro faol + bola shu akkauntniki + yoshi mos + kunlik limit tugamagan bo‘lsa.
- PIN `scrypt` bilan shifrlanadi. To‘g‘ri PIN 15 daqiqalik imzolangan token beradi; ota-onalar amallari shu tokensiz ishlamaydi.
- `service_role` kaliti hech qachon brauzerga berilmaydi va GitHub'ga yuklanmaydi.

**PIN nimani himoya qiladi:** bola profillarini yaratish/tahrirlash/o‘chirish, kunlik limitni o‘zgartirish, tarixni ko‘rish, PINni almashtirish.

**Cheklovlar (bilib qo‘ying):**
- Boshqa bola profiliga o‘tish PIN-kod so‘raydi (PIN yaqinda kiritilgan bo‘lsa, 15 daqiqa qayta so‘ralmaydi). Bu himoya brauzerda ishlaydi: kichik bolalar uchun yetarli, texnik bilimli o‘smirni to‘xtata olmaydi.
- Admin paneli PIN bilan emas, faqat admin roli bilan himoyalangan: admin akkaunti ochiq turgan qurilmani bolaga bermang.
- Bolaga qurilma berishdan oldin ota-ona bo‘limidan chiqib (“Qulflash”) qo‘ying.

## Parolni tiklash

- **Email orqali:** kirish oynasidagi “Parolni unutdingizmi?” havolasi. Supabase’ning o‘rnatilgan email xizmati cheklangan (faqat jamoa a’zolariga yuboradi va soatiga kam xat), shuning uchun haqiqiy foydalanuvchilarga xat yetishi uchun **Authentication → SMTP Settings** ga o‘z email xizmatingizni (Resend, Brevo va h.k.) ulang. Redirect URLs’da saytingiz manzili (`https://.../**`) bo‘lishi kerak.
- **Administrator orqali (email kerak emas):** Admin panel → **Foydalanuvchilar** → “Parol” tugmasi vaqtinchalik parol o‘rnatadi. Parolni foydalanuvchiga o‘zingiz yetkazasiz.

## Maxfiylik (muhim)

Sayt bolalar ma’lumotlari bilan ishlaydi. `/privacy` sahifasi **namuna matn**: uni yuristingiz bilan tekshiring va `[ALOQA EMAILINGIZ]` o‘rniga haqiqiy manzil yozing. Foydalanuvchi ro‘yxatdan o‘tganda ota-ona ekanini tasdiqlaydi (formada yozilgan).

## Loyiha tuzilmasi

```
server.js               Express ilovasi (xavfsizlik sarlavhalari, marshrutlar, statik fayllar)
src/
  config.js db.js util.js   sozlamalar, Supabase mijozi, yordamchilar
  auth.js pin.js videos.js  kirish/rol/bola tekshiruvi, PIN va token, video so‘rovlari
  routes/catalog.js         ochiq katalog (videolar, kanallar, bo‘limlar)
  routes/kids.js            ijro, tarix, like, obuna, ijro ro‘yxatlari
  routes/parent.js          PIN va bola profillari
  routes/admin.js           admin API
supabase/schema.sql     baza sxemasi
public/                 frontend (HTML + CSS + oddiy JS modullar)
render.yaml             Render sozlamasi
```

## Muammolar

- **“.env faylida ... yo‘q”** — fayl `.env` deb nomlanganini va qiymatlar `=` dan keyin bo‘sh joysiz yozilganini tekshiring. Windows'da fayl kengaytmalarini ko‘rsatishni yoqing.
- **Video ochilmaydi** — Pro faolmi, bola tanlanganmi, video yoshi bolaga mosmi va kunlik limit tugamaganmi, shularni tekshiring.
- **Fayl yuklanmaydi** — Supabase Storage'dagi umumiy fayl limitidan katta emasligini tekshiring.
