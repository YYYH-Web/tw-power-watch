import { init, loadJSON, esc, fmt, chart, srcLine, empty } from "../app.js";

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
await init("outlook");
const o = await loadJSON("outlook.json");

if (!o) { empty(document.getElementById("c-rev")); }
else {
  const cur = o.forecasts.at(-1);
  document.getElementById("headline").innerHTML = `<div class="big-fact"><strong>${cur.cagr}%<small>／年</small></strong><span>${cur.period} 用電需求年均成長率（${esc(cur.label)}）</span></div>${srcLine(cur.source)}`;

  const items = [...o.forecasts.map((f) => ({ name: f.period, v: f.cagr, label: f.label, src: f.source }))];
  chart(document.getElementById("c-rev"), {
    legend: false, grid: { top: 20 },
    tooltip: { formatter: (p) => `${items[p.dataIndex].label}<br>${p.name}：${p.value}%` },
    xAxis: { type: "category", data: items.map((x) => x.name + " 預估") },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
    series: [{ type: "bar", barMaxWidth: 46, label: { show: true, position: "top", formatter: "{c}%", color: css("--ink-2") },
      data: items.map((x, i) => ({ value: x.v, itemStyle: { color: i === items.length - 1 ? css("--accent") : css("--rule") } })),
      markLine: { symbol: "none", silent: true, lineStyle: { color: css("--ink-3"), type: "dashed" },
        label: { formatter: `過去十年實際 ${o.past_decade.cagr}%`, position: "insideStartTop", color: css("--ink-2") }, data: [{ yAxis: o.past_decade.cagr }] } }],
  });
  document.getElementById("s-rev").innerHTML = [...new Map(o.forecasts.map((f) => [f.source.url, f.source])).values()].map((s) => srcLine(s)).join("") + srcLine(o.past_decade.source, "過去十年實際值");

  // 依官方年均成長率推算的用電量路徑（本站推算）
  const c = o.consumption;
  const base2025 = c.base_100gwh * (1 + c.y2025_growth_pct / 100);
  const years = [c.base_year, 2025], vals = [c.base_100gwh, base2025];
  for (let y = 2026; y <= 2035; y++) { years.push(y); vals.push(vals.at(-1) * (1 + cur.cagr / 100)); }
  chart(document.getElementById("c-path"), {
    legend: false,
    tooltip: { valueFormatter: (v) => `${fmt(v, 0)} 億度` },
    xAxis: { type: "category", data: years.map(String) },
    yAxis: { type: "value", name: "億度", scale: true },
    series: [
      { name: "官方公布", type: "line", data: vals.map((v, i) => (i <= 1 ? +v.toFixed(1) : null)), itemStyle: { color: css("--ink") }, lineStyle: { width: 2.5 }, symbolSize: 7 },
      { name: "本站推算", type: "line", data: vals.map((v, i) => (i >= 1 ? +v.toFixed(1) : null)), itemStyle: { color: css("--accent") }, lineStyle: { type: "dashed", width: 2 }, symbolSize: 5,
        markPoint: { symbol: "circle", symbolSize: 1, label: { formatter: `2035 年約 ${fmt(vals.at(-1), 0)} 億度`, position: "left", color: css("--ink-2") }, data: [{ coord: ["2035", +vals.at(-1).toFixed(1)] }] } },
    ],
  });
  document.getElementById("s-path").innerHTML = srcLine(c.base_source, `${c.base_year} 年全國電力消費 ${fmt(c.base_100gwh, 1)} 億度`) +
    srcLine(c.y2025_source, `2025 年用電 ${c.y2025_growth_pct}%（經濟成長 ${c.y2025_gdp_pct}%）`) +
    `<p class="src">虛線為本站以官方年均成長率 ${cur.cagr}% 逐年推算，不是官方逐年預測值。</p>`;

  document.getElementById("highlights").innerHTML = o.highlights.map((h) => `<li>${esc(h.text)}${srcLine(h.source)}</li>`).join("");
}
