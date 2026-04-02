"""
GQ Taiwan - 抓取最新文章 (MOST UPDATED)
策略：
1. 先從首頁解析 MOST UPDATED 區塊（通常只有 3-4 篇）
2. 再從 sitemap 抓本週所有文章，按日期排序補充更多
"""

import requests
from bs4 import BeautifulSoup
from datetime import datetime
import xml.etree.ElementTree as ET
import json

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}

BASE_URL = "https://www.gq.com.tw"


def parse_homepage_most_updated() -> list[dict]:
    """從首頁解析 MOST UPDATED 區塊"""
    resp = requests.get(BASE_URL, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    articles = []

    # 找到 MOST UPDATED 的 section
    # Condé Nast Verso 的結構：h2 標題後面跟著文章列表
    for heading in soup.find_all(["h2", "h3"]):
        text = heading.get_text(strip=True).upper()
        if "MOST UPDATED" in text:
            # 找這個 heading 之後的所有文章連結
            section = heading.find_parent()
            if section:
                for a in section.find_all("a", href=True):
                    href = a["href"]
                    if "/article/" in href or "/special/" in href:
                        title = a.get_text(strip=True)
                        if title and len(title) > 10:
                            url = href if href.startswith("http") else BASE_URL + href
                            articles.append({"title": title, "url": url, "source": "homepage"})
            break

    return articles


def parse_sitemap_week(year: int, month: int, week: int) -> list[dict]:
    """從 sitemap 抓指定週的所有文章 URL + lastmod"""
    sitemap_url = f"{BASE_URL}/sitemap.xml?year={year}&month={month}&week={week}"
    resp = requests.get(sitemap_url, headers=HEADERS, timeout=15)
    resp.raise_for_status()

    articles = []
    try:
        root = ET.fromstring(resp.content)
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        for url_el in root.findall(".//sm:url", ns):
            loc = url_el.findtext("sm:loc", namespaces=ns) or ""
            lastmod = url_el.findtext("sm:lastmod", namespaces=ns) or ""
            if "/article/" in loc or "/special/" in loc:
                articles.append({"url": loc, "lastmod": lastmod, "source": "sitemap"})
    except ET.ParseError as e:
        print(f"  XML 解析錯誤: {e}")

    return articles


def enrich_article(article: dict) -> dict:
    """抓取文章頁面取得標題、分類、作者、日期"""
    try:
        resp = requests.get(article["url"], headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # 標題
        title_el = soup.find("h1")
        title = title_el.get_text(strip=True) if title_el else ""

        # 分類
        category = ""
        for el in soup.find_all(["a", "span"], class_=lambda c: c and "category" in c.lower()):
            category = el.get_text(strip=True)
            break

        # 作者
        author = ""
        for el in soup.find_all(["a", "span"], class_=lambda c: c and "author" in c.lower()):
            author = el.get_text(strip=True)
            break

        # 日期 (meta tag 最可靠)
        date = article.get("lastmod", "")
        for meta in soup.find_all("meta"):
            prop = meta.get("property", "") or meta.get("name", "")
            if prop in ("article:published_time", "datePublished"):
                date = meta.get("content", date)
                break

        article.update({
            "title": title or article.get("title", ""),
            "category": category,
            "author": author,
            "date": date,
        })
    except Exception as e:
        article["error"] = str(e)

    return article


def get_current_week_info() -> tuple[int, int, int]:
    """取得今天是哪一年哪一月第幾週"""
    today = datetime.today()
    year = today.year
    month = today.month
    # 計算是當月第幾週（1-based）
    day = today.day
    week = (day - 1) // 7 + 1
    return year, month, week


def main(max_articles: int = 20, enrich: bool = False):
    print("=" * 60)
    print("GQ Taiwan MOST UPDATED 文章爬蟲")
    print("=" * 60)

    all_articles: list[dict] = []
    seen_urls: set[str] = set()

    # 1. 首頁 MOST UPDATED 區塊
    print("\n[1] 解析首頁 MOST UPDATED 區塊...")
    homepage_articles = parse_homepage_most_updated()
    print(f"    找到 {len(homepage_articles)} 篇")
    for a in homepage_articles:
        if a["url"] not in seen_urls:
            seen_urls.add(a["url"])
            all_articles.append(a)

    # 2. 從 sitemap 補充更多最新文章
    year, month, week = get_current_week_info()
    print(f"\n[2] 從 sitemap 抓 {year}/{month} 第 {week} 週文章...")

    # 抓本週 + 上週，確保有足夠文章
    for w_offset in range(2):
        w = week - w_offset
        m = month
        y = year
        if w <= 0:
            w = 4
            m -= 1
            if m <= 0:
                m = 12
                y -= 1

        try:
            sitemap_articles = parse_sitemap_week(y, m, w)
            print(f"    {y}/{m} 第 {w} 週: 找到 {len(sitemap_articles)} 篇")
            for a in sitemap_articles:
                if a["url"] not in seen_urls:
                    seen_urls.add(a["url"])
                    all_articles.append(a)
        except Exception as e:
            print(f"    sitemap 抓取失敗: {e}")

        if len(all_articles) >= max_articles:
            break

    # 按 lastmod 排序（最新在前）
    all_articles.sort(key=lambda x: x.get("lastmod", ""), reverse=True)
    all_articles = all_articles[:max_articles]

    # 3. 選擇性地豐富文章資料（抓標題、作者等）
    if enrich:
        print(f"\n[3] 抓取各文章詳細資料（共 {len(all_articles)} 篇）...")
        for i, article in enumerate(all_articles, 1):
            print(f"    [{i}/{len(all_articles)}] {article['url'][:60]}...")
            all_articles[i - 1] = enrich_article(article)

    # 4. 輸出結果
    from urllib.parse import unquote
    print(f"\n{'=' * 60}")
    print(f"共找到 {len(all_articles)} 篇最新文章：")
    print(f"{'=' * 60}")
    for i, a in enumerate(all_articles, 1):
        raw_title = a.get("title") or a.get("url", "").split("/")[-1]
        title = unquote(raw_title)
        date = a.get("lastmod") or a.get("date", "")
        category = a.get("category", "")
        print(f"\n{i:2}. [{date[:10] if date else '未知日期'}] {title[:70]}")
        if category:
            print(f"    分類: {category}")
        print(f"    URL: {a['url']}")

    # 儲存 JSON
    output_file = "gq_most_updated.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=2)
    print(f"\n結果已儲存至 {output_file}")

    return all_articles


if __name__ == "__main__":
    main(max_articles=20, enrich=True)
