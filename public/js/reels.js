/* Vertikal video lentasi (Instagram Reels / YouTube Shorts kabi).
   Bosh sahifa va /shorts sahifasi shu mexanizmni ishlatadi.

   Ishlash tartibi:
   - har bir video butun lenta balandligini egallaydi, surilganda bittadan "yopishadi" (scroll-snap);
   - ko'rinib turgan video o'zi ijro bo'ladi, boshqalari to'xtaydi;
   - tomosha vaqti (kunlik limit va ota-ona tarixi) serverga yozib boriladi;
   - Pro bo'lmasa yoki bola tanlanmagan bo'lsa, "preview" rejimida faqat muqovalar va qulf ko'rsatiladi. */

import { api, channelAvatar, childPicker, createWatchTracker, el, openPlaylistPicker, toast } from "./core.js";
import { catSit } from "./cats.js";

const link = (href, text, ghost = false) => el("a", { class: ghost ? "btn btn--ghost" : "btn", href, text });

/** Ko'rish mumkin emas: nima uchun va nima qilish kerak (mehmon, Pro yo'q, bola tanlanmagan) */
export function gateSpec(ctx) {
  if (!ctx.session) {
    return { emoji: "🔒", title: "Ko'rish uchun kiring", text: "Videolar Pro obunasi bor ota-ona akkaunti orqali ochiladi.", actions: () => [link("/profile", "Kirish"), link("/pro", "Pro haqida", true)] };
  }
  if (!ctx.isPro) {
    return { emoji: "⭐", title: "Bu videolar Pro obuna bilan ochiladi", text: "Obuna barcha bola profillari uchun amal qiladi.", actions: () => [link("/pro", "Pro haqida")] };
  }
  if (!ctx.child) {
    return ctx.children.length
      ? { emoji: "🧒", title: "Kim tomosha qiladi?", extra: () => [el("div", { class: "kids" }, childPicker(ctx.children, null))] }
      : { emoji: "🧒", title: "Avval bola profilini yarating", actions: () => [link("/parent", "Bola qo'shish")] };
  }
  return null;
}

export function gateCard({ emoji, title, text, extra, actions = [] }) {
  // Tugmalar funksiya bo'lsa, har safar yangi elementlar yasaladi (bitta element ikki joyda tura olmaydi)
  const buttons = typeof actions === "function" ? actions() : actions;
  return el(
    "div",
    { class: "gate-card" },
    el("span", { class: "gate-emoji", "aria-hidden": "true", text: emoji }),
    el("h2", { text: title }),
    text ? el("p", { class: "muted", text }) : null,
    ...(extra ? extra() : []),
    ...buttons
  );
}

/**
 * @param {object} o
 * @param {HTMLElement} o.feed        aylanuvchi konteyner
 * @param {HTMLElement} [o.overlay]   limit tugaganda ustidan chiqadigan oyna
 * @param {HTMLElement} [o.prev]      "oldingi" tugmasi
 * @param {HTMLElement} [o.next]      "keyingi" tugmasi
 * @param {number}  [o.first=8]       birinchi yuklanadigan videolar soni
 * @param {boolean} [o.infinite=true] oxirigacha yetganda yana yuklash
 * @param {boolean} [o.syncUrl=false] ?start=ID ni manzilga yozib borish
 * @param {string}  [o.startId]       aynan shu videodan boshlash
 * @param {object}  [o.preview]       gateSpec natijasi: berilsa, video ijro etilmaydi, faqat muqova va qulf ko'rsatiladi
 * @param {boolean} [o.endCard]       oxirida "yana ko'proq" kartochkasi
 * @param {Function} [o.onEmpty]      video yo'q bo'lsa
 * @param {Function} [o.onError]      yuklab bo'lmasa
 */
