import { $, childPicker, el, emptyBox, loadContext, mountChrome } from "./core.js";
import { createReels } from "./reels.js";

mountChrome("shorts");

const stage = $("#stage");
const gateBox = $("#shorts-gate");

const startId = new URLSearchParams(location.search).get("start") || new URLSearchParams(location.search).get("id");
const link = (href, text, ghost = false) => el("a", { class: ghost ? "btn btn--ghost" : "btn", href, text });

/* Kirish/obuna/bola holatlari uchun butun sahifa xabari */
function showGate({ emoji, title, text, extra = [], actions = [] }) {
  stage.hidden = true;
  gateBox.hidden = false;
  gateBox.replaceChildren(
    el("div", { class: "panel gate-card gate-card--page" }, el("span", { class: "gate-emoji", "aria-hidden": "true", text: emoji }), el("h2", { text: title }), text ? el("p", { class: "muted", text }) : null, ...extra, ...actions)
  );
}

function showMessage(...nodes) {
  stage.hidden = true;
  gateBox.hidden = false;
  gateBox.replaceChildren(...nodes);
}

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
  createReels({
    feed: $("#feed"),
    overlay: $("#overlay"),
    prev: $("#prev"),
    next: $("#next"),
    first: 8,
    infinite: true,
    syncUrl: true,
    startId,
    onEmpty: () => showMessage(emptyBox("Hozircha Shorts yo'q", "Tez orada yangi videolar qo'shiladi."), el("p", {}, link("/", "Bosh sahifaga", true))),
    onError: (error) => showMessage(emptyBox("Yuklab bo'lmadi", error.message)),
  }).start();
}

main();
