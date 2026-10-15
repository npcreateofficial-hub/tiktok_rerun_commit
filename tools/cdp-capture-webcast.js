const http = require('http');
const WebSocket = require('../runtime/resources/app/node_modules/ws');
const proto = require('../runtime/resources/app/node_modules/tiktok-live-connector');
function getJson(url){return new Promise((resolve,reject)=>http.get(url,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));}
function bytesFromBody(body, base64){ return Buffer.from(body || '', base64 ? 'base64' : 'utf8'); }
function simplifyChat(decoded){
  const user = decoded.user || decoded.userInfo || {};
  return {
    content: decoded.content || decoded.comment || decoded.text || '',
    user: user.nickname || user.displayId || user.uniqueId || user.id || '',
    rawKeys: Object.keys(decoded).slice(0,30)
  };
}
(async()=>{
  const targets = await getJson('http://127.0.0.1:9444/json/list');
  const t = targets.find(x => x.type === 'page' && x.url === 'https://shop.tiktok.com/streamer/live/product/dashboard');
  if(!t) throw new Error('target not found');
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id=0; const pending = new Map(); const hits=[];
  ws.on('message', async raw => {
    const m=JSON.parse(raw);
    if(m.id && pending.has(m.id)){pending.get(m.id)(m); pending.delete(m.id); return;}
    if(m.method === 'Network.responseReceived' && /webcast\/im\/fetch/.test(m.params.response.url)){
      const reqId=m.params.requestId;
      setTimeout(async()=>{
        try{
          const body=await send('Network.getResponseBody',{requestId:reqId});
          const buf=bytesFromBody(body.result.body, body.result.base64Encoded);
          let fetchResult=null;
          try { fetchResult = proto.ProtoMessageFetchResult.decode(buf); } catch(e) {}
          const messages=[];
          const list = fetchResult?.messages || fetchResult?.messageList || [];
          for(const item of list){
            const type = item.type || item.method || item.messageType || '';
            const payload = item.payload || item.binary || item.message || item.data;
            if(!payload) continue;
            if(type === 'WebcastChatMessage' || /ChatMessage/.test(type)){
              const decoded = proto.deserializeMessage('WebcastChatMessage', payload);
              messages.push({type, ...simplifyChat(decoded)});
            } else if(/Member|Social|Room/.test(type)) {
              messages.push({type});
            }
          }
          hits.push({url:m.params.response.url.slice(0,220), status:m.params.response.status, bytes:buf.length, decoded:!!fetchResult, keys: fetchResult?Object.keys(fetchResult):[], count:list.length, messages});
          if(hits.length>=3){ console.log(JSON.stringify(hits,null,2)); ws.close(); process.exit(0); }
        }catch(e){ hits.push({error:String(e)}); }
      }, 300);
    }
  });
  await new Promise(r=>ws.once('open',r));
  const send=(method,params={})=>new Promise(resolve=>{const n=++id; pending.set(n,resolve); ws.send(JSON.stringify({id:n,method,params}));});
  await send('Network.enable', {maxResourceBufferSize: 1024*1024*20, maxTotalBufferSize: 1024*1024*100});
  await send('Runtime.evaluate',{expression:"fetch(location.href, {cache:'no-store'}).catch(()=>{})"});
  setTimeout(()=>{ console.log(JSON.stringify(hits,null,2)); ws.close(); process.exit(0); }, 9000);
})();
