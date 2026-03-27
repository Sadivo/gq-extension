/**
 * GQ Taiwan - More Updates
 * 從 sitemap 抓最新文章，注入到首頁 MOST UPDATED 區塊下方
 */

const MAX_PER_LOAD = 8;   // 每次載入幾篇
const MAX_TOTAL = 40;     // 最多顯示幾篇

let allArticles = [];     // 從 sitemap 抓到的所有文章
let displayedCount = 0;   // 目前已顯示幾篇
let isLoading = false;

// ── 工具函式 ──────────────────────────────────────────────

function getWeekInfo(offsetWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetWeeks * 7);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const week = Math.ceil(d.getDate() / 7);
  return { year, month, week };
}

async function fetchSitemap(year, month, week) {
  const url = `https://www.gq.com.tw/sitemap.xml?year=${year}&month=${month}&week=${week}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  const text = await resp.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");

  const articles = [];
  for (const urlEl of xml.querySelectorAll("url")) {
    const loc = urlEl.querySelector("loc")?.textContent || "";
    const lastmod = urlEl.querySelector("lastmod")?.textContent || "";
    if (loc.includes("/article/") || loc.includes("/special/")) {
      articles.push({ url: loc, lastmod, title: "", category: "" });
    }
  }
  return articles;
}

async function fetchArticleMeta(article) {
  try {
    const resp = await fetch(article.url);
    if (!resp.ok) return article;
    const text = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");

    // 標題
    const h1 = doc.querySelector("h1");
    if (h1) article.title = h1.textContent.trim();

    // 分類（Open Graph 或 meta）
    const ogSection = doc.querySelector('meta[property="article:section"]');
    if (ogSection) article.category = ogSection.getAttribute("content") || "";

    // 縮圖
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage) article.image = ogImage.getAttribute("content") || "";

  } catch (_) { /* 忽略單篇失敗 */ }
  return article;
}

// ── 取得首頁已顯示的文章 URL（避免重複）────────────────────

function getExistingUrls() {
  const urls = new Set();
  document.querySelectorAll("a[href]").forEach(a => {
    const href = a.href;
    if (href.includes("/article/") || href.includes("/special/")) {
      urls.add(href.split("#")[0]);
    }
  });
  return urls;
}

// ── 渲染文章卡片 ──────────────────────────────────────────

function renderCard(article) {
  const a = document.createElement("a");
  a.className = "gq-article-card";
  a.href = article.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const dateStr = article.lastmod
    ? new Date(article.lastmod).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })
    : "";

  a.innerHTML = `
    ${article.image ? `<img src="${article.image}" alt="" style="width:100%;aspect-ratio:1/1;object-fit:cover;margin-bottom:10px;">` : ""}
    ${article.category ? `<span class="gq-card-category">${article.category}</span>` : ""}
    <div class="gq-card-title">${article.title || decodeURIComponent(article.url.split("/").pop())}</div>
    ${dateStr ? `<div class="gq-card-date">${dateStr}</div>` : ""}
  `;
  return a;
}

function showNextBatch(grid, btn, statusEl) {
  const batch = allArticles.slice(displayedCount, displayedCount + MAX_PER_LOAD);
  batch.forEach(article => grid.appendChild(renderCard(article)));
  displayedCount += batch.length;

  const remaining = Math.min(allArticles.length, MAX_TOTAL) - displayedCount;
  if (remaining <= 0 || displayedCount >= MAX_TOTAL) {
    btn.style.display = "none";
    statusEl.textContent = `已顯示全部 ${displayedCount} 篇`;
  } else {
    btn.textContent = `載入更多（還有 ${remaining} 篇）`;
    btn.disabled = false;
  }
}

// ── 主流程 ────────────────────────────────────────────────

async function init() {
  // 找到 MOST UPDATED section，插在它後面
  let insertAfter = null;
  for (const el of document.querySelectorAll("h2, h3, [class*='heading']")) {
    if (el.textContent.trim().toUpperCase().includes("MOST UPDATED")) {
      insertAfter = el.closest("section") || el.parentElement;
      break;
    }
  }
  if (!insertAfter) {
    // fallback：插在 main 內容最前面
    insertAfter = document.querySelector("main") || document.body;
  }

  // 建立 UI 容器
  const section = document.createElement("div");
  section.id = "gq-more-section";
  section.innerHTML = `
    <h2>MORE UPDATES</h2>
    <div class="gq-article-grid" id="gq-grid"></div>
    <div id="gq-status">載入中...</div>
    <button id="gq-load-btn" disabled>載入更多</button>
  `;
  insertAfter.insertAdjacentElement("afterend", section);

  const grid = section.querySelector("#gq-grid");
  const btn = section.querySelector("#gq-load-btn");
  const statusEl = section.querySelector("#gq-status");

  // 抓 sitemap
  const existingUrls = getExistingUrls();
  let rawArticles = [];

  for (let offset = 0; offset < 3; offset++) {
    const { year, month, week } = getWeekInfo(offset * 7);
    try {
      const batch = await fetchSitemap(year, month, week);
      rawArticles.push(...batch);
    } catch (_) {}
    if (rawArticles.length >= MAX_TOTAL) break;
  }

  // 去重 + 排序
  const seen = new Set(existingUrls);
  allArticles = rawArticles
    .filter(a => {
      const clean = a.url.split("#")[0];
      if (seen.has(clean)) return false;
      seen.add(clean);
      return true;
    })
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
    .slice(0, MAX_TOTAL);

  if (allArticles.length === 0) {
    statusEl.textContent = "沒有找到更多文章";
    btn.style.display = "none";
    return;
  }

  // 預先抓第一批的 meta（標題、圖片）
  statusEl.textContent = "抓取文章資訊...";
  const firstBatch = allArticles.slice(0, MAX_PER_LOAD);
  await Promise.all(firstBatch.map(a => fetchArticleMeta(a)));

  statusEl.textContent = "";
  showNextBatch(grid, btn, statusEl);

  // 點「載入更多」時，先抓 meta 再顯示
  btn.addEventListener("click", async () => {
    if (isLoading) return;
    isLoading = true;
    btn.disabled = true;
    btn.textContent = "載入中...";
    statusEl.textContent = "";

    const nextBatch = allArticles.slice(displayedCount, displayedCount + MAX_PER_LOAD);
    await Promise.all(nextBatch.map(a => fetchArticleMeta(a)));

    showNextBatch(grid, btn, statusEl);
    isLoading = false;
  });
}

init();
