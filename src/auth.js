import { supabase } from "./db.js";
import { HttpError, isNetworkError, isUuid } from "./util.js";
import { verifyParentToken } from "./pin.js";

const PROFILE_FIELDS = "id, email, full_name, role, pro_until, created_at";

/** Authorization: Bearer <token> ni tekshirib, req.user va req.profile ni to'ldiradi. */
async function loadUser(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return false;

  const { data, error } = await supabase.auth.getUser(token);
  // Tarmoq uzilgan bo'lsa foydalanuvchini "kirmagan" deb hisoblamaymiz: bu 503 xatosi bo'lishi kerak
  if (error && isNetworkError(error)) throw error;
  if (error || !data?.user) return false;
  const user = data.user;

  const found = await supabase.from("profiles").select(PROFILE_FIELDS).eq("id", user.id).maybeSingle();
  if (found.error) throw found.error;
  let profile = found.data;
  if (!profile) {
    // Sxema o'rnatilishidan oldin ro'yxatdan o'tganlar uchun profilni o'zimiz yaratamiz
    const created = await supabase
      .from("profiles")
      .upsert({ id: user.id, email: user.email, full_name: user.user_metadata?.full_name ?? null }, { onConflict: "id" })
      .select(PROFILE_FIELDS)
      .single();
    if (created.error) throw created.error;
    profile = created.data;
  }

  req.user = user;
  req.profile = profile;
  return true;
}

/** Kirmagan foydalanuvchi ham o'tadi (mehmon). */
export async function softAuth(req, _res, next) {
  await loadUser(req);
  next();
}

export async function requireAuth(req, _res, next) {
  if (!(await loadUser(req))) throw new HttpError(401, "Avval tizimga kiring", "auth_required");
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.profile?.role !== "admin") throw new HttpError(403, "Bu amal faqat administratorlar uchun", "admin_only");
  next();
}

/** X-Child-Id sarlavhasidagi bola shu ota-onaga tegishli ekanini tekshiradi. */
async function loadChild(req, required) {
  const id = req.headers["x-child-id"];
  let child = null;
  if (req.user && isUuid(id)) {
    const { data } = await supabase.from("child_profiles").select("*").eq("id", id).eq("parent_id", req.user.id).maybeSingle();
    child = data;
  }
  if (!child && required) throw new HttpError(400, "Avval bola profilini tanlang", "no_child");
  req.child = child ?? undefined;
}

export async function softChild(req, _res, next) {
  await loadChild(req, false);
  next();
}

export async function requireChild(req, _res, next) {
  await loadChild(req, true);
  next();
}

/** Ota-onalar bo'limi: PIN o'rnatilgan va vaqtinchalik token yaroqli bo'lishi kerak. */
export async function requireParent(req, _res, next) {
  const { data } = await supabase.from("parent_pins").select("parent_id").eq("parent_id", req.user.id).maybeSingle();
  if (!data) throw new HttpError(428, "Avval PIN-kod o'rnating", "no_pin");
  if (!verifyParentToken(req.headers["x-parent-token"], req.user.id)) {
    throw new HttpError(403, "Bu bo'lim PIN-kod bilan ochiladi", "parent_locked");
  }
  next();
}
