const http = require('node:http');
const {WebSocket} = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const marker = process.argv[3] || 'NPTEST_API_1';

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

function shortHeaders(headers = {}) {
  const keep = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^(content-type|origin|referer|user-agent|x-|sec-|tt-|cookie|authorization)/i.test(key)) {
      keep[key] = /cookie|authorization|token/i.test(key) ? '[redacted]' : value;
    }
  }
  return keep;
}

(async () => {
  const pages = await getJson('/json/list');
  const page = pages.find((item) => item.type === 'page' && /shop\.tiktok\.com\/streamer\/live\/product\/dashboard/.test(item.url))
    || pages.find((item) => item.type === 'page' && /tiktokshop|tiktok\.com/i.test(item.url));
  if (!page) throw Error('No TikTok page found on CDP port ' + port);

  console.log('ATTACHED', page.title, page.url);
  console.log('MARKER', marker);
  console.log('NOW: type/send the marker in LIVE chat, then wait 10 seconds.');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const requests = new Map();
  const hits = [];

  ws.on('open', () => {
    send(ws, nextId++, 'Network.enable', {maxPostDataSize: 1024 * 1024});
    send(ws, nextId++, 'Page.enable');
    send(ws, nextId++, 'Runtime.enable');
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const p = msg.params || {};
    if (msg.method === 'Network.requestWillBeSent') {
      const req = p.request || {};
      requests.set(p.requestId, {
        id: p.requestId,
        type: p.type,
        url: req.url,
        method: req.method,
        headers: shortHeaders(req.headers),
        postData: req.postData,
        ts: new Date().toISOString(),
      });
      const text = [req.url, req.postData || ''].join('\n');
      if (/comment|chat|message|webcast|room|im|send|conversation/i.test(text) || text.includes(marker)) {
        console.log('REQ', JSON.stringify(requests.get(p.requestId), null, 2));
      }
    }
    if (msg.method === 'Network.webSocketCreated') {
      console.log('WS_CREATED', p.requestId, p.url);
    }
    if (msg.method === 'Network.webSocketFrameSent' || msg.method === 'Network.webSocketFrameReceived') {
      const payload = p.response?.payloadData || '';
      if (payload.includes(marker) || /comment|chat|message|webcast/i.test(payload)) {
        console.log(msg.method === 'Network.webSocketFrameSent' ? 'WS_SENT' : 'WS_RECV', JSON.stringify({
          requestId: p.requestId,
          opcode: p.response?.opcode,
          payload: payload.slice(0, 2000),
        }, null, 2));
      }
    }
    if (msg.method === 'Network.responseReceived') {
      const req = requests.get(p.requestId);
      const res = p.response || {};
      if (!req) return;
      req.status = res.status;
      req.responseHeaders = shortHeaders(res.headers);
      if (/comment|chat|message|webcast|room|im|send|conversation/i.test(req.url) || (req.postData || '').includes(marker)) {
        hits.push(req);
        console.log('RES', JSON.stringify(req, null, 2));
        send(ws, nextId++, 'Network.getResponseBody', {requestId: p.requestId});
      }
    }
    if (msg.id && msg.result && typeof msg.result.body === 'string') {
      const body = msg.result.body.slice(0, 3000);
      if (body.includes(marker) || /comment|chat|message|success|room/i.test(body)) {
        console.log('BODY', body);
      }
    }
  });

  setTimeout(() => {
    console.log('SUMMARY', JSON.stringify(hits, null, 2));
    ws.close();
  }, 120000);
})();
