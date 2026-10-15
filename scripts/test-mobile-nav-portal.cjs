const fs = require('fs');
const path = require('path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist/index.html');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(root, 'mobile-nav-portal-check.png');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const style = indexHtml.match(/<style id="mobile-nav-portal">([\s\S]*?)<\/style>/)?.[1];
const script = indexHtml.match(/<script id="mobile-nav-portal-script">([\s\S]*?)<\/script>/)?.[1];

if (!style || !script) {
  throw new Error('mobile-nav-portal style/script not found in index.html');
}

const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/></svg>';
const fixture = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body{margin:0;background:#101820;color:#fff;font-family:Arial,sans-serif}
    .app-shell{min-height:100vh;padding:0}
    .sidebar nav,.sidebar-bottom{display:grid;gap:8px}
    button{font:inherit}
    ${style}
  </style>
  <script>${script}</script>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <nav>
        <button class="active" type="button">${icon}<span>แดชบอร์ด</span></button>
        <button type="button">${icon}<span>บัญชีไลฟ์</span></button>
        <button type="button">${icon}<span>แพ็กเกจ</span></button>
        <button type="button">${icon}<span>คลังวิดีโอ</span></button>
        <button type="button">${icon}<span>สรุปไลฟ์ย้อนหลัง</span></button>
      </nav>
      <div class="sidebar-bottom">
        <button type="button">${icon}<span>ระบบ & ตั้งค่า</span></button>
        <button type="button">${icon}<span>จัดการผู้ใช้</span></button>
        <button type="button">${icon}<span>ออกจากระบบ</span></button>
      </div>
    </aside>
    <main style="height:1200px"></main>
  </div>
</body>
</html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  page.on('console', (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.stack || error.message}`));
  await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
  await page.waitForFunction(() => {
    return document.querySelectorAll('#np-mobile-top-nav .np-mobile-nav-button').length === 3
      && document.querySelectorAll('#np-mobile-bottom-nav .np-mobile-nav-button').length === 5;
  }, null, { timeout: 3000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      readyState: document.readyState,
      mediaMatches: window.matchMedia("(max-width:650px)").matches,
      sidebarNav: !!document.querySelector("aside nav"),
      sidebarBottom: !!document.querySelector(".sidebar-bottom"),
      topBar: document.querySelectorAll("#np-mobile-top-nav .np-mobile-nav-button").length,
      bottomBar: document.querySelectorAll("#np-mobile-bottom-nav .np-mobile-nav-button").length,
      bodyClass: document.body.className,
      bodyText: document.body.innerText.slice(0, 500)
    }));
    console.error(JSON.stringify(debug, null, 2));
    throw error;
  });
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const mobile = await page.evaluate(() => {
    const labels = (selector) => Array.from(document.querySelectorAll(selector)).map((node) => node.textContent.trim());
    const boxes = (selector) => Array.from(document.querySelectorAll(selector)).map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
    });
    return {
      topLabels: labels('#np-mobile-top-nav .np-mobile-nav-label'),
      bottomLabels: labels('#np-mobile-bottom-nav .np-mobile-nav-label'),
      topBoxes: boxes('#np-mobile-top-nav .np-mobile-nav-button'),
      bottomBoxes: boxes('#np-mobile-bottom-nav .np-mobile-nav-button'),
      sidebarDisplay: getComputedStyle(document.querySelector('.sidebar')).display,
      originalNavDisplay: getComputedStyle(document.querySelector('.sidebar nav')).display,
      originalBottomDisplay: getComputedStyle(document.querySelector('.sidebar-bottom')).display
    };
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForTimeout(100);
  const desktop = await page.evaluate(() => ({
    portalTopExists: !!document.querySelector('#np-mobile-top-nav'),
    portalBottomExists: !!document.querySelector('#np-mobile-bottom-nav'),
    originalNavDisplay: getComputedStyle(document.querySelector('.sidebar nav')).display,
    originalBottomDisplay: getComputedStyle(document.querySelector('.sidebar-bottom')).display
  }));
  await context.close();
  await browser.close();
  if (mobile.sidebarDisplay !== 'none') {
    console.error(JSON.stringify({ mobile, desktop, screenshotPath }, null, 2));
    throw new Error('mobile sidebar shell should be hidden when portal nav is active');
  }
  console.log(JSON.stringify({ mobile, desktop, screenshotPath }, null, 2));
})();
