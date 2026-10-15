const http = require('http');
const WebSocket = require('../runtime/resources/app/node_modules/ws');
function getJson(url){return new Promise((resolve,reject)=>http.get(url,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));}
(async()=>{
  const targets = await getJson('http://127.0.0.1:9444/json/list');
  const t = targets.find(x => x.type === 'page' && x.url === 'https://shop.tiktok.com/streamer/live/product/dashboard');
  if(!t) throw new Error('target not found');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id=0; const pending = new Map();
  ws.on('message', raw => { const m=JSON.parse(raw); if(m.id && pending.has(m.id)){pending.get(m.id)(m); pending.delete(m.id);} });
  await new Promise(r=>ws.once('open',r));
  const send=(method,params={})=>new Promise(resolve=>{const n=++id; pending.set(n,resolve); ws.send(JSON.stringify({id:n,method,params}));});
  await send('Runtime.enable');
  const expr = `(() => performance.getEntriesByType('resource').map(e => e.name).filter(u => /chat|comment|message|webcast|im|room|live|list/i.test(u)).slice(-80))()`;
  const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true});
  console.log(JSON.stringify(r.result.result.value, null, 2));
  ws.close();
})();

