"""發電裝置容量（年）：能源署資料集 16480。輸出 capacity_annual.json，單位 MW。"""
from common import num, record_status, save_json, now_iso
from config import DATASETS
from datagov import fetch_csv_rows

# 順序重要：細項必須排在總項（火力、再生能源）之前
CATEGORIES = [
    ("total", ["總發電裝置容量"]),
    ("pumped", ["抽蓄水力"]),
    ("coal", ["燃煤"]),
    ("oil", ["燃油"]),
    ("gas", ["燃氣"]),
    ("thermal", ["火力"]),
    ("nuclear", ["核能"]),
    ("hydro", ["慣常水力"]),
    ("geothermal", ["地熱"]),
    ("solar", ["太陽光電"]),
    ("wind", ["風力"]),
    ("biomass", ["生質能"]),
    ("waste", ["廢棄物"]),
    ("renewable", ["再生能源"]),
]
SCOPES = [("全國", "national"), ("台電", "taipower"), ("民營", "ipp"), ("自用", "self")]
UNIT_FACTORS = {"百萬瓩": 1000, "萬瓩": 10, "千瓩": 1, "MW": 1, "瓩": 0.001, "kW": 0.001}


def classify(col):
    name = col.replace("(數值)", "").replace("（數值）", "")
    parts = name.split("_")
    if len(parts) < 2:
        return None, None
    scope = next((key for zh, key in SCOPES if parts[-1].startswith(zh)), None)
    body = "_".join(parts[:-1])
    cat = next((key for key, pats in CATEGORIES if any(p in body for p in pats)), None)
    return cat, scope


def unit_factor(unit_text, national_total):
    for k, f in UNIT_FACTORS.items():
        if unit_text and k in unit_text:
            return f
    # 單位不明時，依台灣全國裝置容量量級（約 4～15 萬 MW）推斷
    if national_total:
        if national_total > 1e7:
            return 0.001
        if national_total < 2e4:
            return 10
    return 1


def build(rows):
    if not rows:
        raise RuntimeError("資料集沒有資料列")
    cols = list(rows[0].keys())
    year_col = next((c for c in cols if "西元年" in c), None) or next(c for c in cols if "年" in c)
    unit_col = next((c for c in cols if c.startswith("單位")), None)
    mapping = {c: classify(c) for c in cols}

    out = {}
    for row in rows:
        y = num(row.get(year_col))
        if not y:
            continue
        y = int(y)
        if y < 1000:  # 民國年
            y += 1911
        nat_total = None
        for c, (cat, scope) in mapping.items():
            if cat == "total" and scope == "national":
                nat_total = num(row.get(c))
        f = unit_factor(row.get(unit_col, "") if unit_col else "", nat_total)
        for c, (cat, scope) in mapping.items():
            if not cat or not scope:
                continue
            v = num(row.get(c))
            if v is None:
                continue
            out.setdefault(scope, {}).setdefault(cat, {})[y] = round(v * f, 1)

    years = sorted({y for s in out.values() for cat in s.values() for y in cat})
    scopes = {}
    for scope, cats in out.items():
        scopes[scope] = {cat: [vals.get(y) for y in years] for cat, vals in cats.items()}

    # 台電系統 ≈ 台電自有 + 民營電廠（自用發電設備躉售部分無法拆出，故不計入）
    if "taipower" in scopes and "ipp" in scopes:
        sysd = {}
        for cat in set(scopes["taipower"]) | set(scopes["ipp"]):
            a = scopes["taipower"].get(cat, [None] * len(years))
            b = scopes["ipp"].get(cat, [None] * len(years))
            sysd[cat] = [
                None if (x is None and z is None) else round((x or 0) + (z or 0), 1)
                for x, z in zip(a, b)
            ]
        scopes["system"] = sysd

    return {
        "updated": now_iso(),
        "unit": "MW",
        "years": years,
        "scopes": scopes,
        "source": {
            "name": "經濟部能源署｜發電裝置容量",
            "url": f"https://data.gov.tw/dataset/{DATASETS['capacity_annual']}",
        },
        "note": "台電系統＝台電自有＋民營電廠；全國另含自用發電設備。",
    }


def run():
    try:
        data = build(fetch_csv_rows(DATASETS["capacity_annual"]))
        save_json("capacity_annual.json", data)
        record_status("capacity_annual", True, rows=len(data["years"]))
    except Exception as e:  # noqa: BLE001
        record_status("capacity_annual", False, str(e))
        print("capacity_annual failed:", e)


if __name__ == "__main__":
    run()
