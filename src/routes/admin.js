import crypto from "node:crypto";
import { Router } from "express";
import { supabase } from "../db.js";
import { requireAdmin, requireAuth } from "../auth.js";
import { HttpError, int, isPro, isUuid, publicUrl, str } from "../util.js";

export const admin = Router();
admin.use(requireAuth, requireAdmin);

const found = (row, what) => {
  if (!row) throw new HttpError(404, `${what} topilmadi`);
  return row;
};

async function removeFiles(bucket, paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from(bucket).remove(list);
  if (error) console.error(`Fayllarni o'chirib bo'lmadi (${bucket}):`, error.message);
}

/* ------------------------------------------------------------------ */
/*  Statistika                                                         */
/* ------------------------------------------------------------------ */
admin.get("/stats", async (_req, res) => {
  const count = async (table, filter) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };
  const [parents, children, videos, published, channels, pro] = await Promise.all([
    count("profiles"),
    count("child_profiles"),
    count("videos"),
    count("videos", (q) => q.eq("is_published", true)),
    count("channels"),
    count("profiles", (q) => q.gt("pro_until", new Date().toISOString())),
  ]);
  res.json({ parents, children, videos, published, channels, pro });
});

/* ------------------------------------------------------------------ */
/*  Fayl yuklash: brauzer faylni to'g'ridan-to'g'ri Supabase Storage'ga */
/*  yuboradi (Render serveri katta fayllarni o'tkazib turmaydi)         */
/* ------------------------------------------------------------------ */
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const UPLOAD_KINDS = {
  video: { bucket: "videos", prefix: "", types: { "video/mp4": "mp4", "video/webm": "webm" } },
  thumb: { bucket: "thumbnails", prefix: "", types: IMAGE_TYPES },
  channel: { bucket: "thumbnails", prefix: "channels/", types: IMAGE_TYPES },
};

