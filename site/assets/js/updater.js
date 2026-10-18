// 手動更新：從網頁觸發 GitHub Actions，並追蹤進度直到網站重新部署完成。
// Token 只存在使用者自己瀏覽器的 localStorage，不會寫進 repo 或網站檔案。
import { esc, bumpCache } from "./app.js";

const LS_TOKEN = "tpw.token";
const LS_REPO = "tpw.repo";
const API = "https://api.github.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function detectRepo() {
  const saved = localStorage.getItem(LS_REPO);
  if (saved) return saved;
  const attr = document.documentElement.dataset.repo || "";
  const m = attr.match(/github\.com\/([^/]+)\/([^/#?]+)/);
  if (m) return `${m[1]}/${m[2]}`;
  if (location.hostname.endsWith(".github.io")) {
    const owner = location.hostname.split(".")[0];
    const first = location.pathname.split("/").filter(Boolean)[0];
    const repo = first && !first.endsWith(".html") ? first : `${owner}.github.io`;
    return `${owner}/${repo}`;
  }
  return "";
}

const token = () => localStorage.getItem(LS_TOKEN) || "";

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token()}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (r.status === 401) throw new Error("Token 無效或已過期，請重新設定。");
  if (r.status === 403) throw new Error("Token 權限不足：需要此 repo 的 Actions（讀寫）權限；上傳月報另需 Contents（讀寫）。");
  if (r.status === 404) throw new Error("找不到 repo 或工作流程，請確認 repo 名稱，以及 Token 是否授權給這個 repo。");
  if (!r.ok && r.status !== 204) throw new Error(`GitHub 回應 ${r.status}：${(await r.text()).slice(0, 160)}`);
  return r.status === 204 ? null : r.json();
}

async function findRun(repo, file, sinceMs, timeoutMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const data = await api(`/repos/${repo}/actions/workflows/${file}/runs?per_page=5`);
    const run = (data.workflow_runs || []).find((x) => new Date(x.created_at).getTime() >= sinceMs - 10000);
    if (run) return run;
    await sleep(5000);
  }
  throw new Error("等不到工作流程啟動，請到 GitHub 的 Actions 頁確認。");
}

async function waitRun(repo, run, onTick, timeoutMs = 20 * 60000) {
  const t0 = Date.now();
  let cur = run;
  while (cur.status !== "completed") {
    if (Date.now() - t0 > timeoutMs) throw new Error("執行時間過長，請到 GitHub 的 Actions 頁查看。");
    onTick?.(cur);
    await sleep(8000);
    cur = await api(`/repos/${repo}/actions/runs/${cur.id}`);
  }
  return cur;
}

// ---------- UI ----------
const STEPS = ["送出更新要求", "抓取資料（約 1～3 分鐘）", "重新部署網站（約 1 分鐘）", "完成"];

function renderSteps(el, active, failedAt = -1, note = "") {
  el.innerHTML = STEPS.map((s, i) => {
    const cls = i === failedAt ? "fail" : i < active ? "done" : i === active ? "active" : "";
    const mark = i === failedAt ? "✕" : i < active ? "✓" : i === active ? "…" : "";
    return `<li class="${cls}"><b>${mark}</b><span>${s}</span></li>`;
  }).join("") + (note ? `<li class="${failedAt >= 0 ? "fail" : "active"}"><b></b><span>${note}</span></li>` : "");
}

