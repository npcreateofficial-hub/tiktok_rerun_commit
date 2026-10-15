// Compatibility adapter for the original server logic. The user interface is HTTP-only.
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const childProcess=require('node:child_process'),nativeSpawn=childProcess.spawn;
childProcess.spawn=(command,args,options)=>nativeSpawn(command,args,{...options,windowsHide:true});
const app=new EventEmitter(),sessions=new Map(),windows=new Map();let nextWindow=1,quitting=false;
const paths={temp:os.tmpdir()};
app.isPackaged=true;app.setPath=(key,value)=>paths[key]=value;app.getPath=key=>paths[key];app.getAppPath=()=>__dirname;
app.getVersion=()=> '0.1.3';app.whenReady=()=>Promise.resolve();app.commandLine={appendSwitch(){}};
app.quit=()=>{if(quitting)return;quitting=true;app.emit('before-quit');Promise.allSettled([...sessions.values()].map(s=>s.close())).finally(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();};
process.resourcesPath=path.resolve(__dirname,'..');
function shouldRunBrowserHeadless(){
  if(process.env.NP_BROWSER_HEADLESS==='0')return false;
  if(process.env.NP_BROWSER_HEADLESS==='1')return true;
  return process.platform==='linux'&&!process.env.DISPLAY;
}
function commandPath(name){
  const pathEnv=String(process.env.PATH||'');
  for(const dir of pathEnv.split(path.delimiter)){
    if(!dir)continue;
    const candidate=path.join(dir,name);
    if(fs.existsSync(candidate))return candidate;
  }
  return '';
}
function playwrightChromiumPath(){
  try{
    const {chromium}=require('playwright-core');
    const executable=chromium.executablePath();
    return fs.existsSync(executable)?executable:'';
  }catch{return '';}
}
function browserExecutable(){
  const choices=[
    process.env.NP_BROWSER_PATH,
    commandPath('google-chrome-stable'),
    commandPath('google-chrome'),
    commandPath('chromium'),
    commandPath('chromium-browser'),
    commandPath('microsoft-edge-stable'),
    commandPath('microsoft-edge'),
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/microsoft-edge',
    playwrightChromiumPath(),
    path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);
  const found=choices.find(p=>fs.existsSync(p));if(!found)throw Error('ต้องติดตั้ง Google Chrome หรือ Microsoft Edge บนเครื่องเซิร์ฟเวอร์');return found;
}
class BrowserSession {
  constructor(partition){this.partition=partition;this.capture=null;this.contextPromise=null;this.networkIssues=[];
    this.contextLock=Promise.resolve();this.visible=false;this.savedCookies=[];
    this.cookies={get:async filter=>{let all;for(let attempt=0;attempt<2;attempt++){try{const context=await this.context();all=await context.cookies();break;}catch(error){if(attempt)throw error;}}this.savedCookies=all;return all.filter(c=>!filter.name||c.name===filter.name);}};
    this.webRequest={onSendHeaders:(_filter,callback)=>this.capture=callback};
  }
  context(showWindow=false){
    const operation=this.contextLock.then(async()=>{
      const visible=true; // Full Chrome mode, with its native window parked offscreen.
      if(visible&&this.contextPromise&&!this.visible){const previous=await this.contextPromise;this.savedCookies=await previous.cookies();await previous.close();this.contextPromise=null;}
      return this.createContext(visible);
    });
    this.contextLock=operation.catch(()=>{});return operation;
  }
  async createContext(visible){
    if(!this.contextPromise)this.contextPromise=(async()=>{
      const {chromium}=require('playwright-core');
      const profile=path.join(app.getPath('userData'),'browser',crypto.createHash('sha256').update(this.partition).digest('hex').slice(0,24));
      const context=await chromium.launchPersistentContext(profile,{executablePath:browserExecutable(),chromiumSandbox:false,headless:shouldRunBrowserHeadless(),viewport:{width:1600,height:900},locale:'th-TH',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--window-position=-24000,-24000','--window-size=1640,1000','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
      this.visible=visible;this.liveContext=context;
      if(this.savedCookies.length)await context.addCookies(this.savedCookies);
      this.initialPage=context.pages()[0];
      try{if(this.initialPage)await require('./backend-window.cjs').parkBackendWindow(context,this.initialPage);}catch(error){await context.close();throw error;}
      context.on('close',()=>{if(this.liveContext===context){this.liveContext=null;this.contextPromise=null;this.visible=false;}});
      const {recordNetworkIssue}=require('./browser-diagnostics.cjs');
      context.on('requestfailed',request=>recordNetworkIssue(this.networkIssues,request.url(),null,request.failure()?.errorText));
      context.on('response',response=>{if(response.status()>=400)recordNetworkIssue(this.networkIssues,response.url(),response.status());});
      context.on('request',async request=>{if(this.capture){try{this.capture({url:request.url(),requestHeaders:await request.allHeaders()});}catch{}}});
      return context;
    })().catch(error=>{this.contextPromise=null;throw error;});
    return this.contextPromise;
  }
  async resetContext(){
    if(this.contextPromise){
      try{this.savedCookies=await (await this.contextPromise).cookies();}catch{}
      try{await (await this.contextPromise).close();}catch{}
    }
    this.contextPromise=null;this.liveContext=null;this.visible=false;
  }
  async newPage(){
    const context=await this.context(true);
    try{return await context.newPage();}
    catch(error){
      if(!/Target\.createTarget|Failed to open a new tab|Browser has been closed|Target closed/i.test(String(error?.message||'')))throw error;
      await this.resetContext();
      return await (await this.context(true)).newPage();
    }
  }
  setPermissionRequestHandler(){}
  async flushStorageData(){if(this.contextPromise){const ctx=await this.contextPromise;const page=ctx.pages()[0];if(!page)return;const cdp=await ctx.newCDPSession(page);await cdp.send('Storage.getCookies');await cdp.detach();}}
  async clearStorageData(){const ctx=await this.context();await ctx.clearCookies();this.savedCookies=[];for(const page of ctx.pages()){await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();}).catch(()=>{});}}
  async clearCache(){const ctx=await this.context();const page=ctx.pages()[0];if(!page)return;const cdp=await ctx.newCDPSession(page);await cdp.send('Network.clearBrowserCache');await cdp.detach();}
  async close(){if(this.contextPromise){const ctx=await this.contextPromise;await ctx.close();}}
}
function fromPartition(partition){if(!sessions.has(partition))sessions.set(partition,new BrowserSession(partition));return sessions.get(partition);}
class BrowserWindow extends EventEmitter {
  constructor(options={},existingPage=null){
    super();this.id=nextWindow++;this.title=options.title||'TikTok';this.size=[Math.max(1600,options.width||0),Math.max(900,options.height||0)];this.destroyed=false;this.children=[];
    this.webContents=new EventEmitter();const wc=this.webContents;wc.session=fromPartition(options.webPreferences?.partition||'default');wc.loading=true;wc.url='';wc.ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    this.pagePromise=(async()=>{
      const context=await wc.session.context(true);
      const initial=wc.session.initialPage;wc.session.initialPage=null;
      const page=existingPage||initial||await wc.session.newPage();await page.setViewportSize({width:this.size[0],height:this.size[1]});
      await require('./backend-window.cjs').parkBackendWindow(context,page);
      page.on('load',()=>{wc.loading=false;wc.url=page.url();wc.emit('did-finish-load');wc.emit('did-stop-loading');});
      page.on('framenavigated',frame=>{if(frame===page.mainFrame())wc.url=frame.url();});
      page.on('close',()=>{this.destroyed=true;windows.delete(this.id);this.emit('closed');});
      page.on('popup',async popup=>{const decision=wc.openHandler?.({url:popup.url()});if(decision?.action==='deny'){await popup.close();return;}const child=new BrowserWindow({...options,title:'TikTok Login'},popup);this.children.push(child);});
      return page;
    })();
    this.pagePromise.catch(error=>{this.error=error.message;this.destroyed=true;windows.delete(this.id);wc.loading=false;wc.emit('did-stop-loading');this.emit('closed');});
    wc.isLoading=()=>wc.loading;wc.getURL=()=>wc.url;wc.getUserAgent=()=>wc.ua;wc.setUserAgent=ua=>wc.ua=ua;wc.setFrameRate=()=>{};wc.setWindowOpenHandler=fn=>wc.openHandler=fn;
    wc.getDiagnostics=async()=>{
      const all=await wc.session.cookies.get({});
      const present=name=>all.some(c=>c.name===name&&Boolean(c.value)&&/(^|\.)tiktok\.com$/.test(c.domain.replace(/^\./,'')));
      return {mode:'background-chrome',sessionPresent:present('sessionid'),multiSessionPresent:present('multi_sids'),networkIssues:wc.session.networkIssues.slice(),loading:wc.loading};
    };
    wc.executeJavaScript=async script=>(await this.pagePromise).evaluate(script);
    wc.capturePage=async()=>{const page=await this.pagePromise;const bytes=await page.screenshot({type:'png',timeout:10000});return{toPNG:()=>bytes};};
    wc.insertText=async text=>{
      const page=await this.pagePromise;
      const cdp=await page.context().newCDPSession(page);
      try{await cdp.send('Input.insertText',{text});}
      finally{await cdp.detach().catch(()=>{});}
    };
    wc.sendInputEvent=async e=>{
      const page=await this.pagePromise;
      if(e.type==='click'){
        try{
          await page.mouse.move(e.x,e.y);
          await page.mouse.down({button:'left',clickCount:e.clickCount||1});
          await page.waitForTimeout(35).catch(()=>{});
          await page.mouse.up({button:'left',clickCount:e.clickCount||1});
        }catch(error){
          const cdp=await page.context().newCDPSession(page);
          try{
            await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:e.x,y:e.y,button:'none'});
            await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:e.x,y:e.y,button:'left',clickCount:e.clickCount||1});
            await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:e.x,y:e.y,button:'left',clickCount:e.clickCount||1});
          }finally{
            await cdp.detach().catch(()=>{});
          }
        }
      }
      else if(e.type==='mouseDown')await page.mouse.move(e.x,e.y).then(()=>page.mouse.down());
      else if(e.type==='mouseUp'){await page.mouse.move(e.x,e.y);await page.mouse.up();}
      else if(e.type==='mouseMove')await page.mouse.move(e.x,e.y);
      else if(e.type==='mouseWheel'){await page.mouse.move(e.x,e.y);await page.mouse.wheel(e.deltaX,-e.deltaY);}
      else if(e.type==='keyDown'){const map={Left:'ArrowLeft',Right:'ArrowRight',Up:'ArrowUp',Down:'ArrowDown'},mods={control:'Control',shift:'Shift',alt:'Alt',meta:'Meta'};await page.keyboard.press([...(e.modifiers||[]).map(m=>mods[m]),map[e.keyCode]||e.keyCode].join('+'));}
    };
    windows.set(this.id,this);app.emit('browser-window-created',{},this);
  }
  async loadURL(url){this.webContents.loading=true;try{const page=await this.pagePromise;await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});this.webContents.url=page.url();}catch(error){this.error=error.message;}finally{this.webContents.loading=false;this.webContents.emit('did-stop-loading');}}
  getContentSize(){return this.size;}getTitle(){return this.title;}setTitle(value){this.title=value;}isDestroyed(){return this.destroyed;}getChildWindows(){return this.children;}show(){this.emit('show');}hide(){}focus(){}
  close(){this.pagePromise.then(async page=>{this.webContents.session.savedCookies=await page.context().cookies();await page.close();}).catch(()=>{this.destroyed=true;windows.delete(this.id);this.emit('closed');});}destroy(){this.close();}
  static getAllWindows(){return [...windows.values()];}
}
function storageKey(){
  const file=path.join(app.getPath('userData'),'.web-storage-key');
  if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});
  const key=fs.readFileSync(file);if(key.length!==32)throw Error('Invalid local encryption key');return key;
}
const safeStorage={isEncryptionAvailable:()=>true,encryptString(text){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',storageKey(),iv),encrypted=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
  return Buffer.concat([Buffer.from('NPWEB1'),iv,cipher.getAuthTag(),encrypted]);
},decryptString(bytes){
  if(bytes.subarray(0,6).toString()!=='NPWEB1')throw Error('Unknown encrypted storage format');
  const decipher=crypto.createDecipheriv('aes-256-gcm',storageKey(),bytes.subarray(6,18));decipher.setAuthTag(bytes.subarray(18,34));return Buffer.concat([decipher.update(bytes.subarray(34)),decipher.final()]).toString('utf8');
}};
const shim={app,BrowserWindow,session:{fromPartition},ipcMain:{handle(){}},dialog:{},protocol:{registerSchemesAsPrivileged(){},handle(){}},safeStorage,shell:{openExternal:async()=>{throw Error('Use browser links');}},net:{request:options=>{const url=new URL(options.url);return require(url.protocol==='https:'?'node:https':'node:http').request(url,{method:options.method||'GET'});}}};
const Module=require('node:module'),originalLoad=Module._load;
Module._load=function(name,parent,isMain){if(name==='electron')return shim;if(name==='electron-updater')return{autoUpdater:{on(){},checkForUpdates:async()=>{},quitAndInstall(){}}};return originalLoad.call(this,name,parent,isMain);};
module.exports=shim;
