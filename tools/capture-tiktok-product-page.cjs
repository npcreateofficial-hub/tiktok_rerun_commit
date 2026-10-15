const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const productId = process.argv[3] || '1732677488117515405';
const out = process.argv[4] || path.join(__dirname, `tiktok-product-page-${productId}-${Date.now()}.json`);

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

function redactUrl(url) {
  return String(url)
    .replace(/([?&](?:msToken|X-Bogus|X-Gnarly|X-Tts-Oec-Bsid|_signature)=)[^&]+/gi, '$1[redacted]')
    .replace(/(token=)[^&]+/gi, '$1[redacted]');
}

(async () => {
  const urls = [
    `https://shop.tiktok.com/view/product/${productId}`,
    `https://shop.tiktok.com/product/${productId}`,
    `https://shop.tiktok.com/pdp/${productId}`,
    `https://www.tiktok.com/shop/pdp/${productId}`,
  ];
  const created = await httpJson(`/json/new?${encodeURIComponent(urls[0])}`, 'PUT');
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let nextId = 1;
  const requests = new Map();
  const bodies = [];
  const bodyIds = new Map();
  let urlIndex = 0;

  const maybeInteresting = (item, body = '') => {
    const text = `${item.url}\n${item.postData || ''}\n${body}`;
    if (!/shop\.tiktok\.com|tiktok\.com/i.test(text)) return false;
    if (/mcs-va|mon-va|app_log|monitor_web|__bav_|captcha|passport/i.test(text)) return false;
    return new RegExp(`${productId}|sku|sale_prop|spec|variant|description|desc|product|pdp|detail`, 'i').test(text);
  };

  function navigateCurrent() {
    const url = urls[urlIndex];
    console.log('NAVIGATE', url);
    send(ws, nextId++, 'Page.navigate', {url});
  }

  ws.on('open', () => {
    send(ws, nextId++, 'Network.enable', {maxPostDataSize: 1024 * 1024});
    send(ws, nextId++, 'Page.enable');
    send(ws, nextId++, 'Runtime.enable');
    navigateCurrent();
    const timer = setInterval(() => {
      urlIndex += 1;
      if (urlIndex >= urls.length) {
        clearInterval(timer);
        setTimeout(() => {
          fs.writeFileSync(out, JSON.stringify(bodies, null, 2));
          console.log(JSON.stringify({
            out,
            count: bodies.length,
            hits: bodies.map((item) => ({
              status: item.status,
              method: item.method,
              url: item.url,
              postData: item.postData,
              keys: item.keys,
              hasSku: item.hasSku,
              hasDescription: item.hasDescription,
              sample: item.sample,
            })).slice(0, 30),
          }, null, 2));
          send(ws, nextId++, 'Page.close');
          ws.close();
        }, 8000);
      } else {
        navigateCurrent();
      }
    }, 9000);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = msg.params || {};
    if (msg.method === 'Network.requestWillBeSent') {
      const req = p.request || {};
      requests.set(p.requestId, {
        id: p.requestId,
        method: req.method,
        url: redactUrl(req.url || ''),
        rawUrl: req.url || '',
        postData: req.postData,
      });
    }
    if (msg.method === 'Network.responseReceived') {
      const req = requests.get(p.requestId);
      if (!req) return;
      req.status = p.response?.status;
      req.mimeType = p.response?.mimeType;
      if (maybeInteresting(req)) {
        const id = nextId++;
        bodyIds.set(id, p.requestId);
        send(ws, id, 'Network.getResponseBody', {requestId: p.requestId});
      }
    }
    if (bodyIds.has(msg.id)) {
      const requestId = bodyIds.get(msg.id);
      const req = requests.get(requestId);
      if (!req) return;
      const body = msg.result?.base64Encoded ? '[base64 body omitted]' : String(msg.result?.body || '');
      if (!maybeInteresting(req, body)) return;
      let parsed = null;
      try { parsed = JSON.parse(body); } catch {}
      const raw = body.slice(0, 6000);
      bodies.push({
        method: req.method,
        url: req.url,
        status: req.status,
        postData: req.postData,
        keys: parsed?.data && typeof parsed.data === 'object' ? Object.keys(parsed.data).slice(0, 40) : parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 40) : [],
        hasSku: /sku|sale_prop|spec|variant|option/i.test(body),
        hasDescription: /description|desc|detail|รายละเอียด/i.test(body),
        sample: raw,
      });
    }
  });
})();
