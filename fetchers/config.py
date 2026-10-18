"""資料來源設定。網址或關鍵字變動時，只需改這個檔案。"""

# 政府資料開放平臺資料集編號（https://data.gov.tw/dataset/<id>）
DATASETS = {
    "capacity_annual": 16480,   # 能源署：發電裝置容量（全國／台電／民營／自用）
    "daily_supply": 19995,      # 台電：過去電力供需資訊（每日）
    "forecast_2m": 103262,      # 台電：未來二個月電力供需預測
    "realtime_units": 8931,     # 台電：各機組發電量即時資訊（含外購電力）
}

# 平臺 API 取不到下載網址時的備援
REALTIME_FALLBACK_URLS = [
    "https://www.taipower.com.tw/d006/loadGraph/loadGraph/data/genary.json",
]

# 即時資料中，機組名稱含以下關鍵字者歸類為「離岸風電」，其餘風力歸為「陸域風電」。
# 台電若新增離岸風場或改名，請在此補上。
OFFSHORE_WIND_KEYWORDS = [
    "離岸", "海洋", "海能", "允能", "沃旭", "大彰化", "彰芳", "西島", "海龍",
    "中能", "海鼎", "台電二期", "Offshore",
]

# 新聞來源：Google News RSS 搜尋（不含圖片）。可另在 DIRECT_FEEDS 加入媒體自有 RSS。
GOOGLE_NEWS_QUERIES = [
    ("power", "zh", "台電 OR 供電 OR 電價 OR 備轉容量 OR 電網"),
    ("renewables", "zh", "離岸風電 OR 太陽光電 OR 綠電 OR 再生能源 台灣"),
    ("gas", "zh", "天然氣 OR LNG OR 接收站 台灣"),
    ("carbon", "zh", "碳費 OR 碳定價 OR 碳權 OR 淨零 台灣"),
    ("aidc", "zh", "資料中心 用電 OR AI 用電 OR 算力 電力"),
    ("intl", "en", "electricity grid OR power demand OR data center power"),
]

# 媒體自有 RSS（格式：(分類, RSS 網址)）。這類來源會嘗試抓取文章 og:image 當縮圖。
DIRECT_FEEDS = [
    # ("power", "https://example.com/energy/rss.xml"),
]

NEWS_KEEP_DAYS = 45
NEWS_MAX_ITEMS = 240
