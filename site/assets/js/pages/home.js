import { init, loadJSON, t, fmt, esc, lightOf, LIGHT_CLASS, LIGHT_VAR, chart, empty, srcLine, monthlyEstimate, FUEL_COLORS, RE_FUELS, fuelName } from "../app.js";
import { storyCard, pickFront } from "../stories.js";

const MIX_ORDER = ["nuclear", "coal", "gas", "oil", "cogen", "hydro", "wind_onshore", "wind_offshore", "solar", "biomass", "geothermal", "other_re", "pumped", "storage"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const taipeiYear = () => Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Taipei" }).format(new Date()));

await init("home");
const [daily, latest, monthly, news, plants, outlook] = await Promise.all([
  loadJSON("daily_supply.json"), loadJSON("realtime/latest.json"), loadJSON("realtime/monthly.json"),
  loadJSON("news.json"), loadJSON("plants.json"), loadJSON("outlook.json"),
]);

const thisYear = taipeiYear();
const allRows = daily?.rows || [];
let year = thisYear;
let rows = allRows.filter((r) => r.date.startsWith(String(year)));
if (!rows.length && allRows.length) { year = Number(allRows.at(-1).date.slice(0, 4)); rows = allRows.filter((r) => r.date.startsWith(String(year))); }

// ---------- 供電燈號條 ----------
document.getElementById("lights-title").textContent = `${year} 年每日供電燈號`;
const strip = document.getElementById("strip-wrap");
const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const nDays = isLeap(year) ? 366 : 365;
const lastDate = rows.at(-1)?.date;
let cells = "";
const counts = { green: 0, yellow: 0, orange: 0, red: 0, black: 0 };
for (let i = 0; i < nDays; i++) {
  const d = new Date(Date.UTC(year, 0, 1 + i)).toISOString().slice(0, 10);
  const r = byDate[d];
  const L = lightOf(r);
  if (L) counts[L]++;
  const title = r ? `${d}　備轉容量率 ${fmt(r.reserve_pct, 2)}%（${t("light." + L)}）` : `${d}　尚無資料`;
  cells += `<i class="${L ? LIGHT_CLASS[L] : ""}${d === lastDate ? " today" : ""}" title="${title}"></i>`;
}
const lightsSummary = rows.length
  ? `${year} 年已記錄 ${rows.length} 天，其中綠燈 ${counts.green} 天、黃燈 ${counts.yellow} 天、橘燈以上 ${counts.orange + counts.red + counts.black} 天。`
  : "尚無每日供需資料。";
strip.innerHTML = `<div class="strip" role="img" aria-label="${lightsSummary}">${cells}</div>
  <div class="strip__months" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}月</span>`).join("")}</div>`;
if (!rows.length) {
  document.getElementById("lights-sub").textContent = t("empty.pending", { workflow: "更新電力資料" });
}

const legend = ["green", "yellow", "orange", "red", "black"].map((k) => `<span><i style="background:var(${LIGHT_VAR[k]})"></i>${t("light." + k)}${rows.length ? ` ${counts[k]} 天` : ""}</span>`);
document.getElementById("lights-legend").innerHTML = legend.join("");

const last = rows.at(-1);
if (last) {
  const L = lightOf(last);
  document.getElementById("lights-now").innerHTML = `
    <span class="lights__dot" style="background:var(${LIGHT_VAR[L]})"></span>
    <div><strong>${fmt(last.reserve_pct, 2)}%</strong><span>${last.date.slice(5).replace("-", "/")} 備轉容量率　${t("light." + L)}</span></div>`;
}

// ---------- KPI ----------
const est = monthlyEstimate(monthly);
let reShare = null, reNote = "等待即時取樣累積";
if (est) {
  const idx = est.months.map((m, i) => (m.startsWith(String(year)) ? i : -1)).filter((i) => i >= 0);
  let re = 0, tot = 0;
  for (const [fuel, arr] of Object.entries(est.gen)) {
    if (fuel === "pumped_load") continue;
    for (const i of idx) { const v = arr[i] || 0; if (v > 0) { tot += v; if (RE_FUELS.includes(fuel)) re += v; } }
  }
  if (tot > 0) { reShare = (re / tot) * 100; reNote = "台電系統，即時取樣估算"; }
}
const peakRow = rows.reduce((a, r) => (r.peak_mw != null && (!a || r.peak_mw > a.peak_mw) ? r : a), null);
const avgRes = rows.length ? rows.reduce((s, r) => s + (r.reserve_pct || 0), 0) / rows.filter((r) => r.reserve_pct != null).length : null;
const kpis = [
  ["今年最高尖峰負載", peakRow ? fmt(peakRow.peak_mw / 10, 1) : "—", "萬瓩", peakRow ? peakRow.date.slice(5).replace("-", "/") : ""],
  ["今年平均備轉容量率", avgRes != null ? fmt(avgRes, 1) : "—", "%", rows.length ? `${rows.length} 天平均` : ""],
  ["再生能源發電占比", reShare != null ? fmt(reShare, 1) : "—", "%", reNote],
  ["綠燈天數", rows.length ? fmt(counts.green) : "—", "天", rows.length ? `占 ${fmt((counts.green / rows.length) * 100, 0)}%` : ""],
];
document.getElementById("kpis").innerHTML = kpis.map(([k, v, u, n]) => `<div class="kpi"><dt>${k}</dt><dd>${v}<small>${u}</small></dd><div class="note">${esc(n)}</div></div>`).join("");

// ---------- 新聞 ----------
const newsEl = document.getElementById("front-news");
const front = pickFront(news?.items || [], 5);
if (front.length) newsEl.innerHTML = front.map((it, i) => storyCard(it, i === 0)).join("");
else { newsEl.style.display = "block"; empty(newsEl, "empty.news"); }

// ---------- 逐月發電結構（估算） ----------
const mixEl = document.getElementById("c-mix");
if (est) {
  const idx = est.months.map((m, i) => (m.startsWith(String(year)) ? i : -1)).filter((i) => i >= 0);
  const useIdx = idx.length ? idx : est.months.map((_, i) => i);
  const labels = useIdx.map((i) => `${Number(est.months[i].slice(5))}月`);
  const series = MIX_ORDER.filter((f) => est.gen[f]).map((f) => ({
    name: fuelName(f), type: "bar", stack: "g", barMaxWidth: 34,
    itemStyle: { color: FUEL_COLORS[f] }, emphasis: { focus: "series" },
    data: useIdx.map((i) => (est.gen[f][i] != null && est.gen[f][i] > 0 ? +(est.gen[f][i] / 100).toFixed(2) : 0)),
  }));
  chart(mixEl, {
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)} 億度` },
    legend: { type: "scroll" },
    xAxis: { type: "category", data: labels },
    yAxis: { type: "value", name: "億度" },
    series,
  });
  document.getElementById("s-mix").innerHTML = srcLine(latest?.source, `每月取樣 ${est.samples.at(-1)} 次；官方數字以台電月報為準`);
} else empty(mixEl, "empty.realtime");

