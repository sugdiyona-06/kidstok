/* Nurchashma — barcha sahifalar uchun umumiy yordamchilar */

export const $ = (selector, root = document) => root.querySelector(selector);

/** Xavfsiz DOM yaratish (innerHTML ishlatilmaydi, shuning uchun XSS bo'lmaydi). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

// Brauzerning "uz" sana formatiga ishonib bo'lmaydi (ba'zilarida "M10" chiqadi), shuning uchun oy nomlari o'zimizda
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDuration(seconds) {
  if (seconds == null) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatMinutes(seconds) {
  const minutes = Math.round(seconds / 60);
  return minutes < 1 && seconds > 0 ? "1 daqiqadan kam" : `${minutes} daqiqa`;
}

export function toast(message, type = "ok") {
  let box = $("#toast");
  if (!box) {
    box = el("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.append(box);
  }
  box.textContent = message;
  box.dataset.type = type;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 3200);
}

/* ------------------------------------------------------------------ */
/*  Brauzerda saqlanadigan holat                                       */
/* ------------------------------------------------------------------ */
const CHILD_KEY = "nurchashma.child";
const PARENT_KEY = "nurchashma.parent";

export function getChildId() {
  try {
    return localStorage.getItem(CHILD_KEY);
  } catch {
    return null;
  }
}

export function setChildId(id) {
  try {
    if (id) localStorage.setItem(CHILD_KEY, id);
    else localStorage.removeItem(CHILD_KEY);
  } catch {
    /* saqlash imkonsiz bo'lsa, e'tibor bermaymiz */
  }
}

// Ota-onalar tokeni faqat shu oyna ochiq turguncha saqlanadi
export function getParentToken() {
  try {
    const data = JSON.parse(sessionStorage.getItem(PARENT_KEY) ?? "null");
    if (data && data.exp > Date.now()) return data.token;
    sessionStorage.removeItem(PARENT_KEY);
  } catch {
    /* yaroqsiz qiymat */
  }
  return null;
}

export function setParentToken(token, ttlMs) {
  try {
    sessionStorage.setItem(PARENT_KEY, JSON.stringify({ token, exp: Date.now() + ttlMs - 5000 }));
  } catch {
    /* ... */
  }
}

export function clearParentToken() {
  try {
    sessionStorage.removeItem(PARENT_KEY);
  } catch {
    /* ... */
  }
}

/* ------------------------------------------------------------------ */
/*  Supabase (brauzerda faqat kirish/ro'yxatdan o'tish va fayl yuklash) */
/* ------------------------------------------------------------------ */
let clientPromise;
export function getSupabase() {
  clientPromise ??= (async () => {
    const config = await getConfig();
    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  })();
  return clientPromise;
}

let configPromise;
export function getConfig() {
  configPromise ??= fetch("/api/config").then((res) => {
    if (!res.ok) throw new Error("Sozlamalarni yuklab bo'lmadi");
    return res.json();
  });
  return configPromise;
}

export async function getSession() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signOut() {
  const sb = await getSupabase();
  await sb.auth.signOut();
  setChildId(null);
  clearParentToken();
}

