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


def run():
    import pdfplumber

    data = load_json("monthly_reports.json", {"months": {}}) or {"months": {}}
    done, failed = 0, []
    for month, url in read_list():
        if month in data["months"] and data["months"][month].get("sales_kwh"):
            continue
        try:
            pdf_bytes = get(url, timeout=90).content
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages[:4])
            vals = parse_text(text)
            if len(vals) < 4:
                raise RuntimeError("解析到的欄位太少，月報格式可能不同")
            vals["source_url"] = url
            data["months"][month] = vals
            done += 1
        except Exception as e:  # noqa: BLE001
            failed.append(f"{month}: {e}")
    data["updated"] = now_iso()
    data["source"] = {"name": "台灣電力公司｜簡明月報", "url": "https://www.taipower.com.tw/"}
    save_json("monthly_reports.json", data)
    record_status("monthly_reports", not failed, "; ".join(failed[:3]), rows=len(data["months"]))
    print(f"monthly reports: {done} parsed, {len(failed)} failed")


if __name__ == "__main__":
    run()
