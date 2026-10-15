const http = require('http');
const WebSocket = require('../runtime/resources/app/node_modules/ws');
function getJson(url){return new Promise((resolve,reject)=>http.get(url,res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));}
(async()=>{
 const targets=await getJson('http://127.0.0.1:9444/json/list'); const t=targets.find(x=>x.type==='page'&&x.url==='https://shop.tiktok.com/streamer/live/product/dashboard');
 const ws=new WebSocket(t.webSocketDebuggerUrl); let id=0; const pending=new Map(); ws.on('message',raw=>{const m=JSON.parse(raw); if(m.id&&pending.has(m.id)){pending.get(m.id)(m); pending.delete(m.id);}}); await new Promise(r=>ws.once('open',r)); const send=(method,params={})=>new Promise(resolve=>{const n=++id; pending.set(n,resolve); ws.send(JSON.stringify({id:n,method,params}));});
 await send('Runtime.enable');
 const expr=`(() => {
   const cap=s=>String(s||'').replace(/\s+/g,' ').trim();
   const inputs=[...document.querySelectorAll('textarea,input,[contenteditable="true"]')];
   const composer=inputs.find(el=>/type something|comment|message|พิมพ์|ข้อความ/i.test(String(el.placeholder||el.getAttribute('aria-label')||'')));
   let panel=composer?.closest('form')||composer?.parentElement;
   for(let i=0; panel&&panel!==document.body&&i<12; i++){ const txt=cap(panel.innerText||panel.textContent); if(/Chat/i.test(txt)&&/All/i.test(txt)){break;} panel=panel.parentElement; }
   const panelText=cap(panel?.innerText||panel?.textContent||'');
   const allText=[...document.querySelectorAll('body *')].map(el=>cap(el.innerText||'')).filter(Boolean).filter(t=>/(สวัสดี|เม้น|comment|Chat|just joined)/i.test(t)).slice(-80);
   return {url:location.href,title:document.title,composer:!!composer,panelText,allText};
 })()`;
 const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true}); console.log(JSON.stringify(r.result.result.value,null,2)); ws.close();
})();
