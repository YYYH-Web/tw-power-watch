# 台灣電力觀測站

以台電與經濟部能源署的公開資料，長期追蹤台灣供電與用電的靜態網站。
資料由 GitHub Actions 定期自動抓取，網站部署在 GitHub Pages，日後可直接搬到自己的伺服器。

## 上線步驟（約 10 分鐘）

1. 在 GitHub 建立一個 **Public** repository，例如 `tw-power-watch`，把本資料夾全部推上去：
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/tw-power-watch.git
   git push -u origin main
   ```
2. **Settings → Actions → General → Workflow permissions**：選「Read and write permissions」，按 Save。
3. **Settings → Pages → Build and deployment → Source**：選「GitHub Actions」。
4. 到 **Actions** 頁，依序手動執行一次（點進工作流程 → Run workflow）：
   - 「更新電力資料」：裝置容量、每日供需、兩個月預測、台電月報
   - 「即時發電取樣」：第一筆即時資料
   - 「更新新聞」
   
   前兩個完成後，「部署網站」會自動執行。
5. 網址：`https://<你的帳號>.github.io/tw-power-watch/`

（選用）把每個 HTML 檔開頭的 `data-repo=""` 填入 repo 網址，頁尾就會出現原始碼連結。

## 手動更新（網頁上操作）

網站右上角「手動更新」會開啟「資料來源」頁的更新面板：

- **重新載入最新資料**：任何人都能用，略過瀏覽器快取重新讀取資料。
- **立即更新全部資料**：觸發「全部更新」工作流程，畫面會顯示進度（抓取 → 部署 → 完成）。需要管理者先設定 GitHub Token。
- **上傳台電簡明月報 PDF**：台電網站會擋自動下載，可手動下載 PDF 後在這裡上傳，系統自動解析。

Token 設定方式：GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
- Repository access：只選這個 repo
- Permissions：**Actions: Read and write**；若要上傳月報，再加 **Contents: Read and write**

Token 只存在你自己瀏覽器的 localStorage，不會進入 repo。建議設定到期日，也不要在公用電腦上設定。

## 自動更新排程

| 工作流程 | 時間（台灣時間） | 內容 |
|---|---|---|
| 更新電力資料 | 每月 5、15 日 09:00 | 能源署裝置容量、台電每日供需、兩個月預測、簡明月報 |
| 即時發電取樣 | 每小時 | 台電各機組即時出力 → 估算月發電量與容量因數 |
| 更新新聞 | 每天 06:00、17:00 | 電力、綠能、天然氣、碳費、AI 用電、國際 |
| 全部更新 | 手動 | 網站「立即更新全部資料」按鈕使用 |
| 部署網站 | 上述資料或 site/ 有更新時 | 發布到 GitHub Pages |

某個來源失敗時，舊資料會保留，失敗原因會顯示在網站「資料來源」頁。

## 需要人工維護的部分

- **`site/data/plants.json`、`outlook.json`、`facts.json`、`contract_capacity.json`**：電源開發計畫、需求預測、重點數字、契約容量。這些只出現在政府報告與新聞稿裡，沒有結構化資料。每年《全國電力資源供需報告》公布後（通常 6～9 月）更新一次；每筆都要附出處，官方沒公布的數字請留 `null`。
- **台電簡明月報**：從網站上傳 PDF 最簡單，或直接把 PDF 放進 `reports/` 資料夾 commit。`fetchers/monthly_reports.txt` 的網址清單也保留，但台電常擋 GitHub 主機下載。
- **`fetchers/config.py`**：離岸風場關鍵字、新聞搜尋關鍵字、媒體 RSS。

## 已知限制

- **即時資料格式**：若「各機組即時發電量」顯示失敗，程式會把資料格式樣本存到 `site/data/debug/realtime_sample.json`，可依此調整 `fetchers/realtime.py`。
- **每日供需的時間落差**：台電資料集為「今年至上月」，且通常在月中後才更新上個月，所以 10 月上中旬可能只到 8 月底。
- **海外 IP 存取**：GitHub Actions 主機在海外。台電官網有反爬蟲機制，部分政府網站也可能擋海外 IP。如果「資料來源」頁持續顯示失敗，改用自己伺服器當 self-hosted runner（Settings → Actions → Runners → New self-hosted runner），工作流程的 `runs-on` 改成 `self-hosted`。
- **每日供需只有近兩年**：台電資料集只提供上一年度與今年。本站每次更新會累積合併，跑得越久歷史越完整；更早的年份需另外匯入。
- **新聞縮圖**：Google News RSS 不含圖片，沒有圖的新聞會用分類色塊。在 `config.py` 的 `DIRECT_FEEDS` 加入媒體自有 RSS，就會抓取文章縮圖。
- **排程停用**：GitHub 會停用 60 天沒有活動的 repo 排程。本站每小時都有取樣 commit，正常情況不會觸發。

## 搬到自己的伺服器

網站是純靜態檔案，`site/` 整個資料夾放到 nginx 或任何網頁伺服器即可。

資料更新有兩種做法：
- 繼續用 GitHub Actions 更新，伺服器定期 `git pull`。
- 在伺服器用 cron 直接執行抓取程式：
  ```
  17 * * * *    cd /path/fetchers && python3 realtime.py
  0 1 5,15 * *  cd /path/fetchers && python3 fetch_all.py
  0 6,17 * * *  cd /path/fetchers && python3 news.py
  ```

## 專案結構

```
fetchers/             Python 抓取程式（requirements.txt）
  config.py           資料集編號、關鍵字、新聞來源
  capacity.py         裝置容量（年）
  supply.py           每日供需、兩個月預測
  realtime.py         即時取樣與月估算
  monthly_report.py   台電簡明月報 PDF 解析
  news.py             新聞彙整
tests/                解析器測試（每次更新前會先執行）
site/                 網站本體（直接部署此資料夾）
  data/               JSON 資料
  i18n/zh-TW.json     介面文字（之後加英文版只需新增 en.json）
  assets/             CSS、JS
.github/workflows/    自動更新與部署
```

## 本機預覽

```bash
cd site && python3 -m http.server 8000
# 開啟 http://localhost:8000
```
