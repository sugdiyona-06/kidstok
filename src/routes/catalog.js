import { Router } from "express";
import { supabase } from "../db.js";
import { config } from "../config.js";
import { softAuth, softChild } from "../auth.js";
import { HttpError, clamp, cleanQuery, isUuid } from "../util.js";
import { VIDEO_SELECT, getPublishedVideo, shapeChannel, shapeVideo } from "../videos.js";

export const catalog = Router();

catalog.get("/health", (_req, res) => res.json({ ok: true }));

// Brauzer Supabase Auth bilan ishlashi uchun (anon kalit ochiq bo'lishi mo'ljallangan)
catalog.get("/config", (_req, res) => {
  res.json({ supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.anonKey, proContactUrl: config.proContactUrl });
});

catalog.get("/categories", async (_req, res) => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, emoji")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  res.json(data);
});

// Faqat kamida bitta nashr etilgan videosi bor kanallar
catalog.get("/channels", async (_req, res) => {
  const [channels, videos] = await Promise.all([
    supabase.from("channels").select("id, name, description, avatar_path").order("name"),
    supabase.from("videos").select("channel_id").eq("is_published", true).not("channel_id", "is", null),
  ]);
  if (channels.error) throw channels.error;
  if (videos.error) throw videos.error;
  const active = new Set(videos.data.map((v) => v.channel_id));
  res.json(channels.data.filter((c) => active.has(c.id)).map(shapeChannel));
});

catalog.get("/channels/:id", softAuth, softChild, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Kanal topilmadi");
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, description, avatar_path")
    .eq("id", req.params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Kanal topilmadi");

  let following = false;
  if (req.child) {
    const follow = await supabase
      .from("channel_follows")
      .select("channel_id")
      .eq("child_id", req.child.id)
      .eq("channel_id", data.id)
      .maybeSingle();
    following = Boolean(follow.data);
  }
  res.json({ ...shapeChannel(data), following });
});

catalog.get("/videos", softAuth, softChild, async (req, res) => {
  const limit = clamp(Number(req.query.limit) || 24, 1, 60);
  const q = cleanQuery(req.query.q);

  let query = supabase
    .from("videos")
    .select(VIDEO_SELECT)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Bola profili tanlangan bo'lsa, faqat uning yoshiga mos videolar ko'rsatiladi
  if (req.child) query = query.lte("min_age", req.child.age);
  if (isUuid(req.query.category)) query = query.eq("category_id", req.query.category);
  if (isUuid(req.query.channel)) query = query.eq("channel_id", req.query.channel);
  if (q) query = query.ilike("title", `%${q}%`);

  if (req.query.follow === "1") {
    if (!req.child) throw new HttpError(400, "Avval bola profilini tanlang", "no_child");
    const follows = await supabase.from("channel_follows").select("channel_id").eq("child_id", req.child.id);
    if (follows.error) throw follows.error;
    if (!follows.data.length) return res.json([]);
    query = query.in("channel_id", follows.data.map((f) => f.channel_id));
  }

  const { data, error } = await query;
  if (error) throw error;
  res.json(data.map(shapeVideo));
});

catalog.get("/videos/:id", softAuth, softChild, async (req, res) => {
  const video = await getPublishedVideo(req.params.id, `${VIDEO_SELECT}, category:categories(id, name, emoji)`);

  const likeCount = await supabase.from("likes").select("*", { count: "exact", head: true }).eq("video_id", video.id);
  const result = {
    ...shapeVideo(video),
    category: video.category ?? null,
    like_count: likeCount.count ?? 0,
    liked: false,
    following: false,
    age_blocked: Boolean(req.child && video.min_age > req.child.age),
  };

  if (req.child) {
    const [liked, follow] = await Promise.all([
      supabase.from("likes").select("video_id").eq("child_id", req.child.id).eq("video_id", video.id).maybeSingle(),
      video.channel
        ? supabase.from("channel_follows").select("channel_id").eq("child_id", req.child.id).eq("channel_id", video.channel.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    result.liked = Boolean(liked.data);
    result.following = Boolean(follow.data);
  }
  res.json(result);
});
