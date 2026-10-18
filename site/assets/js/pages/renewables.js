import { init, loadJSON, t, fmt, esc, chart, empty, srcLine, monthlyEstimate, FUEL_COLORS, fuelName } from "../app.js";

const RE = ["hydro", "wind", "solar", "biomass", "waste", "geothermal"];
const CF_FUELS = ["nuclear", "coal", "gas", "oil", "cogen", "hydro", "wind_onshore", "wind_offshore", "solar", "biomass"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

await init("renewables");
const [cap, facts, latest, monthly] = await Promise.all([loadJSON("capacity_annual.json"), loadJSON("facts.json"), loadJSON("realtime/latest.json"), loadJSON("realtime/monthly.json")]);

// ---------- 重點數字 ----------
const fEl = document.getElementById("facts");
fEl.innerHTML = (facts?.renewables || []).slice(0, 2).map((f) => `
  <section class="panel"><div class="big-fact"><strong>${fmt(f.value, 1)}<small>${esc(f.unit)}</small></strong><span>${esc(f.label)}（${esc(f.asof)}）</span></div>
  <p class="sub" style="margin:8px 0 0">${esc(f.detail)}</p>${srcLine(f.source)}</section>`).join("");

// ---------- 再生能源裝置容量 ----------
const capEl = document.getElementById("c-recap");
const seg = document.getElementById("scope");
let c1 = null;
function draw(scope) {
  const s = cap.scopes[scope];
  const years = cap.years.slice(-11), off = cap.years.length - years.length;
  const opt = {
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)} 萬瓩` },
    xAxis: { type: "category", data: years.map(String) },
    yAxis: { type: "value", name: "萬瓩" },
    series: RE.filter((f) => s[f]?.some((v) => v)).map((f) => ({
      name: fuelName(f), type: "bar", stack: "r", barMaxWidth: 30, itemStyle: { color: FUEL_COLORS[f] },
      data: s[f].slice(off).map((v) => (v == null ? null : +(v / 10).toFixed(1))),
    })),
  };
  if (c1) c1.setOption(opt, { replaceMerge: ["series"] }); else c1 = chart(capEl, opt);
}
if (cap?.years?.length) {
  const scopes = ["national", "system", "taipower"].filter((k) => cap.scopes[k]);
  seg.innerHTML = scopes.map((k, i) => `<button type="button" aria-pressed="${i === 0}" data-k="${k}">${t("scope." + k)}</button>`).join("");
  seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(b.dataset.k); });
  draw(scopes[0]);
  document.getElementById("s-recap").innerHTML = srcLine(cap.source, "多數太陽光電屬自用發電設備，建議以「全國」口徑觀察。");
} else empty(capEl);

// ---------- 離岸 vs 陸域 ----------
const wEl = document.getElementById("c-wind");
const split = (facts?.wind_split || []).filter((w) => w.onshore_mw != null || w.offshore_mw != null);
const rows = split.map((w) => ({ label: `${w.year}${w.asof ? `（${w.asof.slice(5).replace("-", "/")}）` : ""}`, on: w.onshore_mw, off: w.offshore_mw }));
if (latest?.by_fuel?.wind_offshore || latest?.by_fuel?.wind_onshore) {
  rows.push({ label: `台電系統即時\n${latest.time.slice(0, 10)}`, on: latest.by_fuel.wind_onshore?.cap_mw ?? null, off: latest.by_fuel.wind_offshore?.cap_mw ?? null });
}
if (rows.length) {
  chart(wEl, {
    tooltip: { valueFormatter: (v) => (v == null ? "未公布" : `${fmt(v / 10, 1)} 萬瓩`) },
    xAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { fontSize: 11 } },
    yAxis: { type: "value", name: "萬瓩", axisLabel: { formatter: (v) => fmt(v / 10) } },
    series: [
      { name: fuelName("wind_onshore"), type: "bar", barMaxWidth: 34, itemStyle: { color: FUEL_COLORS.wind_onshore }, data: rows.map((r) => r.on) },
      { name: fuelName("wind_offshore"), type: "bar", barMaxWidth: 34, itemStyle: { color: FUEL_COLORS.wind_offshore }, data: rows.map((r) => r.off) },
    ],
  });
  document.getElementById("s-wind").innerHTML = split.map((w) => srcLine(w.source, `${w.year} 年數據`)).join("") +
    (latest?.by_fuel?.wind_offshore ? srcLine(latest.source, "離岸／陸域依機組名稱分類") : "");
} else empty(wEl);

// ---------- 容量因數 ----------
const est = monthlyEstimate(monthly);
const cfEl = document.getElementById("c-cf"), cfTrend = document.getElementById("c-cf-trend");
if (est) {
  // 優先用最近一個完整月份
  const nowYm = new Date().toISOString().slice(0, 7);
  let i = est.months.length - 1;
  if (est.months[i] === nowYm && i > 0) i -= 1;
  const fuels = CF_FUELS.filter((f) => est.cf[f]?.[i] != null);
  document.getElementById("cf-month").textContent = `${est.months[i]}，依每小時即時取樣估算（樣本 ${est.samples[i]} 筆）`;
  chart(cfEl, {
    legend: false,
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)}%` },
    grid: { left: 8, right: 36, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", data: fuels.map(fuelName).reverse() },
    series: [{ type: "bar", barMaxWidth: 16, label: { show: true, position: "right", formatter: (p) => `${fmt(p.value, 1)}%`, color: css("--ink-2") },
      data: fuels.map((f) => ({ value: +est.cf[f][i].toFixed(1), itemStyle: { color: FUEL_COLORS[f] } })).reverse() }],
  });
  chart(cfTrend, {
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)}%` },
    xAxis: { type: "category", data: est.months },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
    series: ["solar", "wind_onshore", "wind_offshore", "coal", "gas"].filter((f) => est.cf[f]).map((f) => ({
      name: fuelName(f), type: "line", showSymbol: est.months.length < 3, itemStyle: { color: FUEL_COLORS[f] }, data: est.cf[f].map((v) => (v == null ? null : +v.toFixed(1))),
    })),
  });
  document.getElementById("s-cf").innerHTML = srcLine(latest?.source, "容量因數＝平均出力÷裝置容量；官方數字見台電簡明月報表 2-3");
} else { empty(cfEl, "empty.realtime"); empty(cfTrend, "empty.realtime"); }
