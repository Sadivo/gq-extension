/**
 * GQ Taiwan - More Updates
 * 從 sitemap 抓最新文章，注入到首頁 MOST UPDATED 區塊下方
 */

const MAX_PER_LOAD = 8;
const MAX_TOTAL = 40;

let allArticles = [];
let displayedCount = 0;
let isLoading = false;

// ── sitemap 工具 ──────────────────────────────────────────

function getCurrentWeeks() {
  // 回傳最近 3 週的 {year, month, week}，week = Math.ceil(day/7)
  const results = [];
  const d = new Date();
  for (let i = 0; i < 3; i++) {
    const t = new Date(d);
    t.setDate(d.getDate() - i * 7);
    results.push({
      year: t.getFullYear(),
      month: t.getMonth() + 1,
      week: Math.ceil(t.getDate() / 7),
    });
  }
  return results;
}

async function fetchSitemap(year, month, week) {
  const url = `https://www.gq.com.tw/sitemap.xml?year=${year}&month=${month}&week=${week}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  const text = await resp.text();
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const articles = [];

  for (const urlEl of xml.querySelectorAll("url")) {
    const loc     = urlEl.querySelector("loc")?.textContent || "";
    const lastmod = urlEl.querySelector("lastmod")?.textContent || "";
    if (loc.includes("/article/") || loc.includes("/special/")) {
      articles.push({ url: loc, lastmod, title: "", category: "", image: "" });
    }
  }
  return articles;
}

async function fetchArticleMeta(article) {
  try {
    const resp = await fetch(article.url);
    if (!resp.ok) return article;
    const doc = new DOMParser().parseFromString(await resp.text(), "text/html");

    const h1 = doc.querySelector("h1");
    if (h1) article.title = h1.textContent.trim();

    const ogSection = doc.querySelector('meta[property="article:section"]');
    if (ogSection) article.category = ogSection.getAttribute("content") || "";

    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage) article.image = ogImage.getAttribute("content") || "";
  } catch (_) {}
  return article;
}

// ── DOM 工具 ──────────────────────────────────────────────

/**
 * 找到包含 MOST UPDATED 標題 + 4 篇文章的完整 FeaturesRow 容器。
 * 結構：h3 > SectionTitleRoot > GridContent > GridWrapper > FeaturesRow
 * 插在 FeaturesRow 後面，就會出現在 4 篇文章正下方。
 */
function findMostUpdatedContainer() {
  for (const el of document.querySelectorAll("h2, h3")) {
    if (!el.textContent.trim().toUpperCase().includes("MOST UPDATED")) continue;

    let node = el.parentElement;
    for (let i = 0; i < 10; i++) {
      if (!node) break;
      const cls = node.className || "";
      // FeaturesRow 是包含標題 + 所有文章卡片的最小完整容器
      if (cls.includes("FeaturesRow") || cls.includes("featuresrow")) {
        return node;
      }
      node = node.parentElement;
    }

    // fallback：往上 4 層
    let fallback = el.parentElement;
    for (let i = 0; i < 3; i++) fallback = fallback?.parentElement;
    return fallback || el.parentElement;
  }
  return null;
}

// ── 渲染 ──────────────────────────────────────────────────

function renderCard(article) {
  const a = document.createElement("a");
  a.className = "gq-article-card";
  a.href = article.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const dateStr = article.lastmod
    ? new Date(article.lastmod).toLocaleDateString("zh-TW", {
        year: "numeric", month: "long", day: "numeric",
      })
    : "";

  const title = article.title || decodeURIComponent(article.url.split("/").pop());

  a.innerHTML = `
    ${article.image
      ? `<img src="${article.image}" alt="" style="width:100%;aspect-ratio:1/1;object-fit:cover;margin-bottom:10px;">`
      : ""}
    ${article.category ? `<span class="gq-card-category">${article.category}</span>` : ""}
    <div class="gq-card-title">${title}</div>
    ${dateStr ? `<div class="gq-card-date">${dateStr}</div>` : ""}
  `;
  return a;
}

function showNextBatch(grid, btn, statusEl) {
  const batch = allArticles.slice(displayedCount, displayedCount + MAX_PER_LOAD);
  batch.forEach(a => grid.appendChild(renderCard(a)));
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
  const container = findMostUpdatedContainer();
  if (!container) {
    console.warn("[GQ+] 找不到 MOST UPDATED 容器");
    return;
  }

  // 建立 UI，插在 MOST UPDATED 正後面
  const section = document.createElement("div");
  section.id = "gq-more-section";
  section.innerHTML = `
    <h2>MORE UPDATES</h2>
    <div class="gq-article-grid" id="gq-grid"></div>
    <div id="gq-status">載入中...</div>
    <button id="gq-load-btn" disabled>載入更多</button>
  `;
  container.insertAdjacentElement("afterend", section);

  const grid    = section.querySelector("#gq-grid");
  const btn     = section.querySelector("#gq-load-btn");
  const statusEl = section.querySelector("#gq-status");

  // 抓 sitemap（本週 + 前兩週，確保有足夠文章）
  let rawArticles = [];
  const seen = new Set();

  for (const { year, month, week } of getCurrentWeeks()) {
    try {
      const batch = await fetchSitemap(year, month, week);
      for (const a of batch) {
        const key = a.url.split("#")[0];
        if (!seen.has(key)) {
          seen.add(key);
          rawArticles.push(a);
        }
      }
    } catch (_) {}
    if (rawArticles.length >= MAX_TOTAL) break;
  }

  // 按時間排序（最新在前），取前 MAX_TOTAL 篇
  allArticles = rawArticles
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod))
    .slice(0, MAX_TOTAL);

  if (allArticles.length === 0) {
    statusEl.textContent = "沒有找到更多文章";
    btn.style.display = "none";
    return;
  }

  // 預先抓第一批 meta
  statusEl.textContent = "抓取文章資訊...";
  await Promise.all(allArticles.slice(0, MAX_PER_LOAD).map(a => fetchArticleMeta(a)));

  statusEl.textContent = "";
  showNextBatch(grid, btn, statusEl);

  btn.addEventListener("click", async () => {
    if (isLoading) return;
    isLoading = true;
    btn.disabled = true;
    btn.textContent = "載入中...";

    await Promise.all(
      allArticles.slice(displayedCount, displayedCount + MAX_PER_LOAD).map(a => fetchArticleMeta(a))
    );

    showNextBatch(grid, btn, statusEl);
    isLoading = false;
  });
}

init();
