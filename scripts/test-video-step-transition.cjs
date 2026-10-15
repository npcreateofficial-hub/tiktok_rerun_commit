const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist');
const publishedSource = process.argv[2] || '';
const bridge = `
  const catalog=[{path:'/fixture/first.mp4',name:'first.mp4',mediaUrl:'/fixture/first.mp4'},
    {path:'/fixture/second.mp4',name:'second.mp4',mediaUrl:'/fixture/second.mp4'}];
  const schedules={};
  window.rerun=new Proxy({
    getLicenseStatus:async()=>({licensed:true,packageActive:true,username:'fixture',displayName:'fixture',channelLimit:5,videoLimit:5}),
    getAppInfo:async()=>({version:'fixture',ffmpegReady:true,maxConcurrentStreams:5}),
    getStreamStatus:async()=>({state:'idle'}),
    getTikTokStatus:async()=>({connected:true,streamerReady:true}),
    listLibrary:async()=>catalog,
    listSales:async()=>({records:[],batches:[]}),
    probeClips:async(paths)=>paths.map(path=>({path,label:'1080 x 1920'})),
    getStreamSchedule:async(id)=>schedules[id]||{},
    setStreamSchedule:async(id,value)=>(schedules[id]={...value}),
    saveStreamConfig:async()=>({ok:true}),
  },{get(target,key){if(key in target)return target[key];
    if(String(key).startsWith('on'))return()=>()=>{};
    if(String(key).startsWith('list')||key==='getAnnouncements')return async()=>[];
    return async()=>({});}});
`;

async function run(width, height) {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 650, hasTouch: width < 650 });
    if (publishedSource) {
      const response = await context.request.get(publishedSource);
      assert.ok(response.ok(), 'Published site must respond');
    }
    await context.addInitScript(() => {
      if (localStorage.getItem('np.active.username')) return;
      localStorage.setItem('np.active.username', 'fixture');
      localStorage.setItem('np.reset.work-data.20261008', 'done');
      const accounts = [{ id: 'main', alias: 'Primary', connected: true, step: 2, maxStep: 2, videoList: [],
        texts: [{ id: 'preserve', text: 'Keep this overlay', x: 0, y: 0, fontSize: 32, opacity: 1 }], bitrate: 4500 },
        { id: 'other', alias: 'Other', connected: true, step: 1, maxStep: 1, videoList: [] }];
      localStorage.setItem('rerun.accounts', JSON.stringify(accounts));
      localStorage.setItem('rerun.accounts.user.fixture', JSON.stringify(accounts));
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://studio.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/web-bridge.js') return route.fulfill({ contentType: 'application/javascript', body: bridge });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { records: [], batches: [], users: [], jobs: [] } });
      if (url.pathname.startsWith('/fixture/')) return route.fulfill({ status: 404 });
      // Load published UI assets, but keep all account and API actions in the fixture.
      if (publishedSource) {
        const response = await context.request.get(new URL(url.pathname + url.search, publishedSource).href);
        return route.fulfill({ status: response.status(), contentType: response.headers()['content-type'], body: await response.body() });
      }
      const file = path.join(dist, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return route.fulfill({ contentType: mime[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto('http://studio.test/');
    await page.locator('.app-shell').waitFor();
    await page.getByRole('button', { name: 'บัญชีไลฟ์', exact: true }).last().click();
    await page.locator('[data-pick-main]').waitFor({ timeout: 8000 }).catch(async error => {
      console.error(await page.evaluate(() => ({ text: document.body.innerText.slice(-4000), accounts: localStorage.getItem('rerun.accounts') })));
      console.error(errors);
      throw error;
    });
    assert.equal(await page.locator('.step').nth(2).isDisabled(), true, 'No video must keep step 3 locked');
    await page.locator('[data-pick-main]').click();
    await page.locator('[data-select-video]').first().click();
    await page.locator('[data-main-video][data-rendered-path="/fixture/first.mp4"]').waitFor();
    await page.waitForFunction(() => !document.querySelectorAll('.step')[2].disabled, null, { timeout: 5000 });
    await page.locator('.step').nth(2).click();
    await page.locator('.portrait-stage > video').waitFor();
    assert.ok((await page.locator('.portrait-stage > video').getAttribute('src')).includes('first.mp4'));
    const previewGeometry = await page.locator('.portrait-stage').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, ratio: rect.width / rect.height };
    });
    assert.ok(Math.abs(previewGeometry.ratio - 9 / 16) < 0.01,
      `Preview must keep 9:16 ratio, got ${previewGeometry.width}x${previewGeometry.height}`);
    assert.ok(previewGeometry.width > 0 && previewGeometry.height > 0);
    await page.locator('.step').nth(1).click();
    await page.locator('[data-pick-main]').click();
    await page.locator('[data-select-video]').nth(1).click();
    await page.locator('.wizard-footer .primary-button').click();
    await page.locator('.portrait-stage > video').waitFor();
    assert.ok((await page.locator('.portrait-stage > video').getAttribute('src')).includes('second.mp4'));
    const accounts = await page.evaluate(() => JSON.parse(localStorage.getItem('rerun.accounts')));
    assert.equal(accounts[0].texts[0].text, 'Keep this overlay');
    assert.equal(accounts[0].bitrate, 4500);
    assert.deepEqual(accounts[1].videoList, [], 'Other accounts must not receive the selected video');
    await page.locator('.step').nth(1).click();
    await page.locator('[data-remove-main]').click();
    await page.waitForFunction(() => document.querySelectorAll('.step')[2].disabled);
    assert.equal(await page.locator('.wizard-footer .primary-button').isDisabled(), true,
      'Removing the only video must lock Next again');
    await page.locator('[data-pick-main]').click();
    await page.locator('[data-select-video]').first().click();
    await page.locator('.wizard-footer .primary-button').click();
    await page.locator('.portrait-stage > video').waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'บัญชีไลฟ์', exact: true }).last().click();
    await page.locator('.portrait-stage > video').waitFor();
    assert.ok((await page.locator('.portrait-stage > video').getAttribute('src')).includes('first.mp4'),
      'Selected video and step 3 must survive refresh');
    await page.screenshot({ path: path.join(root, `video-step-transition-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}x${height}: select, step 3, replace, Next, remove/reselect, refresh, overlay preservation, account isolation.`);
  } finally { await browser.close(); }
}

(async () => { await run(390, 844); await run(320, 740); await run(1440, 1000); })().catch(error => { console.error(error); process.exitCode = 1; });
