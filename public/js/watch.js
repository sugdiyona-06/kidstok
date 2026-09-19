import {
  $, api, channelAvatar, childPicker, el, emptyBox, formatMinutes, loadContext, mountChrome, openSheet, renderVideos, toast,
} from "./core.js";

mountChrome("home");

const id = new URLSearchParams(location.search).get("id");
const ctx = await loadContext().catch(() => ({ session: null, me: null, children: [], child: null, isPro: false }));

const root = $("#watch");
const player = $("#player");
const timeLeft = $("#time-left");

let video;

/* ------------------------------------------------------------------ */
/*  Pleyer o'rnida chiqadigan xabar oynasi                             */
/* ------------------------------------------------------------------ */
function showGate({ emoji, title, text, extra = [], actions = [] }) {
  player.replaceChildren(
    video.thumb_url ? el("img", { class: "player__poster", src: video.thumb_url, alt: "" }) : null,
    el(
      "div",
      { class: "player__gate" },
      el(
        "div",
        { class: "gate-card" },
        el("span", { class: "gate-emoji", "aria-hidden": "true", text: emoji }),
        el("h2", { text: title }),
        text ? el("p", { class: "muted", text }) : null,
        ...extra,
        ...actions
      )
    )
  );
}

const link = (href, text, ghost = false) => el("a", { class: ghost ? "btn btn--ghost" : "btn", href, text });

const showLimitReached = () =>
  showGate({ emoji: "🌙", title: "Bugungi tomosha vaqti tugadi", text: "Ertaga yana ko'rishamiz! Endi o'ynash yoki dam olish vaqti.", actions: [link("/", "Bosh sahifa", true)] });

function showRemaining(seconds) {
  timeLeft.hidden = seconds === null || seconds === undefined;
  if (!timeLeft.hidden) timeLeft.textContent = `Bugun qolgan vaqt: ${formatMinutes(seconds)}`;
}

/* ------------------------------------------------------------------ */
/*  Tomosha vaqtini hisoblash (kunlik limit va ota-ona tarixi uchun)   */
/* ------------------------------------------------------------------ */
function trackWatching(videoEl) {
  let since = null;

  async function send(seconds) {
    try {
      const result = await api("/watch/heartbeat", { method: "POST", body: { video_id: video.id, seconds }, keepalive: true });
      showRemaining(result.remaining_seconds);
      if (result.remaining_seconds === 0) {
        videoEl.pause();
        showLimitReached();
      }
    } catch (error) {
      if (error.code === "pro_required") {
        videoEl.pause();
        showGate({ emoji: "⭐", title: "Pro obuna muddati tugagan", actions: [link("/pro", "Pro haqida")] });
      }
    }
  }

  function flush() {
    if (since === null) return;
    const now = Date.now();
    let seconds = Math.round((now - since) / 1000);
    since = videoEl.paused || videoEl.ended ? null : now;
    while (seconds > 0) {
      const chunk = Math.min(seconds, 30);
      seconds -= chunk;
      send(chunk);
    }
  }

  videoEl.addEventListener("play", () => {
    since ??= Date.now();
  });
  videoEl.addEventListener("pause", flush);
  videoEl.addEventListener("ended", flush);
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  window.addEventListener("pagehide", flush);
  setInterval(() => !videoEl.paused && flush(), 15000);
}

async function startPlayback() {
  try {
    const play = await api(`/videos/${video.id}/play`, { method: "POST" });
    const videoEl = el("video", {
      controls: true,
      playsinline: true,
      preload: "metadata",
      poster: video.thumb_url,
      src: play.url,
      "aria-label": video.title,
    });
    player.replaceChildren(videoEl);
    showRemaining(play.remaining_seconds);
    trackWatching(videoEl);
  } catch (error) {
    if (error.code === "limit_reached") return showLimitReached();
    if (error.code === "pro_required") return showGate({ emoji: "⭐", title: "Bu video Pro obuna bilan ochiladi", actions: [link("/pro", "Pro haqida")] });
    if (error.code === "age_blocked") return showGate({ emoji: "🎈", title: "Bu video kattaroq bolalar uchun", text: `${video.min_age} yoshdan boshlab.` });
    showGate({ emoji: "😕", title: "Videoni ochib bo'lmadi", text: error.message, actions: [link(location.href, "Qayta urinish", true)] });
  }
}

