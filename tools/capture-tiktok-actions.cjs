const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const mode = process.argv[3] || 'pin-product';

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

function redactUrl(url) {
  return url
    .replace(/([?&](?:msToken|X-Bogus|X-Gnarly|X-Tts-Oec-Bsid|_signature)=)[^&]+/gi, '$1[redacted]')
    .replace(/(token=)[^&]+/gi, '$1[redacted]');
}

function shortHeaders(headers = {}) {
  const keep = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^(content-type|origin|referer|user-agent|x-|sec-|tt-|cookie|authorization)/i.test(key)) {
      keep[key] = /cookie|authorization|token/i.test(key) ? '[redacted]' : value;
    }
  }
  return keep;
}

function actionScript(actionMode) {
  return `(async () => {
    const mode = ${JSON.stringify(actionMode)};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const text = (el) => (el?.innerText || el?.textContent || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0;
    };
    const click = async (button) => {
      button.scrollIntoView({block: 'center', inline: 'center'});
      await sleep(200);
      button.click();
      await sleep(3500);
    };
    const candidates = [...document.querySelectorAll('button, [role="button"]')]
      .filter((button) => visible(button) && /^(Pin|Unpin|ปัก|เลิกปัก)$/i.test(text(button)))
      .map((button, index) => {
        let node = button.parentElement;
        let context = '';
        for (let i = 0; node && node !== document.body && i < 7; i += 1) {
          context = text(node).slice(0, 500);
          if (context.length > 40) break;
          node = node.parentElement;
        }
        return {index, label: text(button), context, button};
      });
    const summary = candidates.map(({index, label, context}) => ({index, label, context: context.slice(0, 220)}));
    let target = null;
    if (mode === 'coupon') {
      target = candidates.find((item) => /off|coupon|voucher|คูปอง|orders over/i.test(item.context));
    } else {
      target = candidates.find((item) => /THB|฿|In stock|Requested demo/i.test(item.context) && !/orders over|coupon|voucher|คูปอง/i.test(item.context));
    }
    if (!target && candidates.length) target = candidates[0];
    if (!target) return {ok: false, mode, candidates: summary};
    await click(target.button);
    return {ok: true, mode, clicked: {index: target.index, label: target.label, context: target.context.slice(0, 260)}, candidates: summary};
  })()`;
}

(async () => {
  const pages = await getJson('/json/list');
  const page = pages.find((item) => item.type === 'page' && String(item.url).includes('shop.tiktok.com/streamer/live/product/dashboard'))
    || pages.find((item) => item.type === 'page' && /tiktokshop|tiktok\.com/i.test(item.url));
  if (!page) throw Error('No TikTok page found on CDP port ' + port);

  console.log('ATTACHED', page.title, page.url);
  console.log('ACTION', mode);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const requests = new Map();
  const hits = [];
  const responseBodyRequests = new Map();
  const bodyByRequest = new Map();
  let actionEvalId = 0;

  const interesting = (req) => {
    const text = [req.url || '', req.postData || ''].join('\\n');
    if (!/shop\.tiktok\.com|webcast\.tiktok\.com/i.test(text)) return false;
    if (/mcs-va|mon-va|\/service\/2\/app_log|\/monitor_web\/collect|__bav_|\/api\/window\//i.test(text)) return false;
    if (/webcast\/im\/fetch/i.test(text)) return mode === 'chat-read';
    if (/room\/status/i.test(text)) return mode === 'room-status';
    return /pin|product|coupon|voucher|room|live|chat|message|streamer_desktop|insights|promotion|flash|billboard|giveaway/i.test(text);
  };

  ws.on('open', () => {
    send(ws, nextId++, 'Network.enable', {maxPostDataSize: 1024 * 1024});
    send(ws, nextId++, 'Page.enable');
    send(ws, nextId++, 'Runtime.enable');
    setTimeout(() => {
      actionEvalId = nextId++;
      send(ws, actionEvalId, 'Runtime.evaluate', {
        expression: actionScript(mode),
        awaitPromise: true,
        returnByValue: true,
      });
    }, 1000);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = msg.params || {};

    if (msg.method === 'Network.requestWillBeSent') {
      const req = p.request || {};
      const item = {
        id: p.requestId,
        type: p.type,
        url: redactUrl(req.url || ''),
        rawUrl: req.url || '',
        method: req.method,
        headers: shortHeaders(req.headers),
        postData: req.postData,
        ts: new Date().toISOString(),
      };
      requests.set(p.requestId, item);
      if (interesting(item)) console.log('REQ', JSON.stringify({...item, rawUrl: undefined}, null, 2));
    }

    if (msg.method === 'Network.responseReceived') {
      const req = requests.get(p.requestId);
      if (!req) return;
      const res = p.response || {};
      req.status = res.status;
      req.responseHeaders = shortHeaders(res.headers);
      if (interesting(req)) {
        hits.push(req);
        console.log('RES', JSON.stringify({...req, rawUrl: undefined}, null, 2));
        const id = nextId++;
        responseBodyRequests.set(id, p.requestId);
        send(ws, id, 'Network.getResponseBody', {requestId: p.requestId});
      }
    }

    if (msg.id === actionEvalId) {
      console.log('ACTION_RESULT', JSON.stringify(msg.result?.result?.value ?? msg.result, null, 2));
    } else if (responseBodyRequests.has(msg.id)) {
      const requestId = responseBodyRequests.get(msg.id);
      const body = msg.result?.body;
      if (typeof body === 'string') {
        const text = msg.result?.base64Encoded ? '[base64 body omitted]' : body.slice(0, 2500);
        bodyByRequest.set(requestId, text);
        if (/code|message|success|error|data|product|coupon|voucher|pin|room/i.test(text)) {
          console.log('BODY', text);
        }
      }
    }
  });

  setTimeout(() => {
    const summary = hits.map((hit) => ({
      method: hit.method,
      url: hit.url,
      status: hit.status,
      postData: hit.postData,
      body: bodyByRequest.get(hit.id),
    }));
    const out = path.join(__dirname, `tiktok-action-capture-${mode}-${Date.now()}.json`);
    fs.writeFileSync(out, JSON.stringify(summary, null, 2));
    console.log('SUMMARY_FILE', out);
    console.log('SUMMARY', JSON.stringify(summary.map((hit) => ({
      method: hit.method,
      url: hit.url,
      status: hit.status,
      postData: hit.postData,
      body: typeof hit.body === 'string' ? hit.body.slice(0, 800) : hit.body,
    })), null, 2));
    ws.close();
  }, 15000);
})();
