import {
  $, AVATARS, api, avatarEl, clearParentToken, el, formatDate, formatDateTime, formatMinutes, getParentToken, loadContext, mountChrome,
  resetContext, setParentToken, toast,
} from "./core.js";

mountChrome("profile");

const gate = $("#gate");
const panel = $("#panel");
const gateError = $("#gate-error");
const pinForm = $("#pin-form");

let ctx;
let mode = "entry"; // "entry" | "setup"

const showGateError = (message) => {
  gateError.textContent = message;
  gateError.hidden = false;
};

/* ---------- Darvoza: kirish va PIN ---------- */
function setupPinForm(nextMode) {
  mode = nextMode;
  pinForm.hidden = false;
  $("#pin2-field").hidden = mode !== "setup";
  $("#pin2").required = mode === "setup";
  $("#pin-submit").textContent = mode === "setup" ? "PIN-kodni o'rnatish" : "Ochish";
  $("#gate-title").textContent = mode === "setup" ? "PIN-kod o'rnating" : "Ota-onalar bo'limi";
  $("#gate-text").textContent =
    mode === "setup"
      ? "Bola profillari, vaqt limiti va tarix faqat siz bilishingiz kerak bo'lgan 4 xonali PIN-kod bilan ochiladi."
      : "Davom etish uchun PIN-kodni kiriting.";
  $("#pin").focus();
}

async function unlock(pin) {
  const result = await api("/parent/unlock", { method: "POST", body: { pin } });
  setParentToken(result.token, result.expires_in_ms);
}

pinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  gateError.hidden = true;
  const pin = $("#pin").value;
  const button = $("#pin-submit");
  button.disabled = true;
  try {
    if (mode === "setup") {
      if (pin !== $("#pin2").value) throw new Error("PIN-kodlar bir xil emas");
      await api("/parent/pin", { method: "POST", body: { pin } });
    }
    await unlock(pin);
    resetContext();
    location.reload();
  } catch (error) {
    showGateError(error.message);
    $("#pin").value = "";
    $("#pin2").value = "";
    $("#pin").focus();
  } finally {
    button.disabled = false;
  }
});

/* ---------- Server "qulflangan" desa, PIN so'rash ---------- */
async function guard(task) {
  try {
    return await task();
  } catch (error) {
    if (error.code === "parent_locked" || error.code === "no_pin") {
      clearParentToken();
      location.reload();
      return undefined;
    }
    throw error;
  }
}

/* ---------- Bo'limlar ---------- */
const tabButtons = document.querySelectorAll("[data-tab]");
const loaders = { kids: loadKids, history: loadHistory, plan: loadPlan, pin: async () => {} };

function openTab(name) {
  for (const button of tabButtons) {
    const active = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(active));
    $(`#tab-${button.dataset.tab}`).hidden = !active;
  }
  loaders[name]().catch((error) => toast(error.message, "error"));
}
tabButtons.forEach((button) => button.addEventListener("click", () => openTab(button.dataset.tab)));

$("#lock").addEventListener("click", () => {
  clearParentToken();
  location.href = "/profile";
});

/* ---------- Bolalar ---------- */
let children = [];

