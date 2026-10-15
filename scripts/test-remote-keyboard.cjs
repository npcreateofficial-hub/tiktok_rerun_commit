const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../runtime/resources/app/node_modules/playwright-core');

const remoteSource = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : '';
const dist = path.resolve(__dirname, '..', !remoteSource && process.argv[2] ||
  '.codex-zip-restore-20261014/tiktok-live.np-main/runtime/resources/app/dist');

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    const assets = {};
    if (remoteSource) {
      // Fetch published assets only; all window/input calls remain in the fixture.
      const home = await context.request.get(remoteSource);
      assert.ok(home.ok(), 'Published site must respond');
    }
    for (const file of ['remote.html', 'remote.js']) {
      if (remoteSource) {
        const response = await context.request.get(new URL('/' + file, remoteSource).href);
        assert.ok(response.ok(), 'Published ' + file + ' must respond');
        assets[file] = await response.body();
      } else assets[file] = fs.readFileSync(path.join(dist, file));
    }
    assert.ok(assets['remote.html'].includes(Buffer.from('20261015-mobile-keyboard-delete')),
      'Remote HTML must load the updated keyboard version');
    // Use a local password fixture, never a real account or login submission.
    const target = await context.newPage();
    await target.setContent('<label>Password <input id="value" type="password"></label>');
    await target.locator('#value').focus();
    const frame = await target.screenshot();
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://remote.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/windows') {
        return route.fulfill({ json: [{ id: 1, title: 'Keyboard fixture', size: [390, 844] }] });
      }
      if (url.pathname === '/api/window/frame') {
        return route.fulfill({ contentType: 'image/png', body: frame });
      }
      if (url.pathname === '/api/window/diagnostics') {
        return route.fulfill({ json: { networkIssues: [] } });
      }
      if (url.pathname === '/api/window/input') {
        const payload = route.request().postDataJSON();
        requests.push(payload);
        if (payload.type === 'text') await target.keyboard.insertText(payload.text);
        if (payload.type === 'key') {
          const keys = { Left: 'ArrowLeft', Right: 'ArrowRight' };
          const mods = { control: 'Control', meta: 'Meta', shift: 'Shift', alt: 'Alt' };
          await target.keyboard.press([
            ...(payload.modifiers || []).map(mod => mods[mod]), keys[payload.key] || payload.key,
          ].join('+'));
        }
        return route.fulfill({ json: { ok: true } });
      }
      const file = url.pathname === '/' ? 'remote.html' : url.pathname.slice(1);
      if (!['remote.html', 'remote.js'].includes(file)) return route.fulfill({ status: 404 });
      return route.fulfill({
        contentType: file.endsWith('.js') ? 'application/javascript' : 'text/html',
        body: assets[file],
      });
    });
    await page.goto('http://remote.test/');
    await page.locator('#screen:not([hidden])').waitFor();
    await page.locator('#keyboard').focus();
    const flush = () => page.evaluate(() => inputQueue);
    const value = () => target.locator('#value').inputValue();
    async function input(text) {
      await page.keyboard.insertText(text);
      await flush();
    }
    async function mobileDelete(cancelable = true, forward = false) {
      await page.evaluate(({ cancelable, forward }) => {
        const el = document.querySelector('#keyboard');
        const inputType = forward ? 'deleteContentForward' : 'deleteContentBackward';
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', keyCode: 229, bubbles: true }));
        const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable });
        if (el.dispatchEvent(event)) {
          const start = el.selectionStart, end = el.selectionEnd;
          const from = start !== end || forward ? start : Math.max(0, start - 1);
          const to = start !== end || !forward ? end : Math.min(el.value.length, end + 1);
          // An empty textarea gives Android nothing to delete and may emit no input event.
          if (from !== to) {
            el.setRangeText('', from, to, 'end');
            el.dispatchEvent(new InputEvent('input', { inputType, bubbles: true }));
          }
        }
      }, { cancelable, forward });
      await flush();
    }

    await input('123456');
    for (let i = 0; i < 6; i++) await mobileDelete();
    assert.equal(await value(), '', 'Android backspace must delete all six characters');
    await mobileDelete();
    await input('78');
    assert.equal(await value(), '78', 'Typing after clearing must still work');
    await mobileDelete(false);
    assert.equal(await value(), '7', 'Non-cancelable mobile deletion must be forwarded once');
    await page.keyboard.press('Backspace');
    await flush();
    assert.equal(await value(), '', 'Physical backspace must delete exactly once');

    await input('abcd');
    await page.keyboard.press('ArrowLeft');
    await mobileDelete(true, true);
    assert.equal(await value(), 'abc', 'Mobile forward delete must preserve the caret');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await flush();
    assert.equal(await value(), '', 'Select all and backspace must clear the remote field');

    await page.evaluate(() => {
      const el = document.querySelector('#keyboard');
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      el.value += '\u0e01';
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
      el.value += '\u0e32';
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
    });
    await flush();
    assert.equal(await value(), '', 'Uncommitted Thai composition must not be sent');
    await page.evaluate(() => {
      const el = document.querySelector('#keyboard');
      el.dispatchEvent(new CompositionEvent('compositionend', { data: '\u0e01\u0e32', bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: '\u0e01\u0e32', bubbles: true }));
    });
    await flush();
    assert.equal(await value(), '\u0e01\u0e32', 'Thai composition must be committed exactly once');
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', 'paste');
      document.querySelector('#keyboard').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await flush();
    assert.equal(await value(), '\u0e01\u0e32paste', 'Pasted text must be sent exactly once');
    assert.ok(requests.every(item => !item.text?.includes('\u200b')), 'Keyboard sentinel must never reach the remote field');
    assert.deepEqual(errors, []);
    console.log('PASS: Android repeat delete, input fallback, physical keys, forward delete, clear, retype, Thai composition, paste.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
