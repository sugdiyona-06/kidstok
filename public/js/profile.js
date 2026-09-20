import { $, childPicker, el, formatDate, getSupabase, loadContext, mountChrome, resetContext, signOut } from "./core.js";

mountChrome("profile");

const loading = $("#loading");
const authSection = $("#auth-section");
const profileSection = $("#profile-section");
const errorBox = $("#auth-error");
const noteBox = $("#auth-note");

const tabs = { login: $("#tab-login"), register: $("#tab-register") };
const forms = { login: $("#login-form"), register: $("#register-form") };

/* ---------- Kirish / ro'yxatdan o'tish ---------- */
function showTab(name) {
  for (const key of Object.keys(tabs)) {
    tabs[key].setAttribute("aria-selected", String(key === name));
    forms[key].hidden = key !== name;
  }
  $("#forgot-form").hidden = true;
  errorBox.hidden = true;
  noteBox.hidden = true;
}
tabs.login.addEventListener("click", () => showTab("login"));
tabs.register.addEventListener("click", () => showTab("register"));

function showError(message) {
  noteBox.hidden = true;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function humanizeAuthError(error) {
  const message = (error.message || "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed")) {
    return "Supabase'ga ulanib bo'lmadi. Internetni va serverdagi SUPABASE_URL to'g'riligini tekshiring.";
  }
  if (message.includes("invalid login")) return "Email yoki parol noto'g'ri.";
  if (message.includes("email not confirmed")) return "Emailingiz hali tasdiqlanmagan. Pochtangizni tekshiring.";
  if (message.includes("already registered")) return "Bu email bilan ro'yxatdan o'tilgan. Kirish bo'limidan foydalaning.";
  if (message.includes("password")) return "Parol talabga javob bermaydi (kamida 8 ta belgi bo'lsin).";
  return error.message || "Xatolik yuz berdi. Qayta urinib ko'ring.";
}

async function withBusy(form, task) {
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  errorBox.hidden = true;
  try {
    await task();
  } finally {
    button.disabled = false;
  }
}

/* ---------- Parolni unutdim ---------- */
const forgotForm = $("#forgot-form");
$("#forgot-link").addEventListener("click", (event) => {
  event.preventDefault();
  forms.login.hidden = true;
  forgotForm.hidden = false;
  errorBox.hidden = true;
  noteBox.hidden = true;
  $("#forgot-email").focus();
});
$("#forgot-cancel").addEventListener("click", () => {
  forgotForm.hidden = true;
  forms.login.hidden = false;
});
forgotForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = new FormData(forgotForm).get("email");
  withBusy(forgotForm, async () => {
    const sb = await getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset` });
    if (error) return showError(humanizeAuthError(error));
    noteBox.textContent = "Agar bu email ro'yxatdan o'tgan bo'lsa, parolni yangilash havolasi yuborildi. Xat kelmasa, administrator bilan bog'laning.";
    noteBox.hidden = false;
  });
});

forms.login.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(forms.login);
  withBusy(forms.login, async () => {
    const sb = await getSupabase();
    const { error } = await sb.auth.signInWithPassword({ email: data.get("email"), password: data.get("password") });
    if (error) return showError(humanizeAuthError(error));
    forms.login.reset();
    location.reload();
  });
});

forms.register.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(forms.register);
  withBusy(forms.register, async () => {
    const sb = await getSupabase();
    const { data: result, error } = await sb.auth.signUp({
      email: data.get("email"),
      password: data.get("password"),
      options: { data: { full_name: String(data.get("full_name")).trim() }, emailRedirectTo: `${location.origin}/profile` },
    });
    if (error) return showError(humanizeAuthError(error));

    forms.register.reset();
    if (result.session) return location.reload();

    // Supabase'da "Confirm email" yoqilgan bo'lsa
    noteBox.textContent = "Emailingizga tasdiqlash xati yuborildi. Havolani bosgach, shu sahifaga qaytasiz.";
    noteBox.hidden = false;
  });
});

/* ---------- Profil ---------- */
function renderProfile(ctx) {
  const { me, children, child } = ctx;
  $("#parent-name").textContent = me.full_name || me.email.split("@")[0];
  $("#parent-email").textContent = me.email;

  const badge = $("#pro-badge");
  badge.className = ctx.isPro ? "badge badge--pro" : "badge badge--off";
  badge.textContent = ctx.isPro ? `Pro obuna: ${formatDate(me.pro_until)} gacha` : "Pro obuna yo'q";

  // Bolalar
  const kids = $("#kids");
  const hint = $("#kids-hint");
  if (children.length) {
    kids.replaceChildren(...childPicker(children, child?.id));
    hint.hidden = true;
  } else {
    kids.replaceChildren();
    hint.hidden = false;
    hint.textContent = "Hali bola profili yo'q. Ota-onalar bo'limida yarating.";
  }
  kids.append(
    el("a", { class: "kid kid--add", href: "/parent" }, el("span", { class: "avatar avatar--lg", "aria-hidden": "true", text: "+" }), el("span", { text: "Bola qo'shish" }))
  );

  // Tanlangan bolaning kutubxonasi
  const library = $("#library-panel");
  library.hidden = !child;
  if (child) {
    $("#library-title").textContent = `${child.name} kutubxonasi`;
    const tile = (tab, emoji, title, small) =>
      el("a", { class: "tile tile--wide", href: `/library?tab=${tab}` }, el("span", { class: "tile__emoji", "aria-hidden": "true", text: emoji }), el("span", {}, title, el("small", { text: small })));
    $("#library-tiles").replaceChildren(
      tile("likes", "❤️", "Yoqtirganlar", "Sevimli videolar"),
      tile("playlists", "📋", "Ijro ro'yxatlari", "O'z to'plamlari"),
      tile("history", "🕘", "Ko'rilganlar", "Yaqinda ko'rilgan"),
      tile("follows", "⭐", "Obunalar", "Sevimli kanallar")
    );
  }

  $("#admin-link").hidden = me.role !== "admin";
}

$("#logout").addEventListener("click", async () => {
  await signOut();
  resetContext();
  location.reload();
});

try {
  const ctx = await loadContext();
  loading.hidden = true;
  authSection.hidden = Boolean(ctx.session);
  profileSection.hidden = !ctx.session;
  if (ctx.session) renderProfile(ctx);
} catch (error) {
  loading.hidden = false;
  loading.textContent = error.message;
}
