import {
  $, api, channelAvatar, el, formatDate, formatDuration, getSession, getSupabase, loadContext, mountChrome, toast,
} from "./core.js";

mountChrome("profile");

const gate = $("#gate");
const panel = $("#panel");
const tabButtons = document.querySelectorAll("[data-tab]");

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/*  Kirish tekshiruvi                                                  */
/* ------------------------------------------------------------------ */
function showGate(message, linkText, href) {
  $("#gate-message").textContent = message;
  const link = $("#gate-link");
  if (linkText) {
    link.textContent = linkText;
    link.href = href;
    link.hidden = false;
  }
}

async function boot() {
  if (!(await getSession())) return showGate("Admin panelga kirish uchun avval tizimga kiring.", "Kirish", "/profile");

  const ctx = await loadContext();
  if (ctx.me?.role !== "admin") return showGate("Bu bo'lim faqat administratorlar uchun.", "Profilga qaytish", "/profile");

  gate.hidden = true;
  panel.hidden = false;
  openTab("overview");
}

/* ------------------------------------------------------------------ */
/*  Bo'limlar                                                          */
/* ------------------------------------------------------------------ */
const loaders = { overview: loadOverview, videos: loadVideos, channels: loadChannels, categories: loadCategories, users: loadUsers };

function openTab(name) {
  for (const button of tabButtons) {
    const active = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(active));
    $(`#tab-${button.dataset.tab}`).hidden = !active;
  }
  loaders[name]().catch((error) => toast(error.message, "error"));
}
tabButtons.forEach((button) => button.addEventListener("click", () => openTab(button.dataset.tab)));

// Barcha dialoglardagi "yopish" tugmalari
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

const actionButtons = (onEdit, onDelete) =>
  el(
    "div",
    { class: "actions" },
    el("button", { class: "btn btn--ghost btn--small", type: "button", onclick: onEdit, text: "Tahrirlash" }),
    el("button", { class: "btn btn--danger btn--small", type: "button", onclick: onDelete, text: "O'chirish" })
  );

/* ------------------------------------------------------------------ */
/*  Fayl yuklash (brauzer → Supabase Storage, server faqat ruxsat beradi) */
/* ------------------------------------------------------------------ */
async function uploadFile(kind, file) {
  const { bucket, path, token } = await api("/admin/uploads", { method: "POST", body: { kind, content_type: file.type } });
  const sb = await getSupabase();
  const { error } = await sb.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error) throw new Error(`Fayl yuklanmadi: ${error.message}`);
  return path;
}

function readDuration(file) {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    const url = URL.createObjectURL(file);
    // Brauzer metama'lumotni o'qiy olmasa, cheksiz kutmaymiz (davomiylik ixtiyoriy)
    const timer = setTimeout(() => done(null), 5000);
    function done(value) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    }
    probe.preload = "metadata";
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? Math.round(probe.duration) : null);
    probe.onerror = () => done(null);
    probe.src = url;
  });
}

function checkFile(file, maxBytes, label) {
  if (file && file.size > maxBytes) throw new Error(`${label} hajmi ${Math.round(maxBytes / 1048576)} MB dan oshmasligi kerak`);
}

/* ------------------------------------------------------------------ */
/*  Umumiy                                                             */
/* ------------------------------------------------------------------ */
async function loadOverview() {
  const s = await api("/admin/stats");
  const stat = (value, label) => el("div", { class: "stat" }, el("strong", { text: String(value) }), el("span", { text: label }));
  $("#stats").replaceChildren(
    stat(s.parents, "Ota-onalar"),
    stat(s.children, "Bola profillari"),
    stat(`${s.published} / ${s.videos}`, "Videolar (nashr / jami)"),
    stat(s.channels, "Kanallar"),
    stat(s.pro, "Pro obunachilar")
  );
}

/* ------------------------------------------------------------------ */
/*  Kanal va bo'limlar ro'yxati (video formasida kerak)                */
/* ------------------------------------------------------------------ */
let channels = [];
let categories = [];

async function loadLookups() {
  [channels, categories] = await Promise.all([api("/admin/channels"), api("/admin/categories")]);
}

const option = (value, text) => el("option", { value, text });

/* ------------------------------------------------------------------ */
/*  Videolar                                                           */
/* ------------------------------------------------------------------ */
const videoDialog = $("#video-dialog");
const videoError = $("#video-error");
let editingVideo = null;

async function loadVideos() {
  const videos = await api("/admin/videos");
  $("#videos-wrap").hidden = !videos.length;
  $("#videos-empty").hidden = videos.length > 0;

  $("#videos-body").replaceChildren(
    ...videos.map((video) =>
      el(
        "tr",
        {},
        el(
          "td",
          {},
          el(
            "div",
            { class: "cell-with-thumb" },
            video.thumb_url ? el("img", { class: "mini-thumb", src: video.thumb_url, alt: "" }) : el("span", { class: "mini-thumb" }),
            el(
              "div",
              {},
              el("strong", { text: video.title }),
              el("div", { class: "hint", text: [video.channel?.name, video.category?.name, video.duration_seconds ? formatDuration(video.duration_seconds) : null].filter(Boolean).join(" · ") })
            )
          )
        ),
        el("td", { text: `${video.min_age}+` }),
        el("td", {}, el("span", { class: video.is_published ? "badge" : "badge badge--draft", text: video.is_published ? "Nashr etilgan" : "Qoralama" })),
        el("td", {}, actionButtons(() => openVideoDialog(video), () => removeVideo(video)))
      )
    )
  );
}

