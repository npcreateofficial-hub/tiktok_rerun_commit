const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const productId = process.argv[3] || '1732677488117515405';
const url = process.argv[4] || `https://shop.tiktok.com/view/product/${productId}`;
const out = process.argv[5] || path.join(__dirname, `tiktok-product-state-${productId}-${Date.now()}.json`);

function httpJson(route, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path: route, method, timeout: 5000}, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('timeout')));
    req.end();
  });
}

function send(ws, id, method, params = {}) {
  ws.send(JSON.stringify({id, method, params}));
}

(async () => {
  const created = await httpJson(`/json/new?${encodeURIComponent(url)}`, 'PUT');
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let nextId = 1;
  let evalId = 0;
  ws.on('open', () => {
    send(ws, nextId++, 'Page.enable');
    send(ws, nextId++, 'Runtime.enable');
    send(ws, nextId++, 'Page.navigate', {url});
    setTimeout(() => {
      evalId = nextId++;
      send(ws, evalId, 'Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async () => {
          await new Promise((resolve) => setTimeout(resolve, 7000));
          const text = document.body ? document.body.innerText : '';
          const scripts = [...document.scripts].map((script) => script.textContent || '').filter(Boolean);
          const interestingScripts = scripts
            .filter((script) => /${productId}|sku|sale_prop|spec|description|productInfo|product_detail/i.test(script))
            .map((script) => script.slice(0, 200000));
          const globals = {};
          for (const key of Object.keys(window)) {
            if (/__|SIGI|INIT|STATE|PDP|PRODUCT|SHOP/i.test(key)) {
              try {
                const value = window[key];
                if (value && typeof value !== 'function') globals[key] = JSON.stringify(value).slice(0, 200000);
              } catch {}
            }
          }
          const html = document.documentElement ? document.documentElement.innerHTML : '';
          const matches = [...html.matchAll(/.{0,120}(?:${productId}|sku_id|sale_prop|property_value|description|รายละเอียด).{0,220}/gi)]
            .slice(0, 80)
            .map((m) => m[0]);
          return {
            location: location.href,
            title: document.title,
            bodyText: text.slice(0, 20000),
            scriptCount: scripts.length,
            interestingScripts,
            globals,
            matches,
          };
        })()`,
      });
    }, 3000);
  });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id !== evalId) return;
    const value = msg.result?.result?.value ?? msg.result;
    fs.writeFileSync(out, JSON.stringify(value, null, 2));
    const all = JSON.stringify(value);
    console.log(JSON.stringify({
      out,
      location: value.location,
      title: value.title,
      scriptCount: value.scriptCount,
      hasSku: /sku_id|sku|sale_prop|property_value/i.test(all),
      hasDescription: /description|รายละเอียด|Product details/i.test(all),
      bodySample: String(value.bodyText || '').slice(0, 1200),
      matchSample: value.matches?.slice(0, 10),
      globals: Object.keys(value.globals || {}).slice(0, 30),
      interestingScripts: value.interestingScripts?.length || 0,
    }, null, 2));
    send(ws, nextId++, 'Page.close');
    ws.close();
  });
})();
