const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const patchPath = path.join(root, 'runtime/resources/app/dist/np-live-patch.js');
const screenshotPath = path.join(root, 'tmp-library-layout-test.png');
const fixturePath = path.join(root, 'tmp-library-layout-fixture.html');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <style>
    :root{--np-line:rgba(126,164,218,.24)}
    body{margin:0;background:#050b14;color:#fff;font-family:Arial,sans-serif}
    .app-shell{display:grid;grid-template-columns:200px 1fr;min-height:100vh}
    .sidebar{background:#07121f;padding:20px 12px}
    .sidebar button{display:block;width:100%;margin:8px 0;padding:12px;border:1px solid #21466e;background:#071625;color:#fff;border-radius:10px}
    .sidebar button.active{background:#1478ef}
    .main-area{padding:30px}
    .settings-page{max-width:1660px}
    .page-intro{padding:20px 0;border-bottom:1px solid #22324a}
    .page-intro h1{margin:0 0 4px;font-size:26px}
    .primary-button{background:#2388ff;color:#fff;border:0;border-radius:10px;padding:10px 18px}
    .placeholder-page{padding:80px;text-align:center;color:#aebdd3}
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <nav>
        <button><span>แดชบอร์ด</span></button>
        <button><span>บัญชีไลฟ์</span></button>
        <button class="active"><span>คลังวิดีโอ</span></button>
      </nav>
    </aside>
    <main class="main-area">
      <section class="settings-page library-page">
        <section class="page-intro library-hero">
          <div>
            <p class="eyebrow">แหล่งวิดีโอ</p>
            <h1>คลังวิดีโอ</h1>
            <p>วิดีโอที่เคยเลือกจะถูกนำไว้ที่นี่ เพื่อหยิบกลับมาใช้ได้เร็วขึ้น</p>
          </div>
          <button class="primary-button" type="button">+ เพิ่มวิดีโอ</button>
        </section>
        <div class="placeholder-page inline">ยังไม่มีวิดีโอในคลัง</div>
      </section>
    </main>
  </div>
  <script>
    localStorage.setItem('np.active.username', 'test01');
    localStorage.setItem('np.pendingLibraryUploads', JSON.stringify([{
      uploadToken: 'old-stuck-upload',
      name: 'รีรันจงเจริญ7.mp4',
      size: 221954469,
      progress: 30,
      updatedAt: Date.now() - 60 * 60 * 1000
    }]));
    window.fetch = async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({
        currentPackage: { name: 'NP-PRO', videoLimit: 3, clipSizeGb: 2, durationDays: 30 }
      })
    });
    window.__removedIds = [];
    window.rerun = {
      listLibrary: async () => ([
        {
          id: 'video-0922',
          name: '0922',
          size: 385491872,
          addedAt: new Date('2026-10-08T17:03:12+07:00').getTime(),
          mediaUrl: 'data:video/mp4;base64,'
        },
        {
          id: 'video-rerun',
          name: 'รีรันจงเจริญ7',
          size: 221954469,
          addedAt: new Date('2026-10-09T09:31:03+07:00').getTime(),
          mediaUrl: 'data:video/mp4;base64,'
        }
      ]),
      removeLibrary: async (id) => {
        window.__removedIds.push(id);
        return window.rerun.listLibrary();
      },
      getLicenseStatus: async () => ({ username: 'test01' })
    };
  </script>
</body>
</html>`;

(async () => {
  fs.writeFileSync(fixturePath, html, 'utf8');
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
  page.on('pageerror', (error) => console.error(`[pageerror] ${error.stack || error.message}`));
  await page.goto(pathToFileURL(fixturePath).href, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: patchPath });
  await page.evaluate(() => window.dispatchEvent(new Event('DOMContentLoaded')));
  await page.waitForFunction(() => document.querySelectorAll('.library-card').length === 2, null, { timeout: 5000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      body: document.body.innerText.slice(0, 1200),
      cards: document.querySelectorAll('.library-card').length,
      grid: !!document.querySelector('.library-grid'),
      page: !!document.querySelector('.settings-page.library-page'),
      toolbar: !!document.querySelector('[data-np-library-toolbar]'),
      storage: !!document.querySelector('[data-np-storage-package]'),
    }));
    console.error(JSON.stringify(debug, null, 2));
    throw error;
  });
  await page.waitForTimeout(600);
  await page.click('[data-remove-library="video-0922"]');
  await page.waitForSelector('.np-library-confirm-backdrop', { timeout: 3000 });
  const deleteBeforeConfirm = await page.evaluate(() => window.__removedIds.length);
  await page.click('.np-library-confirm-cancel');
  await page.waitForSelector('.np-library-confirm-backdrop', { state: 'detached', timeout: 3000 });
  await page.click('[data-remove-library="video-0922"]');
  await page.waitForSelector('.np-library-confirm-backdrop', { timeout: 3000 });
  await page.click('.np-library-confirm-delete');
  await page.waitForFunction(() => window.__removedIds.includes('video-0922'), null, { timeout: 3000 });
  const result = await page.evaluate(() => {
    const intro = document.querySelector('.page-intro.library-hero');
    const strip = document.querySelector('[data-np-storage-package]');
    const toolbar = document.querySelector('[data-np-library-toolbar]');
    const grid = document.querySelector('.library-grid');
    const cards = Array.from(document.querySelectorAll('.library-card'));
    const pendingCards = Array.from(document.querySelectorAll('.np-library-pending-card'));
    const stripBeforeToolbar = !!(strip && toolbar && !!(strip.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING));
    const toolbarBeforeGrid = !!(toolbar && grid && !!(toolbar.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      introDisplay: intro ? getComputedStyle(intro).display : null,
      packageText: strip ? strip.textContent.replace(/\\s+/g, ' ').trim() : '',
      cards: cards.map((card) => card.querySelector('strong')?.textContent?.trim()),
      pendingCount: pendingCards.length,
      deleteBeforeConfirm: window.__removedIds.length ? undefined : 0,
      removedIds: window.__removedIds.slice(),
      stripBeforeToolbar,
      toolbarBeforeGrid
    };
  });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  const failures = [];
  if (result.introDisplay !== 'none') failures.push(`intro still visible: ${result.introDisplay}`);
  if (result.pendingCount !== 0) failures.push(`pending cards remain: ${result.pendingCount}`);
  if (result.cards.length !== 2) failures.push(`expected 2 cards, got ${result.cards.length}`);
  if (!result.cards.includes('0922') || !result.cards.includes('รีรันจงเจริญ7')) failures.push(`wrong card names: ${result.cards.join(', ')}`);
  if (!result.packageText.includes('2 / 3 ไฟล์')) failures.push(`quota text not updated: ${result.packageText}`);
  if (deleteBeforeConfirm !== 0) failures.push(`delete fired before confirm: ${deleteBeforeConfirm}`);
  if (!result.removedIds.includes('video-0922')) failures.push(`delete did not fire after confirm: ${result.removedIds.join(', ')}`);
  if (!result.stripBeforeToolbar) failures.push('package strip is not before toolbar');
  if (!result.toolbarBeforeGrid) failures.push('toolbar is not before grid');

  console.log(JSON.stringify({ ok: failures.length === 0, failures, result, screenshotPath }, null, 2));
  if (failures.length) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
