/* Nurchashma — mushukchalar: SVG rasmlar va ularni sahifaga joylash.
   Barcha rasmlar aria-hidden: bezak, ekran o'quvchilarga xalaqit bermaydi.
   Ranglar va animatsiyalar css/style.css dagi "MUSHUKCHALAR" bo'limida. */

const VARIANTS = ["orange", "gray", "white", "black"];
const variant = (name) => (VARIANTS.includes(name) ? name : "orange");

/* ---------- Logotip: mushuk yuzi ---------- */
export const CAT_LOGO =
  '<svg width="42" height="42" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="10" fill="#3E6BF4"/>' +
  '<path d="M7 14 8 5l7 4.5Z" fill="#FFB067"/><path d="M25 14l-1-9-7 4.5Z" fill="#FFB067"/>' +
  '<path d="M9.2 12.4 9.6 8l3.4 2.2Z" fill="#FFB3C1"/><path d="M22.8 12.4 22.4 8 19 10.2Z" fill="#FFB3C1"/>' +
  '<ellipse cx="16" cy="18.5" rx="10" ry="9" fill="#FFB067"/>' +
  '<circle cx="12.3" cy="17.5" r="1.7" fill="#1A2347"/><circle cx="19.7" cy="17.5" r="1.7" fill="#1A2347"/>' +
  '<circle cx="12.8" cy="16.9" r=".6" fill="#fff"/><circle cx="20.2" cy="16.9" r=".6" fill="#fff"/>' +
  '<path d="M14.6 21h2.8L16 22.8Z" fill="#FF8FA3"/>' +
  '<path d="M16 22.8q-2 2.2-4 .8M16 22.8q2 2.2 4 .8" stroke="#1A2347" stroke-width="1" fill="none" stroke-linecap="round"/></svg>';

/* ---------- Old tomondan o'tirgan mushuk ---------- */
// Bosh + quloqlar + ko'z + burun — alohida guruhda, chunki "mo'ralovchi" mushuk faqat boshni ishlatadi
const FACE = `
  <g class="cat__ear cat__ear--l"><path class="c-fur" d="M50 74 44 22 88 50Z"/><path class="c-ear" d="M55 64 52 36 76 51Z"/></g>
  <g class="cat__ear cat__ear--r"><path class="c-fur" d="M150 74l6-52-44 28Z"/><path class="c-ear" d="M145 64l3-28-24 15Z"/></g>
  <ellipse class="c-fur" cx="100" cy="98" rx="64" ry="56"/>
  <path class="c-stripe" d="M100 44v14M86 46l3 12M114 46l-3 12"/>
  <ellipse class="c-blush" cx="62" cy="114" rx="11" ry="7"/><ellipse class="c-blush" cx="138" cy="114" rx="11" ry="7"/>
  <g class="cat__eyes">
    <ellipse class="c-eye" cx="76" cy="98" rx="9" ry="11"/><circle class="c-shine" cx="79" cy="93" r="3.4"/>
    <ellipse class="c-eye" cx="124" cy="98" rx="9" ry="11"/><circle class="c-shine" cx="127" cy="93" r="3.4"/>
  </g>
  <path class="c-nose" d="M93 112h14l-7 8Z"/>
  <path class="c-mouth" d="M100 120q-8 11-18 5M100 120q8 11 18 5"/>
  <g class="c-whisker cat__whiskers"><path d="M60 118 24 110M60 124 24 128"/><path d="M140 118l36-8M140 124l36 4"/></g>`;

export function catSit(name = "orange") {
  return `<svg class="cat cat--${variant(name)}" viewBox="0 0 200 232" aria-hidden="true">
  <path class="cat__tail" d="M148 208c40 2 50-40 22-60" fill="none"/>
  <ellipse class="c-fur" cx="100" cy="178" rx="58" ry="50"/>
  <ellipse class="c-belly" cx="100" cy="188" rx="34" ry="34"/>
  <ellipse class="c-fur" cx="76" cy="222" rx="19" ry="10"/><ellipse class="c-fur" cx="124" cy="222" rx="19" ry="10"/>
  <path class="c-toe" d="M70 224v-6M78 225v-7M122 225v-7M130 224v-6"/>
  <g class="cat__head">${FACE}</g>
</svg>`;
}

