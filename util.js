import { config } from "./config.js";

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const isUuid = (v) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

export const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const int = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// PostgREST filtrini buzadigan belgilarni olib tashlaymiz
export const cleanQuery = (q) =>
  String(q ?? "").replace(/[%_,()*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

// Bugungi sana (O'zbekiston vaqti bilan), "2026-09-19" ko'rinishida
export const today = () => new Date(Date.now() + config.tzOffsetHours * 3600 * 1000).toISOString().slice(0, 10);

// Ochiq "thumbnails" bucketi uchun to'g'ridan-to'g'ri havola
export const publicUrl = (path) =>
  path ? `${config.supabaseUrl}/storage/v1/object/public/thumbnails/${path}` : null;

export const AVATARS = ["bear", "cat", "rabbit", "fox", "panda", "lion", "frog", "penguin", "owl", "unicorn", "koala", "dog"];

export const isPro = (profile) => Boolean(profile?.pro_until) && new Date(profile.pro_until) > new Date();

// Internet, DNS yoki Supabase'ga ulanishdagi vaqtinchalik xatolar
export const isNetworkError = (err) =>
  err?.name === "AuthRetryableFetchError" ||
  /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN/.test(`${err?.message ?? ""} ${err?.details ?? ""}`);
