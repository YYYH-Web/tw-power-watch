"""台電《簡明月報》PDF：解析第一章「營運綜合摘要」中的官方月度數字。

台電網站沒有固定的月報網址規則，所以月報清單放在 fetchers/monthly_reports.txt，
每行一筆「YYYY-MM 網址」。新月報公布後加一行即可，下次排程就會解析。
已解析過的月份不會重複下載。
"""
import io
import os
import re

from common import ROOT, get, load_json, now_iso, num, record_status, save_json

LIST_FILE = os.path.join(ROOT, "fetchers", "monthly_reports.txt")
LOCAL_DIR = os.path.join(ROOT, "reports")  # 手動放入（或從網頁上傳）的月報 PDF
MIRROR_HOSTS = ["www.taipower.com.tw", "hc.taipower.com.tw", "hc2.taipower.com.tw", "dr.taipower.com.tw", "demo2024.taipower.com.tw"]

PATTERNS = {
    "capacity_kw": r"總裝置容量為([\d,]+)瓩",
    "gross_gen_kwh": r"總毛發電量([\d,]+)度",
    "net_gen_kwh": r"淨發電量([\d,]+)度",
    "peak_mw": r"月尖峰負載為([\d,.]+)MW",
    "avg_load_mw": r"月平均負載為([\d,.]+)MW",
    "purchased_kwh": r"總購電量為([\d,]+)度",
    "purchased_thermal_kwh": r"傳統火力發電([\d,]+)度",
    "purchased_re_kwh": r"再生能源發電業([\d,]+)度",
    "sales_kwh": r"總售電量([\d,]+)度",
}
AFTER_SALES = {
    "sales_lighting_kwh": r"電燈([\d,]+)度",
    "sales_power_kwh": r"電力([\d,]+)度",
}


def parse_text(text):
    t = re.sub(r"\s+", "", text)
    out = {}
    for key, pat in PATTERNS.items():
        m = re.search(pat, t)
        if m:
            out[key] = num(m.group(1))
    i = t.find("總售電量")
    if i >= 0:
        tail = t[i:i + 200]
        for key, pat in AFTER_SALES.items():
            m = re.search(pat, tail)
            if m:
                out[key] = num(m.group(1))
    return out


def read_list():
    items = []
    if not os.path.exists(LIST_FILE):
        return items
    with open(LIST_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(None, 1)
            if len(parts) == 2 and re.match(r"^\d{4}-\d{2}$", parts[0]):
                items.append((parts[0], parts[1]))
    return items


def month_from_filename(name):
    """11305簡明月報.pdf → 2024-05；2024-05.pdf → 2024-05。"""
    m = re.match(r"^(\d{4})-(\d{2})", name)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r"^(\d{3})(\d{2})", name)
    if m:
        return f"{int(m.group(1)) + 1911}-{m.group(2)}"
    return None


def mirrors(url):
    """台電同一份 PDF 常可在多個子網域取得，依序嘗試。"""
    m = re.match(r"^https?://([^/]+)(/.*)$", url)
    if not m or not m.group(1).endswith("taipower.com.tw"):
        return [url]
    return [url] + [f"https://{h}{m.group(2)}" for h in MIRROR_HOSTS if h != m.group(1)]


def pdf_text(pdf_bytes):
    import pdfplumber
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages[:4])


def parse_pdf(pdf_bytes):
    vals = parse_text(pdf_text(pdf_bytes))
    if len(vals) < 4:
        raise RuntimeError("解析到的欄位太少，月報格式可能不同")
    return vals


def local_reports():
    if not os.path.isdir(LOCAL_DIR):
        return []
    out = []
    for name in sorted(os.listdir(LOCAL_DIR)):
        if name.lower().endswith(".pdf"):
            month = month_from_filename(name)
            if month:
                out.append((month, os.path.join(LOCAL_DIR, name)))
    return out


def run():
    data = load_json("monthly_reports.json", {"months": {}}) or {"months": {}}
    done, failed = 0, []
    have = lambda m: m in data["months"] and data["months"][m].get("sales_kwh")  # noqa: E731

    # 1. 本機 PDF（不受台電網站阻擋影響）
    for month, fpath in local_reports():
        if have(month):
            continue
        try:
            with open(fpath, "rb") as f:
                vals = parse_pdf(f.read())
            vals["source_url"] = "reports/" + os.path.basename(fpath)
            data["months"][month] = vals
            done += 1
        except Exception as e:  # noqa: BLE001
            failed.append(f"{month}（本機檔案）: {e}")

    # 2. 清單中的網址，失敗時改試其他台電子網域；所有網域都回 403 就判定被阻擋並停止
    blocked = False
    for month, url in read_list():
        if have(month):
            continue
        if blocked:
            failed.append(f"{month}: 略過（台電網站阻擋自動下載）")
            continue
        last, n403 = None, 0
        for u in mirrors(url):
            try:
                vals = parse_pdf(get(u, timeout=30, retries=1).content)
                vals["source_url"] = u
                data["months"][month] = vals
                done += 1
                last = None
                break
            except Exception as e:  # noqa: BLE001
                last = e
                if "403" in str(e):
                    n403 += 1
        if last:
            failed.append(f"{month}: {str(last)[:80]}")
            if n403 == len(mirrors(url)):
                blocked = True
    data["updated"] = now_iso()
    data["source"] = {"name": "台灣電力公司｜簡明月報", "url": "https://www.taipower.com.tw/"}
    save_json("monthly_reports.json", data)
    msg = "；".join(failed[:3])
    if failed:
        msg += "。台電網站阻擋自動下載時，可從網站「資料來源」頁上傳 PDF。"
    record_status("monthly_reports", done > 0 or not failed, msg, rows=len(data["months"]))
    print(f"monthly reports: {done} parsed, {len(failed)} failed")


if __name__ == "__main__":
    run()
