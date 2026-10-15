const fs = require('fs');
const path = require('path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist/index.html');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const accountsCss = indexHtml.match(/<style id="mobile-accounts-flow-final">([\s\S]*?)<\/style>/)?.[1] || '';
const accountsPolishCss = indexHtml.match(/<style id="mobile-accounts-polish-final">([\s\S]*?)<\/style>/)?.[1] || '';
if (!accountsCss || !accountsPolishCss) throw new Error('mobile account CSS not found');

const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16v16H4z"/></svg>';
const stepLabels = ['เข้าสู่ระบบ', 'เลือกวิดีโอ', 'โอเวอร์เลย์', 'เชื่อม TikTok', 'พร้อมไลฟ์', 'กำลังไลฟ์'];
const steps = (current) => stepLabels.map((label, index) => `
  <div class="step-wrap">
    <button class="step ${index + 1 === current ? 'active' : ''} ${index + 1 < current ? 'done' : ''}" type="button">
      <span class="step-number">${index + 1 < current ? '✓' : index + 1}</span>
      <span class="step-label">${label}</span>
    </button>
    ${index < 5 ? '<span class="step-line done"></span>' : ''}
  </div>`).join('');

const stepContent = {
  1: `<section class="card login-card">
    <div class="card-heading"><div><span class="eyebrow">บัญชีปลายทาง</span><h2>TikTok พร้อมใช้งาน</h2><p>ระบบเก็บ browser session ไว้เฉพาะเครื่องนี้</p></div><div class="status-pill success"><span class="status-dot"></span>บันทึก session แล้ว</div></div>
    <label class="field-label">ชื่อบัญชีในแอป</label><input class="text-input" value="test">
    <div class="connected-panel"><div class="connected-icon">${icon}</div><div><strong>test</strong><span>Session ถูกแยกเก็บใน persistent profile ของ Electron</span></div><div class="connected-actions"><button class="soft-button">เปิด TikTok</button><button class="soft-button logout-button">ออกจากระบบ</button></div></div>
  </section>`,
  2: `<section class="card"><div class="card-heading compact"><div><span class="eyebrow">แหล่งวิดีโอ</span><h2>เลือกวิดีโอที่จะเล่นซ้ำ</h2><p>รองรับ MP4, MOV, MKV และ WebM</p></div></div>
    <div class="video-list"><div class="video-list-item"><video></video><div class="file-copy"><span class="file-badge">คลิป 1</span><strong>1004.mp4</strong><small>1080 x 1920</small></div><div class="layer-tools"><button class="icon-button">${icon}</button><button class="icon-button">${icon}</button><button class="icon-button danger">${icon}</button></div></div></div>
    <button class="dropzone has-file"><div class="drop-icon">${icon}</div><strong>เพิ่มวิดีโออีกคลิป</strong><span>วิดีโอจะยังอยู่ในเครื่องของคุณ</span></button>
    <div class="option-row"><div>${icon}<span><strong>เล่นวนอัตโนมัติ</strong><small>เริ่มใหม่โดยไม่ตัดสตรีม</small></span></div><span class="toggle on"><span></span></span></div>
  </section>`,
  3: `<section class="overlay-layout"><div class="preview-card"><div class="preview-title"><span>ตัวอย่าง 9:16</span><small>1080 x 1920</small></div><div class="portrait-stage"></div></div><div class="card overlay-controls"><div class="card-heading compact"><div><span class="eyebrow">ตัวจัดวาง</span><h2>จัดการ Overlay</h2><p>เพิ่มรูป นาฬิกา หรือข้อความ</p></div></div><div class="overlay-actions"><button class="outline-button">${icon} เพิ่มรูป</button><button class="outline-button">${icon} นาฬิกา</button><button class="outline-button">${icon} ข้อความ</button></div></div></section>`,
  4: `<section class="card"><div class="card-heading compact"><div><span class="eyebrow">ปลายทางสตรีม</span><h2>เชื่อม TikTok Streamer Desktop</h2><p>รับ RTMP URL และส่งต่ออัตโนมัติ</p></div></div><div class="mode-toggle"><button class="active">TikTok อัตโนมัติ</button><button>Manual RTMP</button></div><div class="tiktok-shop-destination"><strong>TikTok Shop LIVE Manager</strong><button class="outline-button">เปิด LIVE Manager</button></div><div class="quality-box"><div class="quality-title">${icon}<div><strong>คุณภาพการส่ง</strong><span>H.264 · 1080x1920</span></div></div><input type="range"></div></section>`,
  5: `<section class="ready-grid"><div class="ready-hero"><div class="ready-icon">${icon}</div><span class="eyebrow">ตรวจครบทุกขั้นตอน</span><h2>พร้อมเริ่มไลฟ์</h2><p>ระบบจะเชื่อมต่อ RTMP</p><div class="error-banner">${icon}<span>TikTok ไม่ได้ยืนยันการส่งสตรีมแล้ว ไลฟ์อาจถูกจำกัดหรือไม่มี TikTok อนุญาต</span></div><button class="primary-button">เริ่มไลฟ์ตอนนี้</button></div><div class="checklist card"><h3>สรุปการตั้งค่า</h3><div>${icon}<span>บัญชี<strong>test</strong></span>${icon}</div><div>${icon}<span>วิดีโอ<strong>1004.mp4</strong></span>${icon}</div><div>${icon}<span>ปลายทาง<strong>TikTok Streamer Desktop · Auto</strong></span>${icon}</div></div></section>`,
  6: `<section class="live-layout"><div class="live-preview"><video></video><div class="live-chip"><span></span>LIVE</div></div><div class="card live-panel"><div class="live-status-icon">${icon}</div><span class="eyebrow">สถานะ Pipeline</span><h2>กำลังไลฟ์อยู่</h2><div class="live-time">00:02:37</div><div class="health-row"><span>${icon}FFmpeg</span><strong>ทำงานปกติ</strong></div><button class="stop-button">หยุดไลฟ์</button></div><div class="card chat-live-panel"><div class="chat-live-head">${icon}<strong>แชทสด & การตอบกลับ</strong></div></div></section>`
};

