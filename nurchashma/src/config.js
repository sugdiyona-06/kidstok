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
  // O'zbekiston vaqti (UTC+5, yozgi vaqt yo'q): kunlik limit shu vaqt bo'yicha hisoblanadi
  tzOffsetHours: 5,
};