/* ------------------------------------------------------------------ */
/*  Like, obuna, ijro ro'yxati                                         */
/* ------------------------------------------------------------------ */
function renderActions() {
  const box = $("#actions");
  box.hidden = false;

  let liked = video.liked;
  let count = video.like_count;
  const likeBtn = el("button", { class: "btn btn--ghost", type: "button" });
  const paintLike = () => {
    likeBtn.textContent = `${liked ? "❤️" : "🤍"} ${count}`;
    likeBtn.setAttribute("aria-pressed", String(liked));
    likeBtn.setAttribute("aria-label", liked ? "Yoqtirishni bekor qilish" : "Yoqdi");
  };
  likeBtn.addEventListener("click", async () => {
    try {
      await api(`/videos/${video.id}/like`, { method: liked ? "DELETE" : "POST" });
      liked = !liked;
      count += liked ? 1 : -1;
      paintLike();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  paintLike();
  box.append(likeBtn);

  if (video.channel) {
    let following = video.following;
    const followBtn = el("button", { class: "btn btn--ghost", type: "button" });
    const paintFollow = () => {
      followBtn.textContent = following ? "🔔 Obuna bo'lingan" : "🔔 Obuna bo'lish";
      followBtn.setAttribute("aria-pressed", String(following));
    };
    followBtn.addEventListener("click", async () => {
      try {
        await api(`/channels/${video.channel.id}/follow`, { method: following ? "DELETE" : "POST" });
        following = !following;
        paintFollow();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    paintFollow();
    box.append(followBtn);
  }

  box.append(el("button", { class: "btn btn--ghost", type: "button", onclick: openPlaylistPicker, text: "➕ Ro'yxatga" }));
}

async function openPlaylistPicker() {
  try {
    showPicker(await api(`/child/playlists?video=${video.id}`));
  } catch (error) {
    toast(error.message, "error");
  }
}

function showPicker(lists) {
  const input = el("input", { type: "text", maxlength: "40", placeholder: "Yangi ro'yxat nomi", "aria-label": "Yangi ro'yxat nomi" });

  const rows = lists.map((list) =>
    el(
      "li",
      {},
      el(
        "button",
        {
          class: list.has_video ? "btn" : "btn btn--ghost",
          type: "button",
          "aria-pressed": String(list.has_video),
          onclick: async () => {
            try {
              if (list.has_video) await api(`/child/playlists/${list.id}/items/${video.id}`, { method: "DELETE" });
              else await api(`/child/playlists/${list.id}/items`, { method: "POST", body: { video_id: video.id } });
              list.has_video = !list.has_video;
              showPicker(lists);
            } catch (error) {
              toast(error.message, "error");
            }
          },
        },
        el("span", { text: list.name }),
        el("span", { text: list.has_video ? "✓ Qo'shilgan" : "Qo'shish" })
      )
    )
  );

  const createForm = el(
    "form",
    {
      class: "searchbar",
      onsubmit: async (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        try {
          const created = await api("/child/playlists", { method: "POST", body: { name: input.value } });
          await api(`/child/playlists/${created.id}/items`, { method: "POST", body: { video_id: video.id } });
          created.has_video = true;
          showPicker([created, ...lists]);
          toast("Ro'yxat yaratildi");
        } catch (error) {
          toast(error.message, "error");
        }
      },
    },
    input,
    el("button", { class: "btn", type: "submit", text: "Yaratish" })
  );

  openSheet("Ijro ro'yxatiga qo'shish", rows.length ? el("ul", { class: "pick-list" }, rows) : el("p", { class: "muted", text: "Hali ro'yxatlar yo'q. Birinchisini yarating." }), createForm);
}

/* ------------------------------------------------------------------ */
/*  Sahifani yig'ish                                                   */
/* ------------------------------------------------------------------ */
async function loadSuggestions() {
  const more = $("#more");
  try {
    let list = video.category_id ? await api(`/videos?category=${video.category_id}&limit=8`) : [];
    list = list.filter((v) => v.id !== video.id);
    if (list.length < 2) list = (await api("/videos?limit=8")).filter((v) => v.id !== video.id);
    renderVideos(more, list.slice(0, 6), { locked: !ctx.isPro, empty: "Boshqa videolar yo'q" });
  } catch {
    more.replaceChildren();
  }
}

async function main() {
  try {
    video = await api(`/videos/${id}`);
  } catch (error) {
    const box = $("#watch-error");
    box.hidden = false;
    box.replaceChildren(el("div", { class: "block" }, emptyBox("Video topilmadi", error.message), el("p", {}, el("a", { class: "btn", href: "/", text: "Bosh sahifaga" }))));
    return;
  }

  document.title = `${video.title} — Nurchashma`;
  root.hidden = false;
  $("#title").textContent = video.title;

  if (video.channel) {
    const channelLink = $("#channel");
    channelLink.hidden = false;
    channelLink.href = `/channel?id=${video.channel.id}`;
    channelLink.replaceChildren(channelAvatar(video.channel, "chan chan--mini"), el("span", { text: video.channel.name }));
  }
  if (video.description) {
    $("#desc").hidden = false;
    $("#desc").replaceChildren(...video.description.split(/\n{2,}/).map((text) => el("p", { text })));
  }

  loadSuggestions();

  if (!ctx.session) {
    return showGate({
      emoji: "🔒",
      title: "Tomosha qilish uchun kiring",
      text: "Videolar Pro obunasi bor ota-ona akkaunti orqali ochiladi.",
      actions: [link("/profile", "Kirish"), link("/pro", "Pro haqida", true)],
    });
  }
  if (!ctx.isPro) {
    return showGate({ emoji: "⭐", title: "Bu video Pro obuna bilan ochiladi", text: "Obuna barcha bola profillari uchun amal qiladi.", actions: [link("/pro", "Pro haqida")] });
  }
  if (!ctx.child) {
    return ctx.children.length
      ? showGate({ emoji: "🧒", title: "Kim tomosha qiladi?", extra: [el("div", { class: "kids" }, childPicker(ctx.children, null))] })
      : showGate({ emoji: "🧒", title: "Avval bola profilini yarating", actions: [link("/parent", "Bola qo'shish")] });
  }
  if (video.age_blocked) {
    return showGate({ emoji: "🎈", title: "Bu video kattaroq bolalar uchun", text: `${video.min_age} yoshdan boshlab.` });
  }

  renderActions();
  await startPlayback();
}

main();
