const fs = require('fs');
const path = require('path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist/index.html');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotPath = path.join(root, 'mobile-accounts-flow-check.png');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const accountsCss = indexHtml.match(/<style id="mobile-accounts-flow-final">([\s\S]*?)<\/style>/)?.[1] || '';
const accountsPolishCss = indexHtml.match(/<style id="mobile-accounts-polish-final">([\s\S]*?)<\/style>/)?.[1] || '';
if (!accountsCss) throw new Error('mobile-accounts-flow-final style not found');
if (!accountsPolishCss) throw new Error('mobile-accounts-polish-final style not found');

const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/></svg>';
const accountChips = Array.from({ length: 5 }, (_, index) => `
        <div class="account-chip ${index === 0 ? 'active' : ''}">
          <button class="account-chip-main" type="button">${icon}<span class="account-dot idle"></span><span class="account-chip-text"><strong>${index === 0 ? 'test' : `test${index + 1}`}</strong><small>พร้อมไลฟ์</small></span></button>
          <button class="account-chip-remove" type="button">${icon}</button>
        </div>`).join('');
const steps = ['เข้าสู่ระบบ', 'เลือกวิดีโอ', 'โอเวอร์เลย์', 'เชื่อม TikTok', 'พร้อมไลฟ์', 'กำลังไลฟ์']
  .map((label, index) => `
    <div class="step-wrap">
      <button class="step ${index === 4 ? 'active' : ''} ${index < 4 ? 'done' : ''}" type="button">
        <span class="step-number">${index < 4 ? '✓' : index + 1}</span>
        <span class="step-label">${label}</span>
      </button>
      ${index < 5 ? '<span class="step-line done"></span>' : ''}
    </div>`).join('');

