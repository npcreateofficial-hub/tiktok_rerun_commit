const fs = require('fs');
const path = require('path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist/index.html');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(root, 'mobile-dashboard-stat-strip-check.png');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const mobileContract = indexHtml.match(/<style id="mobile-nav-contract">([\s\S]*?)<\/style>/)?.[1] || '';
const portalStyle = indexHtml.match(/<style id="mobile-nav-portal">([\s\S]*?)<\/style>/)?.[1] || '';
const finalStyle = indexHtml.match(/<style id="mobile-dashboard-stat-strip-final">([\s\S]*?)<\/style>/)?.[1] || '';

if (!finalStyle) throw new Error('mobile-dashboard-stat-strip-final style not found');

const stat = (trend, value, label, extra = '') => `
  <div class="stat-card ${extra}">
    <div class="stat-top">
      <div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/></svg></div>
      <span class="stat-trend flat">${trend}</span>
    </div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;

const fixture = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#090f18;color:#fff;font-family:Arial,"Noto Sans Thai",sans-serif}
    .app-shell{min-height:100vh}
    .dashboard{padding:10px}
    .dash-stats{display:grid;grid-template-columns:1fr;gap:14px}
    .stat-card{min-height:118px;padding:18px 20px;border-radius:14px;background:#121c2b;border:1px solid #26384f}
    .dash-grid{display:grid;gap:16px}
    .dash-panel{height:220px;border:1px solid #26384f;border-radius:14px}
    ${mobileContract}
    ${portalStyle}
    /* Simulate np-live-patch late desktop/tablet override that caused the bug. */
    @media(max-width:900px){
      .dashboard .dash-stats{grid-template-columns:1fr!important}
      .dashboard .stat-card{min-height:118px!important;padding:18px 20px!important}
    }
    ${finalStyle}
  </style>
</head>
<body class="np-mobile-nav-ready">
  <div class="app-shell">
    <main class="main-area">
      <section class="dashboard">
        <section class="dash-stats">
          ${stat('ทุกช่อง', '0 THB', 'ยอดขายรวมจาก CSV · 0 ออร์เดอร์', 'highlight')}
          ${stat('บัญชี', '1', 'บัญชีไลฟ์ทั้งหมด')}
          ${stat('ว่าง', '0/1', 'กำลังไลฟ์ตอนนี้')}
          ${stat('รวม', '20', 'ไลฟ์ทั้งหมดที่ผ่านมา')}
          ${stat('สะสม', '9:40:31', 'เวลาไลฟ์รวม')}
        </section>
        <section class="dash-grid"><div class="dash-panel"></div></section>
      </section>
    </main>
  </div>
</body>
</html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const result = await page.evaluate(() => {
    const stats = document.querySelector('.dash-stats');
    const cards = Array.from(document.querySelectorAll('.stat-card'));
    const statsRect = stats.getBoundingClientRect();
    return {
      statsColumns: getComputedStyle(stats).gridTemplateColumns,
      statsRect: { x: Math.round(statsRect.x), y: Math.round(statsRect.y), w: Math.round(statsRect.width), h: Math.round(statsRect.height) },
      cardRects: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
      }),
      labels: cards.map((card) => card.innerText.replace(/\s+/g, ' ').trim())
    };
  });
  await context.close();
  await browser.close();
  const oneRow = result.cardRects.length === 5 && new Set(result.cardRects.map((rect) => rect.y)).size === 1;
  const compact = result.cardRects.every((rect) => rect.h <= 60 && rect.w >= 68);
  if (!oneRow || !compact) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error('mobile dashboard stat strip is not a compact 5-card row');
  }
  console.log(JSON.stringify({ ...result, screenshotPath }, null, 2));
})();