const htmlFor = (current) => `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
*{box-sizing:border-box}body{margin:0;background:#090f18;color:#fff;font-family:Arial,"Noto Sans Thai",sans-serif}.app-shell{min-height:100vh;padding-top:54px;padding-bottom:76px}.main-area{width:100%}.accounts-bar{display:flex;gap:10px}.account-chip,.account-add{height:58px;min-width:158px;border:1px solid #31435f;border-radius:13px;background:#101c2d;color:#edf5ff}.account-chip{display:flex}.account-chip-main{display:flex;align-items:center;gap:10px;padding:10px 14px;background:transparent;border:0;color:inherit}.account-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b}.account-chip-text{display:flex;flex-direction:column}.account-add{display:flex;align-items:center;justify-content:center;gap:6px}.wizard-area{padding:28px 38px 110px}.stepper{display:flex}.step-wrap{flex:1;display:flex}.step-wrap:last-child{flex:0 0 74px}.step{width:74px;border:0;background:transparent;color:#9aaac1;display:flex;align-items:center;flex-direction:column;gap:7px}.step-number{width:32px;height:32px;border-radius:50%;background:#1f2933;display:grid;place-items:center}.step.active .step-number{background:#1e8cff;color:#fff}.step.done .step-number{background:#24b283;color:#fff}.step-label{font-size:11px}.step-line{flex:1;height:2px;margin:15px 7px 0;background:#26344a}.card{border:1px solid #26384f;border-radius:17px;background:#101927;padding:28px}.ready-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:22px}.ready-hero{min-height:455px;padding:48px;border-radius:18px;background:#2448b2;display:flex;flex-direction:column;justify-content:center}.ready-icon{width:68px;height:68px}.checklist>div{min-height:67px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #26384f}.preview-card{border:1px solid #26384f;border-radius:17px;padding:16px}.portrait-stage{width:315px;aspect-ratio:9/16;background:#234}.live-layout{display:grid;grid-template-columns:.84fr 1.16fr;gap:22px}.live-preview{min-height:530px;border-radius:18px;background:#325ba4}.health-row,.option-row{display:flex;justify-content:space-between}.dropzone{width:100%;min-height:270px}.video-list-item{display:flex}.video-list-item video{width:122px;height:210px}.overlay-layout{display:grid;grid-template-columns:minmax(310px,.86fr) minmax(400px,1.14fr);gap:22px}.mode-toggle{display:flex}.mode-toggle button{flex:1}.primary-button,.outline-button,.soft-button,.stop-button{border-radius:10px}
${accountsCss}
${accountsPolishCss}
</style></head><body class="np-mobile-nav-ready"><div class="app-shell"><main class="main-area"><section class="accounts-bar"><div class="account-chip active"><button class="account-chip-main">${icon}<span class="account-dot idle"></span><span class="account-chip-text"><strong>test</strong><small>พร้อมไลฟ์</small></span></button><button class="account-chip-remove" type="button">${icon}</button></div><button class="account-add">${icon}<span>เพิ่มบัญชี</span></button></section><div class="wizard-area"><div class="stepper">${steps(current)}</div><div class="step-content">${stepContent[current]}</div></div></main></div></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const results = [];
  for (let current = 1; current <= 6; current += 1) {
    await page.setContent(htmlFor(current), { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate((step) => {
      const nodes = Array.from(document.querySelectorAll('.accounts-bar,.stepper,.step-content,.card,.ready-grid,.ready-hero,.checklist,.overlay-layout,.preview-card,.live-layout,.live-preview,.video-list-item,.dropzone'));
      const overflow = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { className: node.className, right: Math.round(rect.right), width: Math.round(rect.width), over: rect.right > window.innerWidth + 1 };
      }).filter((item) => item.over);
      return {
        step,
        overflowCount: overflow.length,
        overflow,
        accountsDisplay: getComputedStyle(document.querySelector('.accounts-bar')).display,
        accountChipDisplay: getComputedStyle(document.querySelector('.account-chip')).display,
        accountAddDisplay: getComputedStyle(document.querySelector('.account-add')).display,
        accountRemoveDisplay: getComputedStyle(document.querySelector('.account-chip-remove')).display,
        accountMainIconDisplay: getComputedStyle(document.querySelector('.account-chip-main svg')).display
      };
    }, current);
    results.push(result);
  }
  await context.close();
  await browser.close();
  const failures = results.filter((item) =>
    item.overflowCount ||
    item.accountsDisplay === 'none' ||
    item.accountChipDisplay === 'none' ||
    item.accountAddDisplay === 'none' ||
    item.accountRemoveDisplay !== 'none' ||
    item.accountMainIconDisplay !== 'none'
  );
  if (failures.length) {
    console.error(JSON.stringify(results, null, 2));
    throw new Error('one or more mobile account steps overflow');
  }
  console.log(JSON.stringify(results, null, 2));
})();
