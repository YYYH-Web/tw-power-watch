import { init, loadJSON, esc, fmt, srcLine, empty, FUEL_COLORS, fuelName } from "../app.js";

await init("plants");
const plants = await loadJSON("plants.json");
const list = document.getElementById("timeline");
const sum = document.getElementById("summary");
const filt = document.getElementById("fuel-filter");

if (plants?.items?.length) {
  sum.innerHTML = plants.summary.map((s) => `<li>${esc(s.text)}${srcLine(s.source)}</li>`).join("");
  const fuels = [...new Set(plants.items.map((p) => p.fuel))];
  filt.innerHTML = [`<button type="button" aria-pressed="true" data-f="">全部</button>`, ...fuels.map((f) => `<button type="button" aria-pressed="false" data-f="${f}">${fuelName(f)}</button>`)].join("");
  const render = (f) => {
    const items = plants.items.filter((p) => !f || p.fuel === f)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    list.innerHTML = items.map((p) => `<li>
      <div class="when">${p.year ?? esc(p.period || "未定")}</div>
      <div><div class="what"><span class="fuel-dot" style="background:${FUEL_COLORS[p.fuel] || "#999"}"></span>${esc(p.name)}</div>
        <div class="meta"><span class="status">${esc(p.status)}</span><span>${fuelName(p.fuel)}</span><span>${esc(p.owner)}</span><span>${p.capacity_mw ? fmt(p.capacity_mw) + " MW" : "容量未公布"}</span></div>
        ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}
        ${srcLine(p.source)}</div></li>`).join("");
  };
  filt.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    filt.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render(b.dataset.f);
  });
  render("");
  document.getElementById("note").textContent = plants.note;
} else empty(list);
