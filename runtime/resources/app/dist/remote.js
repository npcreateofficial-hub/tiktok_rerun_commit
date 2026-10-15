const select=document.querySelector('#windows'),screen=document.querySelector('#screen'),status=document.querySelector('#status'),keyboard=document.querySelector('#keyboard');
let windows=[],current=null,objectUrl='',running=true,inputQueue=Promise.resolve(),lastAction=0,lastList=0,lastLoginReadyCheck=0,lastLoginReady=false,listSignature='',wheelPending=null,pointerDown=null,dragStarted=false,frameFailures=0;
const query=new URLSearchParams(location.search);
const remoteTarget=query.get('target')||(query.get('login')==='1'?'login':'');
const recoveryChannelByTarget={login:'tiktok:login',home:'tiktok:open',shop:'tiktok:open-shop',ads:'tiktok:open-ads-manager'};
const remoteRecoveryChannel=recoveryChannelByTarget[remoteTarget]||'';
let remoteRecoveryStarted=false,remoteRecoveryLast=0;
const remoteOpenedAt=Date.now();

function cookieValue(name){return document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';}
function selectedAccountId(){
  const accountFromUrl=String(query.get('accountId')||'').trim();
  if(accountFromUrl)return accountFromUrl;
  try{return localStorage.getItem('np.selected.accountId')||'main';}catch{return 'main';}
}
function targetActionText(){
  return remoteTarget==='shop'
    ? 'LIVE Manager'
    : remoteTarget==='ads'
      ? 'Ads Manager'
      : remoteTarget==='home'
        ? 'TikTok'
        : 'หน้าล็อกอิน TikTok';
}
async function invokeRemoteRecovery(){
  if(Date.now()-remoteOpenedAt<2500)return;
  if(!remoteRecoveryChannel||remoteRecoveryStarted||windows.length||Date.now()-remoteRecoveryLast<8000)return;
  remoteRecoveryStarted=true;
  remoteRecoveryLast=Date.now();
  try{
    status.textContent=`กำลังเปิด ${targetActionText()} บนเซิร์ฟเวอร์...`;
    const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json','X-NP-Web':'1','X-NP-CSRF':cookieValue('np_csrf')},body:JSON.stringify({channel:remoteRecoveryChannel,args:[selectedAccountId()],uploadId:null})});
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw Error(data.error||`เปิด ${targetActionText()} ไม่สำเร็จ`);
    }
    lastList=0;
  }catch(e){
    status.textContent=e.message||'เปิดหน้าต่าง TikTok ไม่สำเร็จ';
  }finally{
    setTimeout(()=>{remoteRecoveryStarted=false;},5000);
  }
}
async function loginSessionReady(){
  if(remoteTarget!=='login')return false;
  const now=Date.now();
  if(now-lastLoginReadyCheck<1500)return lastLoginReady;
  lastLoginReadyCheck=now;
  try{
    const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json','X-NP-Web':'1','X-NP-CSRF':cookieValue('np_csrf')},body:JSON.stringify({channel:'tiktok:status',args:[selectedAccountId()],uploadId:null})});
    if(!response.ok)return false;
    lastLoginReady=Boolean((await response.json())?.result?.streamerReady);
  }catch{lastLoginReady=false;}
  return lastLoginReady;
}
function closeAfterLogin(){
  running=false;
  if(objectUrl)URL.revokeObjectURL(objectUrl);
  status.textContent='เข้าสู่ระบบสำเร็จ กำลังปิดหน้านี้...';
  try{window.close();}catch{}
}
async function send(payload){
  const response=await fetch('/api/window/input',{method:'POST',signal:AbortSignal.timeout(12000),headers:{'Content-Type':'application/json','X-NP-Web':'1','X-NP-CSRF':cookieValue('np_csrf')},body:JSON.stringify(payload)});
  if(!response.ok){const d=await response.json().catch(()=>({}));throw Error(d.error||'ส่งคำสั่งไปหน้าต่าง TikTok ไม่สำเร็จ');}
}
async function sendDirect(payload){if(!current)return;return send({id:current,...payload});}
function queue(payload){
  if(!current)return inputQueue;
  lastAction=Date.now();
  const item={id:current,...payload};
  if(item.type==='wheel'&&wheelPending?.id===item.id){wheelPending.dx=Math.max(-1000,Math.min(1000,wheelPending.dx+item.dx));wheelPending.dy=Math.max(-1000,Math.min(1000,wheelPending.dy+item.dy));return inputQueue;}
  wheelPending=item.type==='wheel'?item:null;
  inputQueue=inputQueue.then(()=>{if(wheelPending===item)wheelPending=null;return send(item);}).catch(e=>{status.textContent=e.message;});
  return inputQueue;
}
function activeWindow(){return windows.find(w=>w.id===current);}
function coords(e){
  const r=screen.getBoundingClientRect(),w=activeWindow();
  const width=screen.naturalWidth||w?.size?.[0]||r.width;
  const height=screen.naturalHeight||w?.size?.[1]||r.height;
  return {
    x:Math.max(0,Math.min(width,Math.round((e.clientX-r.left)*width/r.width))),
    y:Math.max(0,Math.min(height,Math.round((e.clientY-r.top)*height/r.height))),
  };
}
function focusKeyboard(){
  keyboard.focus({preventScroll:true});
  screen.focus({preventScroll:true});
  setTimeout(()=>keyboard.focus({preventScroll:true}),0);
}
screen.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  e.preventDefault();
  screen.setPointerCapture?.(e.pointerId);
  pointerDown={id:e.pointerId,...coords(e)};
  dragStarted=false;
  focusKeyboard();
});
screen.addEventListener('pointermove',e=>{
  if(!pointerDown||pointerDown.id!==e.pointerId)return;
  e.preventDefault();
  const p=coords(e);
  const dx=Math.abs(p.x-pointerDown.x),dy=Math.abs(p.y-pointerDown.y);
  if(!dragStarted&&(dx>6||dy>6)){
    dragStarted=true;
    queue({type:'mouseMove',x:pointerDown.x,y:pointerDown.y});
    queue({type:'mouseDown',x:pointerDown.x,y:pointerDown.y});
  }
  if(dragStarted)queue({type:'mouseMove',...p});
});
function finishPointer(e){
  if(!pointerDown||pointerDown.id!==e.pointerId)return;
  e.preventDefault();
  const p=coords(e);
  if(dragStarted)queue({type:'mouseUp',...p});
  else queue({type:'click',...p});
  pointerDown=null;
  dragStarted=false;
  focusKeyboard();
}
screen.addEventListener('pointerup',finishPointer);
screen.addEventListener('pointercancel',e=>{
  if(!pointerDown||pointerDown.id!==e.pointerId)return;
  const p=coords(e);
  if(dragStarted)queue({type:'mouseUp',...p});
  pointerDown=null;
  dragStarted=false;
});
screen.addEventListener('click',e=>e.preventDefault());
screen.addEventListener('wheel',e=>{e.preventDefault();queue({type:'wheel',...coords(e),dx:e.deltaX,dy:e.deltaY});},{passive:false});

