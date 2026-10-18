import { init, loadJSON, fmt, esc, chart, empty, srcLine, lightOf, LIGHT_VAR } from "../app.js";

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
await init("demand");
const [daily, fc, reports, contract] = await Promise.all([
  loadJSON("daily_supply.json"), loadJSON("forecast_2m.json"), loadJSON("monthly_reports.json"), loadJSON("contract_capacity.json"),
]);

const rowsAll = daily?.rows || [];
const years = [...new Set(rowsAll.map((r) => r.date.slice(0, 4)))].sort().reverse();
const sel = document.getElementById("year");
let charts = {};

function draw(year) {
  const rows = rowsAll.filter((r) => r.date.startsWith(year));
  const x = rows.map((r) => r.date.slice(5));
  const opt1 = {
    xAxis: { type: "category", data: x },
    yAxis: { type: "value", name: "萬瓩", scale: true },
    dataZoom: [{ type: "inside" }],
    series: [
      { name: "淨尖峰供電能力", type: "line", showSymbol: false, data: rows.map((r) => r.capacity_mw && r.capacity_mw / 10), itemStyle: { color: css("--ink-3") }, lineStyle: { width: 1.5 } },
      { name: "尖峰負載", type: "line", showSymbol: false, data: rows.map((r) => r.peak_mw && r.peak_mw / 10), itemStyle: { color: css("--accent") }, lineStyle: { width: 2 } },
    ],
  };
  const opt2 = {
    legend: false,
    tooltip: { valueFormatter: (v) => `${fmt(v, 2)}%` },
    xAxis: { type: "category", data: x },
    yAxis: { type: "value", axisLabel: { formatter: "{value}%" }, min: 0 },
    dataZoom: [{ type: "inside" }],
    series: [{
      name: "備轉容量率", type: "bar", barMaxWidth: 6,
      data: rows.map((r) => ({ value: r.reserve_pct, itemStyle: { color: css(LIGHT_VAR[lightOf(r)] || "--empty") } })),
      markLine: { symbol: "none", silent: true, label: { formatter: "{c}%", color: css("--ink-2") }, lineStyle: { color: css("--ink-3"), type: "dashed" }, data: [{ yAxis: 10 }, { yAxis: 6 }] },
    }],
  };
  const opt3 = {
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)} 百萬度` },
    xAxis: { type: "category", data: x },
    yAxis: { type: "value", name: "百萬度" },
    dataZoom: [{ type: "inside" }],
    series: [
      { name: "工業用電", type: "line", stack: "u", areaStyle: { opacity: 0.85 }, showSymbol: false, lineStyle: { width: 0 }, itemStyle: { color: "#4b6a8a" }, data: rows.map((r) => r.industrial_gwh) },
      { name: "民生用電", type: "line", stack: "u", areaStyle: { opacity: 0.85 }, showSymbol: false, lineStyle: { width: 0 }, itemStyle: { color: "#9db7d3" }, data: rows.map((r) => r.residential_gwh) },
    ],
  };
  for (const [id, opt] of [["c-peak", opt1], ["c-res", opt2], ["c-use", opt3]]) {
    if (charts[id]) charts[id].setOption(opt, { replaceMerge: ["series", "xAxis"] });
    else charts[id] = chart(document.getElementById(id), opt);
  }
}

if (years.length) {
  sel.innerHTML = years.map((y) => `<option>${y}</option>`).join("");
  sel.addEventListener("change", () => draw(sel.value));
  draw(years[0]);
  for (const id of ["s-peak", "s-res", "s-use"]) document.getElementById(id).innerHTML = srcLine(daily.source);
} else {
  sel.closest("label").style.display = "none";
  ["c-peak", "c-res", "c-use"].forEach((id) => empty(document.getElementById(id)));
}

// ---------- 未來兩個月預測 ----------
const fcEl = document.getElementById("c-fc");
if (fc?.rows?.length) {
  chart(fcEl, {
    xAxis: { type: "category", data: fc.rows.map((r) => r.date.slice(5)) },
    yAxis: [{ type: "value", name: "萬瓩", scale: true }, { type: "value", name: "%", splitLine: { show: false } }],
    series: [
      { name: "預估供電能力", type: "line", data: fc.rows.map((r) => r.capacity_mw && r.capacity_mw / 10), itemStyle: { color: css("--ink-3") } },
      { name: "預估尖峰負載", type: "line", data: fc.rows.map((r) => r.peak_mw && r.peak_mw / 10), itemStyle: { color: css("--accent") } },
      { name: "預估備轉容量率", type: "bar", yAxisIndex: 1, barMaxWidth: 14, data: fc.rows.map((r) => r.reserve_pct), itemStyle: { color: css("--light-green"), opacity: 0.5 } },
    ],
  });
  document.getElementById("s-fc").innerHTML = srcLine(fc.source);
} else empty(fcEl);

// ---------- 月售電量（官方月報） ----------
const salesEl = document.getElementById("c-sales");
const months = Object.keys(reports?.months || {}).sort().filter((m) => reports.months[m].sales_kwh);
if (months.length) {
  const v = (m, k) => (reports.months[m][k] ? +(reports.months[m][k] / 1e8).toFixed(2) : null);
  chart(salesEl, {
    tooltip: { valueFormatter: (x) => `${fmt(x, 2)} 億度` },
    xAxis: { type: "category", data: months },
    yAxis: { type: "value", name: "億度" },
    series: [
      { name: "電力（產業）", type: "bar", stack: "s", barMaxWidth: 30, itemStyle: { color: "#4b6a8a" }, data: months.map((m) => v(m, "sales_power_kwh")) },
      { name: "電燈（民生）", type: "bar", stack: "s", barMaxWidth: 30, itemStyle: { color: "#9db7d3" }, data: months.map((m) => v(m, "sales_lighting_kwh")) },
    ],
  });
  document.getElementById("s-sales").innerHTML = srcLine(reports.source, months.length < 6 ? "目前收錄月份較少，持續補齊中" : "");
} else empty(salesEl);

// ---------- 契約容量 ----------
const ccEl = document.getElementById("c-contract");
if (contract?.counties?.length) {
  const c = [...contract.counties].sort((a, b) => a.contract_kw - b.contract_kw);
  document.getElementById("contract-total").innerHTML = `<div class="big-fact"><strong>${fmt(contract.total.contract_kw / 1e4, 0)}<small>萬瓩</small></strong><span>${contract.roc_year} 年全國${esc(contract.scope)}契約容量合計，${fmt(contract.total.customers)} 戶</span></div>`;
  chart(ccEl, {
    legend: false,
    tooltip: { valueFormatter: (v) => `${fmt(v, 1)} 萬瓩` },
    grid: { left: 8, right: 30, top: 10, bottom: 8, containLabel: true },
    xAxis: { type: "value", name: "萬瓩" },
    yAxis: { type: "category", data: c.map((x) => x.name) },
    series: [{ type: "bar", barMaxWidth: 16, itemStyle: { color: css("--accent") }, label: { show: true, position: "right", color: css("--ink-2"), formatter: (p) => fmt(p.value, 0) }, data: c.map((x) => +(x.contract_kw / 1e4).toFixed(1)) }],
  });
  document.getElementById("s-contract").innerHTML = srcLine(contract.source, esc(contract.note));
} else empty(ccEl);
