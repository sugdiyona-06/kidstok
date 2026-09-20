import { Router } from "express";
import { supabase } from "../db.js";
import { requireAuth, requireChild } from "../auth.js";
import { HttpError, clamp, isPro, isUuid, publicUrl, str, today } from "../util.js";
import { VIDEO_SELECT, getPublishedVideo, shapeChannel, shapeVideo, visibleTo } from "../videos.js";

export const kids = Router();

const asChild = [requireAuth, requireChild];

/* ------------------------------------------------------------------ */
/*  Akkaunt                                                            */
/* ------------------------------------------------------------------ */
kids.get("/me", requireAuth, async (req, res) => {
  const { data } = await supabase.from("parent_pins").select("parent_id").eq("parent_id", req.user.id).maybeSingle();
  res.json({
    id: req.user.id,
    email: req.user.email,
    full_name: req.profile.full_name ?? "",
    role: req.profile.role,
    is_pro: isPro(req.profile),
    pro_until: req.profile.pro_until,
    has_pin: Boolean(data),
    created_at: req.user.created_at,
  });
});

// "Kim tomosha qiladi?" ekrani uchun (PIN talab qilinmaydi)
kids.get("/children", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("child_profiles")
    .select("id, name, avatar, age, daily_limit_minutes")
    .eq("parent_id", req.user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  res.json(data);
});

/* ------------------------------------------------------------------ */
/*  Tomosha qilish (faqat Pro obuna, yosh va kunlik limit tekshiriladi) */
/* ------------------------------------------------------------------ */
const limitSeconds = (child) => (child.daily_limit_minutes ? child.daily_limit_minutes * 60 : null);

async function usedToday(childId) {
  const { data, error } = await supabase.from("daily_usage").select("seconds").eq("child_id", childId).eq("day", today()).maybeSingle();
  if (error) throw error;
  return data?.seconds ?? 0;
}

const remaining = (limit, used) => (limit === null ? null : Math.max(0, limit - used));

kids.post("/videos/:id/play", ...asChild, async (req, res) => {
  if (!isPro(req.profile)) throw new HttpError(402, "Tomosha qilish uchun Pro obuna kerak", "pro_required");

  const video = await getPublishedVideo(req.params.id, "id, video_path, min_age");
  if (video.min_age > req.child.age) throw new HttpError(403, "Bu video kattaroq bolalar uchun", "age_blocked");

  const limit = limitSeconds(req.child);
  const used = await usedToday(req.child.id);
  if (limit !== null && used >= limit) throw new HttpError(403, "Bugungi tomosha vaqti tugadi", "limit_reached");

  // Video bucket yopiq: havola 1 soat amal qiladi va faqat shu yerda beriladi
  const signed = await supabase.storage.from("videos").createSignedUrl(video.video_path, 3600);
  if (signed.error) throw signed.error;

  // 0 soniya bilan yozamiz: video tarixda darrov ko'rinadi.
  // Shorts lentasi keyingi videoni oldindan yuklaydi (record=0): u hali ko'rilmagani uchun tarixga yozilmaydi.
  if (req.query.record !== "0") {
    const rec = await supabase.rpc("record_watch", { p_child: req.child.id, p_video: video.id, p_day: today(), p_seconds: 0 });
    if (rec.error) throw rec.error;
  }

  res.json({ url: signed.data.signedUrl, remaining_seconds: remaining(limit, used) });
});

kids.post("/watch/heartbeat", ...asChild, async (req, res) => {
  if (!isPro(req.profile)) throw new HttpError(402, "Tomosha qilish uchun Pro obuna kerak", "pro_required");
  if (!isUuid(req.body?.video_id)) throw new HttpError(400, "Video ko'rsatilmagan");

  const seconds = clamp(Math.floor(Number(req.body.seconds)) || 0, 1, 30);
  const rec = await supabase.rpc("record_watch", { p_child: req.child.id, p_video: req.body.video_id, p_day: today(), p_seconds: seconds });
  if (rec.error) throw rec.error;

  const limit = limitSeconds(req.child);
  res.json({ used_seconds: rec.data, remaining_seconds: remaining(limit, rec.data) });
});

kids.get("/child/usage", ...asChild, async (req, res) => {
  const limit = limitSeconds(req.child);
  const used = await usedToday(req.child.id);
  res.json({ used_seconds: used, limit_seconds: limit, remaining_seconds: remaining(limit, used) });
});