/* ---------- Devor ortidan mo'ralovchi mushuk (faqat bosh) ---------- */
export function catPeek(name = "orange") {
  return `<svg class="cat cat--${variant(name)}" viewBox="0 14 200 122" aria-hidden="true"><g class="cat__head">${FACE}</g></svg>`;
}

/* ---------- Yon tomondan yuguruvchi mushuk ---------- */
export function catWalk(name = "gray") {
  return `<svg class="cat cat--${variant(name)}" viewBox="0 0 140 84" aria-hidden="true">
  <path class="cat__tail cat__tail--walk" d="M28 40C6 40 4 16 17 9" fill="none"/>
  <rect class="leg leg--b1 c-fur2" x="30" y="50" width="10" height="26" rx="5"/>
  <rect class="leg leg--f1 c-fur2" x="72" y="50" width="10" height="26" rx="5"/>
  <rect class="c-fur" x="24" y="24" width="68" height="34" rx="17"/>
  <path class="c-stripe" d="M40 25v9M52 24v10M64 24v10M76 25v9"/>
  <rect class="leg leg--b2 c-fur" x="42" y="50" width="10" height="26" rx="5"/>
  <rect class="leg leg--f2 c-fur" x="84" y="50" width="10" height="26" rx="5"/>
  <g class="cat__walkhead">
    <path class="c-fur" d="M88 22 91 3l11 11Z"/><path class="c-fur" d="M105 14 116 3l3 20Z"/>
    <circle class="c-fur" cx="103" cy="32" r="19"/>
    <circle class="c-eye" cx="109" cy="30" r="2.8"/><circle class="c-shine" cx="110" cy="29" r="1"/>
    <path class="c-nose" d="M119 33h5l-2.5 3.2Z"/>
    <path class="c-mouth c-mouth--thin" d="M121.5 36.2q-2 3-5 2"/>
    <g class="c-whisker"><path d="M119 36l14-3M119 38l14 3"/></g>
  </g>
</svg>`;
}

/* ---------- Uxlayotgan mushuk (bo'sh ro'yxatlar uchun) ---------- */
export function catSleep(name = "orange") {
  return `<svg class="cat cat--${variant(name)} sleepcat" viewBox="0 0 230 138" aria-hidden="true">
  <ellipse cx="112" cy="128" rx="88" ry="7" class="c-shadow"/>
  <path class="cat__tail sleepcat__tail" d="M170 108C220 116 222 66 178 74" fill="none"/>
  <ellipse class="c-fur sleepcat__body" cx="114" cy="98" rx="78" ry="33"/>
  <path class="c-stripe" d="M98 70v12M114 67v13M130 68v12"/>
  <g>
    <path class="c-fur" d="M28 78 27 48 52 64Z"/><path class="c-fur" d="M80 76l6-30-26 17Z"/>
    <circle class="c-fur" cx="54" cy="94" r="31"/>
    <path class="c-mouth" d="M39 94q7 7 14 0M63 94q7 7 14 0"/>
    <ellipse class="c-blush" cx="36" cy="106" rx="7" ry="4.5"/><ellipse class="c-blush" cx="74" cy="106" rx="7" ry="4.5"/>
    <path class="c-nose" d="M51 102h8l-4 5Z"/>
  </g>
  <g class="zzz"><text x="92" y="52">z</text><text x="108" y="36">Z</text><text x="128" y="22">Z</text></g>
</svg>`;
}

