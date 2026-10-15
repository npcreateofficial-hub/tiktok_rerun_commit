const http = require('node:http');
const { WebSocket } = require('../runtime/resources/app/node_modules/ws');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: 9444, path, timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(JSON.parse(data)));
      })
      .on('error', reject);
  });
}

(async () => {
  const pages = await getJson('/json/list');
  const page = pages.find((item) => item.type === 'page' && String(item.url).includes('shop.tiktok.com/streamer/live/product/dashboard'));
  if (!page) throw Error('no LIVE Manager page on 9444');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  await new Promise((resolve) => ws.once('open', resolve));
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const next = ++id;
      pending.set(next, resolve);
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.reload', { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 8000));
  const expr = `(() => {
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const interesting = resources.filter((url) => /room_id=|webcast\\/im\\/fetch|message\\/chat|streamer_desktop/.test(url));
    const rooms = [...new Set(interesting.map((raw) => {
      try { return new URL(raw).searchParams.get('room_id') || '' } catch { return '' }
    }).filter(Boolean))];
    const storage = [];
    try { for (let i = 0; i < localStorage.length; i += 1) storage.push(localStorage.getItem(localStorage.key(i)) || '') } catch {}
    try { for (let i = 0; i < sessionStorage.length; i += 1) storage.push(sessionStorage.getItem(sessionStorage.key(i)) || '') } catch {}
    const joined = [document.documentElement.innerHTML, ...storage].join('\\n');
    return {
      url: location.href,
      title: document.title,
      rooms,
      hasEcStreamerKey: /ec_streamer_key|streamer_key/.test(joined),
      lastUrls: interesting.slice(-20),
    };
  })()`;
  const result = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(result.result?.result?.value || result, null, 2));
  ws.close();
})();
