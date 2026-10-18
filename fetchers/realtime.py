"""台電各機組即時發電量（資料集 8931，每 10 分鐘更新）。

GitHub Actions 每小時取樣一次，用來：
1. latest.json      ：最新一筆各能源別裝置容量與出力、近 48 筆供電曲線
2. monthly.json     ：每月各能源別「平均出力」累計 → 估算月發電量與容量因數

月發電量估算＝當月平均出力(MW) × 當月時數。這是台電系統的估算值，
官方數字以台電簡明月報為準（見 monthly_report.py）。
"""
import datetime as dt
import json
import re

from common import TZ, get, load_json, now_iso, num, record_status, save_json
from config import DATASETS, OFFSHORE_WIND_KEYWORDS, REALTIME_FALLBACK_URLS
from datagov import resource_urls

TYPE_MAP = [
    ("nuclear", ["核能", "Nuclear"]),
    ("coal", ["燃煤", "Coal"]),
    ("cogen", ["汽電共生", "Co-Gen"]),
    ("gas", ["燃氣", "LNG"]),
    ("oil", ["燃油", "Oil", "輕油", "Diesel"]),
    ("pumped_load", ["抽蓄負載", "Pumping Load"]),
    ("pumped", ["抽蓄", "Pumping"]),
    ("hydro", ["水力", "Hydro"]),
    ("wind", ["風力", "Wind"]),
    ("solar", ["太陽能", "太陽光電", "Solar"]),
    ("storage", ["儲能", "Storage"]),
    ("geothermal", ["地熱", "Geothermal"]),
    ("biomass", ["生質", "Biomass"]),
    ("other_re", ["其它再生", "其他再生", "Other Renewable"]),
]
TAG_RE = re.compile(r"<[^>]+>")
TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}")


def fuel_of(type_text, unit_name):
    t = TAG_RE.sub("", type_text or "")
    fuel = next((k for k, pats in TYPE_MAP if any(p in t for p in pats)), None)
    if fuel == "wind":
        offshore = any(k in (unit_name or "") for k in OFFSHORE_WIND_KEYWORDS)
        return "wind_offshore" if offshore else "wind_onshore"
    return fuel


def find_rows(obj):
    if isinstance(obj, list) and obj and isinstance(obj[0], list):
        return obj
    if isinstance(obj, dict):
        for v in obj.values():
            rows = find_rows(v)
            if rows:
                return rows
    return None


def find_time(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, str) and TIME_RE.search(v):
                return TIME_RE.search(v).group(0).replace("T", " ")
    return None


def parse(payload):
    rows = find_rows(payload) or []
    by_fuel = {}
    units = 0
    for row in rows:
        cells = [TAG_RE.sub("", str(c)).strip() for c in row]
        if len(cells) < 5:
            continue
        name = cells[2]
        if not name or "小計" in name or "合計" in name:
            continue
        fuel = fuel_of(str(row[0]), name)
        cap, gen = num(cells[3]), num(cells[4])
        if fuel is None or cap is None:
            continue
        b = by_fuel.setdefault(fuel, {"cap_mw": 0.0, "gen_mw": 0.0, "units": 0})
        b["cap_mw"] += cap
        b["gen_mw"] += gen or 0.0
        b["units"] += 1
        units += 1
    for b in by_fuel.values():
        b["cap_mw"] = round(b["cap_mw"], 1)
        b["gen_mw"] = round(b["gen_mw"], 1)
    t = find_time(payload) or dt.datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    return {"time": t, "units": units, "by_fuel": by_fuel}


def fetch_payload():
    urls = []
    try:
        urls += resource_urls(DATASETS["realtime_units"], "JSON")
    except Exception as e:  # noqa: BLE001
        print("realtime: data.gov.tw API failed, using fallback:", e)
    urls += REALTIME_FALLBACK_URLS
    last = None
    for u in urls:
        try:
            r = get(u)
            return json.loads(r.content.decode("utf-8-sig"))
        except Exception as e:  # noqa: BLE001
            last = e
    raise last or RuntimeError("沒有可用的即時資料網址")


def accumulate(monthly, snap):
    month = snap["time"][:7]
    m = monthly.setdefault("months", {}).setdefault(month, {"samples": 0, "sum_gen_mw": {}, "cap_mw": {}})
    m["samples"] += 1
    for fuel, b in snap["by_fuel"].items():
        m["sum_gen_mw"][fuel] = round(m["sum_gen_mw"].get(fuel, 0.0) + b["gen_mw"], 1)
        m["cap_mw"][fuel] = b["cap_mw"]
    m["last_sample"] = snap["time"]
    return monthly


def run():
    try:
        snap = parse(fetch_payload())
        if snap["units"] < 20:
            raise RuntimeError(f"只解析到 {snap['units']} 部機組，格式可能已變動")
        latest = load_json("realtime/latest.json", {}) or {}
        hist = latest.get("history", [])
        if not hist or hist[-1]["time"] != snap["time"]:
            hist.append({"time": snap["time"], "gen": {k: v["gen_mw"] for k, v in snap["by_fuel"].items()}})
            monthly = load_json("realtime/monthly.json", {}) or {}
            save_json("realtime/monthly.json", accumulate(monthly, snap))
        save_json("realtime/latest.json", {
            "updated": now_iso(),
            "source": {
                "name": "台灣電力公司｜各機組發電量即時資訊（含外購電力）",
                "url": f"https://data.gov.tw/dataset/{DATASETS['realtime_units']}",
            },
            **snap,
            "history": hist[-48:],
        })
        record_status("realtime", True, rows=snap["units"])
    except Exception as e:  # noqa: BLE001
        record_status("realtime", False, str(e))
        print("realtime failed:", e)


if __name__ == "__main__":
    run()
