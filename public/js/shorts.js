import {
  $, api, channelAvatar, createWatchTracker, el, emptyBox, loadContext, mountChrome, openPlaylistPicker, toast, childPicker,
} from "./core.js";

mountChrome("shorts");

const stage = $("#stage");
const feed = $("#feed");
const gateBox = $("#shorts-gate");
const overlay = $("#overlay");

const params = new URLSearchParams(location.search);
const startId = params.get("start") || params.get("id");

const PAGE = 8;
const slides = []; // { video, section, videoEl, url, loading, ... }
const seen = new Set();
const state = { muted: false, needsTap: false, offset: 0, exhausted: false, loadingMore: false, active: -1, blocked: false };

const link = (href, text, ghost = false) => el("a", { class: ghost ? "btn btn--ghost" : "btn", href, text });

/* ------------------------------------------------------------------ */
/*  Kirish/obuna/bola holatlari uchun xabar oynasi                     */
/* ------------------------------------------------------------------ */
function showGate({ emoji, title, text, extra = [], actions = [] }) {
  stage.hidden = true;
  gateBox.hidden = false;
  gateBox.replaceChildren(
    el(
      "div",
      { class: "panel gate-card gate-card--page" },
      el("span", { class: "gate-emoji", "aria-hidden": "true", text: emoji }),
      el("h2", { text: title }),
      text ? el("p", { class: "muted", text }) : null,
      ...extra,
      ...actions
    )
  );
}

/** Kunlik limit tugadi yoki Pro tugadi: lenta to'xtaydi */
function block({ emoji, title, text, actions = [] }) {
  state.blocked = true;
  const current = slides[state.active];
  current?.videoEl.pause();
  tracker.detach();
  overlay.hidden = false;
  overlay.replaceChildren(el("div", { class: "gate-card" }, el("span", { class: "gate-emoji", "aria-hidden": "true", text: emoji }), el("h2", { text: title }), text ? el("p", { class: "muted", text }) : null, ...actions));
}

const showLimitReached = () =>
  block({ emoji: "🌙", title: "Bugungi tomosha vaqti tugadi", text: "Ertaga yana ko'rishamiz! Endi o'ynash yoki dam olish vaqti.", actions: [link("/", "Bosh sahifa", true)] });

/* ------------------------------------------------------------------ */
/*  Tomosha vaqti kuzatuvchisi                                         */
/* ------------------------------------------------------------------ */
const tracker = createWatchTracker({
  onRemaining: () => {},
  onLimit: showLimitReached,
  onProLost: () => block({ emoji: "⭐", title: "Pro obuna muddati tugagan", actions: [link("/pro", "Pro haqida")] }),
});