const fixture = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#090f18;color:#fff;font-family:Arial,"Noto Sans Thai",sans-serif}
    .app-shell{min-height:100vh;padding-top:54px;padding-bottom:76px}
    .main-area{width:100%;min-height:100vh}
    .page-intro{padding:30px 40px}
    .accounts-bar{display:flex;gap:10px;margin:0 0 20px}
    .account-chip,.account-add{height:58px;min-width:158px;border:1px solid #31435f;border-radius:13px;background:#101c2d;color:#edf5ff}
    .account-chip{display:flex;overflow:hidden}
    .account-chip-main{display:flex;align-items:center;gap:10px;padding:10px 14px;background:transparent;border:0;color:inherit}
    .account-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b}
    .account-chip-text{display:flex;flex-direction:column;gap:2px}
    .account-chip-text strong{font-size:12px}.account-chip-text small{font-size:9px}
    .account-add{display:flex;align-items:center;justify-content:center;gap:6px}
    .wizard-area{padding:28px 38px 110px}
    .stepper{display:flex;max-width:1050px;margin:0 auto 28px}
    .step-wrap{flex:1;display:flex}.step-wrap:last-child{flex:0 0 74px}
    .step{width:74px;border:0;background:transparent;color:#9aaac1;display:flex;align-items:center;flex-direction:column;gap:7px}
    .step-number{width:32px;height:32px;border-radius:50%;background:#1f2933;display:grid;place-items:center}
    .step.active .step-number{background:#1e8cff;color:#fff}.step.done .step-number{background:#24b283;color:#fff}
    .step-label{font-size:11px;white-space:nowrap}
    .step-line{flex:1;height:2px;margin:15px 7px 0;background:#26344a}
    .ready-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:22px}
    .ready-hero{min-height:455px;padding:48px;border-radius:18px;background:#2448b2;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
    .ready-icon{width:68px;height:68px;display:grid;place-items:center;border-radius:21px;background:#2b8bff;margin-bottom:25px}
    .ready-hero h2{font-size:32px;margin:0}.ready-hero p{font-size:13px;line-height:1.6}.eyebrow{font-size:10px;color:#93c5fd}
    .primary-button{height:52px;border:0;border-radius:12px;background:#ffb515;color:#111;font-weight:900}
    .card{border:1px solid #26384f;border-radius:17px;background:#101927;padding:28px}
    .checklist h3{font-size:15px;margin:1px 0 12px}.checklist>div{min-height:67px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #26384f}
    .checklist span{display:flex;flex-direction:column;gap:3px;color:#9baac0;font-size:9px;min-width:0}.checklist strong{font-size:11px;color:#fff}
    ${accountsCss}
    ${accountsPolishCss}
  </style>
</head>
<body class="np-mobile-nav-ready">
  <div class="app-shell">
    <main class="main-area">
      <section class="page-intro"><h1>บัญชีไลฟ์</h1></section>
      <section class="accounts-bar">
${accountChips}
        <button class="account-add" type="button">${icon}<span>เพิ่มบัญชี</span></button>
      </section>
      <div class="wizard-area">
        <div class="stepper">${steps}</div>
        <div class="step-content">
          <section class="ready-grid">
            <div class="ready-hero">
              <div class="ready-icon">${icon}</div>
              <span class="eyebrow">ตรวจครบทุกขั้นตอน</span>
              <h2>พร้อมเริ่มไลฟ์</h2>
              <p>เมื่อกดเริ่ม ระบบจะสร้างห้อง TikTok และเชื่อม FFmpeg เข้ากับ RTMP ที่ได้รับทันที</p>
              <div class="error-banner">${icon}<span>TikTok ไม่ได้ยืนยันการส่งสตรีมแล้ว ไลฟ์อาจถูกจำกัดหรือไม่มี TikTok อนุญาต</span></div>
              <button class="primary-button" type="button">เริ่มไลฟ์ตอนนี้</button>
            </div>
            <div class="checklist card">
              <h3>สรุปการตั้งค่า</h3>
              <div>${icon}<span>บัญชี<strong>test</strong></span>${icon}</div>
              <div>${icon}<span>วิดีโอ<strong>1004.mp4</strong></span>${icon}</div>
              <div>${icon}<span>Overlay<strong>0 layer</strong></span>${icon}</div>
              <div>${icon}<span>ปลายทาง<strong>TikTok Streamer Desktop · Auto</strong></span>${icon}</div>
              <div>${icon}<span>Bitrate<strong>6,000 kbps</strong></span>${icon}</div>
            </div>
          </section>
        </div>
      </div>
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
    const viewport = { w: window.innerWidth, h: window.innerHeight };
    const rectOf = (selector) => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), right: Math.round(rect.right) };
    };
    const all = Array.from(document.querySelectorAll('.accounts-bar,.stepper,.ready-grid,.ready-hero,.checklist'));
    return {
      viewport,
      accounts: rectOf('.accounts-bar'),
      stepper: rectOf('.stepper'),
      readyGrid: rectOf('.ready-grid'),
      readyHero: rectOf('.ready-hero'),
      checklist: rectOf('.checklist'),
      errorBanner: rectOf('.error-banner'),
      accountsDisplay: getComputedStyle(document.querySelector('.accounts-bar')).display,
      accountChipDisplay: getComputedStyle(document.querySelector('.account-chip')).display,
      accountAddDisplay: getComputedStyle(document.querySelector('.account-add')).display,
      accountChipCount: document.querySelectorAll('.accounts-bar .account-chip').length,
      accountsScrollWidth: document.querySelector('.accounts-bar').scrollWidth,
      accountRemoveDisplay: getComputedStyle(document.querySelector('.account-chip-remove')).display,
      accountMainIconDisplay: getComputedStyle(document.querySelector('.account-chip-main svg')).display,
      overflow: all.map((node) => {
        const rect = node.getBoundingClientRect();
        return { className: node.className, right: Math.round(rect.right), width: Math.round(rect.width), over: rect.right > window.innerWidth + 1 };
      }),
      stepLabels: Array.from(document.querySelectorAll('.step-label')).map((node) => getComputedStyle(node, ':after').content)
    };
  });
  await context.close();
  await browser.close();
  const hasOverflow = result.overflow.some((item) => item.over) || result.errorBanner.right > result.viewport.w + 1;
  const readyStacked = result.checklist.y > result.readyHero.y;
  if (
    hasOverflow ||
    !readyStacked ||
    result.stepLabels.length !== 6 ||
    result.accountsDisplay === 'none' ||
    result.accountChipDisplay === 'none' ||
    result.accountAddDisplay === 'none' ||
    result.accountChipCount !== 5 ||
    result.accounts.h > 52 ||
    result.accountsScrollWidth <= result.accounts.w ||
    result.accountRemoveDisplay !== 'none' ||
    result.accountMainIconDisplay !== 'none'
  ) {
    console.error(JSON.stringify(result, null, 2));
    throw new Error('mobile accounts flow failed layout checks');
  }
  console.log(JSON.stringify({ ...result, screenshotPath }, null, 2));
})();
