(() => {
  const listeners=new Map();
  const stagedLibraryFiles=new Map();
  let nativeBrowser=false;
  function cookieValue(name){
    return document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';
  }
  function activeUsername(){
    const webUser=localStorage.getItem('np.web.active.username');
    const legacyUser=localStorage.getItem('np.active.username');
    return String(window.__npActiveUsername||webUser||legacyUser||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'');
  }
  function unscopedAccountId(accountId){
    const raw=String(accountId||'main').trim()||'main';
    const user=activeUsername();
    const prefix=user?user+'__':'';
    return prefix&&raw.startsWith(prefix)?(raw.slice(prefix.length)||'main'):raw;
  }
  function savedAccountIds(){
    try{
      const items=JSON.parse(localStorage.getItem('rerun.accounts')||'[]');
      const ids=(Array.isArray(items)?items:[]).map(item=>String(item?.id||'').trim()).filter(Boolean);
      return [...new Set(['main', ...ids])];
    }catch{return ['main'];}
  }
  function secureHeaders(extra={}){
    return {...extra,'X-NP-Web':'1','X-NP-CSRF':cookieValue('np_csrf')};
  }
  const browserModeReady=fetch('/api/browser-mode').then(async r=>{
    if(r.ok){nativeBrowser=Boolean((await r.json()).visible);return;}
    // Compatibility with an already running server, until the next restart.
    const windows=await (await fetch('/api/windows')).json();
    if(windows.length){const d=await fetch('/api/window/diagnostics?id='+windows[0].id);if(d.ok)nativeBrowser=(await d.json()).mode==='visible';}
  }).catch(()=>{});
  const choices={'media:choose-video':'video/*,.mkv,.m4v','media:choose-overlay':'image/png,image/jpeg,image/webp','sales:choose-file':'.csv,.tsv,.txt','library:add':'video/*,.mkv,.m4v'};
  const apiInflight=new Map();
  const apiCache=new Map();
  const cacheableApiChannels=new Set(['app:info','license:status','stream:status','tiktok:status']);
  function apiCacheKey(url,payload){
    try{return url+':'+JSON.stringify({channel:payload?.channel,args:payload?.args||[]});}
    catch{return '';}
  }
  function apiCacheTtl(channel){
    return channel==='stream:status'?1000:1000;
  }
  async function api(url,payload){
    const channel=payload?.channel;
    const cacheable=url==='/api/invoke'&&cacheableApiChannels.has(channel);
    const key=cacheable?apiCacheKey(url,payload):'';
    if(key){
      const cached=apiCache.get(key);
      if(cached&&Date.now()-cached.at<apiCacheTtl(channel))return cached.data;
      const pending=apiInflight.get(key);
      if(pending)return pending;
    }
    const request=(async()=>{
      const response=await fetch(url,{method:'POST',headers:secureHeaders({'Content-Type':'application/json'}),body:JSON.stringify(payload)});
      if(response.status===401)throw Error('เซสชันเว็บหมดอายุ กรุณารีเฟรชหน้าเว็บแล้วเข้าสู่ระบบใหม่');
      if(response.status===429){
        const cached=key?apiCache.get(key):null;
        if(cached)return cached.data;
        throw Error('ระบบรับคำสั่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
      }
      const text=await response.text();
      let data;
      try{data=text?JSON.parse(text):{};}catch{
        if(/^\s*</.test(text))throw Error('server ตอบกลับเป็นหน้าเว็บแทนข้อมูล กรุณารีเฟรชหน้า Studio แล้วลองใหม่');
        throw Error(text||'คำขอไม่สำเร็จ');
      }
      if(!response.ok)throw Error(data.error||'คำขอไม่สำเร็จ');
      if(key)apiCache.set(key,{at:Date.now(),data});
      return data;
    })();
    if(key){
      apiInflight.set(key,request);
      try{return await request;}
      finally{apiInflight.delete(key);}
    }
    return request;
  }
  function choose(accept){return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;document.body.append(input);
    input.onchange=()=>{resolve(input.files[0]||null);input.remove();};input.oncancel=()=>{resolve(null);input.remove();};input.click();
  });}
  function token(){return (crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2));}
  function pendingUploadStore(){
    if(!window.__npPendingLibraryUploads){
      let saved=[];
      try{saved=JSON.parse(localStorage.getItem('np.pendingLibraryUploads')||'[]');}catch{}
      window.__npPendingLibraryUploads=new Map((Array.isArray(saved)?saved:[]).filter(item=>item&&item.uploadToken).map(item=>[item.uploadToken,item]));
    }
    return window.__npPendingLibraryUploads;
  }
  function persistPendingUploads(){
    try{localStorage.setItem('np.pendingLibraryUploads',JSON.stringify([...pendingUploadStore().values()].filter(item=>item&&item.phase!=='complete')));}catch{}
  }
  async function listLibraryUploadJobs(){
    const response=await fetch('/api/library-upload-jobs',{headers:secureHeaders()});
    if(!response.ok)return [];
    const data=await response.json().catch(()=>({jobs:[]}));
    return Array.isArray(data.jobs)?data.jobs:[];
  }
  async function cancelLibraryUploadJob(id){
    const response=await fetch('/api/library-upload-jobs/cancel',{method:'POST',headers:secureHeaders({'Content-Type':'application/json'}),body:JSON.stringify({id})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'ยกเลิกอัปโหลดไม่สำเร็จ');
    pendingUploadStore().delete(id);
    persistPendingUploads();
    return data;
  }
  function formatUploadBytes(value){
    const size=Number(value||0),units=['B','KB','MB','GB'];let next=size,unit=0;
    while(next>=1024&&unit<units.length-1){next/=1024;unit+=1;}
    return (next>=100?next.toFixed(0):next>=10?next.toFixed(1):next.toFixed(2))+' '+units[unit];
  }
  function formatUploadEta(seconds){
    if(!Number.isFinite(seconds)||seconds<1)return 'อีกไม่ถึง 1 วินาที';
    const mins=Math.floor(seconds/60),secs=Math.round(seconds%60);
    if(mins<=0)return 'อีกประมาณ '+secs+' วินาที';
    return 'อีกประมาณ '+mins+' นาที '+secs+' วินาที';
  }
  async function upload(file,uploadToken){
    if(file.size>2*1024*1024*1024)throw Error('แต่ละคลิปต้องมีขนาดไม่เกิน 2 GB');
    const uploadKind=uploadToken?'&kind=library':'';
    const store=pendingUploadStore();
    if(uploadToken){
      const current=store.get(uploadToken)||{};
      store.set(uploadToken,{...current,uploadToken,fileName:file.name,name:current.name||file.name,size:file.size,phase:'uploading',percent:0,updatedAt:Date.now()});
      persistPendingUploads();
    }
    const status={set textContent(_value){},remove(){}};
    const startedAt=Date.now();
    const emitProgress=(detail)=>{
      const current=uploadToken?(store.get(uploadToken)||{}):{};
      const next={uploadToken,fileName:file.name,size:file.size,...detail,name:current.name||detail.name||file.name,updatedAt:Date.now()};
      if(uploadToken){
        const current=store.get(uploadToken)||{};
        store.set(uploadToken,{...current,...next});
        persistPendingUploads();
      }
      window.dispatchEvent(new CustomEvent('np-upload-progress',{detail:next}));
    };
    const progressText=(loaded,total)=>{
      const elapsed=Math.max((Date.now()-startedAt)/1000,.1),speed=loaded/elapsed,remaining=Math.max(total-loaded,0),eta=speed>0?remaining/speed:null,percent=Math.min(100,Math.round(loaded/total*100));
      return {percent,loaded,total,speed,eta,text:'กำลังอัปโหลดขึ้น server '+percent+'% — '+formatUploadBytes(loaded)+' / '+formatUploadBytes(total)+' · '+formatUploadBytes(speed)+'/s · '+formatUploadEta(eta)};
    };
    async function uploadChunked(){
      const remembered=uploadToken?(store.get(uploadToken)||{}):{};
      const resumeId=remembered.serverUploadId||remembered.uploadId||'';
      const init=await fetch('/api/upload-chunk?action=init&name='+encodeURIComponent(file.name)+'&size='+encodeURIComponent(file.size)+uploadKind+(resumeId?'&resumeId='+encodeURIComponent(resumeId):''),{method:'POST',headers:secureHeaders()});
      const initData=await init.json().catch(()=>({}));
      if(!init.ok)throw Error(initData.error||'เริ่มอัปโหลดไม่สำเร็จ');
      const id=initData.id,chunkSize=8*1024*1024;
      let offset=Math.max(0,Math.min(file.size,Number(initData.received||0)));
      if(uploadToken){
        const current=store.get(uploadToken)||{};
        store.set(uploadToken,{...current,serverUploadId:id,uploadId:id,phase:'uploading',percent:Math.round(offset/file.size*100),loaded:offset,total:file.size,updatedAt:Date.now()});
        persistPendingUploads();
        window.dispatchEvent(new CustomEvent('np-upload-progress',{detail:{uploadToken,serverUploadId:id,uploadId:id,phase:'uploading',percent:Math.round(offset/file.size*100),loaded:offset,total:file.size}}));
      }
      while(offset<file.size){
        const chunk=file.slice(offset,Math.min(offset+chunkSize,file.size));
        await new Promise((resolve,reject)=>{
          const xhr=new XMLHttpRequest();
          xhr.open('POST','/api/upload-chunk?action=append&id='+encodeURIComponent(id)+'&offset='+encodeURIComponent(offset));
          xhr.setRequestHeader('X-NP-Web','1');xhr.setRequestHeader('X-NP-CSRF',cookieValue('np_csrf'));
          xhr.upload.onprogress=e=>{const p=progressText(offset+(e.lengthComputable?e.loaded:0),file.size);status.textContent=p.text+' — '+file.name;emitProgress({phase:'uploading',...p});};
          xhr.onerror=()=>reject(Error('อัปโหลดไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ'));
          xhr.onload=()=>{try{const d=JSON.parse(xhr.responseText||'{}');xhr.status===200?resolve(d):reject(Error(d.error||'อัปโหลดไม่สำเร็จ'));}catch{reject(Error('อัปโหลดไม่สำเร็จ'));}};
          xhr.send(chunk);
        });
        offset+=chunk.size;
        const p=progressText(offset,file.size);status.textContent=p.text+' — '+file.name;emitProgress({phase:'uploading',...p});
      }
      const finish=await fetch('/api/upload-chunk?action=finish&id='+encodeURIComponent(id),{method:'POST',headers:secureHeaders()});
      const data=await finish.json().catch(()=>({}));
      if(!finish.ok)throw Error(data.error||'บันทึกไฟล์ไม่สำเร็จ');
      emitProgress({phase:'processing',percent:100,loaded:file.size,total:file.size,speed:0,eta:0,text:'อัปโหลดครบแล้ว กำลังบันทึกเข้าคลัง'});
      return data;
    }
    if(file.size>32*1024*1024){
      try{return await uploadChunked();}catch(error){emitProgress({phase:'error',text:error instanceof Error?error.message:String(error)});throw error;}finally{status.remove();}
    }
    try{return await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/upload?name='+encodeURIComponent(file.name)+uploadKind);xhr.setRequestHeader('X-NP-Web','1');xhr.setRequestHeader('X-NP-CSRF',cookieValue('np_csrf'));
      xhr.upload.onprogress=e=>{if(e.lengthComputable){const p=progressText(e.loaded,e.total);status.textContent=p.text+' — '+file.name;emitProgress({phase:'uploading',...p});}};
      xhr.onerror=()=>{emitProgress({phase:'error',text:'อัปโหลดไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ'});reject(Error('อัปโหลดไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ'));};xhr.onload=()=>{try{const d=JSON.parse(xhr.responseText);if(xhr.status===200){emitProgress({phase:'processing',percent:100,text:'อัปโหลดครบแล้ว กำลังบันทึกเข้าคลัง'});resolve(d);}else{emitProgress({phase:'error',text:d.error||'อัปโหลดไม่สำเร็จ'});reject(Error(d.error||'อัปโหลดไม่สำเร็จ'));}}catch{emitProgress({phase:'error',text:'เซสชันเว็บหมดอายุ'});reject(Error('เซสชันเว็บหมดอายุ'));}};xhr.send(file);
    });}finally{status.remove();}
  }
  async function ensureLibraryQuotaAvailable(exceptUploadToken=''){
    const status=(await api('/api/invoke',{channel:'license:status',args:[]})).result;
    const limit=Number(status?.videoLimit);
    if(!Number.isFinite(limit)||limit<=0)return;
    const list=(await api('/api/invoke',{channel:'library:list',args:[]})).result;
    const savedCount=Array.isArray(list)?list.length:0;
    const serverJobs=await listLibraryUploadJobs().catch(()=>[]);
    const pendingKeys=new Set(serverJobs.map(item=>String(item.uploadToken||item.uploadId||'')));
    const localPending=[...pendingUploadStore().values()].filter(item=>item&&item.uploadToken!==exceptUploadToken&&item.phase!=='complete'&&item.phase!=='error'&&!pendingKeys.has(String(item.uploadToken||'')));
    const pendingCount=serverJobs.filter(item=>String(item.uploadToken||item.uploadId||'')!==exceptUploadToken&&item.phase!=='complete'&&item.phase!=='error').length+localPending.length;
    const used=savedCount+pendingCount;
    const max=Math.floor(limit);
    if(used>=max)throw Error(`ครบแพ็กเกจแล้วค่ะ เพิ่มวิดีโอได้สูงสุด ${max} ไฟล์ ตอนนี้ครบ ${savedCount}/${max} ไฟล์แล้ว`);
  }
  window.__npChooseLibraryVideo=async()=>{
    await ensureLibraryQuotaAvailable();
    const file=await choose('video/*,.mkv,.m4v');
    if(!file)return null;
    const existing=[...pendingUploadStore().values()].find(item=>item&&item.fileName===file.name&&Number(item.size)===Number(file.size)&&item.phase!=='complete');
    const uploadToken=existing?.uploadToken||token();
    stagedLibraryFiles.set(uploadToken,file);
    return {uploadToken,path:file.name,name:file.name,size:file.size,addedAt:Date.now(),mediaUrl:URL.createObjectURL(file)};
  };
  window.__npSaveLibraryVideo=async(payload={})=>{
    await ensureLibraryQuotaAvailable(payload?.uploadToken||'');
    const file=payload?.uploadToken?stagedLibraryFiles.get(payload.uploadToken):null;
    let uploadId;
    if(file){
      const uploaded=await upload(file,payload.uploadToken);
      uploadId=uploaded.id;
      if(uploadId){
        const current=pendingUploadStore().get(payload.uploadToken)||{};
        pendingUploadStore().set(payload.uploadToken,{...current,uploadId,serverUploadId:uploadId,name:payload.name||current.name||file.name,fileName:file.name,phase:'processing',percent:100,updatedAt:Date.now()});
        persistPendingUploads();
      }
      stagedLibraryFiles.delete(payload.uploadToken);
    }
    const result=(await api('/api/invoke',{channel:'library:save-file',args:[payload],uploadId})).result;
    if(payload?.uploadToken){
      pendingUploadStore().delete(payload.uploadToken);
      persistPendingUploads();
      window.dispatchEvent(new CustomEvent('np-upload-progress',{detail:{uploadToken:payload.uploadToken,phase:'complete',percent:100,text:'บันทึกเข้าคลังแล้ว'}}));
    }
    return result;
  };
  window.__npListLibraryUploadJobs=listLibraryUploadJobs;
  window.__npCancelLibraryUploadJob=cancelLibraryUploadJob;
  let remoteOperation=0;
  async function invoke(channel,...args){
    let uploadId;
    if(choices[channel]){if(channel==='library:add')await ensureLibraryQuotaAvailable();const file=await choose(choices[channel]);if(!file){if(channel==='library:add')return (await api('/api/invoke',{channel:'library:list',args:[]})).result;return null;}uploadId=(await upload(file)).id;}
    if(channel==='shell:open-external'){
      try{const u=new URL(args[0]);if(u.protocol==='https:'&&['youtube.com','youtu.be'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))){window.open(u.href,'_blank','noopener,noreferrer');return {opened:true};}}catch{}return {opened:false};
    }
    let remoteWindow,operation;
    if(['tiktok:login','tiktok:open','tiktok:open-shop','tiktok:open-ads-manager'].includes(channel)){
      const status=(await api('/api/invoke',{channel:'license:status',args:[]})).result;
      if(!status?.licensed)throw Error('กรุณาเข้าสู่ระบบ NP ด้วย License + Username + Password ก่อนเปิด TikTok');
      operation=++remoteOperation;
      const remoteTarget={
        'tiktok:login':'login',
        'tiktok:open':'home',
        'tiktok:open-shop':'shop',
        'tiktok:open-ads-manager':'ads'
      }[channel]||'';
      const remoteAccountId=String(args[0]||'main').trim()||'main';
      const remoteUrl='/remote.html?target='+encodeURIComponent(remoteTarget)+'&accountId='+encodeURIComponent(remoteAccountId);
      if(!nativeBrowser)remoteWindow=window.open(remoteUrl,'np-tiktok-window');
    }
    const result=(await api('/api/invoke',{channel,args,uploadId})).result;
    if(channel==='tiktok:login'&&result?.pending){
      for(let attempt=0;attempt<90;attempt+=1){
        await new Promise(resolve=>setTimeout(resolve,1000));
        const status=(await api('/api/invoke',{channel:'tiktok:status',args,uploadId:null})).result;
        if(status?.streamerReady){
          try{if(remoteWindow&&!remoteWindow.closed)remoteWindow.close();}catch{}
          window.focus();
          return {saved:true,streamerReady:true};
        }
      }
      return {saved:false,streamerReady:false,pending:true};
    }
    if(channel==='tiktok:login'&&result?.saved&&operation===remoteOperation){
      // Only close the viewer opened for this completed login, never a newer Shop/Ads window.
      try{if(remoteWindow&&!remoteWindow.closed)remoteWindow.close();}catch{}
      window.focus();
    }
    return result;
  }
  const ipcRenderer={invoke,on(channel,fn){if(!listeners.has(channel))listeners.set(channel,new Set());listeners.get(channel).add(fn);},removeListener(channel,fn){listeners.get(channel)?.delete(fn);}};
  window.__npElectronBridge={ipcRenderer,contextBridge:{exposeInMainWorld:(key,value)=>window[key]=value}};
  if(typeof EventSource==='function'){
    const source=new EventSource('/events');source.onmessage=e=>{const p=JSON.parse(e.data);for(const listener of listeners.get(p.channel)||[])listener({},...p.args);};
    source.onerror=()=>{document.documentElement.dataset.serverConnection='reconnecting';};source.onopen=()=>{document.documentElement.dataset.serverConnection='connected';};
  }
  window.addEventListener('DOMContentLoaded',()=>{
  });
})();
"use strict";

