"""解析器測試。測試資料只用來驗證格式處理，不是實際數據（月報摘要除外，取自 113 年 5 月簡明月報原文）。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "fetchers"))

import capacity  # noqa: E402
import monthly_report  # noqa: E402
import realtime  # noqa: E402
import supply  # noqa: E402
from datagov import parse_csv  # noqa: E402

REPORT_TEXT = """(1)5月份總裝置容量為 32,324,232瓩(含試運轉中機組)。
(2)5 月份總毛發電量 15,577,860,022 度，淨發電量 15,002,852,874 度，全月供電穩定。
(1)5月份月尖峰負載為 35,484.72MW、月平均負載為 28,823.93MW。
(1)公用售電業：5 月份總購電量為 6,464,044,239 度，其中包括傳統火力發電
3,753,579,000度、再生能源發電業 1,086,908,117度、再生能源自用發電設備
846,539,926 度；5 月份總售電量
20,261,915,344度，其中包括電燈 5,607,321,285度，電力 14,654,594,059度。"""


def test_monthly_report():
    v = monthly_report.parse_text(REPORT_TEXT)
    assert v["capacity_kw"] == 32324232
    assert v["net_gen_kwh"] == 15002852874
    assert v["peak_mw"] == 35484.72
    assert v["sales_kwh"] == 20261915344
    assert v["sales_lighting_kwh"] == 5607321285
    assert v["sales_power_kwh"] == 14654594059
    assert v["purchased_re_kwh"] == 1086908117


def test_capacity_csv():
    csv_text = (
        "西元年,單位,總發電裝置容量_全國(數值),火力_燃煤_全國(數值),火力_全國(數值),"
        "再生能源_太陽光電_全國,再生能源_全國(數值),火力_燃煤_台電,火力_燃煤_民營電廠\n"
        "2023,千瓩,60000,20000,40000,12000,16000,10000,3000\n"
        "2024,千瓩,62000,19000,41000,14000,18000,9000,3000\n"
    )
    d = capacity.build(parse_csv(csv_text))
    assert d["years"] == [2023, 2024]
    nat = d["scopes"]["national"]
    assert nat["coal"] == [20000, 19000]
    assert nat["thermal"] == [40000, 41000]
    assert nat["solar"] == [12000, 14000]
    assert nat["renewable"] == [16000, 18000]
    assert d["scopes"]["system"]["coal"] == [13000, 12000]


def test_daily_supply():
    csv_text = (
        "日期,淨尖峰供電能力(萬瓩),尖峰負載(萬瓩),備轉容量(萬瓩),備轉容量率(%),工業用電(百萬度),民生用電(百萬度)\n"
        "20260102,3500.5,3100.0,400.5,12.92,420.1,230.4\n"
    )
    rows = supply.parse_daily(parse_csv(csv_text))
    assert rows[0]["date"] == "2026-01-02"
    assert rows[0]["peak_mw"] == 31000.0
    assert rows[0]["reserve_mw"] == 4005.0
    assert rows[0]["reserve_pct"] == 12.92
    merged = supply.merge_daily([{"date": "2026-01-01", "peak_mw": 1}], rows)
    assert [r["date"] for r in merged] == ["2026-01-01", "2026-01-02"]


def test_realtime_parse():
    payload = {
        "": "2026-10-18 14:30",
        "aaData": [
            ["<A NAME='nuclear'></A><b>核能(Nuclear)</b>", "", "核三#1", "951.0", "0.0", "0%", ""],
            ["<b>燃煤(Coal)</b>", "", "台中#1", "550.0", "480.5", "87%", ""],
            ["<b>燃煤(Coal)</b>", "", "小計", "550.0", "480.5", "", ""],
            ["<b>民營電廠-燃氣(IPP-LNG)</b>", "", "國光#1", "480.0", "300.0", "62%", ""],
            ["<b>風力(Wind)</b>", "", "台電離岸一期", "109.2", "50.0", "", ""],
            ["<b>風力(Wind)</b>", "", "大潭風力", "10.0", "2.0", "", ""],
            ["<b>太陽能(Solar)</b>", "", "太陽能購電", "15000", "8000", "", ""],
            ["<b>抽蓄負載(Pumping Load)</b>", "", "明潭", "1602", "-300", "", ""],
        ],
    }
    s = realtime.parse(payload)
    f = s["by_fuel"]
    assert s["time"] == "2026-10-18 14:30"
    assert f["coal"]["gen_mw"] == 480.5 and f["coal"]["units"] == 1
    assert f["gas"]["cap_mw"] == 480.0
    assert f["wind_offshore"]["cap_mw"] == 109.2
    assert f["wind_onshore"]["cap_mw"] == 10.0
    assert f["pumped_load"]["gen_mw"] == -300
    m = realtime.accumulate({}, s)
    assert m["months"]["2026-10"]["samples"] == 1


def test_realtime_dict_rows():
    rows = [{"機組類型": "燃煤(Coal)", "機組名稱": f"台中#{i}", "裝置容量(MW)": "550.0",
             "淨發電量(MW)": "500.0", "淨發電量/裝置容量比(%)": "90.9%", "備註": ""} for i in range(1, 11)]
    rows.append({"機組類型": "風力(Wind)", "機組名稱": "海能風場", "裝置容量(MW)": "376", "淨發電量(MW)": "120", "淨發電量/裝置容量比(%)": "31%", "備註": ""})
    s = realtime.parse({"DateTime": "2026-10-18T14:30:00", "aaData": rows})
    assert s["time"] == "2026-10-18 14:30"
    assert s["by_fuel"]["coal"]["units"] == 10 and s["by_fuel"]["coal"]["gen_mw"] == 5000
    assert s["by_fuel"]["wind_offshore"]["gen_mw"] == 120


def test_report_month_name():
    assert monthly_report.month_from_filename("11409簡明月報.pdf") == "2025-09"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
