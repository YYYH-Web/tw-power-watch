"""新聞彙整：Google News RSS 搜尋＋媒體自有 RSS。

只保存標題、來源、時間、連結與 RSS 提供的短摘要，不轉載全文；
網站點擊後導向原始媒體。
"""
import datetime as dt
import html
import re
from email.utils import parsedate_to_datetime
from urllib.parse import quote

import feedparser

from common import TZ, get, load_json, now_iso, record_status, save_json
from config import DIRECT_FEEDS, GOOGLE_NEWS_QUERIES, NEWS_KEEP_DAYS, NEWS_MAX_ITEMS

TAG_RE = re.compile(r"<[^>]+>")
OG_RE = re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', re.I)


def gnews_url(query, lang):
    if lang == "en":
        return f"https://news.google.com/rss/search?q={quote(query)}&hl=en-US&gl=US&ceid=US:en"
    return f"https://news.google.com/rss/search?q={quote(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", s or ""))).strip()


def norm_title(t):
    return re.sub(r"[\W_]+", "", t).lower()[:40]


def entry_time(e):
    for k in ("published", "updated"):
        if e.get(k):
            try:
                return parsedate_to_datetime(e[k]).astimezone(TZ)
            except Exception:  # noqa: BLE001
                pass
    return dt.datetime.now(TZ)


def split_source(title, entry):
    src = (entry.get("source") or {}).get("title")
    if " - " in title:
        head, tail = title.rsplit(" - ", 1)
        return head.strip(), (src or tail).strip()
    return title, src or ""


def og_image(url):
    try:
        r = get(url, retries=1, timeout=15)
        m = OG_RE.search(r.text[:200000])
        return m.group(1) if m else None
    except Exception:  # noqa: BLE001
        return None


def collect():
    items = []
    feeds = [(cat, lang, gnews_url(q, lang), False) for cat, lang, q in GOOGLE_NEWS_QUERIES]
    feeds += [(cat, "zh", url, True) for cat, url in DIRECT_FEEDS]
    errors = []
    for cat, lang, url, direct in feeds:
        try:
            parsed = feedparser.parse(get(url).content)
        except Exception as e:  # noqa: BLE001
            errors.append(f"{cat}: {e}")
            continue
        for e in parsed.entries[:30]:
            title, source = split_source(clean(e.get("title")), e)
            summary = clean(e.get("summary"))
            if summary.startswith(title[:12]):  # Google News 摘要常只是重複標題
                summary = ""
            image = None
            media = e.get("media_content") or e.get("media_thumbnail")
            if media:
                image = media[0].get("url")
            if direct and not image:
                image = og_image(e.get("link"))
            items.append({
                "title": title,
                "source": source,
                "url": e.get("link"),
                "time": entry_time(e).isoformat(timespec="minutes"),
                "category": cat,
                "lang": lang,
                "summary": summary[:140],
                "image": image,
            })
    return items, errors


def to_aware(s):
    """'2026-06-19T05:30' 這類沒有時區的時間視為台灣時間。"""
    t = dt.datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=TZ)


def merge(old, new):
    cutoff = dt.datetime.now(TZ) - dt.timedelta(days=NEWS_KEEP_DAYS)
    seen, out = set(), []
    def sort_key(x):
        try:
            return to_aware(x["time"])
        except Exception:  # noqa: BLE001
            return cutoff
    for it in sorted(new + old, key=sort_key, reverse=True):
        key = norm_title(it["title"])
        if not key or key in seen:
            continue
        try:
            t = to_aware(it["time"])
        except (ValueError, TypeError, KeyError):
            continue
        it["time"] = t.isoformat(timespec="minutes")
        if t < cutoff and not it.get("pinned"):
            continue
        seen.add(key)
        out.append(it)
    return out[:NEWS_MAX_ITEMS]


def run():
    try:
        old = (load_json("news.json") or {}).get("items", [])
        new, errors = collect()
        items = merge(old, new)
        save_json("news.json", {"updated": now_iso(), "items": items})
        record_status("news", bool(new), "; ".join(errors[:3]), rows=len(items))
        print(f"news: {len(new)} fetched, {len(items)} kept, {len(errors)} feed errors")
    except Exception as e:  # noqa: BLE001
        record_status("news", False, f"{type(e).__name__}: {e}")
        print("news failed:", e)


if __name__ == "__main__":
    run()
