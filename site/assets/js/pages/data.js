import { init, loadJSON, esc } from "../app.js";
import { mountUpdater } from "../updater.js";

await init("data");
const meta = await loadJSON("meta.json");
mountUpdater(document.getElementById("update"));
if (location.hash === "#update") document.getElementById("update").scrollIntoView();
const SOURCES = [
  ["capacity_annual", "發電裝置容量（年）", "經濟部能源署", "https://data.gov.tw/dataset/16480", "每月 5、15 日", "capacity_annual.json"],
  ["daily_supply", "每日電力供需", "台灣電力公司", "https://data.gov.tw/dataset/19995", "每月 5、15 日", "daily_supply.json"],
  ["forecast_2m", "未來二個月供需預測", "台灣電力公司", "https://data.gov.tw/dataset/103262", "每月 5、15 日", "forecast_2m.json"],
  ["realtime", "各機組即時發電量", "台灣電力公司", "https://data.gov.tw/dataset/8931", "每小時取樣", "realtime/latest.json"],
  ["monthly_reports", "簡明月報（官方月度數字）", "台灣電力公司", "https://www.taipower.com.tw/", "每月 5、15 日", "monthly_reports.json"],
  ["news", "新聞", "Google News 與各媒體", "", "每天 2 次", "news.json"],
  [null, "供需展望、電源開發、契約容量", "經濟部、台電公告（人工整理）", "", "公告後更新", "outlook.json"],
];
const fmtT = (s) => (s ? new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "—");
document.getElementById("sources").innerHTML = SOURCES.map(([key, name, org, url, freq, file]) => {
  const s = key ? meta?.sources?.[key] : null;
  const status = !key ? "人工維護" : !s ? "尚未執行" : s.ok ? `<span class="ok">正常</span>` : `<span class="fail">失敗</span>`;
  return `<tr><td>${url ? `<a href="${url}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name)}</td><td>${esc(org)}</td><td>${freq}</td>
    <td>${status}${s && s.message ? `<small class="msg">${esc(s.message)}</small>` : ""}</td><td>${fmtT(s?.last_success)}</td><td><a href="data/${file}" download>JSON</a></td></tr>`;
}).join("");
