import crypto from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config.js";

const scrypt = promisify(crypto.scrypt);

export const isValidPin = (pin) => typeof pin === "string" && /^\d{4}$/.test(pin);

export async function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const key = await scrypt(pin, salt, 32);
  return { salt, hash: key.toString("hex") };
}

export async function verifyPin(pin, salt, hash) {
  const { hash: candidate } = await hashPin(pin, salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Ota-ona vaqtinchalik tokeni (PIN to'g'ri kiritilgach beriladi) ---------- */
const TOKEN_KEY = crypto.createHash("sha256").update(`nurchashma-parent-token:${config.serviceKey}`).digest();
export const PARENT_TOKEN_TTL_MS = 15 * 60 * 1000;

const sign = (payload) => crypto.createHmac("sha256", TOKEN_KEY).update(payload).digest("base64url");

export function signParentToken(parentId) {
  const payload = Buffer.from(JSON.stringify({ sub: parentId, exp: Date.now() + PARENT_TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyParentToken(token, parentId) {
  if (typeof token !== "string") return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.sub === parentId && data.exp > Date.now();
  } catch {
    return false;
  }
}

/* ---------- PIN taxmin qilishdan himoya: 5 ta xato → 5 daqiqa kutish ---------- */
const failures = new Map(); // parentId -> { count, lockedUntil }
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export function lockedForMs(parentId) {
  const entry = failures.get(parentId);
  if (!entry?.lockedUntil) return 0;
  if (entry.lockedUntil <= Date.now()) {
    failures.delete(parentId);
    return 0;
  }
  return entry.lockedUntil - Date.now();
}

export function recordPinFailure(parentId) {
  const entry = failures.get(parentId) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILS) entry.lockedUntil = Date.now() + LOCK_MS;
  failures.set(parentId, entry);
}

export const clearPinFailures = (parentId) => failures.delete(parentId);