const electron_1 = window.__npElectronBridge;
function activeUsername() {
    const webUser = window.localStorage.getItem('np.web.active.username');
    const legacyUser = window.localStorage.getItem('np.active.username');
    return String(window.__npActiveUsername || webUser || legacyUser || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
}
function unscopedAccountId(accountId) {
    const raw = String(accountId || 'main').trim() || 'main';
    const user = activeUsername();
    const prefix = user ? `${user}__` : '';
    return prefix && raw.startsWith(prefix) ? (raw.slice(prefix.length) || 'main') : raw;
}
function savedAccountIds() {
    try {
        const items = JSON.parse(window.localStorage.getItem('rerun.accounts') || '[]');
        const ids = (Array.isArray(items) ? items : []).map((item) => String(item?.id || '').trim()).filter(Boolean);
        return [...new Set(['main', ...ids])];
    }
    catch {
        return ['main'];
    }
}
electron_1.contextBridge.exposeInMainWorld('rerun', {
    licenseLogin: (payload) => electron_1.ipcRenderer.invoke('license:login', payload),
    getLicenseStatus: () => electron_1.ipcRenderer.invoke('license:status'),
    licenseLogout: () => electron_1.ipcRenderer.invoke('license:logout'),
    getUpdateStatus: () => electron_1.ipcRenderer.invoke('update:get-status'),
    installUpdate: () => electron_1.ipcRenderer.invoke('update:install'),
    checkForUpdate: () => electron_1.ipcRenderer.invoke('update:check'),
    getUpdateConfig: () => electron_1.ipcRenderer.invoke('update:get-config'),
    setUpdateConfig: (payload) => electron_1.ipcRenderer.invoke('update:set-config', payload),
    getAnnouncements: () => electron_1.ipcRenderer.invoke('announcements:get'),
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:open-external', url),
    adminUnlock: (payload) => electron_1.ipcRenderer.invoke('admin:unlock', payload),
    adminStatus: () => electron_1.ipcRenderer.invoke('admin:status'),
    adminLock: () => electron_1.ipcRenderer.invoke('admin:lock'),
    adminIssueKey: (payload) => electron_1.ipcRenderer.invoke('admin:issue-key', payload),
    adminLookupUser: (username) => electron_1.ipcRenderer.invoke('admin:lookup', username),
    adminRevokeUser: (username) => electron_1.ipcRenderer.invoke('admin:revoke', username),
    adminListKeys: () => electron_1.ipcRenderer.invoke('admin:list'),
    onUpdateStatus: (callback) => {
        const listener = (_event, payload) => callback(payload);
        electron_1.ipcRenderer.on('update:status', listener);
        return () => electron_1.ipcRenderer.removeListener('update:status', listener);
    },
    chooseVideo: () => electron_1.ipcRenderer.invoke('media:choose-video'),
    probeClips: (paths) => electron_1.ipcRenderer.invoke('media:probe-clips', paths),
    chooseOverlay: () => electron_1.ipcRenderer.invoke('media:choose-overlay'),
    loginTikTok: (accountId) => electron_1.ipcRenderer.invoke('tiktok:login', accountId),
    getTikTokStatus: (accountId) => electron_1.ipcRenderer.invoke('tiktok:status', accountId),
    logoutTikTok: (accountId) => electron_1.ipcRenderer.invoke('tiktok:logout', accountId),
    openTikTok: (accountId) => electron_1.ipcRenderer.invoke('tiktok:open', accountId),
    openTikTokShop: (accountId) => electron_1.ipcRenderer.invoke('tiktok:open-shop', accountId),
    scanLiveConsole: (accountId) => electron_1.ipcRenderer.invoke('tiktok:scan-live-console', accountId),
    openAdsManager: (accountId) => electron_1.ipcRenderer.invoke('tiktok:open-ads-manager', accountId),
    scanAdsManager: (accountId) => electron_1.ipcRenderer.invoke('tiktok:scan-ads-manager', accountId),
    setAdsField: (accountId, target, value) => electron_1.ipcRenderer.invoke('tiktok:set-ads-field', accountId, target, value),
    getAdsLinkConfig: (accountId) => electron_1.ipcRenderer.invoke('ads:get-link-config', accountId),
    setAdsLinkConfig: (accountId, config) => electron_1.ipcRenderer.invoke('ads:set-link-config', accountId, config),
    getPinConfig: (accountId) => electron_1.ipcRenderer.invoke('pin:get-config', accountId),
    setPinConfig: (accountId, config) => electron_1.ipcRenderer.invoke('pin:set-config', accountId, config),
    listPinProducts: (accountId) => electron_1.ipcRenderer.invoke('pin:list-products', accountId),
    pinProductNow: (accountId, name) => electron_1.ipcRenderer.invoke('pin:pin-now', accountId, name),
    couponAction: (accountId, action) => electron_1.ipcRenderer.invoke('pin:coupon', accountId, action),
    getLiveStats: (accountId) => electron_1.ipcRenderer.invoke('pin:live-stats', accountId),
    startStream: (config) => electron_1.ipcRenderer.invoke('stream:start', config),
    applyStreamConfig: (config) => electron_1.ipcRenderer.invoke('stream:apply-config', config),
    saveStreamConfig: (config) => electron_1.ipcRenderer.invoke('stream:save-config', config),
    clearStreamConfig: (accountId) => electron_1.ipcRenderer.invoke('stream:clear-config', accountId),
    stopStream: (accountId) => electron_1.ipcRenderer.invoke('stream:stop', accountId),
    getStreamStatus: (accountId) => electron_1.ipcRenderer.invoke('stream:status', accountId),
    getLastStreamConfig: (accountId) => electron_1.ipcRenderer.invoke('stream:last-config', accountId),
    listStreamConfigs: () => electron_1.ipcRenderer.invoke('stream:list-configs'),
    getStreamSchedule: (accountId) => electron_1.ipcRenderer.invoke('stream:schedule:get', accountId),
    setStreamSchedule: (accountId, config) => electron_1.ipcRenderer.invoke('stream:schedule:set', accountId, config),
    getAppInfo: () => electron_1.ipcRenderer.invoke('app:info'),
    runBenchmark: (videoPath, overlayCounts) => electron_1.ipcRenderer.invoke('system:benchmark', videoPath, overlayCounts),
    onStreamStatus: (callback) => {
        const normalize = (payload) => payload && typeof payload === 'object'
            ? { ...payload, accountId: unscopedAccountId(payload.accountId) }
            : payload;
        const listener = (_event, payload) => callback(normalize(payload));
        electron_1.ipcRenderer.on('stream:status-changed', listener);
        let busy = false;
        const poll = async () => {
            if (busy)
                return;
            busy = true;
            try {
                for (const accountId of savedAccountIds()) {
                    const status = await electron_1.ipcRenderer.invoke('stream:status', accountId);
                    callback({ accountId: unscopedAccountId(accountId), status });
                }
            }
            catch {
                // EventSource remains the primary path; polling is only a stale-UI fallback.
            }
            finally {
                busy = false;
            }
        };
        const timer = window.setInterval(poll, 2000);
        window.setTimeout(poll, 500);
        return () => {
            electron_1.ipcRenderer.removeListener('stream:status-changed', listener);
            window.clearInterval(timer);
        };
    },
    onStreamHealth: (callback) => {
        const normalize = (payload) => payload && typeof payload === 'object'
            ? { ...payload, accountId: unscopedAccountId(payload.accountId) }
            : payload;
        const listener = (_event, payload) => callback(normalize(payload));
        electron_1.ipcRenderer.on('stream:health', listener);
        return () => electron_1.ipcRenderer.removeListener('stream:health', listener);
    },
    testChatAi: (accountId) => electron_1.ipcRenderer.invoke('chat:test-ai', accountId),
    testChatAiQuestion: (accountId, question) => electron_1.ipcRenderer.invoke('chat:test-ai-question', accountId, question),
    getChatConfig: (accountId) => electron_1.ipcRenderer.invoke('chat:get-config', accountId),
    setChatConfig: (accountId, config) => electron_1.ipcRenderer.invoke('chat:set-config', accountId, config),
    debugLiveChatScan: (accountId) => electron_1.ipcRenderer.invoke('debug:live-chat-scan', accountId),
    debugLiveChatApi: (accountId) => electron_1.ipcRenderer.invoke('debug:live-chat-api', accountId),
    recoverChatReaders: () => electron_1.ipcRenderer.invoke('debug:recover-chat-readers'),
    getLineConfig: () => electron_1.ipcRenderer.invoke('line:get-config'),
    setLineConfig: (config) => electron_1.ipcRenderer.invoke('line:set-config', config),
    testLine: (config) => electron_1.ipcRenderer.invoke('line:test', config),
    pushLineStatus: () => electron_1.ipcRenderer.invoke('line:push-status'),
    listHistory: () => electron_1.ipcRenderer.invoke('history:list'),
    clearHistory: () => electron_1.ipcRenderer.invoke('history:clear'),
    chooseSalesFile: () => electron_1.ipcRenderer.invoke('sales:choose-file'),
    previewSales: (mapping) => electron_1.ipcRenderer.invoke('sales:preview', mapping),
    commitSales: (payload) => electron_1.ipcRenderer.invoke('sales:commit', payload),
    listSales: () => electron_1.ipcRenderer.invoke('sales:list'),
    removeSalesBatch: (batchId) => electron_1.ipcRenderer.invoke('sales:remove-batch', batchId),
    onHistoryChanged: (callback) => {
        const listener = () => callback();
        electron_1.ipcRenderer.on('history:changed', listener);
        return () => electron_1.ipcRenderer.removeListener('history:changed', listener);
    },
    listLibrary: () => electron_1.ipcRenderer.invoke('library:list'),
    addLibrary: () => electron_1.ipcRenderer.invoke('library:add'),
    chooseLibraryVideo: () => window.__npChooseLibraryVideo(),
    saveLibraryVideo: (payload) => window.__npSaveLibraryVideo(payload),
    removeLibrary: (id) => electron_1.ipcRenderer.invoke('library:remove', id),
    onChatEvent: (callback) => {
        const normalize = (payload) => payload && typeof payload === 'object'
            ? { ...payload, accountId: unscopedAccountId(payload.accountId) }
            : payload;
        const listener = (_event, payload) => callback(normalize(payload));
        electron_1.ipcRenderer.on('chat:event', listener);
        return () => electron_1.ipcRenderer.removeListener('chat:event', listener);
    },
});



