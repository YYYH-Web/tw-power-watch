// 共用：版面、i18n、資料載入、格式化、圖表輔助
export const REPO_URL = document.documentElement.dataset.repo || "";
const LANG = "zh-TW";
let STR = {};

export const FUEL_COLORS = {
  coal: "#4b5058", gas: "#e0782a", nuclear: "#7a5ba6", oil: "#8b6b4e", cogen: "#a3a9b1",
  hydro: "#2f74c0", wind: "#2e9a9a", wind_onshore: "#45afa9", wind_offshore: "#17788a",
  solar: "#e8b31a", biomass: "#6d9a3a", waste: "#9a8f5a", geothermal: "#b5523b",
  other_re: "#8fb28a", pumped: "#6e90b5", storage: "#5c6fd0", renewable: "#3d9b6a",
};
export const RE_FUELS = ["hydro", "wind_onshore", "wind_offshore", "wind", "solar", "biomass", "waste", "geothermal", "other_re"];
export const CAT_COLORS = {
  power: "#0b57a4", renewables: "#2b8a6e", gas: "#c8661f", carbon: "#5d6b7a", aidc: "#6a4fb0", intl: "#2c3e57",
};

export function t(key, vars = {}) {
  let s = STR[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

// 快取參數：平常每小時換一次；手動更新後立即換新，確保讀到最新資料
export function bumpCache() { try { localStorage.setItem("tpw.bust", String(Date.now())); } catch { /* 無法使用 localStorage 時略過 */ } }
function cacheKey() {
  let manual = 0;
  try { manual = Number(localStorage.getItem("tpw.bust") || 0); } catch { /* 略過 */ }
  return `${Math.floor(Date.now() / 3.6e6)}-${manual}`;
}

export async function loadJSON(name) {
  try {
    const r = await fetch(`data/${name}?v=${cacheKey()}`, { cache: "no-cache" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const NAV = ["home", "supply", "demand", "renewables", "plants", "outlook", "news", "data"];
const HREF = { home: "index.html" };

export async function init(active) {
  try {
    const r = await fetch(`i18n/${LANG}.json`);
    STR = await r.json();
  } catch { STR = {}; }
  document.documentElement.lang = LANG;

  const today = new Intl.DateTimeFormat(LANG, { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Taipei" }).format(new Date());
  const header = document.createElement("header");
  header.className = "masthead";
  header.innerHTML = `
    <div class="wrap">
      <div class="masthead__top">
        <a class="brand" href="index.html"><span class="brand__name">${t("site.name")}</span><span class="brand__tag">${t("site.tagline")}</span></a>
        <span class="masthead__right"><span class="masthead__date">${today}</span><a class="masthead__update" href="data.html#update">手動更新</a></span>
      </div>
      <nav class="nav" aria-label="主選單">
        ${NAV.map((k) => `<a href="${HREF[k] || k + ".html"}"${k === active ? ' aria-current="page"' : ""}>${t("nav." + k)}</a>`).join("")}
      </nav>
    </div>`;
  document.body.prepend(header);

  const footer = document.createElement("footer");
  footer.className = "footer";
  footer.innerHTML = `<div class="wrap"><p>${t("footer.note")}</p>${REPO_URL ? `<p><a href="${REPO_URL}">${t("footer.repo")}</a></p>` : ""}</div>`;
  document.body.append(footer);
}

// ---------- 格式化 ----------
export const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? "—" : Number(v).toLocaleString(LANG, { maximumFractionDigits: d, minimumFractionDigits: d }));

export function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 2) return t("time.just_now");
  if (m < 60) return t("time.minutes", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("time.hours", { n: h });
  const d = Math.round(h / 24);
  if (d <= 14) return t("time.days", { n: d });
  return new Date(iso).toLocaleDateString(LANG, { month: "numeric", day: "numeric" });
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 台電燈號：綠 ≥10%、黃 6–10%、橘 <6%；紅：備轉容量 <90 萬瓩；黑：<50 萬瓩
export function lightOf(row) {
  if (!row || row.reserve_pct == null) return null;
  if (row.reserve_mw != null && row.reserve_mw < 500) return "black";
  if (row.reserve_mw != null && row.reserve_mw < 900) return "red";
  if (row.reserve_pct >= 10) return "green";
  if (row.reserve_pct >= 6) return "yellow";
  return "orange";
}
export const LIGHT_CLASS = { green: "g", yellow: "y", orange: "o", red: "r", black: "k" };
export const LIGHT_VAR = { green: "--light-green", yellow: "--light-yellow", orange: "--light-orange", red: "--light-red", black: "--light-black" };

export function srcLine(source, extra = "") {
  if (!source) return "";
  const link = source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.name)}</a>` : esc(source.name);
  return `<p class="src">${t("label.source")}：${link}${extra ? `　${extra}` : ""}</p>`;
}

export function empty(el, key = "empty.pending", vars = { workflow: "更新電力資料" }) {
  el.innerHTML = `<div class="empty"><p>${esc(t(key, vars))}</p></div>`;
}

// ---------- 即時取樣 → 月估算 ----------
function hoursInMonth(ym, lastSample) {
  const [y, m] = ym.split("-").map(Number);
  const full = new Date(y, m, 0).getDate() * 24;
  const now = new Date();
  if (y === now.getFullYear() && m === now.getMonth() + 1 && lastSample) {
    const start = new Date(y, m - 1, 1);
    return Math.max(1, Math.min(full, (new Date(lastSample.replace(" ", "T")) - start) / 3.6e6));
  }
  return full;
}

/** 回傳 {months:[...], gen:{fuel:[GWh]}, cf:{fuel:[%]}, samples:[...]} */
export function monthlyEstimate(monthly) {
  if (!monthly?.months) return null;
  const months = Object.keys(monthly.months).sort();
  if (!months.length) return null;
  const gen = {}, cf = {}, samples = [];
  months.forEach((ym, i) => {
    const m = monthly.months[ym];
    const hrs = hoursInMonth(ym, m.last_sample);
    samples.push(m.samples);
    for (const [fuel, sum] of Object.entries(m.sum_gen_mw)) {
      const meanMw = sum / m.samples;
      (gen[fuel] ||= Array(months.length).fill(null))[i] = (meanMw * hrs) / 1000; // GWh
      const cap = m.cap_mw[fuel];
      if (cap > 0) (cf[fuel] ||= Array(months.length).fill(null))[i] = (meanMw / cap) * 100;
    }
  });
  return { months, gen, cf, samples };
}

// ---------- ECharts ----------
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function chart(el, option) {
  if (!window.echarts) {
    el.innerHTML = `<div class="empty"><p>圖表元件（assets/vendor/echarts-5.5.1.min.js）沒有載入。請確認該檔案已上傳到 repo，再按 Ctrl＋F5 重新整理。</p></div>`;
    return null;
  }
  const ink2 = cssVar("--ink-2"), rule = cssVar("--rule"), paper = cssVar("--paper"), ink = cssVar("--ink");
  const c = echarts.init(el, null, { renderer: "svg" });
  const base = {
    textStyle: { fontFamily: cssVar("--sans"), color: ink2 },
    grid: { left: 8, right: 12, top: 30, bottom: 34, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: paper, borderColor: rule, textStyle: { color: ink, fontSize: 13 }, confine: true },
    legend: { bottom: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: ink2, fontSize: 12 } },
  };
  const axisStyle = (ax) => (Array.isArray(ax) ? ax : [ax]).map((a) => ({
    axisLine: { lineStyle: { color: rule } }, axisTick: { show: false },
    splitLine: { lineStyle: { color: rule, type: [3, 3] } },
    axisLabel: { color: ink2, fontSize: 12 }, nameTextStyle: { color: ink2, fontSize: 12 }, ...a,
  }));
  const opt = { ...base, ...option };
  if (option.xAxis) opt.xAxis = axisStyle(option.xAxis);
  if (option.yAxis) opt.yAxis = axisStyle(option.yAxis);
  opt.tooltip = { ...base.tooltip, ...(option.tooltip || {}) };
  opt.legend = option.legend === false ? { show: false } : { ...base.legend, ...(option.legend || {}) };
  if (option.legend === false) opt.grid = { ...base.grid, bottom: 8, ...(option.grid || {}) };
  else opt.grid = { ...base.grid, ...(option.grid || {}) };
  c.setOption(opt);
  new ResizeObserver(() => c.resize()).observe(el);
  return c;
}

export function fuelName(f) { return t("fuel." + f); }
