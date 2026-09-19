import { supabase } from "./db.js";
import { HttpError, isUuid, publicUrl } from "./util.js";

// Ro'yxatlar uchun kerakli ustunlar (video fayl yo'li bu yerda YO'Q — u faqat /play orqali beriladi)
export const VIDEO_SELECT =
  "id, title, description, duration_seconds, min_age, is_published, thumb_path, created_at, category_id, channel:channels(id, name, avatar_path)";

export const shapeChannel = (c) => ({
  id: c.id,
  name: c.name,
  description: c.description ?? null,
  avatar_url: publicUrl(c.avatar_path),
});

export function shapeVideo(v) {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    duration_seconds: v.duration_seconds,
    min_age: v.min_age,
    thumb_url: publicUrl(v.thumb_path),
    created_at: v.created_at,
    category_id: v.category_id,
    channel: v.channel ? { id: v.channel.id, name: v.channel.name, avatar_url: publicUrl(v.channel.avatar_path) } : null,
  };
}

/** Bola uchun ko'rinadigan videolarmi (nashr etilgan va yoshi mos)? */
export const visibleTo = (child) => (v) => v && v.is_published && (!child || v.min_age <= child.age);

export async function getPublishedVideo(id, columns = VIDEO_SELECT) {
  if (!isUuid(id)) throw new HttpError(404, "Video topilmadi");
  const { data, error } = await supabase.from("videos").select(columns).eq("id", id).eq("is_published", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Video topilmadi");
  return data;
}