async function removeVideo(video) {
  if (!confirm(`“${video.title}” videosi o'chirilsinmi? Fayllar ham o'chadi.`)) return;
  try {
    await api(`/admin/videos/${video.id}`, { method: "DELETE" });
    toast("O'chirildi");
    await loadVideos();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function openVideoDialog(video = null) {
  try {
    await loadLookups();
  } catch (error) {
    return toast(error.message, "error");
  }
  editingVideo = video;
  $("#video-title").textContent = video ? "Videoni tahrirlash" : "Yangi video";
  $("#v-title").value = video?.title ?? "";
  $("#v-desc").value = video?.description ?? "";
  $("#v-channel").replaceChildren(option("", "Kanalsiz"), ...channels.map((c) => option(c.id, c.name)));
  $("#v-category").replaceChildren(option("", "Bo'limsiz"), ...categories.map((c) => option(c.id, `${c.emoji} ${c.name}`)));
  $("#v-channel").value = video?.channel_id ?? "";
  $("#v-category").value = video?.category_id ?? "";
  $("#v-age").value = String(video?.min_age ?? 2);
  $("#v-published").checked = video ? video.is_published : true;
  $("#v-file").value = "";
  $("#v-thumb").value = "";
  $("#v-file-hint").textContent = video
    ? "Yangi fayl tanlamasangiz, avvalgi video qoladi."
    : "MP4 yoki WebM, 1–3 daqiqa, 50 MB gacha.";
  videoError.hidden = true;
  videoDialog.showModal();
  $("#v-title").focus();
}

$("#new-video").addEventListener("click", () => openVideoDialog());

$("#video-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#video-save");
  const original = button.textContent;
  button.disabled = true;
  videoError.hidden = true;

  try {
    const file = $("#v-file").files[0];
    const thumb = $("#v-thumb").files[0];
    if (!editingVideo && !file) throw new Error("Video faylini tanlang");
    checkFile(file, MAX_VIDEO_BYTES, "Video");
    checkFile(thumb, MAX_IMAGE_BYTES, "Rasm");

    let videoPath;
    let thumbPath;
    let duration = editingVideo?.duration_seconds ?? null;

    if (file) {
      button.textContent = "Video yuklanmoqda...";
      duration = await readDuration(file);
      videoPath = await uploadFile("video", file);
    }
    if (thumb) {
      button.textContent = "Rasm yuklanmoqda...";
      thumbPath = await uploadFile("thumb", thumb);
    }

    button.textContent = "Saqlanmoqda...";
    const body = {
      title: $("#v-title").value,
      description: $("#v-desc").value,
      channel_id: $("#v-channel").value || null,
      category_id: $("#v-category").value || null,
      min_age: Number($("#v-age").value),
      is_published: $("#v-published").checked,
      duration_seconds: duration,
      video_path: videoPath,
      thumb_path: thumbPath,
    };
    if (editingVideo) await api(`/admin/videos/${editingVideo.id}`, { method: "PUT", body });
    else await api("/admin/videos", { method: "POST", body });

    videoDialog.close();
    toast(editingVideo ? "Saqlandi" : "Video qo'shildi");
    await loadVideos();
  } catch (error) {
    videoError.textContent = error.message;
    videoError.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

/* ------------------------------------------------------------------ */
/*  Kanallar                                                           */
/* ------------------------------------------------------------------ */
const channelDialog = $("#channel-dialog");
const channelError = $("#channel-error");
let editingChannel = null;

async function loadChannels() {
  channels = await api("/admin/channels");
  $("#channels-wrap").hidden = !channels.length;
  $("#channels-empty").hidden = channels.length > 0;
  $("#channels-body").replaceChildren(
    ...channels.map((channel) =>
      el(
        "tr",
        {},
        el(
          "td",
          {},
          el("div", { class: "cell-with-thumb" }, channelAvatar(channel, "chan chan--mini"), el("div", {}, el("strong", { text: channel.name }), channel.description ? el("div", { class: "hint", text: channel.description }) : null))
        ),
        el("td", {}, actionButtons(() => openChannelDialog(channel), () => removeChannel(channel)))
      )
    )
  );
}

function openChannelDialog(channel = null) {
  editingChannel = channel;
  $("#channel-title").textContent = channel ? "Kanalni tahrirlash" : "Yangi kanal";
  $("#c-name").value = channel?.name ?? "";
  $("#c-desc").value = channel?.description ?? "";
  $("#c-avatar").value = "";
  channelError.hidden = true;
  channelDialog.showModal();
  $("#c-name").focus();
}

async function removeChannel(channel) {
  if (!confirm(`“${channel.name}” kanali o'chirilsinmi? Uning videolari o'chmaydi, faqat kanalsiz qoladi.`)) return;
  try {
    await api(`/admin/channels/${channel.id}`, { method: "DELETE" });
    toast("O'chirildi");
    await loadChannels();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("#new-channel").addEventListener("click", () => openChannelDialog());

$("#channel-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#channel-save");
  button.disabled = true;
  channelError.hidden = true;
  try {
    const file = $("#c-avatar").files[0];
    checkFile(file, MAX_IMAGE_BYTES, "Rasm");
    const body = { name: $("#c-name").value, description: $("#c-desc").value, avatar_path: file ? await uploadFile("channel", file) : undefined };
    if (editingChannel) await api(`/admin/channels/${editingChannel.id}`, { method: "PUT", body });
    else await api("/admin/channels", { method: "POST", body });
    channelDialog.close();
    toast("Saqlandi");
    await loadChannels();
  } catch (error) {
    channelError.textContent = error.message;
    channelError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/*  Bo'limlar                                                          */
/* ------------------------------------------------------------------ */
const categoryDialog = $("#category-dialog");
const categoryError = $("#category-error");
let editingCategory = null;

async function loadCategories() {
  categories = await api("/admin/categories");
  $("#categories-body").replaceChildren(
    ...categories.map((category) =>
      el(
        "tr",
        {},
        el("td", { text: `${category.emoji} ${category.name}` }),
        el("td", { text: String(category.sort_order) }),
        el("td", {}, actionButtons(() => openCategoryDialog(category), () => removeCategory(category)))
      )
    )
  );
}

function openCategoryDialog(category = null) {
  editingCategory = category;
  $("#category-title").textContent = category ? "Bo'limni tahrirlash" : "Yangi bo'lim";
  $("#g-name").value = category?.name ?? "";
  $("#g-emoji").value = category?.emoji ?? "";
  $("#g-order").value = String(category?.sort_order ?? 0);
  categoryError.hidden = true;
  categoryDialog.showModal();
  $("#g-name").focus();
}

async function removeCategory(category) {
  if (!confirm(`“${category.name}” bo'limi o'chirilsinmi? Videolar o'chmaydi, faqat bo'limsiz qoladi.`)) return;
  try {
    await api(`/admin/categories/${category.id}`, { method: "DELETE" });
    toast("O'chirildi");
    await loadCategories();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("#new-category").addEventListener("click", () => openCategoryDialog());

$("#category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  categoryError.hidden = true;
  const body = { name: $("#g-name").value, emoji: $("#g-emoji").value, sort_order: Number($("#g-order").value) || 0 };
  try {
    if (editingCategory) await api(`/admin/categories/${editingCategory.id}`, { method: "PUT", body });
    else await api("/admin/categories", { method: "POST", body });
    categoryDialog.close();
    toast("Saqlandi");
    await loadCategories();
  } catch (error) {
    categoryError.textContent = error.message;
    categoryError.hidden = false;
  }
});

/* ------------------------------------------------------------------ */
/*  Foydalanuvchilar                                                   */
/* ------------------------------------------------------------------ */
async function loadUsers() {
  const users = await api("/admin/users");

  $("#users-body").replaceChildren(
    ...users.map((user) => {
      const roleSelect = el("select", { class: "role-select", "aria-label": `${user.email} roli` }, option("user", "Foydalanuvchi"), option("admin", "Administrator"));
      roleSelect.value = user.role;
      let previousRole = user.role;
      roleSelect.addEventListener("change", async () => {
        roleSelect.disabled = true;
        try {
          await api(`/admin/users/${user.id}/role`, { method: "PATCH", body: { role: roleSelect.value } });
          previousRole = roleSelect.value;
          toast("Rol yangilandi");
        } catch (error) {
          roleSelect.value = previousRole;
          toast(error.message, "error");
        } finally {
          roleSelect.disabled = false;
        }
      });

      const proSelect = el(
        "select",
        { class: "pro-select", "aria-label": `${user.email} uchun Pro obuna` },
        option("", "Pro obuna..."),
        option("30", "+30 kun"),
        option("90", "+90 kun"),
        option("365", "+365 kun"),
        option("0", "Bekor qilish")
      );
      proSelect.addEventListener("change", async () => {
        if (proSelect.value === "") return;
        proSelect.disabled = true;
        try {
          await api(`/admin/users/${user.id}/pro`, { method: "POST", body: { days: Number(proSelect.value) } });
          toast("Pro obuna yangilandi");
          await loadUsers();
        } catch (error) {
          toast(error.message, "error");
          proSelect.value = "";
          proSelect.disabled = false;
        }
      });

      return el(
        "tr",
        {},
        el("td", {}, el("strong", { text: user.full_name || "—" }), el("div", { class: "hint", text: user.email ?? "" })),
        el(
          "td",
          {},
          el("span", { class: user.is_pro ? "badge badge--pro" : "badge badge--off", text: user.is_pro ? `${formatDate(user.pro_until)} gacha` : "Yo'q" }),
          " ",
          proSelect
        ),
        el("td", {}, roleSelect)
      );
    })
  );
}

boot().catch((error) => showGate(error.message, "Profilga o'tish", "/profile"));