/* ---------- Bosh sahifadagi katta manzara (mehmonlar uchun) ---------- */
export function heroScene() {
  return `<svg viewBox="0 0 440 340" aria-hidden="true">
  <g class="cloud cloud--1" fill="#fff"><circle cx="70" cy="70" r="22"/><circle cx="100" cy="56" r="30"/><circle cx="134" cy="72" r="22"/><rect x="70" y="70" width="64" height="24" rx="12"/></g>
  <g class="cloud cloud--2" fill="#fff"><circle cx="352" cy="46" r="16"/><circle cx="374" cy="36" r="22"/><circle cx="398" cy="48" r="15"/><rect x="352" y="46" width="46" height="17" rx="8.5"/></g>
  <ellipse cx="220" cy="292" rx="214" ry="48" fill="#3FD1A6"/>
  <ellipse cx="300" cy="300" rx="120" ry="28" fill="#2FBF95" opacity=".55"/>
  <circle cx="130" cy="182" r="74" fill="#3E6BF4"/>
  <circle cx="130" cy="182" r="58" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="6"/>
  <path d="M114 150v64l54-32z" fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
  <svg class="hero-cat hero-cat--small cat--gray" x="6" y="204" width="104" height="120" viewBox="0 0 200 232">${catSit("gray").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>
  <svg class="hero-cat hero-cat--big cat--orange" x="228" y="70" width="190" height="220" viewBox="0 0 200 232">${catSit("orange").replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>
  <path class="twinkle twinkle--1" transform="translate(212 84) scale(1.3)" d="M0-14C2-4 4-2 14 0 4 2 2 4 0 14-2 4-4 2-14 0-4-2-2-4 0-14Z" fill="#FF8A78"/>
  <path class="twinkle twinkle--2" transform="translate(52 130)" d="M0-14C2-4 4-2 14 0 4 2 2 4 0 14-2 4-4 2-14 0-4-2-2-4 0-14Z" fill="#A58BFF"/>
  <path class="twinkle twinkle--3" transform="translate(420 170) scale(.8)" d="M0-14C2-4 4-2 14 0 4 2 2 4 0 14-2 4-4 2-14 0-4-2-2-4 0-14Z" fill="#fff"/>
</svg>`;
}

/* ---------- Suzib yuruvchi bezaklar (orqa fon) ---------- */
const PAW = '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="27" rx="9" ry="7.5"/><ellipse cx="8" cy="17" rx="4" ry="5.2"/><ellipse cx="16" cy="9" rx="4" ry="5.4"/><ellipse cx="24" cy="9" rx="4" ry="5.4"/><ellipse cx="32" cy="17" rx="4" ry="5.2"/></svg>';
const FISH = '<svg viewBox="0 0 48 32"><path d="M4 16C12 4 28 4 38 16 28 28 12 28 4 16Z"/><path d="M36 16l10-9v18Z"/><circle cx="14" cy="14" r="2" fill="#fff"/></svg>';
const YARN = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/><path d="M8 14c8 4 16 4 24 0M6 22c10 5 18 5 28 0M12 32c6-4 12-5 18-4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><path d="M33 30c4 3 6 3 6 8" fill="none" stroke-width="2.4" stroke-linecap="round"/></svg>';
const STAR = '<svg viewBox="-16 -16 32 32"><path d="M0-14C2-4 4-2 14 0 4 2 2 4 0 14-2 4-4 2-14 0-4-2-2-4 0-14Z"/></svg>';
const HEART = '<svg viewBox="0 0 40 36"><path d="M20 34C4 22 2 14 2 10 2 4 7 1 12 1c4 0 7 2 8 6 1-4 4-6 8-6 5 0 10 3 10 9 0 4-2 12-18 24Z"/></svg>';

const DECOR = [
  ["paw", PAW, "3%", "12%"], ["fish", FISH, "93%", "20%"], ["yarn", YARN, "5%", "44%"], ["star", STAR, "95%", "50%"],
  ["heart", HEART, "2%", "72%"], ["paw", PAW, "94%", "78%"], ["star", STAR, "9%", "90%"], ["fish", FISH, "88%", "92%"],
];

