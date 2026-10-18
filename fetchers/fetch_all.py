"""每月排程進入點：更新所有非即時資料。個別來源失敗不影響其他來源，也不會覆蓋舊資料。"""
import capacity
import monthly_report
import supply

if __name__ == "__main__":
    capacity.run()
    supply.run_daily()
    supply.run_forecast()
    monthly_report.run()
