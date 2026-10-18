"""每日電力供需（資料集 19995）與未來二個月供需預測（資料集 103262）。

19995 只提供「上一年度＋今年至上月」，所以每次更新都與既有資料合併，
長期執行後就會累積成完整的多年序列。萬瓩一律換算為 MW（×10）。
"""
from common import load_json, norm_date, now_iso, num, record_status, save_json
from config import DATASETS
from datagov import fetch_csv_rows, find_col


def parse_daily(rows):
    if not rows:
        return []
    cols = list(rows[0].keys())
    c_date = find_col(cols, "日期")
    c_cap = find_col(cols, "淨尖峰供電能力")
    c_peak = find_col(cols, "尖峰負載")
    c_res = find_col(cols, "備轉容量", exclude=("率",))
    c_pct = find_col(cols, "備轉容量率")
    c_ind = find_col(cols, "工業用電")
    c_res_use = find_col(cols, "民生用電")
    out = []
    for r in rows:
        d = norm_date(r.get(c_date, ""))
        if not d:
            continue
        def mw(c):
            v = num(r.get(c)) if c else None
            return None if v is None else round(v * 10, 1)
        out.append({
            "date": d,
            "capacity_mw": mw(c_cap),
            "peak_mw": mw(c_peak),
            "reserve_mw": mw(c_res),
            "reserve_pct": num(r.get(c_pct)) if c_pct else None,
            "industrial_gwh": num(r.get(c_ind)) if c_ind else None,
            "residential_gwh": num(r.get(c_res_use)) if c_res_use else None,
        })
    return out


def merge_daily(existing, new_rows):
    by_date = {r["date"]: r for r in existing}
    for r in new_rows:
        by_date[r["date"]] = r
    return [by_date[k] for k in sorted(by_date)]


def parse_forecast(rows):
    if not rows:
        return []
    cols = list(rows[0].keys())
    c_date = find_col(cols, "日期")
    c_cap = find_col(cols, "供電能力")
    c_peak = find_col(cols, "尖峰負載")
    c_res = find_col(cols, "備轉容量", exclude=("率",))
    c_pct = find_col(cols, "備轉容量率")
    out = []
    for r in rows:
        d = norm_date(r.get(c_date, ""))
        if not d:
            continue
        out.append({
            "date": d,
            "capacity_mw": None if num(r.get(c_cap)) is None else round(num(r.get(c_cap)) * 10, 1),
            "peak_mw": None if num(r.get(c_peak)) is None else round(num(r.get(c_peak)) * 10, 1),
            "reserve_mw": None if num(r.get(c_res)) is None else round(num(r.get(c_res)) * 10, 1),
            "reserve_pct": num(r.get(c_pct)),
        })
    return sorted(out, key=lambda x: x["date"])


def validate_daily(rows):
    """排除明顯錯誤的數值（例如單位錯置），回傳警告清單。"""
    warnings = []
    for r in rows:
        p = r.get("peak_mw")
        if p is not None and not (15000 <= p <= 70000):
            warnings.append(f"{r['date']} 尖峰負載 {p} MW 超出合理範圍，已忽略")
            r["peak_mw"] = None
    return warnings


def run_daily():
    try:
        new_rows = parse_daily(fetch_csv_rows(DATASETS["daily_supply"]))
        if not new_rows:
            raise RuntimeError("沒有解析到任何每日資料")
        warns = validate_daily(new_rows)
        old = (load_json("daily_supply.json") or {}).get("rows", [])
        rows = merge_daily(old, new_rows)
        save_json("daily_supply.json", {
            "updated": now_iso(),
            "unit": {"power": "MW", "energy": "GWh（百萬度）"},
            "source": {
                "name": "台灣電力公司｜過去電力供需資訊",
                "url": f"https://data.gov.tw/dataset/{DATASETS['daily_supply']}",
            },
            "rows": rows,
        }, compact=True)
        record_status("daily_supply", True, "; ".join(warns[:3]), rows=len(rows))
    except Exception as e:  # noqa: BLE001
        record_status("daily_supply", False, str(e))
        print("daily_supply failed:", e)


def run_forecast():
    try:
        rows = parse_forecast(fetch_csv_rows(DATASETS["forecast_2m"]))
        if not rows:
            raise RuntimeError("沒有解析到任何預測資料")
        save_json("forecast_2m.json", {
            "updated": now_iso(),
            "source": {
                "name": "台灣電力公司｜未來二個月電力供需預測",
                "url": f"https://data.gov.tw/dataset/{DATASETS['forecast_2m']}",
            },
            "rows": rows,
        })
        record_status("forecast_2m", True, rows=len(rows))
    except Exception as e:  # noqa: BLE001
        record_status("forecast_2m", False, str(e))
        print("forecast_2m failed:", e)


if __name__ == "__main__":
    run_daily()
    run_forecast()
