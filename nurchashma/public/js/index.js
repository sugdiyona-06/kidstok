import { $, api, avatarEl, channelBubble, childPicker, el, loadContext, mountChrome, renderError, renderVideos } from "./core.js";

mountChrome("home");

const ctx = await loadContext().catch(() => ({ session: null, me: null, children: [], child: null, isPro: false }));
const locked = ctx.session ? !ctx.isPro : true;

/* ---------- Tepa qism: mehmon / bola tanlash / salomlashish ---------- */
const notice = $("#notice");
const addNotice = (text, linkHref, linkText) =>
  notice.append(el("div", { class: "notice" }, el("p", { text }), el("a", { class: "btn btn--small", href: linkHref, text: linkText })));

if (!ctx.session) {
  $("#hero").hidden = false;
} else {
  if (ctx.child) {
    const greeting = $("#greeting");
    greeting.hidden = false;
    greeting.replaceChildren(
      avatarEl(ctx.child.avatar, "avatar avatar--lg"),
      el("div", {}, el("h1", { text: `Salom, ${ctx.child.name}!` }), el("p", { text: "Bugun nima ko‘ramiz?" }))
    );
  } else if (ctx.children.length) {
    $("#picker-block").hidden = false;
    $("#picker").replaceChildren(...childPicker(ctx.children, null));
  } else {
    addNotice("Tomosha qilish uchun avval bola profilini yarating.", "/parent", "Bola qo‘shish");
  }
  if (!ctx.isPro) addNotice("Videolarni tomosha qilish uchun Pro obuna kerak.", "/pro", "Pro haqida");
}

/* ---------- Kontent ---------- */
const latest = $("#latest");

try {
  const [categories, channels, videos] = await Promise.all([api("/categories"), api("/channels"), api("/videos?limit=12")]);

  if (categories.length) {
    $("#cats-block").hidden = false;
    $("#tiles").replaceChildren(
      el("a", { class: "tile tile--all", href: "/search" }, el("span", { class: "tile__emoji", "aria-hidden": "true", text: "🌟" }), el("span", { text: "Hammasi" })),
      ...categories.map((c) =>
        el("a", { class: "tile", href: `/search?category=${c.id}` }, el("span", { class: "tile__emoji", "aria-hidden": "true", text: c.emoji }), el("span", { text: c.name }))
      )
    );
  }

  if (channels.length) {
    $("#channels-block").hidden = false;
    $("#channels").replaceChildren(...channels.map(channelBubble));
  }

  renderVideos(latest, videos, { locked, empty: "Hozircha videolar yo'q", emptyText: "Admin paneldan birinchi videoni yuklang." });

  if (ctx.child) {
    const recent = await api("/child/history?limit=6");
    if (recent.length) {
      $("#recent-block").hidden = false;
      renderVideos($("#recent"), recent, { locked });
    }
  }
} catch (error) {
  renderError(latest, error);
}