admin.post("/uploads", async (req, res) => {
  const kind = UPLOAD_KINDS[req.body?.kind];
  if (!kind) throw new HttpError(400, "Fayl turi noma'lum");
  const ext = kind.types[req.body?.content_type];
  if (!ext) throw new HttpError(400, "Bu fayl formati qabul qilinmaydi (video: MP4/WebM, rasm: JPG/PNG/WebP)");

  const path = `${kind.prefix}${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from(kind.bucket).createSignedUploadUrl(path);
  if (error) throw error;
  res.json({ bucket: kind.bucket, path, token: data.token });
});

/* ------------------------------------------------------------------ */
/*  Bo'limlar                                                          */
/* ------------------------------------------------------------------ */
function cleanCategory(b = {}) {
  const name = str(b.name, 40);
  if (!name) throw new HttpError(400, "Bo'lim nomini kiriting");
  return { name, emoji: str(b.emoji, 8) || "🎬", sort_order: Number.isInteger(int(b.sort_order)) ? int(b.sort_order) : 0 };
}

admin.get("/categories", async (_req, res) => {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order").order("name");
  if (error) throw error;
  res.json(data);
});

admin.post("/categories", async (req, res) => {
  const { data, error } = await supabase.from("categories").insert(cleanCategory(req.body)).select().single();
  if (error?.code === "23505") throw new HttpError(400, "Bunday nomli bo'lim bor");
  if (error) throw error;
  res.status(201).json(data);
});

admin.put("/categories/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Bo'lim topilmadi");
  const { data, error } = await supabase.from("categories").update(cleanCategory(req.body)).eq("id", req.params.id).select().maybeSingle();
  if (error?.code === "23505") throw new HttpError(400, "Bunday nomli bo'lim bor");
  if (error) throw error;
  res.json(found(data, "Bo'lim"));
});

admin.delete("/categories/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Bo'lim topilmadi");
  const { error } = await supabase.from("categories").delete().eq("id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/*  Kanallar                                                           */
/* ------------------------------------------------------------------ */
const CHANNEL_PATH = /^channels\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

function cleanChannel(b = {}) {
  const name = str(b.name, 60);
  if (!name) throw new HttpError(400, "Kanal nomini kiriting");
  const out = { name, description: str(b.description, 300) || null };
  if (b.avatar_path) {
    if (!CHANNEL_PATH.test(b.avatar_path)) throw new HttpError(400, "Rasm yo'li noto'g'ri");
    out.avatar_path = b.avatar_path;
  }
  return out;
}

const withAvatar = (c) => ({ ...c, avatar_url: publicUrl(c.avatar_path) });

admin.get("/channels", async (_req, res) => {
  const { data, error } = await supabase.from("channels").select("*").order("name");
  if (error) throw error;
  res.json(data.map(withAvatar));
});

admin.post("/channels", async (req, res) => {
  const { data, error } = await supabase.from("channels").insert(cleanChannel(req.body)).select().single();
  if (error) throw error;
  res.status(201).json(withAvatar(data));
});

admin.put("/channels/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Kanal topilmadi");
  const before = found((await supabase.from("channels").select("avatar_path").eq("id", req.params.id).maybeSingle()).data, "Kanal");
  const patch = cleanChannel(req.body);
  const { data, error } = await supabase.from("channels").update(patch).eq("id", req.params.id).select().single();
  if (error) throw error;
  if (patch.avatar_path && before.avatar_path !== patch.avatar_path) await removeFiles("thumbnails", [before.avatar_path]);
  res.json(withAvatar(data));
});

admin.delete("/channels/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Kanal topilmadi");
  const before = (await supabase.from("channels").select("avatar_path").eq("id", req.params.id).maybeSingle()).data;
  const { error } = await supabase.from("channels").delete().eq("id", req.params.id);
  if (error) throw error;
  await removeFiles("thumbnails", [before?.avatar_path]);
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/*  Videolar                                                           */
/* ------------------------------------------------------------------ */
const VIDEO_PATH = /^[0-9a-f-]{36}\.(mp4|webm)$/i;
const THUMB_PATH = /^[0-9a-f-]{36}\.(jpg|png|webp)$/i;

function optionalUuid(v, what) {
  if (v === null || v === undefined || v === "") return null;
  if (!isUuid(v)) throw new HttpError(400, `${what} noto'g'ri`);
  return v;
}

function cleanVideo(b = {}, creating) {
  const out = {
    title: str(b.title, 150),
    description: str(b.description, 1000) || null,
    channel_id: optionalUuid(b.channel_id, "Kanal"),
    category_id: optionalUuid(b.category_id, "Bo'lim"),
    min_age: int(b.min_age),
    is_published: b.is_published !== false,
    duration_seconds: b.duration_seconds === null || b.duration_seconds === undefined || b.duration_seconds === "" ? null : int(b.duration_seconds),
  };
  if (!out.title) throw new HttpError(400, "Sarlavha kiritilishi shart");
  if (!(out.min_age >= 2 && out.min_age <= 6)) throw new HttpError(400, "Yosh 2 dan 6 gacha bo'lishi kerak");
  if (out.duration_seconds !== null && !(out.duration_seconds >= 0)) throw new HttpError(400, "Davomiylik noto'g'ri");

  if (b.video_path) {
    if (!VIDEO_PATH.test(b.video_path)) throw new HttpError(400, "Video yo'li noto'g'ri");
    out.video_path = b.video_path;
  } else if (creating) {
    throw new HttpError(400, "Video faylini yuklang");
  }
  if (b.thumb_path) {
    if (!THUMB_PATH.test(b.thumb_path)) throw new HttpError(400, "Muqova yo'li noto'g'ri");
    out.thumb_path = b.thumb_path;
  }
  return out;
}

const withThumb = (v) => ({ ...v, thumb_url: publicUrl(v.thumb_path) });

admin.get("/videos", async (_req, res) => {
  const { data, error } = await supabase
    .from("videos")
    .select("*, channel:channels(id, name), category:categories(id, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data.map(withThumb));
});

admin.post("/videos", async (req, res) => {
  const { data, error } = await supabase.from("videos").insert(cleanVideo(req.body, true)).select().single();
  if (error) throw error;
  res.status(201).json(withThumb(data));
});

admin.put("/videos/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Video topilmadi");
  const before = found((await supabase.from("videos").select("video_path, thumb_path").eq("id", req.params.id).maybeSingle()).data, "Video");
  const patch = { ...cleanVideo(req.body, false), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("videos").update(patch).eq("id", req.params.id).select().single();
  if (error) throw error;

  // Almashtirilgan eski fayllarni Storage'dan olib tashlaymiz
  if (patch.video_path && patch.video_path !== before.video_path) await removeFiles("videos", [before.video_path]);
  if (patch.thumb_path && patch.thumb_path !== before.thumb_path) await removeFiles("thumbnails", [before.thumb_path]);
  res.json(withThumb(data));
});

admin.delete("/videos/:id", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Video topilmadi");
  const before = (await supabase.from("videos").select("video_path, thumb_path").eq("id", req.params.id).maybeSingle()).data;
  const { error } = await supabase.from("videos").delete().eq("id", req.params.id);
  if (error) throw error;
  if (before) {
    await removeFiles("videos", [before.video_path]);
    await removeFiles("thumbnails", [before.thumb_path]);
  }
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/*  Foydalanuvchilar (ota-onalar), rollar va Pro obuna                  */
/* ------------------------------------------------------------------ */
admin.get("/users", async (_req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, pro_until, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data.map((u) => ({ ...u, is_pro: isPro(u) })));
});

admin.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body ?? {};
  if (!isUuid(id)) throw new HttpError(404, "Foydalanuvchi topilmadi");
  if (!["user", "admin"].includes(role)) throw new HttpError(400, "Rol noto'g'ri");
  if (id === req.user.id && role !== "admin") throw new HttpError(400, "O'zingizning admin huquqingizni olib tashlay olmaysiz");
  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select().maybeSingle();
  if (error) throw error;
  found(data, "Foydalanuvchi");
  res.status(204).end();
});

// days > 0: shuncha kun qo'shadi (amaldagi obuna tugagach davom etadi); days = 0: Pro'ni bekor qiladi
admin.post("/users/:id/pro", async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Foydalanuvchi topilmadi");
  const days = int(req.body?.days);
  if (!(days >= 0 && days <= 3650)) throw new HttpError(400, "Kunlar soni 0 dan 3650 gacha bo'lishi kerak");

  const user = found((await supabase.from("profiles").select("pro_until").eq("id", req.params.id).maybeSingle()).data, "Foydalanuvchi");
  let proUntil = null;
  if (days > 0) {
    const base = user.pro_until && new Date(user.pro_until) > new Date() ? new Date(user.pro_until) : new Date();
    proUntil = new Date(base.getTime() + days * 86400000).toISOString();
  }
  const { error } = await supabase.from("profiles").update({ pro_until: proUntil }).eq("id", req.params.id);
  if (error) throw error;
  res.json({ pro_until: proUntil });
});