// ---------- 最新供電組成 ----------
const nowEl = document.getElementById("c-now");
if (latest?.by_fuel) {
  const parts = MIX_ORDER.filter((f) => latest.by_fuel[f]?.gen_mw > 0).map((f) => ({ name: fuelName(f), value: latest.by_fuel[f].gen_mw, itemStyle: { color: FUEL_COLORS[f] } }));
  const total = parts.reduce((s, p) => s + p.value, 0);
  document.getElementById("rt-time").textContent = `${latest.time} 台電系統即時出力`;
  chart(nowEl, {
    tooltip: { trigger: "item", valueFormatter: (v) => `${fmt(v)} MW` },
    legend: false,
    graphic: [{ type: "text", left: "center", top: "middle", style: { text: `${fmt(total / 10)}\n萬瓩`, align: "center", fill: css("--ink"), font: `600 20px ${css("--sans")}`, lineHeight: 24 } }],
    series: [{ type: "pie", radius: ["58%", "82%"], label: { show: false }, data: parts, padAngle: 1, itemStyle: { borderRadius: 2 } }],
  });
  document.getElementById("s-now").innerHTML = srcLine(latest.source);
} else empty(nowEl, "empty.realtime");

// ---------- 每日尖峰負載 ----------
const peakEl = document.getElementById("c-peak");
if (rows.length) {
  chart(peakEl, {
    xAxis: { type: "category", data: rows.map((r) => r.date.slice(5)), axisLabel: { interval: "auto" } },
    yAxis: [{ type: "value", name: "萬瓩", scale: true }, { type: "value", name: "備轉容量率 %", splitLine: { show: false }, min: 0 }],
    dataZoom: [{ type: "inside" }],
    series: [
      { name: "淨尖峰供電能力", type: "line", showSymbol: false, data: rows.map((r) => r.capacity_mw && r.capacity_mw / 10), lineStyle: { width: 1.5, color: css("--ink-3") }, itemStyle: { color: css("--ink-3") } },
      { name: "尖峰負載", type: "line", showSymbol: false, data: rows.map((r) => r.peak_mw && r.peak_mw / 10), lineStyle: { width: 2, color: css("--accent") }, itemStyle: { color: css("--accent") } },
      { name: "備轉容量率", type: "bar", yAxisIndex: 1, barMaxWidth: 4, data: rows.map((r) => ({ value: r.reserve_pct, itemStyle: { color: css(LIGHT_VAR[lightOf(r)] || "--empty"), opacity: 0.55 } })) },
    ],
  });
  document.getElementById("s-peak").innerHTML = srcLine(daily.source);
} else empty(peakEl);

