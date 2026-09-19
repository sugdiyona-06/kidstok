import { $, api, channelAvatar, el, emptyBox, loadContext, mountChrome, renderVideos, toast } from "./core.js";

mountChrome("home");

const id = new URLSearchParams(location.search).get("id");
const ctx = await loadContext().catch(() => ({ session: null, child: null, isPro: false }));

const head = $("#channel-head");
const list = $("#channel-videos");

try {
  const channel = await api(`/channels/${id}`);
  document.title = `${channel.name} — Nurchashma`;

  const info = el("div", {}, el("h1", { text: channel.name }), channel.description ? el("p", { text: channel.description }) : null);
  head.hidden = false;
  head.replaceChildren(channelAvatar(channel, "chan chan--lg"), info);

  if (ctx.child) {
    let following = channel.following;
    const button = el("button", { class: "btn btn--ghost", type: "button" });
    const paint = () => {
      button.textContent = following ? "🔔 Obuna bo'lingan" : "🔔 Obuna bo'lish";
      button.setAttribute("aria-pressed", String(following));
    };
    button.addEventListener("click", async () => {
      try {
        await api(`/channels/${channel.id}/follow`, { method: following ? "DELETE" : "POST" });
        following = !following;
        paint();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    paint();
    info.append(button);
  }

  const videos = await api(`/videos?channel=${channel.id}&limit=60`);
  renderVideos(list, videos, { locked: ctx.session ? !ctx.isPro : true, empty: "Bu kanalda hozircha video yo'q" });
} catch (error) {
  list.classList.remove("videos");
  list.replaceChildren(emptyBox("Kanal topilmadi", error.message), el("p", {}, el("a", { class: "btn", href: "/", text: "Bosh sahifaga" })));

}
