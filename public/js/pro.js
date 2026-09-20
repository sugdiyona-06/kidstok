import { $, api, el, formatDate, loadContext, mountCats, mountChrome, resetContext } from "./core.js";

mountChrome("profile");

const ctx = await loadContext().catch(() => ({ session: null, me: null, isPro: false }));
const info = await api("/plans").catch(() => ({ plans: [], providers: {}, contactUrl: "" }));

const status = $("#pro-status");
const errorBox = $("#pay-error");
const actions = $("#pro-actions");

const price = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
const canPay = Boolean(info.providers?.payme || info.providers?.click);
const POLL_MS = 2000;
const POLL_TRIES = 20;

function say(text, isError = false) {
  status.hidden = isError;
  errorBox.hidden = !isError;
  (isError ? errorBox : status).textContent = text;
}

/* ---------- To'lovdan qaytgach: buyurtma holatini tekshirish ---------- */
async function watchOrder(orderId) {
  say("To'lov tekshirilmoqda...");
  for (let i = 0; i < POLL_TRIES; i++) {
    try {
      const order = await api(`/orders/${orderId}`);
      if (order.status === "paid") {
        say("To'lov qabul qilindi! Pro obunangiz faollashtirildi. Rahmat!");
        resetContext();
        history.replaceState(null, "", "/pro");
        return true;
      }
      if (order.status === "cancelled") {
        say("To'lov bekor qilingan. Qayta urinib ko'ring.", true);
        return false;
      }
    } catch {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  say("To'lov hali tasdiqlanmadi. Pul yechilgan bo'lsa, bir necha daqiqadan keyin sahifani yangilang. Obuna avtomatik faollashadi.");
  return false;
}

/* ---------- Tariflar ---------- */
function planCard(plan, best) {
  const buttons = [];
  if (ctx.session && canPay) {
    for (const [key, label] of [["payme", "Payme"], ["click", "Click"]]) {
      if (!info.providers[key]) continue;
      buttons.push(el("button", { class: "btn", type: "button", "data-pay": key, "data-days": String(plan.days), onclick: () => pay(plan, key), text: `${label} bilan to'lash` }));
    }
  }
  return el(
    "article",
    { class: best ? "plan plan--best" : "plan" },
    best ? el("span", { class: "plan__flag", text: "Eng foydali" }) : null,
    el("h2", { text: plan.label }),
    el("p", { class: "plan__price", text: price(plan.price) }),
    el("p", { class: "hint", text: `${plan.days} kun · kuniga ≈ ${price(Math.round(plan.price / plan.days))}` }),
    el("div", { class: "plan__buttons" }, buttons)
  );
}

async function pay(plan, provider) {
  errorBox.hidden = true;
  const buttons = document.querySelectorAll("[data-pay]");
  buttons.forEach((b) => (b.disabled = true));
  try {
    const order = await api("/orders", { method: "POST", body: { plan_days: plan.days, provider } });
    location.href = order.pay_url; // Payme yoki Click sahifasiga o'tadi
  } catch (error) {
    say(error.message, true);
    buttons.forEach((b) => (b.disabled = false));
  }
}

if (ctx.isPro) {
  status.hidden = false;
  status.textContent = `Pro obunangiz faol: ${formatDate(ctx.me.pro_until)} gacha. Yangi obuna amaldagisi tugagach davom etadi.`;
} else if (ctx.session) {
  status.hidden = false;
  status.textContent = "Hozircha Pro obunangiz yo'q. Quyidagi rejalardan birini tanlang.";
}

if (info.plans.length) {
  const perDay = (p) => p.price / p.days;
  const cheapest = info.plans.reduce((a, b) => (perDay(b) < perDay(a) ? b : a));
  $("#plans").replaceChildren(...info.plans.map((plan) => planCard(plan, info.plans.length > 1 && plan.days === cheapest.days)));
}

mountCats();

if (!ctx.session) {
  actions.append(el("a", { class: "btn btn--big", href: "/profile", text: "Sotib olish uchun kiring" }));
} else if (!canPay) {
  if (info.contactUrl) {
    actions.append(el("a", { class: "btn btn--big", href: info.contactUrl, target: "_blank", rel: "noopener", text: "Obunani faollashtirish" }));
  } else {
    const hint = $("#pro-hint");
    hint.hidden = false;
    hint.textContent = "Online to'lov hozircha ulanmagan. Obunani faollashtirish uchun administrator bilan bog'laning.";
  }
}

const orderId = new URLSearchParams(location.search).get("order");
if (orderId && ctx.session) watchOrder(orderId);
