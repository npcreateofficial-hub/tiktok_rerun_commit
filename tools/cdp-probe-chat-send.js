const http = require('node:http');
const { WebSocket } = require('../runtime/resources/app/node_modules/ws');

const port = Number(process.argv[2] || 9444);
const message = process.argv.slice(3).join(' ') || 'สวัสดีค่ะ เลือกซื้อสินค้าจากตะกร้าด้านล่างได้เลยนะคะ';

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
      ws.send(JSON.stringify({ id, method, params }));
    });

  await call('Runtime.enable');
  const expression = `(async () => {
    const content = ${JSON.stringify(message)};
    const cap = (value, max = 500) => String(value || '').slice(0, max);
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name).reverse();
    const signedSource = resources.find((raw) => {
      try {
        const url = new URL(raw);
        return url.hostname === 'shop.tiktok.com'
          && url.pathname.includes('/api/v1/streamer_desktop/')
          && url.searchParams.get('aid') === '253642'
          && url.searchParams.has('msToken')
          && url.searchParams.has('X-Bogus')
          && url.searchParams.has('X-Gnarly');
      } catch {
        return false;
      }
    });
    if (!signedSource) return { ok: false, reason: 'no-signed-source' };
    const sourceUrl = new URL(signedSource);
    const roomId =
      sourceUrl.searchParams.get('room_id') ||
      [...resources].map((raw) => {
        try { return new URL(raw).searchParams.get('room_id') || ''; } catch { return ''; }
      }).find(Boolean) ||
      '';
    if (!roomId) return { ok: false, reason: 'no-room-id', signedSource };

    const signedUrl = (path) => {
      const next = new URL(path, location.origin);
      for (const [key, value] of sourceUrl.searchParams.entries()) {
        if (!next.searchParams.has(key)) next.searchParams.set(key, value);
      }
      return next;
    };
    const bodies = [
      {
        label: 'content-meta',
        body: {
          content,
          meta: { source: 2, app_id: 253642, room_id: roomId },
          client_start_time_stamp_millisecond: String(Date.now()),
        },
      },
      {
        label: 'content-room',
        body: {
          room_id: roomId,
          content,
          client_start_time_stamp_millisecond: String(Date.now()),
        },
      },
      {
        label: 'text-room',
        body: {
          room_id: roomId,
          text: content,
          client_start_time_stamp_millisecond: String(Date.now()),
        },
      },
      {
        label: 'message-room',
        body: {
          room_id: roomId,
          message: content,
          client_start_time_stamp_millisecond: String(Date.now()),
        },
      },
    ];
    const paths = [
      '/api/v1/streamer_desktop/message/chat',
      '/api/v1/streamer_desktop/live/message/chat',
      '/api/v1/streamer_desktop/comment/send',
      '/api/v1/streamer_desktop/live/comment/send',
      '/api/v1/streamer_desktop/chat/send',
      '/api/v1/streamer_desktop/live_chat/send',
    ];
    const results = [];
    for (const path of paths) {
      for (const candidate of bodies) {
        const url = signedUrl(path);
        if (!url.searchParams.has('room_id')) url.searchParams.set('room_id', roomId);
        try {
          const response = await fetch(url.toString(), {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(candidate.body),
          });
          const raw = await response.text();
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch {}
          results.push({
            path,
            body: candidate.label,
            http: response.status,
            code: data?.code,
            message: data?.message || data?.msg || cap(raw, 220),
            ok: response.ok && Number(data?.code ?? 0) === 0,
          });
          if (response.ok && Number(data?.code ?? 0) === 0) {
            return { ok: true, roomId, used: results[results.length - 1], signedSourcePath: sourceUrl.pathname };
          }
        } catch (error) {
          results.push({ path, body: candidate.label, error: String(error?.message || error) });
        }
      }
    }
    return { ok: false, roomId, signedSourcePath: sourceUrl.pathname, results };
  })()`;

  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(result.result?.result?.value || result, null, 2));
  ws.close();
})();
