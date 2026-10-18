"""共用工具：HTTP 請求、JSON 讀寫、更新狀態紀錄。"""
import datetime as dt
import json
import os
import re
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "site", "data")
TZ = dt.timezone(dt.timedelta(hours=8))  # 台灣時間

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6",
}


def now_iso():
    return dt.datetime.now(TZ).isoformat(timespec="seconds")


def get(url, retries=3, timeout=40, **kw):
    """GET with retries. Raises the last error if every attempt fails."""
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout, **kw)
            r.raise_for_status()
            return r
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise last


def decode_bytes(b):
    for enc in ("utf-8-sig", "cp950", "big5"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("utf-8", errors="replace")


def path(rel):
    return os.path.join(DATA_DIR, rel)


def load_json(rel, default=None):
    p = path(rel)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_json(rel, obj, compact=False):
    p = path(rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def record_status(source, ok, message="", rows=None):
    """寫入 meta.json，供網站「資料來源」頁顯示每個來源的更新狀態。"""
    meta = load_json("meta.json", {"sources": {}})
    s = meta["sources"].get(source, {})
    s["last_attempt"] = now_iso()
    s["ok"] = ok
    s["message"] = message[:300]
    if ok:
        s["last_success"] = s["last_attempt"]
        if rows is not None:
            s["rows"] = rows
    meta["sources"][source] = s
    meta["updated"] = now_iso()
    save_json("meta.json", meta)


_num_re = re.compile(r"[^\d.\-]")


def num(v):
    """'1,234.5' -> 1234.5；空白、'-'、'N/A' -> None。"""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = _num_re.sub("", str(v))
    if s in ("", "-", ".", "-."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def norm_date(s):
    """支援 2025/01/02、2025-1-2、20250102、民國 114/01/02。回傳 YYYY-MM-DD。"""
    s = str(s).strip()
    m = re.match(r"^(\d{8})$", s)
    if m:
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    m = re.match(r"^(\d{2,4})[/\-.](\d{1,2})[/\-.](\d{1,2})", s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 1911:
        y += 1911
    return f"{y:04d}-{mo:02d}-{d:02d}"
