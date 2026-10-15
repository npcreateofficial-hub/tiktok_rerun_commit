const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const productId = process.argv[3] || '1732677488117515405';
const out = process.argv[4] || path.join(__dirname, `tiktok-product-detail-${productId}-${Date.now()}.json`);

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
    || pages.find((item) => item.type === 'page' && /shop\.tiktok\.com/i.test(item.url));
  if (!page) throw Error('No TikTok page found on CDP port ' + port);

  const paths = [
    `/api/v1/streamer_desktop/product/detail?product_id=${productId}`,
    `/api/v1/streamer_desktop/live_product/detail?product_id=${productId}`,
    `/api/v1/streamer_desktop/product/get?product_id=${productId}`,
    `/api/v1/product/detail?product_id=${productId}`,
    `/api/v1/product/get?product_id=${productId}`,
    `/api/v1/oec/product/detail?product_id=${productId}`,
    `/api/v1/shop/product/detail?product_id=${productId}`,
    `/api/v1/affiliate/product/detail?product_id=${productId}`,
    `/api/v1/creator/product/detail?product_id=${productId}`,
    `/api/v1/streamer_desktop/affiliate/product/detail?product_id=${productId}`,
  ];

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const evalId = nextId++;
  ws.on('open', () => {
    send(ws, evalId, 'Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const paths = ${JSON.stringify(paths)};
        const out = [];
        for (const apiPath of paths) {
          try {
            const response = await fetch(new URL(apiPath, location.origin).toString(), {
              credentials: 'include',
              headers: { Accept: 'application/json' },
            });
            const text = await response.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null } catch {}
            const raw = JSON.stringify(data || text);
            out.push({
              path: apiPath,
              ok: response.ok,
              status: response.status,
              code: data && data.code,
              message: data && (data.message || data.msg),
              hasSku: /sku|sale_prop|spec|variant|option/i.test(raw),
              hasDescription: /description|desc|detail|รายละเอียด/i.test(raw),
              keys: data && data.data && typeof data.data === 'object' ? Object.keys(data.data).slice(0, 30) : [],
              sample: text.slice(0, 900),
            });
          } catch (error) {
            out.push({ path: apiPath, ok: false, error: String(error && error.message || error) });
          }
        }
        return out;
      })()`,
    });
  });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id !== evalId) return;
    const value = msg.result?.result?.value ?? msg.result;
    fs.writeFileSync(out, JSON.stringify(value, null, 2));
    console.log(JSON.stringify({out, hits: value.filter((item) => item.status !== 404 && item.status !== 405 && item.code !== 10003)}, null, 2));
    ws.close();
  });
})();
