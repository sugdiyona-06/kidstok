const env = process.env;

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error(
    `Xato: .env faylida quyidagilar yo'q: ${missing.join(", ")}\n` +
      "Namuna uchun .env.example faylini ko'ring (Renderda: Environment bo'limiga kiriting)."
  );
  process.exit(1);
}

const posInt = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);

function fail(message) {
  console.error(`Xato: ${message}`);
  process.exit(1);
}

// Foydalanuvchi ba'zan URL oxiriga /rest/v1 yoki / qo'shib yuboradi: faqat manzilning o'zi (origin) kerak
function cleanSupabaseUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    fail(`SUPABASE_URL noto'g'ri: "${raw}". U "https://" bilan boshlanishi kerak (masalan https://abcdefgh.supabase.co).`);
  }
  if (/^x{5,}\./i.test(url.hostname)) {
    fail("SUPABASE_URL hali .env.example dagi namuna bo'yicha turibdi. Supabase → Project Settings → API dan haqiqiy Project URL ni yozing.");
  }
  return url.origin;
}

for (const key of ["SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (/^eyJ\.\.\./.test(env[key].trim())) fail(`${key} hali namuna qiymatida ("eyJ..."). Supabase → Project Settings → API dan haqiqiy kalitni yozing.`);
}

export const config = {
  supabaseUrl: cleanSupabaseUrl(env.SUPABASE_URL),
  anonKey: env.SUPABASE_ANON_KEY.trim(),
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY.trim(),
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === "production",
  // Pro obunani qayerdan sotib olish mumkinligi (masalan Telegram havolasi). Ixtiyoriy.
  proContactUrl: env.PRO_CONTACT_URL ?? "",
  // Obuna narxlari (so'mda). Render'da PRICE_30 / PRICE_90 / PRICE_365 bilan o'zgartiring
  prices: { 30: posInt(env.PRICE_30, 29000), 90: posInt(env.PRICE_90, 79000), 365: posInt(env.PRICE_365, 249000) },
  // Sayt manzili (to'lovdan keyin qaytish uchun). Bo'sh bo'lsa, so'rovdan olinadi
  siteUrl: (env.SITE_URL ?? "").trim().replace(/\/+$/, ""),
  payme: { merchantId: (env.PAYME_MERCHANT_ID ?? "").trim(), key: (env.PAYME_KEY ?? "").trim(), test: env.PAYME_TEST === "true" },
  click: {
    serviceId: (env.CLICK_SERVICE_ID ?? "").trim(),
    merchantId: (env.CLICK_MERCHANT_ID ?? "").trim(),
    secretKey: (env.CLICK_SECRET_KEY ?? "").trim(),
  },
  // O'zbekiston vaqti (UTC+5, yozgi vaqt yo'q): kunlik limit shu vaqt bo'yicha hisoblanadi
  tzOffsetHours: 5,
};