function mountDecor() {
  if (document.querySelector(".decor")) return;
  const layer = document.createElement("div");
  layer.className = "decor";
  layer.setAttribute("aria-hidden", "true");
  DECOR.forEach(([kind, svg, left, top], i) => {
    const item = document.createElement("span");
    item.className = `decor__i decor__i--${kind}`;
    item.style.left = left;
    item.style.top = top;
    item.style.animationDelay = `${-i * 1.7}s`;
    item.insertAdjacentHTML("afterbegin", svg);
    layer.append(item);
  });
  document.body.prepend(layer);
}

/* ---------- Footer bo'ylab yuguruvchi mushuk ---------- */
function mountWalker() {
  const footer = document.querySelector("#site-footer");
  if (!footer || footer.querySelector(".walker")) return;
  const walker = document.createElement("div");
  walker.className = "walker";
  walker.setAttribute("aria-hidden", "true");
  walker.insertAdjacentHTML("afterbegin", catWalk("gray"));
  footer.prepend(walker);
}

/* ---------- Burchakdagi maskot: bosilsa gapiradi ---------- */
const SAYINGS = ["Miyov! 🐾", "Salom, do'stim!", "Multfilm ko'ramizmi?", "Purr-purr... 💛", "Bugun nima o'ynaymiz?", "Miyov-miyov!", "Men senga yordam beraman!", "Sen juda zo'rsan! ⭐"];
const NO_MASCOT = ["/", "/watch", "/shorts", "/admin", "/parent", "/reset"];

function mountMascot() {
  if (document.querySelector(".mascot") || NO_MASCOT.includes(location.pathname)) return;
  const wrap = document.createElement("div");
  wrap.className = "mascot";
  const bubble = document.createElement("div");
  bubble.className = "mascot__bubble";
  bubble.setAttribute("role", "status");
  bubble.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mascot__btn";
  button.setAttribute("aria-label", "Mushukcha bilan o'ynash");
  button.insertAdjacentHTML("afterbegin", catSit("orange"));

  let timer;
  let last = -1;
  button.addEventListener("click", () => {
    let next;
    do next = Math.floor(Math.random() * SAYINGS.length);
    while (next === last);
    last = next;
    bubble.textContent = SAYINGS[next];
    bubble.hidden = false;
    wrap.classList.remove("is-hop");
    void wrap.offsetWidth; // animatsiyani qayta boshlash
    wrap.classList.add("is-hop");
    clearTimeout(timer);
    timer = setTimeout(() => (bubble.hidden = true), 2600);
  });
  wrap.append(bubble, button);
  document.body.append(wrap);
}

/* ---------- Mo'ralovchi mushuklar: data-peek="orange" bo'lgan elementlar ustida ---------- */
function mountPeeks() {
  document.querySelectorAll("[data-peek]").forEach((host) => {
    if (host.querySelector(":scope > .peek")) return;
    const peek = document.createElement("span");
    peek.className = "peek";
    peek.setAttribute("aria-hidden", "true");
    peek.insertAdjacentHTML("afterbegin", catPeek(host.dataset.peek));
    host.prepend(peek);
  });
}

/* ---------- Lentaning ikki yonida o'tirgan mushuklar (faqat keng ekranda ko'rinadi) ---------- */
function mountReelCats() {
  const stage = document.querySelector(".shorts-stage");
  if (!stage || stage.querySelector(".reel-cat")) return;
  for (const [side, name] of [["left", "orange"], ["right", "gray"]]) {
    const wrap = document.createElement("span");
    wrap.className = `reel-cat reel-cat--${side}`;
    wrap.setAttribute("aria-hidden", "true");
    wrap.insertAdjacentHTML("afterbegin", catSit(name));
    stage.append(wrap);
  }
}

/** Sahifadagi barcha mushukchalarni joylaydi (har chaqirilganda faqat yetishmaganini qo'shadi). */
export function mountCats() {
  mountDecor();
  mountWalker();
  mountMascot();
  mountPeeks();
  mountReelCats();
  const scene = document.querySelector("#scene");
  if (scene && !scene.firstChild) scene.insertAdjacentHTML("afterbegin", heroScene());
}