/* ------------------------------------------------------------------ */
/*  Bitta Shorts "sahifasi"                                            */
/* ------------------------------------------------------------------ */
function makeSlide(video) {
  const videoEl = el("video", { playsinline: true, preload: "none", poster: video.thumb_url, "aria-label": video.title });
  videoEl.disablePictureInPicture = true;

  const pauseIcon = el("span", { class: "short__pause", "aria-hidden": "true", text: "▶", hidden: true });
  const bar = el("i");
  const slide = { video, videoEl, url: null, loading: null };

  /* --- tugmalar --- */
  const likeBtn = el("button", { class: "short__btn", type: "button" });
  const paintLike = () => {
    likeBtn.textContent = video.liked ? "❤️" : "🤍";
    likeBtn.setAttribute("aria-pressed", String(Boolean(video.liked)));
    likeBtn.setAttribute("aria-label", video.liked ? "Yoqtirishni bekor qilish" : "Yoqdi");
  };
  likeBtn.addEventListener("click", async () => {
    try {
      await api(`/videos/${video.id}/like`, { method: video.liked ? "DELETE" : "POST" });
      video.liked = !video.liked;
      paintLike();
    } catch (error) {
      toast(error.message, "error");
    }
  });
  paintLike();

  const listBtn = el("button", { class: "short__btn", type: "button", "aria-label": "Ijro ro'yxatiga qo'shish", text: "📋", onclick: () => openPlaylistPicker(video.id) });

  const muteBtn = el("button", { class: "short__btn short__mute", type: "button" });
  slide.paintMute = () => {
    muteBtn.textContent = state.muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", state.muted ? "Ovozni yoqish" : "Ovozni o'chirish");
  };
  muteBtn.addEventListener("click", () => {
    state.muted = !state.muted;
    state.needsTap = false;
    applyMute();
  });
  slide.paintMute();

  const buttons = [likeBtn, listBtn];
  if (video.channel) {
    const followBtn = el("button", { class: "short__btn", type: "button" });
    const paintFollow = () => {
      followBtn.textContent = video.following ? "🔔" : "🔕";
      followBtn.setAttribute("aria-pressed", String(Boolean(video.following)));
      followBtn.setAttribute("aria-label", video.following ? "Obunani bekor qilish" : "Kanalga obuna bo'lish");
    };
    followBtn.addEventListener("click", async () => {
      try {
        await api(`/channels/${video.channel.id}/follow`, { method: video.following ? "DELETE" : "POST" });
        const next = !video.following;
        for (const s of slides) if (s.video.channel?.id === video.channel.id) s.video.following = next; // shu kanalning boshqa videolarida ham
        for (const s of slides) s.paintFollow?.();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    slide.paintFollow = paintFollow;
    paintFollow();
    buttons.push(followBtn);
  }
  buttons.push(muteBtn);

  const info = el(
    "div",
    { class: "short__info" },
    video.channel
      ? el("a", { class: "short__channel", href: `/channel?id=${video.channel.id}` }, channelAvatar(video.channel, "chan chan--mini"), el("span", { text: video.channel.name }))
      : null,
    el("h2", { text: video.title })
  );

  const section = el("section", { class: "short", "data-id": video.id, "aria-label": video.title }, videoEl, pauseIcon, el("div", { class: "short__actions" }, buttons), info, el("div", { class: "short__bar" }, bar));

  /* --- bosib to'xtatish / davom ettirish --- */
  section.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    if (state.needsTap) {
      state.needsTap = false;
      state.muted = false;
      applyMute();
      return;
    }
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  });
  videoEl.addEventListener("pause", () => (pauseIcon.hidden = videoEl.ended || slides[state.active] !== slide));
  videoEl.addEventListener("play", () => (pauseIcon.hidden = true));
  videoEl.addEventListener("timeupdate", () => {
    if (videoEl.duration) bar.style.width = `${(videoEl.currentTime / videoEl.duration) * 100}%`;
  });
  videoEl.addEventListener("ended", () => {
    const index = slides.indexOf(slide);
    if (index < slides.length - 1) goTo(index + 1);
    else {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    }
  });

  slide.section = section;
  return slide;
}

function applyMute() {
  for (const s of slides) {
    s.videoEl.muted = state.muted;
    s.paintMute();
  }
}

/* ------------------------------------------------------------------ */
/*  Video havolasini olish va ijro etish                               */
/* ------------------------------------------------------------------ */
function handlePlayError(error) {
  if (error.code === "limit_reached") return showLimitReached();
  if (error.code === "pro_required") return block({ emoji: "⭐", title: "Bu videolar Pro obuna bilan ochiladi", actions: [link("/pro", "Pro haqida")] });
  if (error.code === "age_blocked") return toast("Bu video kattaroq bolalar uchun", "error");
  toast(error.message, "error");
}

function ensureSource(slide) {
  if (slide.url) return Promise.resolve();
  slide.loading ??= (async () => {
    try {
      // record=0: oldindan yuklangan video ko'rilmaguncha tarixga yozilmaydi
      const play = await api(`/videos/${slide.video.id}/play?record=0`, { method: "POST" });
      slide.url = play.url;
      slide.videoEl.src = play.url;
      slide.videoEl.preload = "auto";
    } catch (error) {
      handlePlayError(error);
    } finally {
      slide.loading = null;
    }
  })();
  return slide.loading;
}

async function playSlide(slide) {
  await ensureSource(slide);
  if (state.blocked || slides[state.active] !== slide || !slide.url) return;

  slide.videoEl.muted = state.muted;
  try {
    await slide.videoEl.play();
  } catch (error) {
    // Brauzer ovozli avtoijroga ruxsat bermasa: ovozsiz boshlaymiz va bir marta bosishni so'raymiz
    if (error.name === "NotAllowedError") {
      state.muted = true;
      state.needsTap = true;
      applyMute();
      toast("🔇 Ovozni yoqish uchun ekranga tegining");
      await slide.videoEl.play().catch(() => {});
    }
  }
  if (slides[state.active] === slide) tracker.attach(slide.videoEl, slide.video.id);
}

function activate(index) {
  if (index < 0 || index === state.active) return;
  const previous = slides[state.active];
  previous?.videoEl.pause();
  tracker.detach();
  state.active = index;
  const slide = slides[index];
  history.replaceState(null, "", `?start=${slide.video.id}`);
  playSlide(slide);

  // Keyingi videoni oldindan tayyorlaymiz, uzoqdagilarni xotiradan bo'shatamiz
  if (slides[index + 1]) ensureSource(slides[index + 1]);
  slides.forEach((s, i) => {
    if (Math.abs(i - index) > 2 && s.url) {
      s.videoEl.removeAttribute("src");
      s.videoEl.load();
      s.url = null;
    }
  });
  if (index >= slides.length - 3) loadMore();
}

function goTo(index) {
  const target = slides[Math.min(Math.max(index, 0), slides.length - 1)];
  target?.section.scrollIntoView({ behavior: "smooth", block: "start" });
}

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) activate(slides.findIndex((s) => s.section === entry.target));
    }
  },
  { root: feed, threshold: 0.65 }
);

