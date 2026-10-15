const http = require('http');
const WebSocket = require('../runtime/resources/app/node_modules/ws');
const proto = require('../runtime/resources/app/node_modules/tiktok-live-connector');
function getJson(url){return new Promise((resolve,reject)=>http.get(url,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));}
function chatText(decoded){ const u=decoded.user||{}; return {content:decoded.content||'', user:u.nickname||u.displayId||u.uniqueId||''}; }
(async()=>{
 const targets=await getJson('http://127.0.0.1:9444/json/list'); const t=targets.find(x=>x.type==='page'&&x.url==='https://shop.tiktok.com/streamer/live/product/dashboard');
 const ws=new WebSocket(t.webSocketDebuggerUrl); let id=0; const pending=new Map(); ws.on('message',raw=>{const m=JSON.parse(raw); if(m.id&&pending.has(m.id)){pending.get(m.id)(m); pending.delete(m.id);}}); await new Promise(r=>ws.once('open',r)); const send=(method,params={})=>new Promise(resolve=>{const n=++id; pending.set(n,resolve); ws.send(JSON.stringify({id:n,method,params}));});
 await send('Runtime.enable');
 const expr=`async () => {
   const urls=performance.getEntriesByType('resource').map(e=>e.name).filter(u=>u.includes('/webcast/im/fetch/'));
   const src=urls[0] || urls[urls.length-1]; if(!src) return {ok:false};
   const u=new URL(src); ['cursor','internal_ext','history_comment_cursor'].forEach(k=>u.searchParams.delete(k)); u.searchParams.set('history_comment_count','100'); u.searchParams.set('fetch_rule','1'); u.searchParams.set('resp_content_type','protobuf');
   const res=await fetch(u.toString(),{credentials:'include'}); const buf=new Uint8Array(await res.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i++) s+=String.fromCharCode(buf[i]); return {ok:true,status:res.status,url:u.toString().slice(0,500),bytes:buf.length,b64:btoa(s)};
 }`;
 const rr=await send('Runtime.evaluate',{expression:`(${expr})()`,awaitPromise:true,returnByValue:true}); const val=rr.result.result.value; if(!val.ok){console.log(JSON.stringify(val)); process.exit(0)}
 const fr=proto.ProtoMessageFetchResult.decode(Buffer.from(val.b64,'base64')); const list=fr.messages||[]; const out={status:val.status,bytes:val.bytes,count:list.length,cursor:fr.cursor,internalExt:fr.internalExt,messages:[]};
 for(const item of list){ const type=item.type||item.method||''; const payload=item.payload; if(type==='WebcastChatMessage'){try{out.messages.push({type,...chatText(proto.deserializeMessage('WebcastChatMessage',payload))});}catch(e){out.messages.push({type,error:String(e).slice(0,100)})}} else out.messages.push({type}); }
 console.log(JSON.stringify(out,null,2)); ws.close();
})();
