import { Router } from "express";
import { supabase } from "../db.js";
import { requireAuth, requireParent } from "../auth.js";
import { AVATARS, HttpError, int, isUuid, str } from "../util.js";
import {
  PARENT_TOKEN_TTL_MS,
  clearPinFailures,
  hashPin,
  isValidPin,
  lockedForMs,
  recordPinFailure,
  signParentToken,
  verifyPin,
} from "../pin.js";

export const parent = Router();

const MAX_CHILDREN = 6;

/* ------------------------------------------------------------------ */
/*  PIN-kod                                                            */
/* ------------------------------------------------------------------ */
async function checkPin(parentId, pin) {
  const wait = lockedForMs(parentId);
  if (wait > 0) {
    throw new HttpError(429, `Juda ko'p xato urinish. ${Math.ceil(wait / 60000)} daqiqadan keyin qayta urinib ko'ring`, "pin_locked");
  }
  const { data, error } = await supabase.from("parent_pins").select("pin_hash, pin_salt").eq("parent_id", parentId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(428, "Avval PIN-kod o'rnating", "no_pin");

  if (!isValidPin(pin) || !(await verifyPin(pin, data.pin_salt, data.pin_hash))) {
    recordPinFailure(parentId);
    throw new HttpError(403, "PIN-kod noto'g'ri", "bad_pin");
  }
  clearPinFailures(parentId);
}

// PIN o'rnatish yoki almashtirish
parent.post("/parent/pin", requireAuth, async (req, res) => {
  const { pin, current_pin } = req.body ?? {};
  if (!isValidPin(pin)) throw new HttpError(400, "PIN-kod aynan 4 ta raqamdan iborat bo'lishi kerak");

  const existing = await supabase.from("parent_pins").select("parent_id").eq("parent_id", req.user.id).maybeSingle();
  if (existing.data) await checkPin(req.user.id, current_pin);

  const { hash, salt } = await hashPin(pin);
  const { error } = await supabase
    .from("parent_pins")
    .upsert({ parent_id: req.user.id, pin_hash: hash, pin_salt: salt, updated_at: new Date().toISOString() }, { onConflict: "parent_id" });
  if (error) throw error;
  res.status(204).end();
});

// To'g'ri PIN uchun 15 daqiqalik token beradi
parent.post("/parent/unlock", requireAuth, async (req, res) => {
  await checkPin(req.user.id, req.body?.pin);
  res.json({ token: signParentToken(req.user.id), expires_in_ms: PARENT_TOKEN_TTL_MS });
});

/* ------------------------------------------------------------------ */
/*  Bola profillari                                                    */
/* ------------------------------------------------------------------ */
function cleanChild(body = {}) {
  const name = str(body.name, 30);
  const age = int(body.age);
  const avatar = AVATARS.includes(body.avatar) ? body.avatar : null;

  let limit = null;
  if (body.daily_limit_minutes !== null && body.daily_limit_minutes !== "" && body.daily_limit_minutes !== undefined) {
    limit = int(body.daily_limit_minutes);
    if (!(limit >= 5 && limit <= 480)) throw new HttpError(400, "Kunlik limit 5 dan 480 daqiqagacha bo'lishi kerak");
  }

  if (!name) throw new HttpError(400, "Bolaning ismini kiriting");
  if (!(age >= 2 && age <= 6)) throw new HttpError(400, "Yosh 2 dan 6 gacha bo'lishi kerak");
  if (!avatar) throw new HttpError(400, "Rasmni tanlang");
  return { name, age, avatar, daily_limit_minutes: limit };
}

const CHILD_FIELDS = "id, name, avatar, age, daily_limit_minutes";

parent.post("/children", requireAuth, requireParent, async (req, res) => {
  const count = await supabase.from("child_profiles").select("*", { count: "exact", head: true }).eq("parent_id", req.user.id);
  if ((count.count ?? 0) >= MAX_CHILDREN) throw new HttpError(400, `Ko'pi bilan ${MAX_CHILDREN} ta bola profili yaratish mumkin`);
  const { data, error } = await supabase
    .from("child_profiles")
    .insert({ ...cleanChild(req.body), parent_id: req.user.id })
    .select(CHILD_FIELDS)
    .single();
  if (error) throw error;
  res.status(201).json(data);
});

parent.put("/children/:id", requireAuth, requireParent, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Bola profili topilmadi");
  const { data, error } = await supabase
    .from("child_profiles")
    .update(cleanChild(req.body))
    .eq("id", req.params.id)
    .eq("parent_id", req.user.id)
    .select(CHILD_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Bola profili topilmadi");
  res.json(data);
});

parent.delete("/children/:id", requireAuth, requireParent, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Bola profili topilmadi");
  const { error } = await supabase.from("child_profiles").delete().eq("id", req.params.id).eq("parent_id", req.user.id);
  if (error) throw error;
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/*  Bola faoliyatini ko'rish (ota-ona)                                 */
/* ------------------------------------------------------------------ */
async function ownChild(req) {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Bola profili topilmadi");
  const { data, error } = await supabase.from("child_profiles").select("id").eq("id", req.params.id).eq("parent_id", req.user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Bola profili topilmadi");
  return data;
}

parent.get("/parent/children/:id/history", requireAuth, requireParent, async (req, res) => {
  const child = await ownChild(req);
  const { data, error } = await supabase
    .from("watch_history")
    .select("last_watched_at, total_seconds, video:videos(id, title)")
    .eq("child_id", child.id)
    .order("last_watched_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  res.json(data.filter((row) => row.video).map((row) => ({ video_id: row.video.id, title: row.video.title, last_watched_at: row.last_watched_at, total_seconds: row.total_seconds })));
});

parent.get("/parent/children/:id/usage", requireAuth, requireParent, async (req, res) => {
  const child = await ownChild(req);
  const { data, error } = await supabase
    .from("daily_usage")
    .select("day, seconds")
    .eq("child_id", child.id)
    .order("day", { ascending: false })
    .limit(7);
  if (error) throw error;
  res.json(data);
});
