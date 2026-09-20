import { $, api, avatarEl, channelBubble, childPicker, el, emptyBox, loadContext, mountCats, mountChrome, renderError, renderVideos } from "./core.js";
import { catSit } from "./cats.js";
import { createReels, gateSpec } from "./reels.js";

mountChrome("home");

const ctx = await loadContext().catch(() => ({ session: null, me: null, children: [], child: null, isPro: false }));
const locked = ctx.session ? !ctx.isPro : true;

/* ---------- Tepadagi lenta: so'nggi videolar (Instagram Reels kabi) ---------- */
const feed = $("#feed");
$(".feed__loading-cat")?.insertAdjacentHTML("afterbegin", catSit("orange"));

const empty = (title, text) => {
  feed.classList.add("feed--empty");
  feed.replaceChildren(emptyBox(title, text));
};

createReels({
  feed,
  overlay: $("#overlay"),
  prev: $("#prev"),
  next: $("#next"),
  first: 10,
  infinite: false, // bosh sahifada 10 ta; keyin pastdagi bo'limlar, to'liq lenta — /shorts
  endCard: true,
  preview: gateSpec(ctx), // mehmon / Pro yo'q / bola tanlanmagan bo'lsa: faqat muqovalar va qulf
  onEmpty: () => empty("Hozircha videolar yo'q", "Tez orada yangi videolar qo'shiladi."),
  onError: (error) => empty("Yuklab bo'lmadi", error.message),
}).start();

// "Bo'limlar" tugmalari lentadan pastdagi bo'limlarga o'tkazadi
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-jump]")) $("#below").scrollIntoView({ behavior: "smooth", block: "start" });
});

/* ---------- Pastdagi bo'limlar ---------- */
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
    mountCats(); // greeting ichi almashtirilgani uchun mo'ralovchi mushukni qayta qo'shamiz
  } else if (ctx.children.length) {
    $("#picker-block").hidden = false;
    $("#picker").replaceChildren(...childPicker(ctx.children, null));
  } else {
    addNotice("Tomosha qilish uchun avval bola profilini yarating.", "/parent", "Bola qo‘shish");
  }
  if (!ctx.isPro) addNotice("Videolarni tomosha qilish uchun Pro obuna kerak.", "/pro", "Pro haqida");
}

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
    const recent = await api("/child/history?limit=8");
    if (recent.length) {
      $("#recent-block").hidden = false;
      renderVideos($("#recent"), recent, { locked });
    }
  }
} catch (error) {
  renderError(latest, error);
}
