import { $, api, childPicker, el, emptyBox, loadContext, mountChrome, renderError, renderMixed, toast, videoCard, channelBubble } from "./core.js";

mountChrome("profile");

const ctx = await loadContext().catch(() => ({ session: null, children: [], child: null, isPro: false }));

const TABS = [
  ["likes", "❤️ Yoqtirganlar"],
  ["playlists", "📋 Ijro ro'yxatlari"],
  ["history", "🕘 Ko'rilganlar"],
  ["follows", "⭐ Obunalar"],
];

const params = new URLSearchParams(location.search);
const tab = TABS.some(([key]) => key === params.get("tab")) ? params.get("tab") : "likes";
const playlistId = params.get("list");

const content = $("#lib-content");
const actions = $("#lib-actions");
const locked = !ctx.isPro;

function needChild() {
  if (!ctx.session) {
    content.replaceChildren(emptyBox("Avval kiring", "Kutubxona ota-ona akkaunti orqali ochiladi."), el("p", {}, el("a", { class: "btn", href: "/profile", text: "Kirish" })));
  } else if (ctx.children.length) {
    content.replaceChildren(el("h2", { text: "Kim tomosha qiladi?" }), el("div", { class: "kids" }, childPicker(ctx.children, null)));
  } else {
    content.replaceChildren(emptyBox("Bola profili yo'q", "Avval ota-onalar bo'limida bola profilini yarating."), el("p", {}, el("a", { class: "btn", href: "/parent", text: "Bola qo'shish" })));
  }
}

/* ---------- Bo'limlar ---------- */
async function showLikes() {
  renderMixed(content, await api("/child/likes"), { locked, empty: "Hali yoqtirilgan videolar yo'q", emptyText: "Video sahifasida ❤️ tugmasini bosing." });
}

async function showHistory() {
  renderMixed(content, await api("/child/history?limit=50"), { locked, empty: "Hali hech narsa ko'rilmagan" });
}

async function showFollows() {
  const [channels, videos] = await Promise.all([api("/child/follows"), api("/videos?follow=1&limit=24")]);
  if (!channels.length) {
    content.replaceChildren(emptyBox("Hali obunalar yo'q", "Kanal sahifasida ⭐ tugmasini bosing."));
    return;
  }
  const grid = el("div");
  renderMixed(grid, videos, { locked, empty: "Obuna bo'lingan kanallarda hozircha video yo'q" });
  content.replaceChildren(el("div", { class: "bubbles" }, channels.map(channelBubble)), el("h2", { text: "Yangi videolar" }), el("br"), grid);
}

async function showPlaylists() {
  const form = el(
    "form",
    {
      class: "searchbar",
      onsubmit: async (event) => {
        event.preventDefault();
        const input = event.target.elements.name;
        if (!input.value.trim()) return;
        try {
          await api("/child/playlists", { method: "POST", body: { name: input.value } });
          location.reload();
        } catch (error) {
          toast(error.message, "error");
        }
      },
    },
    el("input", { type: "text", name: "name", maxlength: "40", placeholder: "Yangi ro'yxat nomi", "aria-label": "Yangi ro'yxat nomi" }),
    el("button", { class: "btn", type: "submit", text: "Yaratish" })
  );
  actions.hidden = false;
  actions.replaceChildren(form);

  const lists = await api("/child/playlists");
  if (!lists.length) {
    content.replaceChildren(emptyBox("Hali ro'yxatlar yo'q", "Yuqoridan birinchi ro'yxatni yarating."));
    return;
  }
  content.replaceChildren(
    el(
      "div",
      { class: "videos" },
      lists.map((list) =>
        el(
          "a",
          { class: "vcard", href: `/library?tab=playlists&list=${list.id}` },
          el("div", { class: "vcard__thumb" }, list.cover_url ? el("img", { src: list.cover_url, alt: "", loading: "lazy" }) : el("span", { class: "thumb-fallback", "aria-hidden": "true", text: "📋" })),
          el("div", { class: "vcard__meta" }, el("div", {}, el("h3", { text: list.name }), el("p", { text: `${list.count} ta video` })))
        )
      )
    )
  );
}

async function showPlaylist(id) {
  const playlist = await api(`/child/playlists/${id}`);
  $("#lib-title").textContent = playlist.name;

  actions.hidden = false;
  actions.replaceChildren(
    el("a", { class: "btn btn--ghost", href: "/library?tab=playlists", text: "← Barcha ro'yxatlar" }),
    el("button", {
      class: "btn btn--danger",
      type: "button",
      text: "Ro'yxatni o'chirish",
      onclick: async () => {
        if (!confirm(`“${playlist.name}” ro'yxati o'chirilsinmi?`)) return;
        try {
          await api(`/child/playlists/${id}`, { method: "DELETE" });
          location.href = "/library?tab=playlists";
        } catch (error) {
          toast(error.message, "error");
        }
      },
    })
  );

  if (!playlist.videos.length) {
    content.replaceChildren(emptyBox("Ro'yxat bo'sh", "Video sahifasidagi “➕ Ro'yxatga” tugmasi bilan video qo'shing."));
    return;
  }
  content.replaceChildren(
    el(
      "div",
      { class: "videos" },
      playlist.videos.map((video) =>
        el(
          "div",
          { class: "vwrap" },
          videoCard(video, { locked }),
          el("button", {
            class: "btn btn--ghost btn--small",
            type: "button",
            text: "Ro'yxatdan olib tashlash",
            onclick: async () => {
              try {
                await api(`/child/playlists/${id}/items/${video.id}`, { method: "DELETE" });
                location.reload();
              } catch (error) {
                toast(error.message, "error");
              }
            },
          })
        )
      )
    )
  );
}

/* ---------- Ishga tushirish ---------- */
$("#lib-tabs").replaceChildren(
  ...TABS.map(([key, label]) => el("a", { class: "chip", href: `/library?tab=${key}`, "aria-current": key === tab ? "page" : null, text: label }))
);

if (!ctx.child) {
  needChild();
} else {
  $("#lib-title").textContent = `${ctx.child.name} kutubxonasi`;
  try {
    if (tab === "likes") await showLikes();
    else if (tab === "history") await showHistory();
    else if (tab === "follows") await showFollows();
    else if (playlistId) await showPlaylist(playlistId);
    else await showPlaylists();
  } catch (error) {
    renderError(content, error);
  }
}
