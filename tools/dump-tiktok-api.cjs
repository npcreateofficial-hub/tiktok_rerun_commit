const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const apiPath = process.argv[3] || '/api/v1/streamer_desktop/live_product/list';
const out = process.argv[4] || path.join(__dirname, `tiktok-api-dump-${Date.now()}.json`);

function getJson(route) {
  return new Promise((resolve, reject) => {
    const req = http.get({host: '127.0.0.1', port, path: route, timeout: 3000}, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('timeout')));
  });
}

function send(ws, id, method, params = {}) {
  ws.send(JSON.stringify({id, method, params}));
}

(async () => {
  const pages = await getJson('/json/list');
  const page = pages.find((item) => item.type === 'page' && String(item.url).includes('shop.tiktok.com/streamer/live/product/dashboard'))
    || pages.find((item) => item.type === 'page' && /tiktokshop|tiktok\.com/i.test(item.url));
  if (!page) throw Error('No TikTok page found on CDP port ' + port);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const evalId = nextId++;
  ws.on('open', () => {
    send(ws, evalId, 'Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const response = await fetch(new URL(${JSON.stringify(apiPath)}, location.origin).toString(), {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null } catch {}
        return { ok: response.ok, status: response.status, data, text };
      })()`,
    });
  });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id !== evalId) return;
    const value = msg.result?.result?.value ?? msg.result;
    fs.writeFileSync(out, JSON.stringify(value, null, 2));
    const products = value?.data?.data?.products;
    const vouchers = value?.data?.data?.vouchers;
    console.log(JSON.stringify({
      out,
      ok: value?.ok,
      status: value?.status,
      code: value?.data?.code,
      message: value?.data?.message || value?.data?.msg,
      productCount: Array.isArray(products) ? products.length : null,
      voucherCount: Array.isArray(vouchers) ? vouchers.length : null,
      firstKeys: products?.[0] ? Object.keys(products[0]) : vouchers?.[0] ? Object.keys(vouchers[0]) : [],
    }, null, 2));
    ws.close();
  });
})();
