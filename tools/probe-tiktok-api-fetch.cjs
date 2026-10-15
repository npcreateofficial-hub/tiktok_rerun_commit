const http = require('node:http');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const apiPath = process.argv[3] || '/api/v1/streamer_desktop/live_product/list';

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({host: '127.0.0.1', port, path, timeout: 3000}, (res) => {
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
        return {
          ok: response.ok,
          status: response.status,
          code: data && data.code,
          message: data && (data.message || data.msg),
          productCount: data && data.data && Array.isArray(data.data.products) ? data.data.products.length : null,
          voucherCount: data && data.data && Array.isArray(data.data.vouchers) ? data.data.vouchers.length : null,
          sample: text.slice(0, 400),
        };
      })()`,
    });
  });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id !== evalId) return;
    console.log(JSON.stringify(msg.result?.result?.value ?? msg.result, null, 2));
    ws.close();
  });
})();