// ---------- 今年機組 ----------
const pl = (plants?.items || []).filter((p) => p.year === thisYear);
document.getElementById("plants-now").innerHTML = pl.length
  ? pl.map((p) => `<li><div class="when">${p.year}</div><div><div class="what"><span class="fuel-dot" style="background:${FUEL_COLORS[p.fuel] || "#999"}"></span>${esc(p.name)}</div>
      <div class="meta"><span class="status">${esc(p.status)}</span><span>${esc(p.owner)}</span></div>${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}</div></li>`).join("")
  : `<li><div class="when">—</div><div class="note">今年沒有已公告的新機組。</div></li>`;

// ---------- 用電展望 ----------
const om = document.getElementById("outlook-mini");
if (outlook?.forecasts?.length) {
  const cur = outlook.forecasts.at(-1);
  om.innerHTML = `<div class="big-fact"><strong>${cur.cagr}%<small>／年</small></strong><span>${cur.period} 用電需求年均成長率預估（${esc(cur.label)}）</span></div>
    <div id="c-fc" class="chart chart--short"></div>${srcLine(cur.source)}`;
  const fc = [...outlook.forecasts.map((f) => ({ name: `${f.period}\n預估`, v: f.cagr })), { name: `${outlook.past_decade.period}\n實際`, v: outlook.past_decade.cagr, actual: true }];
  chart(document.getElementById("c-fc"), {
    legend: false, grid: { top: 16 },
    tooltip: { valueFormatter: (v) => `${v}%` },
    xAxis: { type: "category", data: fc.map((f) => f.name), axisLabel: { fontSize: 11 } },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
    series: [{ type: "bar", barMaxWidth: 36, label: { show: true, position: "top", formatter: "{c}%", color: css("--ink-2") },
      data: fc.map((f, i) => ({ value: f.v, itemStyle: { color: f.actual ? css("--ink-3") : i === outlook.forecasts.length - 1 ? css("--accent") : css("--rule") } })) }],
  });
}
