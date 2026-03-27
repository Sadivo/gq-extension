# GQ Taiwan - More Updates

一個 Chrome 擴充程式，讓 [GQ Taiwan](https://www.gq.com.tw/) 首頁的 MOST UPDATED 區塊顯示更多最新文章。

原本首頁只顯示 4 篇，裝了之後會在下方自動出現 **MORE UPDATES** 區塊，從 sitemap 抓取最新文章，每次可載入更多，最多顯示 40 篇。

## 安裝方式

1. 下載或 clone 這個 repo
2. 開啟 Chrome，前往 `chrome://extensions/`
3. 右上角開啟「**開發人員模式**」
4. 點「**載入未封裝項目**」，選擇 `gq-extension` 資料夾
5. 前往 `https://www.gq.com.tw/` 即可看到效果

## 功能

- 自動從 GQ Taiwan sitemap 抓取本週最新文章
- 過濾掉首頁已顯示的文章，不重複
- 每次點「載入更多」顯示 8 篇（含標題、分類、縮圖、日期）
- 樣式與 GQ 原站設計一致

## 檔案結構

```
gq-extension/
├── manifest.json   # 擴充程式設定
├── content.js      # 注入首頁的主要邏輯
├── style.css       # 樣式
└── icon.png        # 擴充程式圖示
```
