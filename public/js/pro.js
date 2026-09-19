import { $, el, formatDate, getConfig, loadContext, mountChrome } from "./core.js";

mountChrome("profile");

const ctx = await loadContext().catch(() => ({ session: null, me: null, isPro: false }));
const config = await getConfig().catch(() => ({ proContactUrl: "" }));

const status = $("#pro-status");
const actions = $("#pro-actions");

if (ctx.isPro) {
  status.hidden = false;
  status.textContent = `Pro obunangiz faol: ${formatDate(ctx.me.pro_until)} gacha.`;
  actions.append(el("a", { class: "btn", href: "/", text: "Videolarni ko'rish" }));
} else if (!ctx.session) {
  actions.append(el("a", { class: "btn", href: "/profile", text: "Kirish yoki ro'yxatdan o'tish" }));
} else {
  status.hidden = false;
  status.textContent = "Hozircha Pro obunangiz yo'q.";
}

if (!ctx.isPro) {
  if (config.proContactUrl) {
    actions.append(el("a", { class: "btn btn--ghost", href: config.proContactUrl, target: "_blank", rel: "noopener", text: "Obunani faollashtirish" }));
  } else {
    actions.after(el("p", { class: "hint", text: "Obunani faollashtirish uchun administrator bilan bog'laning." }));
  }
}
