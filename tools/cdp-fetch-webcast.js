const http = require('http');
const WebSocket = require('../runtime/resources/app/node_modules/ws');
const proto = require('../runtime/resources/app/node_modules/tiktok-live-connector');
function getJson(url){return new Promise((resolve,reject)=>http.get(url,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));}
function simplifyChat(decoded){
  const user = decoded.user || decoded.userInfo || {};
  return { content: decoded.content || decoded.comment || decoded.text || '', user: user.nickname || user.displayId || user.uniqueId || user.id || '', keys: Object.keys(decoded).slice(0,25) };
}
(async()=>{
  const targets = await getJson('http://127.0.0.1:9444/json/list');
  const t = targets.find(x => x.type === 'page' && x.url === 'https://shop.tiktok.com/streamer/live/product/dashboard');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id=0; const pending = new Map();
  ws.on('message', raw => { const m=JSON.parse(raw); if(m.id && pending.has(m.id)){pending.get(m.id)(m); pending.delete(m.id);} });
  await new Promise(r=>ws.once('open',r));
  const send=(method,params={})=>new Promise(resolve=>{const n=++id; pending.set(n,resolve); ws.send(JSON.stringify({id:n,method,params}));});
  await send('Runtime.enable');
  const expr = `async () => {
    const urls = performance.getEntriesByType('resource').map(e=>e.name).filter(u=>u.includes('/webcast/im/fetch/'));
    const url = urls[urls.length-1];
    if(!url) return {ok:false, reason:'no-url'};
    const res = await fetch(url, {credentials:'include'});
    const buf = new Uint8Array(await res.arrayBuffer());
    let s = ''; for (let i=0;i<buf.length;i++) s += String.fromCharCode(buf[i]);
    return {ok:true, status:res.status, url:url.slice(0,500), bytes:buf.length, b64:btoa(s)};
  }`;
  const rr = await send('Runtime.evaluate',{expression:`(${expr})()`, awaitPromise:true, returnByValue:true});
  const val = rr.result.result.value;
  if(!val?.ok){ console.log(JSON.stringify(val,null,2)); process.exit(0); }
  const buf=Buffer.from(val.b64,'base64');
  let fetchResult=null; let err='';
  try { fetchResult = proto.ProtoMessageFetchResult.decode(buf); } catch(e) { err=String(e.stack||e); }
  const out={status:val.status, bytes:val.bytes, decoded:!!fetchResult, err:err.slice(0,500), keys:fetchResult?Object.keys(fetchResult):[], count:0, messages:[]};
  const list=fetchResult?.messages || fetchResult?.messageList || [];
  out.count=list.length;
  for(const item of list){
    const type=item.type || item.method || item.messageType || '';
    const payload=item.payload || item.binary || item.message || item.data;
    if(type) {
      if(type==='WebcastChatMessage' || /ChatMessage/.test(type)){
        try{ out.messages.push({type, ...simplifyChat(proto.deserializeMessage('WebcastChatMessage', payload))}); }
        catch(e){ out.messages.push({type, decodeError:String(e).slice(0,200)}); }
      } else out.messages.push({type});
    }
  }
  console.log(JSON.stringify(out,null,2));
  ws.close();
})();