export function createReels(o) {
  const { feed, overlay, first = 8, infinite = true, syncUrl = false, startId = null, preview = null, endCard = false } = o;
  const PAGE = 8;
  const slides = [];
  const seen = new Set();
  const state = { muted: false, needsTap: false, offset: 0, exhausted: !infinite, loadingMore: false, active: -1, blocked: false, visible: true };
  let endSection = null;

  const showLimitReached = () =>
    block({ emoji: "🌙", title: "Bugungi tomosha vaqti tugadi", text: "Ertaga yana ko'rishamiz! Endi o'ynash yoki dam olish vaqti.", actions: [link("/", "Bosh sahifa", true)] });

  const tracker = createWatchTracker({
    onRemaining: () => {},
    onLimit: showLimitReached,
    onProLost: () => block({ emoji: "⭐", title: "Pro obuna muddati tugagan", actions: [link("/pro", "Pro haqida")] }),
  });

  /** Kunlik limit tugadi yoki Pro tugadi: lenta to'xtaydi */
  function block(spec) {
    state.blocked = true;
    slides[state.active]?.videoEl?.pause();
    tracker.detach();
    if (!overlay) return;
    overlay.hidden = false;
    overlay.replaceChildren(gateCard(spec));
  }

  /* ---------------------------------------------------------------- */
  /*  Bitta video "sahifasi"                                           */
  /* ---------------------------------------------------------------- */
  function makeSlide(video) {
    if (preview) return makePreviewSlide(video);

    const videoEl = el("video", { playsinline: true, preload: "none", poster: video.thumb_url, "aria-label": video.title });
    videoEl.disablePictureInPicture = true;
    // Gorizontal video adashib yuklangan bo'lsa, kesib yubormaymiz: butun kadr ko'rinadi
    videoEl.addEventListener("loadedmetadata", () => videoEl.classList.toggle("is-wide", videoEl.videoWidth > videoEl.videoHeight));

    const pauseIcon = el("span", { class: "short__pause", "aria-hidden": "true", text: "▶", hidden: true });
    const heart = el("span", { class: "short__heart", "aria-hidden": "true", text: "❤️", hidden: true });
    const bar = el("i");
    const slide = { video, videoEl, url: null, loading: null };

    /* --- tugmalar --- */
    const likeBtn = el("button", { class: "short__btn", type: "button" });
    const paintLike = () => {
      likeBtn.textContent = video.liked ? "❤️" : "🤍";
      likeBtn.setAttribute("aria-pressed", String(Boolean(video.liked)));
      likeBtn.setAttribute("aria-label", video.liked ? "Yoqtirishni bekor qilish" : "Yoqdi");
    };
    async function toggleLike(force) {
      const want = force ?? !video.liked;
      if (want === Boolean(video.liked)) return;
      try {
        await api(`/videos/${video.id}/like`, { method: want ? "POST" : "DELETE" });
        video.liked = want;
        paintLike();
      } catch (error) {
        toast(error.message, "error");
      }
    }
    likeBtn.addEventListener("click", () => toggleLike());
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
      slide.paintFollow = () => {
        followBtn.textContent = video.following ? "🔔" : "🔕";
        followBtn.setAttribute("aria-pressed", String(Boolean(video.following)));
        followBtn.setAttribute("aria-label", video.following ? "Obunani bekor qilish" : "Kanalga obuna bo'lish");
      };
      followBtn.addEventListener("click", async () => {
        try {
          await api(`/channels/${video.channel.id}/follow`, { method: video.following ? "DELETE" : "POST" });
          const nextValue = !video.following;
          for (const s of slides) if (s.video.channel?.id === video.channel.id) s.video.following = nextValue;
          for (const s of slides) s.paintFollow?.();
        } catch (error) {
          toast(error.message, "error");
        }
      });
      slide.paintFollow();
      buttons.push(followBtn);
    }
    buttons.push(muteBtn);

    const info = el(
      "div",
      { class: "short__info" },
      video.channel ? el("a", { class: "short__channel", href: `/channel?id=${video.channel.id}` }, channelAvatar(video.channel, "chan chan--mini"), el("span", { text: video.channel.name })) : null,
      el("h2", { text: video.title })
    );

    const section = el("section", { class: "short", "data-id": video.id, "aria-label": video.title }, videoEl, pauseIcon, heart, el("div", { class: "short__actions" }, buttons), info, el("div", { class: "short__bar" }, bar));

    /* --- bir marta bosish: to'xtatish/davom; ikki marta bosish: yoqtirish (Instagram kabi) --- */
    let tapTimer = null;
    let lastTap = 0;
    const singleTap = () => {
      if (state.needsTap) {
        state.needsTap = false;
        state.muted = false;
        applyMute();
        return;
      }
      if (videoEl.paused) videoEl.play().catch(() => {});
      else videoEl.pause();
    };
    section.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      const now = Date.now();
      if (now - lastTap < 320) {
        clearTimeout(tapTimer);
        lastTap = 0;
        heart.hidden = false;
        heart.classList.remove("is-pop");
        void heart.offsetWidth; // animatsiyani qayta boshlash
        heart.classList.add("is-pop");
        setTimeout(() => (heart.hidden = true), 800);
        toggleLike(true);
        return;
      }
      lastTap = now;
      tapTimer = setTimeout(singleTap, 320);
    });
    videoEl.addEventListener("pause", () => (pauseIcon.hidden = videoEl.ended || slides[state.active] !== slide));
    videoEl.addEventListener("play", () => (pauseIcon.hidden = true));
    videoEl.addEventListener("timeupdate", () => {
      if (videoEl.duration) bar.style.width = `${(videoEl.currentTime / videoEl.duration) * 100}%`;
    });
    videoEl.addEventListener("ended", () => {
      const index = slides.indexOf(slide);
      if (index < slides.length - 1 || endSection) goTo(index + 1);
      else {
        videoEl.currentTime = 0;
        videoEl.play().catch(() => {});
      }
    });

    slide.section = section;
    return slide;
  }

  /** Preview rejimi: muqova + qulf oynasi (video ijro etilmaydi) */
  function makePreviewSlide(video) {
    const poster = video.thumb_url ? el("img", { class: "short__poster", src: video.thumb_url, alt: "", loading: "lazy" }) : el("div", { class: "short__poster short__poster--empty" });
    const info = el("div", { class: "short__info short__info--lock" }, el("h2", { text: video.title }));
    const section = el("section", { class: "short short--preview", "data-id": video.id, "aria-label": video.title }, poster, el("div", { class: "short__lock" }, gateCard(preview)), info);
    return { video, section, preview: true };
  }

  function applyMute() {
    for (const s of slides) {
      s.videoEl.muted = state.muted;
      s.paintMute();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Video havolasini olish va ijro etish                             */
  /* ---------------------------------------------------------------- */
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
    if (state.blocked || !state.visible || slides[state.active] !== slide || !slide.url) return;

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
    if (index < 0 || index === state.active || !slides[index] || slides[index].preview) return;
    slides[state.active]?.videoEl?.pause();
    tracker.detach();
    state.active = index;
    const slide = slides[index];
    if (syncUrl) history.replaceState(null, "", `?start=${slide.video.id}`);
    if (state.visible) playSlide(slide);

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

  /** Lenta ko'rinishdan chiqdi (sahifa pastga aylantirildi yoki oxirgi kartochka): to'xtatamiz */
  function pauseAll() {
    slides[state.active]?.videoEl?.pause();
    tracker.detach();
  }

  function goTo(index) {
    const all = endSection ? [...slides, { section: endSection }] : slides;
    const target = all[Math.min(Math.max(index, 0), all.length - 1)];
    // scrollIntoView emas: u butun sahifani ham suradi, biz faqat lentani suramiz
    if (target) feed.scrollTo({ top: target.section.offsetTop, behavior: "smooth" });
  }

  const slideObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.65) continue;
        if (entry.target === endSection) {
          pauseAll();
          state.active = -1;
        } else {
          activate(slides.findIndex((s) => s.section === entry.target));
        }
      }
    },
    { root: feed, threshold: 0.65 }
  );

  // Butun lenta ekrandan chiqsa (masalan bosh sahifada pastdagi bo'limlarga tushilsa), video to'xtaydi
  const feedObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries[0].isIntersecting;
      if (visible === state.visible) return;
      state.visible = visible;
      if (!visible) pauseAll();
      else if (slides[state.active]) playSlide(slides[state.active]);
    },
    { threshold: 0.25 }
  );
  feedObserver.observe(feed);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseAll();
    else if (state.visible && slides[state.active]) playSlide(slides[state.active]);
  });

  /* ---------------------------------------------------------------- */
  /*  Lentani to'ldirish                                               */
  /* ---------------------------------------------------------------- */
  function addVideos(videos) {
    const fresh = videos.filter((v) => !seen.has(v.id));
    fresh.forEach((v) => seen.add(v.id));
    const made = fresh.map(makeSlide);
    slides.push(...made);
    const anchor = endSection; // "yana ko'proq" kartochkasi doim oxirida turadi
    if (anchor) anchor.before(...made.map((s) => s.section));
    else feed.append(...made.map((s) => s.section));
    if (!preview) made.forEach((s) => slideObserver.observe(s.section));
    return made;
  }

  async function loadMore() {
    if (state.loadingMore || state.exhausted) return;
    state.loadingMore = true;
    try {
      const videos = await api(`/videos?limit=${PAGE}&offset=${state.offset}`);
      state.offset += videos.length;
      if (videos.length < PAGE) state.exhausted = true;
      addVideos(videos);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      state.loadingMore = false;
    }
  }

  function buildEndCard() {
    const cat = el("span", { class: "end__cat", "aria-hidden": "true" });
    cat.insertAdjacentHTML("afterbegin", catSit("orange"));
    const section = el(
      "section",
      { class: "short short--end", "aria-label": "Yana ko'proq" },
      cat,
      el("h2", { text: "Hozircha shu!" }),
      el("p", { text: "Yana ko'proq qiziqarli videolar bor." }),
      el("div", { class: "end__actions" }, link("/shorts", "Barcha videolar"), el("button", { class: "btn btn--ghost", type: "button", "data-jump": "", text: "Bo'limlar ⬇" }))
    );
    return section;
  }

  function bindControls() {
    o.prev?.addEventListener("click", () => goTo(state.active - 1));
    o.next?.addEventListener("click", () => goTo(state.active + 1));
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
  }

  async function start() {
    bindControls();
    try {
      const firstVideos = await api(`/videos?limit=${first}&offset=0`);
      state.offset = firstVideos.length;
      if (firstVideos.length < first) state.exhausted = true;

      // Boshqa sahifadan kelgan bo'lsa: aynan shu video birinchi bo'lib chiqadi
      if (startId && !firstVideos.some((v) => v.id === startId)) {
        try {
          const one = await api(`/videos/${startId}`);
          if (!one.age_blocked) firstVideos.unshift(one);
        } catch {
          /* video topilmadi: oddiy lenta */
        }
      }

      if (!firstVideos.length) {
        o.onEmpty?.();
        return;
      }

      feed.replaceChildren();
      if (endCard) {
        endSection = buildEndCard();
        feed.append(endSection);
        slideObserver.observe(endSection);
      }
      addVideos(firstVideos);

      const startIndex = Math.max(0, slides.findIndex((s) => s.video.id === startId));
      if (startIndex > 0) feed.scrollTo({ top: slides[startIndex].section.offsetTop });
      // Kuzatuvchi ishga tushmagan bo'lsa (birinchi video allaqachon ko'rinib turgan holat)
      if (!preview && state.active === -1) activate(startIndex);
    } catch (error) {
      o.onError?.(error);
    }
  }

  return { start, goTo, slides, state };
}
