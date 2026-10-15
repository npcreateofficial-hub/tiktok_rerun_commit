const http = require('node:http');
const { WebSocket } = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const message = process.argv.slice(3).join(' ') || 'ทดสอบระบบตอบกลับค่ะ';

function getJson(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: 3000 }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('timeout')));
  });
}

function send(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }));
}

(async () => {
  const pages = await getJson('/json/list');
  const page =
    pages.find((item) => item.type === 'page' && String(item.url).includes('shop.tiktok.com/streamer/live/product/dashboard')) ||
    pages.find((item) => item.type === 'page' && /shop\.tiktok\.com|tiktok\.com/i.test(item.url));
  if (!page) throw Error('No TikTok LIVE Manager page found on CDP port ' + port);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  await new Promise((resolve) => ws.once('open', resolve));
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      send(ws, id, method, params);
    });

  await call('Runtime.enable');
  const expression = `(async () => {
    const content = ${JSON.stringify(message)};
    const cap = (s, n) => String(s || '').slice(0, n);
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name).reverse();
    const findRoomId = () => {
      for (const raw of resources) {
        try {
          const url = new URL(raw);
          const value = url.searchParams.get('room_id');
          if (value && /streamer_desktop|webcast|insights/.test(url.pathname + url.hostname)) return value;
        } catch {}
      }
      const html = document.documentElement.innerHTML;
      const match = html.match(/"room_id"\\s*:\\s*"?(\\d{12,})"?/) || html.match(/room_id=(\\d{12,})/);
      return match?.[1] || '';
    };
    const findStreamerKey = () => {
      const sources = [];
      try { sources.push(document.documentElement.innerHTML); } catch {}
      try {
        for (let i = 0; i < localStorage.length; i += 1) sources.push(localStorage.getItem(localStorage.key(i)) || '');
      } catch {}
      try {
        for (let i = 0; i < sessionStorage.length; i += 1) sources.push(sessionStorage.getItem(sessionStorage.key(i)) || '');
      } catch {}
      const joined = sources.join('\\n');
      for (const re of [
        /"ec_streamer_key"\\s*:\\s*"([^"]+)"/,
        /ec_streamer_key['"]?\\s*[:=]\\s*['"]([^'"]+)['"]/,
        /streamer_key['"]?\\s*[:=]\\s*['"]([^'"]+)['"]/,
      ]) {
        const hit = re.exec(joined);
        if (hit?.[1]) return hit[1];
      }
      return '';
    };
    const roomId = findRoomId();
    const ecStreamerKey = findStreamerKey();
    if (!roomId) return { ok: false, reason: 'no-room-id' };
    if (!ecStreamerKey) return { ok: false, reason: 'no-ec-streamer-key', roomId };
    const body = {
      content,
      meta: { source: 2, app_id: 253642, room_id: roomId, ec_streamer_key: ecStreamerKey },
      client_start_time_stamp_millisecond: String(Date.now()),
    };
    const response = await fetch(new URL('/api/v1/streamer_desktop/message/chat', location.origin).toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    return {
      ok: response.ok && Number(data?.code ?? 0) === 0,
      endpoint: '/api/v1/streamer_desktop/message/chat',
      status: response.status,
      roomId,
      hasEcStreamerKey: Boolean(ecStreamerKey),
      sentContent: content,
      response: data || cap(raw, 400),
    };
  })()`;

  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(result.result?.result?.value || result, null, 2));
  ws.close();
})();