const keys={ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down'};
// Android IMEs need a local character to keep emitting backspace on an empty bridge.
const keyboardSentinel='\u200b';
let composing=false;
function resetKeyboard(){
  keyboard.value=keyboardSentinel;
  keyboard.setSelectionRange(keyboardSentinel.length,keyboardSentinel.length);
}
function flushKeyboard(){
  const text=keyboard.value.startsWith(keyboardSentinel)?keyboard.value.slice(1):keyboard.value;
  if(text)queue({type:'text',text});
  resetKeyboard();
}
function deleteFromKeyboard(inputType){
  queue({type:'key',key:inputType.endsWith('Forward')?'Delete':'Backspace',modifiers:inputType.includes('Word')?['control']:[]});
  resetKeyboard();
}
function modifiers(e){return [e.ctrlKey?'control':null,e.metaKey?'meta':null,e.shiftKey?'shift':null,e.altKey?'alt':null].filter(Boolean);}
function handleKeydown(e,fromKeyboard=false){
  if(e.isComposing||composing)return;
  if(['Backspace','Delete','Tab','Enter','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)||((e.ctrlKey||e.metaKey)&&['a','c','v','x'].includes(e.key.toLowerCase()))){
    e.preventDefault();
    queue({type:'key',key:keys[e.key]||(e.key.length===1?e.key.toUpperCase():e.key),modifiers:modifiers(e)});
  }else if(!fromKeyboard&&e.key&&e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    e.preventDefault();
    queue({type:'text',text:e.key});
  }
}
keyboard.addEventListener('keydown',e=>handleKeydown(e,true));
window.addEventListener('keydown',e=>{if(e.target!==keyboard)handleKeydown(e,false);},{capture:true});
keyboard.addEventListener('beforeinput',e=>{
  if(composing||e.isComposing)return;
  if(e.inputType?.startsWith('delete')&&e.cancelable){
    e.preventDefault();
    deleteFromKeyboard(e.inputType);
  }
});
keyboard.addEventListener('input',e=>{
  if(composing||e.isComposing)return;
  if(e.inputType?.startsWith('delete'))deleteFromKeyboard(e.inputType);
  else flushKeyboard();
});
keyboard.addEventListener('compositionstart',()=>{composing=true;});
keyboard.addEventListener('compositionend',()=>{composing=false;flushKeyboard();});
resetKeyboard();
window.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text');if(text){e.preventDefault();queue({type:'text',text});focusKeyboard();}},{capture:true});
select.onchange=()=>{current=Number(select.value);screen.hidden=true;pointerDown=null;lastAction=Date.now();};
document.querySelector('#close').onclick=async()=>{if(current)await queue({type:'close'});};

async function tick(){
  try{
    if(document.hidden){if(running)setTimeout(tick,1000);return;}
    if(Date.now()-lastList>3000){
      const response=await fetch('/api/windows',{signal:AbortSignal.timeout(12000)});
      if(response.status===401)throw Error('เซสชันหมดอายุ กรุณารีเฟรชหน้าเว็บแล้วเข้าสู่ระบบใหม่');
      if(!response.ok)throw Error('เชื่อมต่อไม่ได้ กำลังลองใหม่...');
      const allWindows=await response.json();
      windows=remoteTarget?allWindows.filter(w=>w.target===remoteTarget):allWindows;
      lastList=Date.now();
    }
    if(!windows.some(w=>w.id===current))current=windows.at(-1)?.id||null;
    const signature=JSON.stringify(windows.map(w=>[w.id,w.title,w.url]));
    if(signature!==listSignature){
      const previousSignature=listSignature;
      select.replaceChildren(...windows.map(w=>{const o=document.createElement('option');o.value=w.id;o.textContent=w.title||'TikTok';o.selected=w.id===current;return o;}));
      listSignature=signature;
      if(previousSignature&&Date.now()-lastAction<10000){
        const newest=windows.at(-1)?.id||null;
        if(newest&&newest!==current){current=newest;select.value=String(current);screen.hidden=true;pointerDown=null;}
      }
    }
    const empty=document.querySelector('#empty');
    empty.hidden=!!current;
    screen.hidden=!current;
    if(current){
      const w=activeWindow();document.querySelector('#address').textContent=w?.url||'';
      const frameId=current,started=performance.now(),frame=await fetch('/api/window/frame?id='+frameId,{signal:AbortSignal.timeout(12000)});
      if(!frame.ok){let message='กำลังเปลี่ยนหน้าต่าง...';try{message=(await frame.json()).error||message;}catch{}if(!objectUrl)screen.hidden=true;throw Error(message);}
      const next=URL.createObjectURL(await frame.blob());
      const decoded=new Image();decoded.src=next;try{await decoded.decode();}catch(e){URL.revokeObjectURL(next);throw e;}
      if(frameId===current&&running){frameFailures=0;screen.src=next;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=next;status.textContent=`เชื่อมต่อแล้ว · รับภาพ ${Math.round(performance.now()-started)} ms · คลิก พิมพ์ภาษาไทย วางข้อความ และเลื่อนหน้าได้`;}else URL.revokeObjectURL(next);
    }else{
      frameFailures=0;
      document.querySelector('#address').textContent='';
      if(await loginSessionReady()){
        closeAfterLogin();
        return;
      }
      status.textContent=remoteRecoveryChannel?`กำลังเตรียม ${targetActionText()}...`:'รอหน้าต่าง TikTok จากหน้า Studio';
      empty.innerHTML=remoteRecoveryChannel
        ? `กำลังเปิด ${targetActionText()} ให้ใหม่<br><small>ถ้าหน้าต่าง TikTok ถูกปิด ระบบจะเปิดกลับให้อัตโนมัติ</small>`
        : 'ยังไม่มีหน้าต่าง TikTok เปิดอยู่<br><small>กลับไปหน้า Studio แล้วกด “เข้าสู่ระบบด้วย TikTok” อีกครั้ง</small>';
      void invokeRemoteRecovery();
    }
  }catch(e){
    frameFailures=Math.min(frameFailures+1,8);
    status.textContent=e.message;
    const empty=document.querySelector('#empty');
    if(!objectUrl){
      screen.hidden=true;
      empty.hidden=false;
      empty.innerHTML=`โหลดหน้าต่าง TikTok ไม่สำเร็จ<br><small>${String(e.message||'กรุณากลับไปกดเข้าสู่ระบบด้วย TikTok อีกครั้ง')}</small>`;
    }
  }
  const activeDelay=Date.now()-lastAction<2500?180:900;
  const retryDelay=frameFailures?Math.min(5000,700*frameFailures):activeDelay;
  if(running)setTimeout(tick,document.hidden?1000:retryDelay);
}
const diagnostic=document.createElement('div');diagnostic.id='diagnostics';diagnostic.style.cssText='display:none!important';status.after(diagnostic);
async function diagnose(){
  const id=current;
  try{if(id&&!document.hidden){
    const response=await fetch('/api/window/diagnostics?id='+id,{signal:AbortSignal.timeout(6000)});
    if(response.status===404){diagnostic.textContent='ตัวเซิร์ฟเวอร์ยังเป็นรุ่นก่อนหน้า — เปิด Restart-Direct-Login.cmd จากโฟลเดอร์เพื่อโหลดตัวตรวจสอบ';}
    else if(response.ok){const d=await response.json();if(id===current){
      if(d.mode==='visible'){diagnostic.textContent='ใช้หน้าต่าง Chrome ที่เปิด TikTok โดยตรงได้ แต่แท็บ remote นี้จะไม่ปิดเอง';}
      const issues=d.networkIssues.filter(e=>Date.now()-e.at<120000).slice(-3);
      diagnostic.textContent=`เบราว์เซอร์: ${d.mode==='visible'?'หน้าต่าง Chrome จริง — ใช้หน้าต่างนั้นเพื่อล็อกอิน':d.mode==='background-chrome'?'Chrome ปกติทำงานเบื้องหลัง':'โหมดส่งภาพ (headless)'}\nเซสชัน TikTok: ${d.sessionPresent?'พบ':'ยังไม่พบ'} · ข้อมูล multi_sids: ${d.multiSessionPresent?'พบ':'ยังไม่พบ'}`+(issues.length?'\nข้อผิดพลาดเครือข่ายล่าสุด: '+issues.map(e=>`${e.host}: ${e.code}`).join(' | '):'\nยังไม่พบ HTTP 4xx/5xx หรือข้อผิดพลาดการเชื่อมต่อที่บันทึกไว้ (ยังไม่ยืนยันว่าล็อกอินสำเร็จ)');
    }}
  }}catch{diagnostic.textContent='อ่านสถานะเบราว์เซอร์ไม่ได้';}
  if(running)setTimeout(diagnose,3000);
}
window.addEventListener('beforeunload',()=>{running=false;if(objectUrl)URL.revokeObjectURL(objectUrl);});
tick();diagnose();
