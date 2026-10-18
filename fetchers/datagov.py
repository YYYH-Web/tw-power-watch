"""政府資料開放平臺：用資料集編號查出實際下載網址，避免把易變的網址寫死。"""
import csv
import io

from common import decode_bytes, get

API = "https://data.gov.tw/api/v2/rest/dataset/{}"


def resource_urls(dataset_id, fmt=None):
    r = get(API.format(dataset_id)).json()
    dist = (r.get("result") or {}).get("distribution") or []
    urls = []
    for d in dist:
        f = (d.get("resourceFormat") or "").upper()
        u = d.get("resourceDownloadUrl")
        if u and (fmt is None or f == fmt.upper()):
            urls.append(u)
    if not urls:
        raise RuntimeError(f"資料集 {dataset_id} 找不到 {fmt or ''} 下載網址")
    return urls


def fetch_csv_rows(dataset_id):
    url = resource_urls(dataset_id, "CSV")[0]
    text = decode_bytes(get(url).content)
    return parse_csv(text)


def parse_csv(text):
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        rows.append({(k or "").strip().lstrip("\ufeff"): (v or "").strip() for k, v in row.items()})
    return rows


def find_col(columns, *keywords, exclude=()):
    """回傳第一個包含所有關鍵字、且不含排除字的欄位名稱。"""
    for c in columns:
        if all(k in c for k in keywords) and not any(x in c for x in exclude):
            return c
    return None
