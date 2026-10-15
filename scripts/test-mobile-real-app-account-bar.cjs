const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(root, 'mobile-real-app-account-bar-check.png');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf'
};

function serveStatic() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const cleanPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (cleanPath === '/web-bridge.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end('delete window.rerun;');
      return;
    }
    const file = path.normalize(path.join(dist, cleanPath));
    if (!file.startsWith(dist)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(file, (error, content) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(content);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const server = await serveStatic();
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.stack || error.message}`));

  await page.goto(`http://127.0.0.1:${port}/?v=real-app-account-bar`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#np-mobile-bottom-nav .np-mobile-nav-button:nth-child(2)', { timeout: 8000 });
  await page.click('#np-mobile-bottom-nav .np-mobile-nav-button:nth-child(2)');
  await page.waitForFunction(() => {
    const bar = document.querySelector('.accounts-bar');
    const chip = document.querySelector('.accounts-bar .account-chip');
    const add = document.querySelector('.accounts-bar .account-add');
    if (!bar || !chip || !add) return false;
    return getComputedStyle(bar).display !== 'none'
      && getComputedStyle(chip).display !== 'none'
      && getComputedStyle(add).display !== 'none';
  }, null, { timeout: 8000 });
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = await page.evaluate(() => {
    const rectOf = (selector) => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), right: Math.round(rect.right) };
    };
    return {
      bodyClass: document.body.className,
      accountsDisplay: getComputedStyle(document.querySelector('.accounts-bar')).display,
      accountChipDisplay: getComputedStyle(document.querySelector('.accounts-bar .account-chip')).display,
      accountAddDisplay: getComputedStyle(document.querySelector('.accounts-bar .account-add')).display,
      accountBarStyle: document.querySelector('.accounts-bar').getAttribute('style') || '',
      accounts: rectOf('.accounts-bar'),
      chip: rectOf('.accounts-bar .account-chip'),
      add: rectOf('.accounts-bar .account-add'),
      stepper: rectOf('.stepper'),
      bottomActive: document.querySelector('#np-mobile-bottom-nav .np-mobile-nav-button.is-active')?.textContent?.trim() || ''
    };
  });

  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  const bad = result.accountsDisplay === 'none'
    || result.accountChipDisplay === 'none'
    || result.accountAddDisplay === 'none'
    || result.accounts.h < 40
    || result.chip.w < 100
    || result.add.w < 100
    || result.stepper.y <= result.accounts.y;
  if (bad) {
    console.error(JSON.stringify({ result, screenshotPath }, null, 2));
    throw new Error('real mobile app account bar is not visible');
  }
  console.log(JSON.stringify({ result, screenshotPath }, null, 2));
})();
