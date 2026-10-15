const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(root, 'mobile-real-app-step2-check.png');

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
      res.end(`
        window.rerun = {
          licenseLogin: async () => ({ licensed: true, displayName: 'Preview', plan: 'preview' }),
          getLicenseStatus: async () => ({ licensed: true, displayName: 'Preview', plan: 'preview' }),
          licenseLogout: async () => ({ licensed: false }),
          getAnnouncements: async () => [],
          getUpdateStatus: async () => ({ state: 'none' }),
          checkForUpdate: async () => ({ state: 'none' }),
          installUpdate: async () => {},
          getUpdateConfig: async () => ({ autoUpdate: true }),
          setUpdateConfig: async (_config) => _config,
          onUpdateStatus: () => () => {},
          getAppInfo: async () => ({ version: '0.1.0-preview', ffmpegReady: true, maxConcurrentStreams: 5 }),
          onStreamStatus: () => () => {},
          onChatEvent: () => () => {},
          onStreamHealth: () => () => {},
          getStreamStatus: async () => ({ state: 'idle', message: 'พร้อมใช้งาน' }),
          getTikTokStatus: async () => ({ connected: true, streamerReady: true }),
          getChatConfig: async () => ({ enabled: false, rules: [], ai: {}, replyCooldownMs: 4000, perUserCooldownMs: 8000 }),
          setChatConfig: async (_id, config) => config,
          getPinConfig: async () => ({ enabled: false, intervalMinutes: 5, includeCoupon: false, products: [] }),
          setPinConfig: async (_id, config) => config,
          loginTikTok: async () => ({ saved: true, streamerReady: true }),
          logoutTikTok: async () => ({ signedOut: true }),
          openTikTok: async () => {},
          openTikTokShop: async () => {},
          chooseVideo: async () => ({ path: 'D:\\\\videos\\\\1004.mp4', name: '1004.mp4', mediaUrl: 'data:video/mp4;base64,' }),
          probeClips: async (paths) => paths.map((path) => ({ path, label: '1080 x 1920' })),
          chooseOverlay: async () => null,
          startStream: async () => ({ state: 'error', message: 'preview' }),
          stopStream: async () => ({ state: 'idle', message: 'หยุดไลฟ์แล้ว' }),
          applyStreamConfig: async () => ({ applied: false, clipsChanged: false }),
          saveStreamConfig: async () => ({ ok: true }),
          clearStreamConfig: async () => ({ ok: true }),
          getLiveStats: async () => ({ ok: false, gmv: null, itemsSold: null, viewers: null, productClicks: null }),
          scanLiveConsole: async () => ({ ok: false, links: [], pins: [], metrics: [], products: [], counts: {} }),
          listPinProducts: async () => ({ ok: false, products: [] }),
          pinProductNow: async () => ({ ok: false }),
          couponAction: async () => ({ ok: false }),
          runBenchmark: async () => ({ hardwareEncoder: null, softwareSpeed: 0, hardwareSpeed: 0, effectiveSpeed: 0, maxStreams: 2 }),
          getLineConfig: async () => ({}),
          setLineConfig: async (config) => config,
          testLine: async () => ({ ok: false }),
          pushLineStatus: async () => ({ ok: false }),
          listLibrary: async () => [{ path: 'D:\\\\videos\\\\1004.mp4', name: '1004.mp4', mediaUrl: 'data:video/mp4;base64,' }],
          addLibrary: async () => [],
          removeLibrary: async () => [],
          listHistory: async () => [],
          clearHistory: async () => [],
          chooseSalesFile: async () => null,
          previewSales: async () => ({ rows: [] }),
          commitSales: async () => ({ imported: 0, duplicates: 0, excluded: 0, total: 0, accountId: '' }),
          listSales: async () => ({ records: [], batches: [] }),
          removeSalesBatch: async () => ({ records: [], batches: [] }),
          onHistoryChanged: () => () => {},
          openExternal: async () => ({ opened: false }),
          adminUnlock: async () => ({ ok: true, dev: true, unlocked: true }),
          adminStatus: async () => ({ unlocked: true, dev: true }),
          adminLock: async () => ({ ok: true }),
          adminIssueKey: async () => ({ ok: false }),
          adminLookupUser: async () => ({ ok: false }),
          adminRevokeUser: async () => ({ ok: true, users: [] }),
          adminListKeys: async () => ({ ok: true, users: [] })
        };
        window.rerun = new Proxy(window.rerun, {
          get(target, prop) {
            if (prop in target) return target[prop];
            if (String(prop).startsWith('on')) return () => () => {};
            if (String(prop).startsWith('get')) return async () => ({});
            if (String(prop).startsWith('list')) return async () => [];
            return async () => ({ ok: true });
          }
        });
      `);
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

  await page.goto(`http://127.0.0.1:${port}/?v=real-app-step2`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"></path></svg>';
    const bodyStyles = Array.from(document.body.querySelectorAll('style')).map((node) => node.outerHTML).join('\n');
    document.body.className = 'np-mobile-nav-ready';
    document.body.innerHTML = `
      ${bodyStyles}
      <main class="main-area">
        <section class="accounts-bar">
          <div class="account-chip active"><button class="account-chip-main" type="button"><span class="account-dot idle"></span><span class="account-chip-text"><strong>test</strong><small>พร้อมไลฟ์</small></span></button><button class="account-chip-remove" type="button">${icon}</button></div>
          <button class="account-add" type="button">${icon}<span>เพิ่มบัญชี</span></button>
        </section>
        <div class="wizard-area">
          <div class="stepper">
            ${['เข้าสู่ระบบ', 'เลือกวิดีโอ', 'โอเวอร์เลย์', 'เชื่อม TikTok', 'พร้อมไลฟ์', 'กำลังไลฟ์'].map((label, index) => `
              <div class="step-wrap">
                <button class="step ${index === 1 ? 'active' : ''} ${index < 1 ? 'done' : ''}" type="button"><span class="step-number">${index + 1}</span><span class="step-label">${label}</span></button>
                ${index < 5 ? '<span class="step-line"></span>' : ''}
              </div>`).join('')}
          </div>
          <div class="step-content"></div>
        </div>
      </main>
      <nav id="np-mobile-bottom-nav"></nav>
    `;
    const host = document.querySelector('.step-content');
    if (!host) throw new Error('step content not found');
    host.innerHTML = `
      <section class="card np-live-video-card-patched">
        <div class="card-heading compact">
          <div>
            <span class="eyebrow">แหล่งวิดีโอ</span>
            <h2>เลือกวิดีโอที่จะเล่นซ้ำ</h2>
            <p>รองรับ MP4, MOV, MKV และ WebM</p>
          </div>
        </div>
        <div class="np-live-main-video" data-main-video="true" data-rendered-path="D:\\videos\\1004.mp4">
          <div class="np-live-main-frame">
            <div class="np-live-main-inner">
              <button class="np-live-main-delete" type="button" data-remove-main>×</button>
              <video src="data:video/mp4;base64," muted playsinline data-np-media-path="D:\\videos\\1004.mp4"></video>
            </div>
          </div>
          <button class="np-live-queue-pick" type="button" data-pick-main>เลือกวิดีโอหลัก</button>
        </div>
        <section class="np-live-extra-card np-live-video-queue">
          <div class="card-heading">
            <div><h2>วิดีโอถัดไป</h2></div>
            <div class="np-live-queue-head-actions">
              <span class="np-live-queue-count" data-queue-count>ยังไม่มีวิดีโอถัดไป</span>
              <button class="ghost-button" type="button" data-add-queue>+ เพิ่มวิดีโอ</button>
            </div>
          </div>
          <div class="np-live-queue-grid"><div class="np-live-queue-table" data-queue-list></div></div>
        </section>
        <section class="card np-live-extra-card np-live-schedule-card">
          <div class="card-heading">
            <div><h2>ขึ้น–ลงไลฟ์สดอัตโนมัติ</h2></div>
            <button class="toggle on" type="button" role="switch" aria-checked="true" data-enabled><span></span></button>
          </div>
          <div class="np-live-schedule-grid">
            <label class="np-live-number"><span>ลงไลฟ์สดหลังจาก (ชม.)</span><input class="text-input mono" value="23"></label>
            <label class="np-live-number"><span>นาที</span><input class="text-input mono" value="20"></label>
            <label class="np-live-number"><span>รอก่อนขึ้นใหม่ (นาที)</span><input class="text-input mono" value="60"></label>
          </div>
          <div class="np-live-status"><span>สถานะ</span><strong data-status>บันทึกแล้ว</strong></div>
        </section>
        <div class="video-list">
          <div class="video-list-item">
            <video src="data:video/mp4;base64," muted playsinline data-np-media-path="D:\\videos\\1004.mp4"></video>
            <div class="file-copy"><span class="file-badge">คลิป 1</span><strong>1004.mp4</strong><small>1080 x 1920</small></div>
            <div class="layer-tools"><button class="icon-button">${icon}</button><button class="icon-button">${icon}</button><button class="icon-button danger">${icon}</button></div>
          </div>
        </div>
        <button class="dropzone has-file" type="button">
          <video src="data:video/mp4;base64," muted playsinline data-np-media-path="D:\\videos\\1004.mp4"></video>
          <div class="file-copy"><strong>1004.mp4</strong><small>1080 x 1920</small></div>
        </button>
      </section>
    `;
  });
  await page.waitForSelector('.np-live-video-card-patched [data-main-video]', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = await page.evaluate(() => {
    const rectOf = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom)
      };
    };
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const selectors = [
      '.accounts-bar',
      '.stepper',
      '.np-live-video-card-patched',
      '[data-main-video]',
      '.np-live-main-frame',
      '.np-live-main-video .np-live-queue-pick',
      '.np-live-video-queue',
      '.np-live-schedule-card',
      '.np-live-schedule-grid',
      '#np-mobile-bottom-nav'
    ];
    const rects = Object.fromEntries(selectors.map((selector) => [selector, rectOf(selector)]));
    const overflow = selectors
      .map((selector) => ({ selector, rect: rectOf(selector) }))
      .filter((item) => item.rect && item.rect.right > viewport.w + 1);
    return {
      viewport,
      rects,
      overflow,
      activeStep: document.querySelector('.step.active')?.textContent?.trim() || '',
      mainGrid: getComputedStyle(document.querySelector('[data-main-video]')).gridTemplateColumns,
      queueActionGrid: getComputedStyle(document.querySelector('.np-live-queue-head-actions')).gridTemplateColumns,
      hiddenOriginalDropzone: getComputedStyle(document.querySelector('.np-live-video-card-patched > .dropzone')).display,
      bottomNavTop: rectOf('#np-mobile-bottom-nav')?.y || 0
    };
  });

  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  const mainFrame = result.rects['.np-live-main-frame'];
  const mainPanel = result.rects['[data-main-video]'];
  const pickButton = result.rects['.np-live-main-video .np-live-queue-pick'];
  const queue = result.rects['.np-live-video-queue'];
  const schedule = result.rects['.np-live-schedule-card'];
  const bottomTop = result.bottomNavTop;
  const bad = result.overflow.length > 0
    || !result.activeStep.includes('2')
    || !mainFrame
    || mainFrame.h > 220
    || !pickButton
    || pickButton.y <= mainFrame.bottom
    || Math.abs(pickButton.w - mainFrame.w) > 2
    || mainPanel.h > 260
    || !queue
    || queue.h > 120
    || !schedule
    || schedule.h > 165
    || schedule.bottom > bottomTop + 40
    || result.hiddenOriginalDropzone !== 'none';

  if (bad) {
    console.error(JSON.stringify({ result, screenshotPath }, null, 2));
    throw new Error('real mobile step 2 layout is not compact');
  }
  console.log(JSON.stringify({ result, screenshotPath }, null, 2));
})();
