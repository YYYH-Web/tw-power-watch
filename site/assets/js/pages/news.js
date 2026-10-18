import { init, loadJSON, t, empty } from "../app.js";
import { storyCard } from "../stories.js";

await init("news");
const data = await loadJSON("news.json");
const items = (data?.items || []).sort((a, b) => b.time.localeCompare(a.time));
const listEl = document.getElementById("list");
const chips = document.getElementById("chips");
const cats = ["all", "power", "renewables", "gas", "carbon", "aidc", "intl"];
chips.innerHTML = cats.map((c, i) => `<button type="button" aria-pressed="${i === 0}" data-c="${c}">${t("cat." + c)}</button>`).join("");
const render = (c) => {
  const list = c === "all" ? items : items.filter((x) => x.category === c);
  if (!list.length) { empty(listEl, "empty.news"); return; }
  listEl.innerHTML = list.map((it) => storyCard(it)).join("");
};
chips.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  chips.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  render(b.dataset.c);
});
render("all");
