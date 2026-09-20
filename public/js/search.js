import { $, api, el, loadContext, mountChrome, renderError, renderMixed } from "./core.js";

mountChrome("search");

const ctx = await loadContext().catch(() => ({ isPro: false, session: null }));
const locked = ctx.session ? !ctx.isPro : true;

const form = $("#search-form");
const input = $("#q");
const chips = $("#chips");
const meta = $("#meta");
const results = $("#results");

const params = new URLSearchParams(location.search);
let category = params.get("category") ?? "";
input.value = params.get("q") ?? "";

let requestId = 0;
let timer;

function syncUrl() {
  const next = new URLSearchParams();
  if (input.value.trim()) next.set("q", input.value.trim());
  if (category) next.set("category", category);
  const query = next.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

async function run() {
  const id = ++requestId;
  const q = input.value.trim();
  syncUrl();

  try {
    const videos = await api(`/videos?${new URLSearchParams({ q, category, limit: "60" })}`);
    if (id !== requestId) return; // eski so'rov natijasi kerak emas
    meta.textContent = videos.length ? (q || category ? `${videos.length} ta video topildi` : "So'nggi videolar") : "";
    renderMixed(results, videos, {
      locked,
      empty: "Hech narsa topilmadi",
      emptyText: q ? "Boshqa so'z yozib ko'ring yoki bo'limni o'zgartiring." : "Bu bo'limda hozircha video yo'q.",
    });
  } catch (error) {
    if (id !== requestId) return;
    meta.textContent = "";
    renderError(results, error);
  }
}

function renderChips(categories) {
  const make = (value, label) =>
    el("button", {
      class: "chip",
      type: "button",
      "aria-pressed": String(category === value),
      onclick: () => {
        category = value;
        renderChips(categories);
        run();
      },
      text: label,
    });
  chips.replaceChildren(make("", "Hammasi"), ...categories.map((c) => make(c.id, `${c.emoji} ${c.name}`)));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(timer);
  run();
});

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(run, 300);
});

api("/categories").then(renderChips).catch(() => renderChips([]));
run();
