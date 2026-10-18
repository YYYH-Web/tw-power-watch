import { CAT_COLORS, esc, t, timeAgo } from "./app.js";

export function storyCard(it, lead = false) {
  const cat = CAT_COLORS[it.category] || CAT_COLORS.power;
  const media = it.image
    ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : "";
  return `
  <a class="story${lead ? " story--lead" : ""}" href="${esc(it.url)}" target="_blank" rel="noopener">
    <div class="story__media" style="--cat:${cat}">
      <div class="story__ph" aria-hidden="true">${esc(t("cat." + it.category))}</div>
      ${media}
    </div>
    <div class="story__body">
      <div class="story__meta"><span class="s">${esc(it.source || "")}</span><time datetime="${esc(it.time)}">${esc(timeAgo(it.time))}</time></div>
      <h3>${esc(it.title)}</h3>
      ${it.summary && lead ? `<p>${esc(it.summary)}</p>` : ""}
    </div>
  </a>`;
}

/** 首頁用：優先挑有圖的當頭條，其餘依時間排序，各分類盡量都出現。 */
export function pickFront(items, n = 5) {
  const sorted = [...items].sort((a, b) => b.time.localeCompare(a.time));
  const lead = sorted.find((x) => x.image) || sorted[0];
  const rest = [];
  const seenCat = new Set([lead?.category]);
  for (const it of sorted) {
    if (it === lead || rest.length >= n - 1) continue;
    if (!seenCat.has(it.category)) { rest.push(it); seenCat.add(it.category); }
  }
  for (const it of sorted) {
    if (rest.length >= n - 1) break;
    if (it !== lead && !rest.includes(it)) rest.push(it);
  }
  return lead ? [lead, ...rest] : [];
}