export function mountUpdater(root) {
  const repo = detectRepo();
  const hasToken = !!token();
  const actionsUrl = repo ? `https://github.com/${repo}/actions/workflows/update-all.yml` : "";

  root.innerHTML = `
    <h2>手動更新</h2>
    <p class="sub">不必等排程，立即重新抓取所有資料。網站管理者設定 GitHub Token 後可直接在這裡執行。</p>
    <div class="update-actions">
      <button class="btn btn--primary" id="u-all" ${hasToken && repo ? "" : "disabled"}>立即更新全部資料</button>
      <button class="btn" id="u-reload">重新載入最新資料</button>
      ${actionsUrl ? `<a class="btn" href="${actionsUrl}" target="_blank" rel="noopener" style="text-decoration:none">在 GitHub 上執行</a>` : ""}
    </div>
    <p class="hint" id="u-hint">${hasToken && repo ? `將在 ${esc(repo)} 執行「全部更新」。` : "尚未設定 Token。可先用「在 GitHub 上執行」，或展開下方設定。"}</p>
    <ul class="progress" id="u-progress" aria-live="polite"></ul>

    <details class="settings" id="u-upload-box">
      <summary>上傳台電簡明月報 PDF</summary>
      <p class="hint">台電網站會阻擋自動下載。到台電官網「公司治理 > 經營實績 > 簡明月報」下載 PDF 後在此上傳，檔名維持原樣（例如 11409簡明月報.pdf），系統會自動解析並更新網站。</p>
      <div class="form-row"><label for="u-file">PDF 檔案</label><input type="file" id="u-file" accept="application/pdf" multiple></div>
      <button class="btn" id="u-upload" ${hasToken && repo ? "" : "disabled"}>上傳並解析</button>
    </details>

    <details class="settings" ${hasToken ? "" : "open"}>
      <summary>管理者設定</summary>
      <div class="form-row"><label for="u-repo">Repository</label><input type="text" id="u-repo" placeholder="帳號/repo 名稱" value="${esc(repo)}"></div>
      <div class="form-row"><label for="u-token">GitHub Token</label><input type="password" id="u-token" placeholder="${hasToken ? "已設定（重新輸入可更換）" : "github_pat_…"}" autocomplete="off"></div>
      <div class="update-actions"><button class="btn" id="u-save">儲存</button><button class="btn" id="u-clear">清除 Token</button></div>
      <p class="hint">建立方式：GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token。Repository access 只選這個 repo；Permissions 的 Actions 設為 Read and write（要上傳月報再加 Contents: Read and write）。Token 只存在這台電腦的瀏覽器，不要在公用電腦上設定。</p>
    </details>`;

  const $ = (id) => root.querySelector("#" + id);
  const prog = $("u-progress");

  $("u-reload").onclick = () => { bumpCache(); location.reload(); };

  $("u-save").onclick = () => {
    const r = $("u-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
    const tk = $("u-token").value.trim();
    if (r) localStorage.setItem(LS_REPO, r);
    if (tk) localStorage.setItem(LS_TOKEN, tk);
    mountUpdater(root);
    root.querySelector("#u-hint").textContent = "已儲存。";
  };
  $("u-clear").onclick = () => { localStorage.removeItem(LS_TOKEN); mountUpdater(root); };

  async function follow(file, since, startStep) {
    renderSteps(prog, startStep);
    const run = await findRun(repo, file, since);
    renderSteps(prog, 1, -1, `<a href="${run.html_url}" target="_blank" rel="noopener">查看執行紀錄</a>`);
    const done = await waitRun(repo, run, () => {});
    const warn = done.conclusion === "success" ? ""
      : `部分步驟未成功（${esc(done.conclusion)}），<a href="${done.html_url}" target="_blank" rel="noopener">查看錯誤</a>；已取得的資料仍會更新。`;
    renderSteps(prog, 2, -1, warn);
    const dep = await findRun(repo, "deploy-pages.yml", new Date(done.updated_at).getTime() - 30000, 180000);
    const depDone = await waitRun(repo, dep, () => {});
    if (depDone.conclusion !== "success") throw Object.assign(new Error("網站部署失敗，請到 Actions 頁查看「部署網站」。"), { step: 2 });
    bumpCache();
    renderSteps(prog, 4, -1, `${warn ? warn + "<br>" : ""}更新完成。<button class="btn" type="button" onclick="location.reload()">重新整理頁面</button>`);
  }

  function lock(on) { root.querySelectorAll("button").forEach((b) => { if (b.id !== "u-reload") b.disabled = on; }); }

  $("u-all").onclick = async () => {
    lock(true);
    const since = Date.now();
    try {
      renderSteps(prog, 0);
      await api(`/repos/${repo}/actions/workflows/update-all.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
      await follow("update-all.yml", since, 1);
    } catch (e) {
      renderSteps(prog, 0, e.step ?? 0, esc(e.message));
    } finally { lock(false); }
  };

  $("u-upload").onclick = async () => {
    const files = [...$("u-file").files];
    if (!files.length) { root.querySelector("#u-hint").textContent = "請先選擇 PDF 檔案。"; return; }
    lock(true);
    const since = Date.now();
    try {
      renderSteps(prog, 0, -1, `上傳 ${files.length} 個檔案…`);
      for (const f of files) {
        const name = f.name.replace(/[\\/]/g, "_");
        const path = `reports/${encodeURIComponent(name)}`;
        const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(f); });
        let sha;
        try { sha = (await api(`/repos/${repo}/contents/${path}?ref=main`)).sha; } catch { sha = undefined; }
        await api(`/repos/${repo}/contents/${path}`, { method: "PUT", body: JSON.stringify({ message: `reports: 上傳 ${name}`, content: b64, branch: "main", ...(sha ? { sha } : {}) }) });
      }
      await follow("update-data.yml", since, 1);
    } catch (e) {
      renderSteps(prog, 0, e.step ?? 0, esc(e.message));
    } finally { lock(false); }
  };
}