/** Backend API'ga so'rov. Kirgan bo'lsangiz token, tanlangan bola va ota-ona tokeni avtomatik qo'shiladi. */
export async function api(path, { method = "GET", body, keepalive = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const session = await getSession();
  if (session) {
    headers.Authorization = `Bearer ${session.access_token}`;
    const child = getChildId();
    if (child) headers["X-Child-Id"] = child;
    const parent = getParentToken();
    if (parent) headers["X-Parent-Token"] = parent;
  }

  const res = await fetch(`/api${path}`, { method, headers, keepalive, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.error || "Xatolik yuz berdi");
    error.status = res.status;
    error.code = json.code;
    if (error.code === "no_child") setChildId(null);
    if (error.code === "parent_locked") clearParentToken();
    throw error;
  }
  return json;
}

/* ------------------------------------------------------------------ */
/*  Sahifa konteksti: kim kirgan, qaysi bola tanlangan, Pro bormi      */
/* ------------------------------------------------------------------ */
let contextPromise;

export function loadContext() {
  contextPromise ??= (async () => {
    const guest = { session: null, me: null, children: [], child: null, isPro: false };
    const session = await getSession();
    if (!session) return guest;

    try {
      const [me, children] = await Promise.all([api("/me"), api("/children")]);
      let child = children.find((c) => c.id === getChildId()) ?? null;
      if (!child && children.length === 1) child = children[0]; // yagona bola bo'lsa, o'zi tanlanadi
      setChildId(child?.id ?? null);
      return { session, me, children, child, isPro: me.is_pro };
    } catch (error) {
      if (error.status === 401) return guest;
      throw error;
    }
  })();
  return contextPromise;
}

export function resetContext() {
  contextPromise = undefined;
}

/* ------------------------------------------------------------------ */
/*  Navbar va footer (barcha sahifalarda bir xil)                      */
/* ------------------------------------------------------------------ */
const LOGO =
  '<svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="10" fill="#3E6BF4"/><path d="M12.5 10v12l10-6z" fill="#fff" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><circle cx="25" cy="7" r="3.2" fill="#FFCF4A"/></svg>';

const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICONS = {
  home: `<svg ${ICON_ATTRS}><path d="M4 11.5 12 4.5l8 7V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z"/></svg>`,
  search: `<svg ${ICON_ATTRS}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
  shorts: `<svg ${ICON_ATTRS}><rect x="6.5" y="2.5" width="11" height="19" rx="3.5"/><path d="M10.5 9v6l4.5-3z"/></svg>`,
  profile: `<svg ${ICON_ATTRS}><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-4 4-5.5 7.5-5.5s6.5 1.5 7.5 5.5"/></svg>`,
};

const NAV = [
  ["home", "/", "Asosiy"],
  ["shorts", "/shorts", "Shorts"],
  ["search", "/search", "Qidiruv"],
  ["profile", "/profile", "Profil"],
];

export function mountChrome(active) {
  const header = $("#site-header");
  if (header) {
    const brand = el("a", { class: "brand", href: "/", "aria-label": "Nurchashma — bosh sahifa" }, el("span", { text: "Nurchashma" }));
    brand.insertAdjacentHTML("afterbegin", LOGO);
    const nav = el(
      "nav",
      { class: "nav", "aria-label": "Asosiy menyu" },
      NAV.map(([key, href, label]) => {
        const icon = el("span", { class: "nav__ico" });
        icon.insertAdjacentHTML("afterbegin", ICONS[key]);
        return el("a", { class: "nav__item", href, "data-nav": key, "aria-current": key === active ? "page" : null }, icon, el("span", { text: label }));
      })
    );
    header.replaceChildren(el("div", { class: "wrap" }, brand, nav));
  }

  const footer = $("#site-footer");
  if (footer) {
    footer.replaceChildren(el("div", { class: "wrap" }, el("span", { text: "© Nurchashma" }), el("span", {}, el("a", { href: "/pro", text: "Pro obuna" }), " · ", el("a", { href: "/privacy", text: "Maxfiylik siyosati" }))));
  }

  loadContext()
    .then((ctx) => {
      // Tanlangan bolaning rasmi "Profil" ikonkasi o'rnida ko'rinadi
      if (ctx.child) $('[data-nav="profile"] .nav__ico')?.replaceChildren(avatarEl(ctx.child.avatar, "avatar avatar--mini"));
    })
    .catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  Bola avatarlari                                                    */
/* ------------------------------------------------------------------ */
export const AVATARS = {
  bear: "🐻", cat: "🐱", rabbit: "🐰", fox: "🦊", panda: "🐼", lion: "🦁",
  frog: "🐸", penguin: "🐧", owl: "🦉", unicorn: "🦄", koala: "🐨", dog: "🐶",
};

export function avatarEl(key, className = "avatar") {
  const keys = Object.keys(AVATARS);
  const index = Math.max(0, keys.indexOf(key));
  return el("span", { class: className, "data-tone": String(index % 5), "aria-hidden": "true", text: AVATARS[key] ?? "🐻" });
}

/**
 * Ota-ona PIN-kodini so'raydi. Yaqinda kiritilgan bo'lsa (15 daqiqa), qayta so'ramaydi.
 * Kiritilsa true, bekor qilinsa false qaytaradi.
 */
export function askPin(message = "Davom etish uchun ota-ona PIN-kodini kiriting.") {
  return new Promise((resolve) => {
    if (getParentToken()) return resolve(true);

    let done = false;
    const error = el("p", { class: "form-error", role: "alert", hidden: true });
    const input = el("input", { class: "pin-input", type: "password", inputmode: "numeric", pattern: "[0-9]{4}", maxlength: "4", autocomplete: "off", required: true, "aria-label": "PIN-kod" });
    const form = el(
      "form",
      {
        onsubmit: async (event) => {
          event.preventDefault();
          error.hidden = true;
          try {
            const result = await api("/parent/unlock", { method: "POST", body: { pin: input.value } });
            setParentToken(result.token, result.expires_in_ms);
            done = true;
            dialog.close();
            resolve(true);
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            input.value = "";
            input.focus();
          }
        },
      },
      el("div", { class: "field" }, input),
      el("button", { class: "btn", type: "submit", text: "Davom etish" })
    );
    const dialog = openSheet("PIN-kod", el("p", { class: "muted", text: message }), error, form);
    dialog.addEventListener("close", () => !done && resolve(false), { once: true });
    input.focus();
  });
}

/** "Kim tomosha qiladi?" tugmalari. Boshqa bola profiliga o'tish PIN-kod talab qiladi. */
export function childPicker(children, activeId) {
  return children.map((child) =>
    el(
      "button",
      {
        class: "kid",
        type: "button",
        "aria-pressed": String(child.id === activeId),
        onclick: async () => {
          const current = getChildId();
          if (current && current !== child.id && !(await askPin("Boshqa profilga o'tish uchun ota-ona PIN-kodini kiriting."))) return;
          setChildId(child.id);
          location.reload();
        },
      },
      avatarEl(child.avatar, "avatar avatar--lg"),
      el("span", { text: child.name })
    )
  );
}

/* ------------------------------------------------------------------ */
/*  Video va kanal kartochkalari                                       */
/* ------------------------------------------------------------------ */
export function channelAvatar(channel, className = "chan") {
  return channel.avatar_url
    ? el("img", { class: className, src: channel.avatar_url, alt: "", loading: "lazy" })
    : el("span", { class: className, "aria-hidden": "true", text: channel.name.charAt(0).toUpperCase() });
}

export function videoCard(video, { locked = false } = {}) {
  const isShort = video.format === "short";
  const thumb = video.thumb_url
    ? el("img", { src: video.thumb_url, alt: "", loading: "lazy" })
    : el("span", { class: "thumb-fallback", "aria-hidden": "true", text: "▶" });

  return el(
    "a",
    { class: isShort ? "vcard vcard--short" : "vcard", href: isShort ? `/shorts?start=${video.id}` : `/watch?id=${video.id}` },
    el(
      "div",
      { class: "vcard__thumb" },
      thumb,
      isShort ? el("span", { class: "vcard__tag", text: "Shorts" }) : null,
      video.duration_seconds ? el("span", { class: "vcard__time", text: formatDuration(video.duration_seconds) }) : null,
      locked ? el("span", { class: "vcard__lock", role: "img", "aria-label": "Pro obuna kerak", text: "🔒" }) : null
    ),
    el(
      "div",
      { class: "vcard__meta" },
      video.channel ? channelAvatar(video.channel, "chan chan--mini") : null,
      el("div", {}, el("h3", { text: video.title }), video.channel ? el("p", { text: video.channel.name }) : null)
    )
  );
}

/** Shorts uchun tik (9:16) kartochka */
export function shortCard(video, { locked = false } = {}) {
  return el(
    "a",
    { class: "scard", href: `/shorts?start=${video.id}` },
    el(
      "div",
      { class: "scard__thumb" },
      video.thumb_url ? el("img", { src: video.thumb_url, alt: "", loading: "lazy" }) : el("span", { class: "thumb-fallback", "aria-hidden": "true", text: "▶" }),
      video.duration_seconds ? el("span", { class: "vcard__time", text: formatDuration(video.duration_seconds) }) : null,
      locked ? el("span", { class: "vcard__lock", role: "img", "aria-label": "Pro obuna kerak", text: "🔒" }) : null
    ),
    el("h3", { text: video.title })
  );
}

export function channelBubble(channel) {
  return el("a", { class: "bubble", href: `/channel?id=${channel.id}` }, channelAvatar(channel, "chan"), el("span", { text: channel.name }));
}

export const emptyBox = (title, text) =>
  el("div", { class: "empty" }, el("strong", { text: title }), text ? el("span", { text }) : null);

export function renderVideos(container, videos, { locked = false, empty = "Hozircha videolar yo'q", emptyText } = {}) {
  if (!videos.length) {
    container.classList.remove("videos");
    container.replaceChildren(emptyBox(empty, emptyText));
    return;
  }
  container.classList.add("videos");
  container.replaceChildren(...videos.map((video) => videoCard(video, { locked })));
}

/** Aralash ro'yxat: uzun videolar to'r ko'rinishida, Shorts esa tik kartochkalar bilan */
export function renderMixed(container, videos, { locked = false, empty = "Hozircha videolar yo'q", emptyText } = {}) {
  container.classList.remove("videos");
  if (!videos.length) {
    container.replaceChildren(emptyBox(empty, emptyText));
    return;
  }
  const longs = videos.filter((v) => v.format !== "short");
  const shorts = videos.filter((v) => v.format === "short");
  const parts = [];
  if (longs.length) parts.push(el("div", { class: "videos" }, longs.map((v) => videoCard(v, { locked }))));
  if (shorts.length) {
    if (longs.length) parts.push(el("h2", { class: "sub-h", text: "Shorts" }));
    parts.push(el("div", { class: "sgrid" }, shorts.map((v) => shortCard(v, { locked }))));
  }
  container.replaceChildren(...parts);
}

export function renderError(container, error) {
  container.classList.remove("videos");
  container.replaceChildren(emptyBox("Yuklab bo'lmadi", error.message));
}

/* ------------------------------------------------------------------ */
/*  Umumiy dialog oynasi                                               */
/* ------------------------------------------------------------------ */
export function openSheet(title, ...content) {
  let dialog = $("#sheet");
  if (!dialog) {
    dialog = el("dialog", { id: "sheet", class: "sheet", "aria-labelledby": "sheet-title" });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
  }
  dialog.replaceChildren(
    el("button", { class: "sheet__close", type: "button", "aria-label": "Yopish", onclick: () => dialog.close(), text: "×" }),
    el("h2", { id: "sheet-title", text: title }),
    ...content.flat().filter(Boolean)
  );
  if (!dialog.open) dialog.showModal();
  return dialog;
}

/* ------------------------------------------------------------------ */
/*  Ijro ro'yxatiga qo'shish oynasi (video va Shorts sahifalarida)      */
/* ------------------------------------------------------------------ */
export async function openPlaylistPicker(videoId) {
  try {
    showPicker(videoId, await api(`/child/playlists?video=${videoId}`));
  } catch (error) {
    toast(error.message, "error");
  }
}

function showPicker(videoId, lists) {
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
              if (list.has_video) await api(`/child/playlists/${list.id}/items/${videoId}`, { method: "DELETE" });
              else await api(`/child/playlists/${list.id}/items`, { method: "POST", body: { video_id: videoId } });
              list.has_video = !list.has_video;
              showPicker(videoId, lists);
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
          await api(`/child/playlists/${created.id}/items`, { method: "POST", body: { video_id: videoId } });
          created.has_video = true;
          showPicker(videoId, [created, ...lists]);
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
/*  Tomosha vaqtini hisoblash (kunlik limit va ota-ona tarixi uchun)   */
/*  Bitta kuzatuvchi istalgan <video> ga ulanadi (Shorts'da almashib turadi) */
/* ------------------------------------------------------------------ */
export function createWatchTracker({ onRemaining = () => {}, onLimit = () => {}, onProLost = () => {} } = {}) {
  let videoEl = null;
  let videoId = null;
  let since = null;

  async function send(id, seconds) {
    try {
      const result = await api("/watch/heartbeat", { method: "POST", body: { video_id: id, seconds }, keepalive: true });
      onRemaining(result.remaining_seconds);
      if (result.remaining_seconds === 0) onLimit();
    } catch (error) {
      if (error.code === "pro_required") onProLost();
    }
  }

  function flush() {
    if (since === null || !videoEl) return;
    const now = Date.now();
    let seconds = Math.round((now - since) / 1000);
    since = videoEl.paused || videoEl.ended ? null : now;
    const id = videoId;
    while (seconds > 0) {
      const chunk = Math.min(seconds, 30);
      seconds -= chunk;
      send(id, chunk);
    }
  }

  const onPlay = () => {
    since ??= Date.now();
  };

  function detach() {
    if (!videoEl) return;
    flush();
    videoEl.removeEventListener("play", onPlay);
    videoEl.removeEventListener("pause", flush);
    videoEl.removeEventListener("ended", flush);
    videoEl = null;
    videoId = null;
    since = null;
  }

  function attach(element, id) {
    detach();
    videoEl = element;
    videoId = id;
    since = !element.paused && !element.ended ? Date.now() : null;
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", flush);
    element.addEventListener("ended", flush);
  }

  document.addEventListener("visibilitychange", () => document.hidden && flush());
  window.addEventListener("pagehide", flush);
  setInterval(() => videoEl && !videoEl.paused && flush(), 15000);

  return { attach, detach };
}
