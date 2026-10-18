import { init, loadJSON, t, fmt, esc, chart, empty, srcLine, FUEL_COLORS, fuelName } from "../app.js";

const STACK = ["nuclear", "coal", "gas", "oil", "pumped", "hydro", "wind", "solar", "biomass", "waste", "geothermal"];
const RT_ORDER = ["nuclear", "coal", "gas", "oil", "cogen", "hydro", "pumped", "wind_onshore", "wind_offshore", "solar", "biomass", "geothermal", "other_re", "storage"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

await init("supply");
const [cap, latest, reports] = await Promise.all([loadJSON("capacity_annual.json"), loadJSON("realtime/latest.json"), loadJSON("monthly_reports.json")]);

// ---------- 裝置容量（年） ----------
const capEl = document.getElementById("c-cap");
const tableEl = document.getElementById("t-cap");
const segEl = document.getElementById("scope");
let capChart = null;

function drawCapacity(scope) {
  const s = cap.scopes[scope];
  if (!s) { empty(capEl); return; }
  const years = cap.years.slice(-11);
  const off = cap.years.length - years.length;
  const series = STACK.filter((f) => s[f]?.some((v) => v)).map((f) => ({
    name: fuelName(f), type: "line", stack: "c", areaStyle: { opacity: 0.88 }, showSymbol: false, smooth: false,
    lineStyle: { width: 0 }, itemStyle: { color: FUEL_COLORS[f] }, emphasis: { focus: "series" },
    data: s[f].slice(off).map((v) => (v == null ? null : +(v / 10).toFixed(1))),
  }));
  const opt = {
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)} 萬瓩` },
    legend: { type: "scroll" },
    grid: { right: 24 },
    xAxis: { type: "category", boundaryGap: false, data: years.map(String) },
    yAxis: { type: "value", name: "萬瓩" },
    series,
  };
  if (capChart) capChart.setOption(opt, { replaceMerge: ["series"] });
  else capChart = chart(capEl, opt);

  // 最新年度表
  const i = cap.years.length - 1;
  const total = s.total?.[i] ?? STACK.reduce((a, f) => a + (s[f]?.[i] || 0), 0);
  const prev = (f) => s[f]?.[i - 1];
  tableEl.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>${cap.years[i]} 年</th><th class="n">裝置容量（萬瓩）</th><th class="n">占比</th><th class="n">較前一年</th></tr></thead>
    <tbody>${STACK.filter((f) => s[f]?.[i]).map((f) => {
      const v = s[f][i], p = prev(f);
      const d = p ? ((v - p) / p) * 100 : null;
      return `<tr><td><span class="fuel-dot" style="background:${FUEL_COLORS[f]}"></span>${fuelName(f)}</td><td class="n">${fmt(v / 10, 1)}</td><td class="n">${fmt((v / total) * 100, 1)}%</td><td class="n">${d == null ? "—" : (d >= 0 ? "+" : "") + fmt(d, 1) + "%"}</td></tr>`;
    }).join("")}
    <tr><th>合計</th><th class="n">${fmt(total / 10, 1)}</th><th></th><th></th></tr></tbody></table></div>`;
}

if (cap?.years?.length) {
  const scopes = ["system", "national", "taipower"].filter((k) => cap.scopes[k]);
  segEl.innerHTML = scopes.map((k, i) => `<button type="button" aria-pressed="${i === 0}" data-k="${k}">${t("scope." + k)}</button>`).join("");
  segEl.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    segEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    drawCapacity(b.dataset.k);
  });
  drawCapacity(scopes[0]);
  document.getElementById("s-cap").innerHTML = srcLine(cap.source, esc(cap.note || ""));
} else { empty(capEl); tableEl.innerHTML = ""; }

// ---------- 即時：各能源別容量與出力 ----------
const rtEl = document.getElementById("c-rt");
if (latest?.by_fuel) {
  const fuels = RT_ORDER.filter((f) => latest.by_fuel[f]).reverse();
  document.getElementById("rt-time").textContent = `${latest.time}，共 ${latest.units} 部機組`;
  chart(rtEl, {
    tooltip: { valueFormatter: (v) => `${fmt(v)} MW` },
    grid: { left: 8, right: 16, top: 30, bottom: 34, containLabel: true },
    xAxis: { type: "value", name: "MW" },
    yAxis: { type: "category", data: fuels.map(fuelName) },
    series: [
      { name: "裝置容量", type: "bar", barGap: "-100%", barMaxWidth: 16, itemStyle: { color: css("--empty") }, data: fuels.map((f) => latest.by_fuel[f].cap_mw) },
      { name: "目前出力", type: "bar", barMaxWidth: 16, data: fuels.map((f) => ({ value: Math.max(0, latest.by_fuel[f].gen_mw), itemStyle: { color: FUEL_COLORS[f] || "#999" } })) },
    ],
  });
  document.getElementById("s-rt").innerHTML = srcLine(latest.source);
} else empty(rtEl, "empty.realtime");

// ---------- 官方月報 ----------
const repEl = document.getElementById("t-rep");
const months = Object.keys(reports?.months || {}).sort().reverse();
if (months.length) {
  const y = (v) => (v == null ? "—" : fmt(v / 1e8, 2));
  repEl.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>月份</th><th class="n">台電自有淨發電（億度）</th><th class="n">購電量（億度）</th><th class="n">其中再生能源業</th><th class="n">月尖峰負載（萬瓩）</th><th class="n">總售電量（億度）</th></tr></thead>
    <tbody>${months.map((m) => { const r = reports.months[m]; return `<tr><td><a href="${esc(r.source_url)}" target="_blank" rel="noopener">${m}</a></td><td class="n">${y(r.net_gen_kwh)}</td><td class="n">${y(r.purchased_kwh)}</td><td class="n">${y(r.purchased_re_kwh)}</td><td class="n">${r.peak_mw ? fmt(r.peak_mw / 10, 1) : "—"}</td><td class="n">${y(r.sales_kwh)}</td></tr>`; }).join("")}</tbody>
  </table></div>`;
} else empty(repEl);