/* ------------------------------------------------------------------ */
/*  Lentani to'ldirish                                                 */
/* ------------------------------------------------------------------ */
function addVideos(videos, { prepend = false } = {}) {
  const fresh = videos.filter((v) => v.format === "short" && !seen.has(v.id));
  fresh.forEach((v) => seen.add(v.id));
  const made = fresh.map(makeSlide);
  if (prepend) slides.unshift(...made);
  else slides.push(...made);
  if (prepend) feed.prepend(...made.map((s) => s.section));
  else feed.append(...made.map((s) => s.section));
  made.forEach((s) => observer.observe(s.section));
  return made;
}

async function loadMore() {
  if (state.loadingMore || state.exhausted) return;
  state.loadingMore = true;
  try {
    const videos = await api(`/videos?format=short&limit=${PAGE}&offset=${state.offset}`);
    state.offset += videos.length;
    if (videos.length < PAGE) state.exhausted = true;
    addVideos(videos);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    state.loadingMore = false;
  }
}

$("#prev").addEventListener("click", () => goTo(state.active - 1));
$("#next").addEventListener("click", () => goTo(state.active + 1));
feed.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "j") {
    event.preventDefault();
    goTo(state.active + 1);
  } else if (event.key === "ArrowUp" || event.key === "k") {
    event.preventDefault();
    goTo(state.active - 1);
  } else if (event.key === " ") {
    event.preventDefault();
    const v = slides[state.active]?.videoEl;
    if (v) v.paused ? v.play().catch(() => {}) : v.pause();
  }
});

/* ------------------------------------------------------------------ */
/*  Ishga tushirish                                                    */
/* ------------------------------------------------------------------ */
async function main() {
  const ctx = await loadContext().catch(() => ({ session: null, children: [], child: null, isPro: false }));

  if (!ctx.session) {
    return showGate({ emoji: "🔒", title: "Shorts uchun kiring", text: "Videolar Pro obunasi bor ota-ona akkaunti orqali ochiladi.", actions: [link("/profile", "Kirish"), link("/pro", "Pro haqida", true)] });
  }
  if (!ctx.isPro) {
    return showGate({ emoji: "⭐", title: "Shorts Pro obuna bilan ochiladi", text: "Obuna barcha bola profillari uchun amal qiladi.", actions: [link("/pro", "Pro haqida")] });
  }
  if (!ctx.child) {
    return ctx.children.length
      ? showGate({ emoji: "🧒", title: "Kim tomosha qiladi?", extra: [el("div", { class: "kids" }, childPicker(ctx.children, null))] })
      : showGate({ emoji: "🧒", title: "Avval bola profilini yarating", actions: [link("/parent", "Bola qo'shish")] });
  }

  stage.hidden = false;

  try {
    const first = await api(`/videos?format=short&limit=${PAGE}&offset=0`);
    state.offset = first.length;
    if (first.length < PAGE) state.exhausted = true;

    // Boshqa sahifadan kelgan bo'lsa: aynan shu video birinchi bo'lib chiqadi
    if (startId && !first.some((v) => v.id === startId)) {
      try {
        const one = await api(`/videos/${startId}`);
        if (one.format === "short" && !one.age_blocked) first.unshift(one);
      } catch {
        /* video topilmadi: oddiy lenta */
      }
    }

    if (!first.length) {
      stage.hidden = true;
      gateBox.hidden = false;
      gateBox.replaceChildren(emptyBox("Hozircha Shorts yo'q", "Tez orada yangi videolar qo'shiladi."), el("p", {}, link("/", "Bosh sahifaga", true)));
      return;
    }

    addVideos(first);
    const startIndex = Math.max(0, slides.findIndex((s) => s.video.id === startId));
    if (startIndex > 0) slides[startIndex].section.scrollIntoView({ block: "start" });
    // Kuzatuvchi ishga tushmagan bo'lsa (birinchi video allaqachon ko'rinib turgan holat)
    if (state.active === -1) activate(startIndex);
  } catch (error) {
    stage.hidden = true;
    gateBox.hidden = false;
    gateBox.replaceChildren(emptyBox("Yuklab bo'lmadi", error.message));
  }
}

main();
