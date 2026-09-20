import dns from "node:dns";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./src/config.js";
import { catalog } from "./src/routes/catalog.js";
import { kids } from "./src/routes/kids.js";
import { parent } from "./src/routes/parent.js";
import { admin } from "./src/routes/admin.js";
import { HttpError, isNetworkError } from "./src/util.js";
import { supabase } from "./src/db.js";

// Ba'zi tarmoqlarda IPv6 manzil topiladi-yu, ulanmaydi. IPv4 ni birinchi sinaymiz.
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const nodeModules = path.join(__dirname, "node_modules");

const app = express();
app.disable("x-powered-by");
// Render (va boshqa hostinglar) proxy orqasida ishlaydi: haqiqiy IP manzilni olish uchun
if (config.isProd) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "connect-src": ["'self'", config.supabaseUrl],
        "img-src": ["'self'", "data:", "https:"],
        // Videolar Supabase Storage'dan keladi; blob: — admin videoning davomiyligini o'qishi uchun
        "media-src": ["'self'", config.supabaseUrl, "blob:"],
        // localhost (http) da brauzerlar sahifani buzmasligi uchun faqat productionda yoqiladi
        "upgrade-insecure-requests": config.isProd ? [] : null,
      },
    },
  })
);
app.use(express.json({ limit: "100kb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 1200, standardHeaders: true, legacyHeaders: false }));

/* ---------- API ---------- */
app.use("/api/admin", admin);
app.use("/api", catalog);
app.use("/api", kids);
app.use("/api", parent);
app.use("/api", (_req, _res, next) => next(new HttpError(404, "Topilmadi")));

/* ---------- Frontend (statik fayllar) ---------- */
// Supabase brauzer kutubxonasi va shriftlar node_modules'dan o'zimizning serverdan beriladi (tashqi CDN kerak emas)
app.get("/vendor/supabase.js", (_req, res) =>
  res.sendFile(path.join(nodeModules, "@supabase/supabase-js/dist/umd/supabase.js"))
);
app.use("/vendor/fonts/fredoka", express.static(path.join(nodeModules, "@fontsource-variable/fredoka"), { maxAge: "30d" }));
app.use("/vendor/fonts/nunito", express.static(path.join(nodeModules, "@fontsource-variable/nunito"), { maxAge: "30d" }));

// /search -> search.html, /watch -> watch.html, /parent -> parent.html va hokazo
app.use(express.static(publicDir, { extensions: ["html"] }));

/* ---------- Xatoliklar ---------- */
// Jadval yoki funksiya topilmasa: supabase/schema.sql hali ishga tushirilmagan
const DB_NOT_READY = ["PGRST205", "PGRST202", "42P01", "42883"];
const DB_HINT =
  "\n⚠️  Ma'lumotlar bazasida jadvallar topilmadi.\n" +
  "    Supabase → SQL Editor da supabase/schema.sql faylini ishga tushiring (aynan .env dagi loyihada).\n";
let hintShown = false;
let lastNetHint = 0;

function warnNetwork(err) {
  // Har 30 soniyada bir marta, qisqa va tushunarli
  if (Date.now() - lastNetHint < 30000) return;
  lastNetHint = Date.now();
  const text = `${err?.details ?? ""} ${err?.message ?? ""}`;
  // Haqiqiy sabab: "Caused by: Error: connect ETIMEDOUT ..." qatori
  const cause = (text.split("\n").find((line) => /Caused by/i.test(line)) ?? "").replace(/^.*Caused by:\s*/i, "").trim();
  const kind = /ENOTFOUND|EAI_AGAIN/.test(text) ? "manzil topilmadi (DNS)" : "ulanish o'rnatilmadi";
  console.error(
    `\n⚠️  Supabase'ga ulanib bo'lmadi (${config.supabaseUrl}): ${kind}.\n` +
      (cause ? `    Sabab: ${cause}\n` : "") +
      "    Internetni, VPN'ni va DNS'ni tekshiring; loyiha pauzada emasligini Supabase Dashboard'da ko'ring.\n"
  );
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (DB_NOT_READY.includes(err.code)) {
    if (!hintShown) console.error(DB_HINT);
    hintShown = true;
    return res.status(503).json({ error: "Ma'lumotlar bazasi hali sozlanmagan. supabase/schema.sql ni ishga tushirish kerak.", code: "db_not_ready" });
  }
  if (isNetworkError(err)) {
    warnNetwork(err);
    return res.status(503).json({ error: "Supabase'ga ulanib bo'lmadi. Internetni tekshirib, birozdan keyin qayta urinib ko'ring.", code: "db_unreachable" });
  }
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "Serverda xatolik yuz berdi" : err.message,
    code: status >= 500 ? undefined : err.code,
  });
});

app.listen(config.port, async () => {
  console.log(`Nurchashma ishga tushdi: http://localhost:${config.port}  (Node ${process.version})`);
  // Ishga tushganda bazani tekshiramiz, muammo bo'lsa darrov aniq xabar beramiz
  const { error } = await supabase.from("categories").select("id").limit(1);
  if (error && DB_NOT_READY.includes(error.code)) {
    console.error(DB_HINT);
    hintShown = true;
  } else if (error && isNetworkError(error)) {
    warnNetwork(error);
  } else if (error) {
    console.error("⚠️  Supabase so'roviga xato javob berdi:", error.message || error);
  }
});