/* ------------------------------------------------------------------ */
/*  Tarix, like, obunalar                                              */
/* ------------------------------------------------------------------ */
kids.get("/child/history", ...asChild, async (req, res) => {
  const limit = clamp(Number(req.query.limit) || 20, 1, 50);
  const { data, error } = await supabase
    .from("watch_history")
    .select(`last_watched_at, video:videos(${VIDEO_SELECT})`)
    .eq("child_id", req.child.id)
    .order("last_watched_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  res.json(data.filter((row) => visibleTo(req.child)(row.video)).map((row) => ({ ...shapeVideo(row.video), last_watched_at: row.last_watched_at })));
});

kids.get("/child/likes", ...asChild, async (req, res) => {
  const { data, error } = await supabase
    .from("likes")
    .select(`created_at, video:videos(${VIDEO_SELECT})`)
    .eq("child_id", req.child.id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  res.json(data.filter((row) => visibleTo(req.child)(row.video)).map((row) => shapeVideo(row.video)));
});

kids.post("/videos/:id/like", ...asChild, async (req, res) => {
  const video = await getPublishedVideo(req.params.id, "id");
  const { error } = await supabase
    .from("likes")
    .upsert({ child_id: req.child.id, video_id: video.id }, { onConflict: "child_id,video_id", ignoreDuplicates: true });
  if (error) throw error;
  res.status(204).end();
});

kids.delete("/videos/:id/like", ...asChild, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Video topilmadi");
  const { error } = await supabase.from("likes").delete().eq("child_id", req.child.id).eq("video_id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

kids.get("/child/follows", ...asChild, async (req, res) => {
  const { data, error } = await supabase
    .from("channel_follows")
    .select("channel:channels(id, name, description, avatar_path)")
    .eq("child_id", req.child.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data.filter((row) => row.channel).map((row) => shapeChannel(row.channel)));
});

kids.post("/channels/:id/follow", ...asChild, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Kanal topilmadi");
  const channel = await supabase.from("channels").select("id").eq("id", req.params.id).maybeSingle();
  if (!channel.data) throw new HttpError(404, "Kanal topilmadi");
  const { error } = await supabase
    .from("channel_follows")
    .upsert({ child_id: req.child.id, channel_id: req.params.id }, { onConflict: "child_id,channel_id", ignoreDuplicates: true });
  if (error) throw error;
  res.status(204).end();
});

kids.delete("/channels/:id/follow", ...asChild, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "Kanal topilmadi");
  const { error } = await supabase.from("channel_follows").delete().eq("child_id", req.child.id).eq("channel_id", req.params.id);
  if (error) throw error;
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/*  Ijro ro'yxatlari                                                   */
/* ------------------------------------------------------------------ */
const MAX_PLAYLISTS = 30;

async function ownPlaylist(child, id) {
  if (!isUuid(id)) throw new HttpError(404, "Ro'yxat topilmadi");
  const { data, error } = await supabase.from("playlists").select("id, name").eq("id", id).eq("child_id", child.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Ro'yxat topilmadi");
  return data;
}

kids.get("/child/playlists", ...asChild, async (req, res) => {
  const { data, error } = await supabase
    .from("playlists")
    .select("id, name, created_at, items:playlist_items(video_id, added_at, video:videos(thumb_path))")
    .eq("child_id", req.child.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const videoId = isUuid(req.query.video) ? req.query.video : null;
  res.json(
    data.map((p) => {
      const items = [...p.items].sort((a, b) => b.added_at.localeCompare(a.added_at));
      return {
        id: p.id,
        name: p.name,
        count: items.length,
        cover_url: publicUrl(items.find((i) => i.video?.thumb_path)?.video.thumb_path),
        has_video: videoId ? items.some((i) => i.video_id === videoId) : false,
      };
    })
  );
});

kids.post("/child/playlists", ...asChild, async (req, res) => {
  const name = str(req.body?.name, 40);
  if (!name) throw new HttpError(400, "Ro'yxat nomini kiriting");
  const count = await supabase.from("playlists").select("*", { count: "exact", head: true }).eq("child_id", req.child.id);
  if ((count.count ?? 0) >= MAX_PLAYLISTS) throw new HttpError(400, `Ro'yxatlar soni ${MAX_PLAYLISTS} tadan oshmasligi kerak`);
  const { data, error } = await supabase.from("playlists").insert({ child_id: req.child.id, name }).select("id, name").single();
  if (error) throw error;
  res.status(201).json({ ...data, count: 0, cover_url: null, has_video: false });
});

kids.get("/child/playlists/:id", ...asChild, async (req, res) => {
  const playlist = await ownPlaylist(req.child, req.params.id);
  const { data, error } = await supabase
    .from("playlist_items")
    .select(`added_at, video:videos(${VIDEO_SELECT})`)
    .eq("playlist_id", playlist.id)
    .order("added_at", { ascending: false });
  if (error) throw error;
  res.json({ ...playlist, videos: data.filter((row) => visibleTo(req.child)(row.video)).map((row) => shapeVideo(row.video)) });
});

kids.delete("/child/playlists/:id", ...asChild, async (req, res) => {
  const playlist = await ownPlaylist(req.child, req.params.id);
  const { error } = await supabase.from("playlists").delete().eq("id", playlist.id);
  if (error) throw error;
  res.status(204).end();
});

kids.post("/child/playlists/:id/items", ...asChild, async (req, res) => {
  const playlist = await ownPlaylist(req.child, req.params.id);
  const video = await getPublishedVideo(req.body?.video_id, "id");
  const { error } = await supabase
    .from("playlist_items")
    .upsert({ playlist_id: playlist.id, video_id: video.id }, { onConflict: "playlist_id,video_id", ignoreDuplicates: true });
  if (error) throw error;
  res.status(204).end();
});

kids.delete("/child/playlists/:id/items/:videoId", ...asChild, async (req, res) => {
  const playlist = await ownPlaylist(req.child, req.params.id);
  if (!isUuid(req.params.videoId)) throw new HttpError(404, "Video topilmadi");
  const { error } = await supabase.from("playlist_items").delete().eq("playlist_id", playlist.id).eq("video_id", req.params.videoId);
  if (error) throw error;
  res.status(204).end();
});