async function loadKids() {
  children = await guard(() => api("/children"));
  const list = $("#kids-list");
  if (!children.length) {
    list.replaceChildren(el("p", { class: "muted", text: "Hali bola profili yo'q. “Bola qo'shish” tugmasini bosing." }));
    return;
  }
  list.replaceChildren(
    ...children.map((child) =>
      el(
        "div",
        { class: "kid-row" },
        avatarEl(child.avatar, "avatar"),
        el("div", {}, el("strong", { text: child.name }), el("p", { text: `${child.age} yosh · ${child.daily_limit_minutes ? `kuniga ${child.daily_limit_minutes} daqiqa` : "vaqt cheklanmagan"}` })),
        el("div", { class: "actions" },
          el("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => openKidDialog(child), text: "Tahrirlash" }),
          el("button", { class: "btn btn--danger btn--small", type: "button", onclick: () => removeKid(child), text: "O'chirish" }))
      )
    )
  );
}

async function removeKid(child) {
  if (!confirm(`${child.name} profili o'chirilsinmi? Uning tarixi, yoqtirganlari va ro'yxatlari ham o'chadi.`)) return;
  try {
    await guard(() => api(`/children/${child.id}`, { method: "DELETE" }));
    toast("O'chirildi");
    resetContext();
    await loadKids();
  } catch (error) {
    toast(error.message, "error");
  }
}

const kidDialog = $("#kid-dialog");
const kidError = $("#kid-error");
let editingKid = null;

$("#k-avatars").replaceChildren(
  ...Object.keys(AVATARS).map((key, index) =>
    el("label", { title: key }, el("input", { type: "radio", name: "avatar", value: key, required: index === 0 }), avatarEl(key, "avatar"))
  )
);

function openKidDialog(child = null) {
  editingKid = child;
  $("#kid-title").textContent = child ? "Profilni tahrirlash" : "Bola qo'shish";
  $("#k-name").value = child?.name ?? "";
  $("#k-age").value = String(child?.age ?? 4);
  $("#k-limit").value = child?.daily_limit_minutes ? String(child.daily_limit_minutes) : "";
  const selected = child?.avatar ?? "bear";
  document.querySelectorAll('#k-avatars input').forEach((input) => (input.checked = input.value === selected));
  kidError.hidden = true;
  kidDialog.showModal();
  $("#k-name").focus();
}

$("#add-kid").addEventListener("click", () => openKidDialog());
$("#kid-close").addEventListener("click", () => kidDialog.close());
$("#kid-cancel").addEventListener("click", () => kidDialog.close());
kidDialog.addEventListener("click", (event) => {
  if (event.target === kidDialog) kidDialog.close();
});

$("#kid-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter ?? event.target.querySelector("button[type=submit]");
  button.disabled = true;
  kidError.hidden = true;

  const body = {
    name: $("#k-name").value,
    age: Number($("#k-age").value),
    avatar: document.querySelector('#k-avatars input:checked')?.value,
    daily_limit_minutes: $("#k-limit").value ? Number($("#k-limit").value) : null,
  };

  try {
    await guard(() => (editingKid ? api(`/children/${editingKid.id}`, { method: "PUT", body }) : api("/children", { method: "POST", body })));
    kidDialog.close();
    toast(editingKid ? "Saqlandi" : "Bola profili yaratildi");
    resetContext();
    await loadKids();
  } catch (error) {
    kidError.textContent = error.message;
    kidError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

/* ---------- Tarix ---------- */
const historyKid = $("#history-kid");
historyKid.addEventListener("change", () => loadHistoryFor(historyKid.value).catch((error) => toast(error.message, "error")));

async function loadHistory() {
  children = await guard(() => api("/children"));
  historyKid.replaceChildren(...children.map((child) => el("option", { value: child.id, text: child.name })));
  if (!children.length) {
    $("#usage-body").replaceChildren(row(["Bola profili yo'q"], 2));
    $("#history-body").replaceChildren(row(["Bola profili yo'q"], 3));
    return;
  }
  await loadHistoryFor(historyKid.value);
}

const row = (cells, span) =>
  el("tr", {}, cells.length === 1 && span ? el("td", { colspan: String(span), class: "muted", text: cells[0] }) : cells.map((text) => el("td", { text })));

async function loadHistoryFor(id) {
  const [usage, history] = await guard(() => Promise.all([api(`/parent/children/${id}/usage`), api(`/parent/children/${id}/history`)]));
  $("#usage-body").replaceChildren(...(usage.length ? usage.map((u) => row([formatDate(u.day), formatMinutes(u.seconds)])) : [row(["Hali tomosha qilinmagan"], 2)]));
  $("#history-body").replaceChildren(
    ...(history.length ? history.map((h) => row([h.title, formatDateTime(h.last_watched_at), formatMinutes(h.total_seconds)])) : [row(["Hali hech narsa ko'rilmagan"], 3)])
  );
}

/* ---------- Obuna ---------- */
async function loadPlan() {
  $("#plan-status").textContent = ctx.isPro
    ? `Pro obunangiz faol. Amal qilish muddati: ${formatDate(ctx.me.pro_until)}.`
    : "Hozircha Pro obunangiz yo'q. Videolarni tomosha qilish uchun obuna kerak.";
}

/* ---------- PIN almashtirish ---------- */
$("#pin-change-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#pin-change-error");
  error.hidden = true;
  try {
    await guard(() => api("/parent/pin", { method: "POST", body: { current_pin: $("#cur-pin").value, pin: $("#new-pin").value } }));
    event.target.reset();
    toast("PIN-kod almashtirildi");
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
});

/* ---------- Ishga tushirish ---------- */
function openPanel() {
  gate.hidden = true;
  panel.hidden = false;
  openTab("kids");
}

try {
  ctx = await loadContext();
  if (!ctx.session) {
    $("#gate-text").textContent = "Bu bo'lim faqat ota-onalar uchun. Avval akkauntingizga kiring.";
    $("#gate-link").hidden = false;
  } else if (!ctx.me.has_pin) {
    setupPinForm("setup");
  } else if (getParentToken()) {
    openPanel();
  } else {
    setupPinForm("entry");
  }
} catch (error) {
  $("#gate-text").textContent = error.message;
}
