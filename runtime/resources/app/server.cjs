const electron = require('./node-runtime.cjs');
const {app, BrowserWindow, ipcMain, dialog, protocol} = electron;
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {AsyncLocalStorage} = require('node:async_hooks');
const {pipeline} = require('node:stream/promises');
const {Readable, Transform} = require('node:stream');
const root = path.resolve(__dirname, '../../..');
const data = process.env.NP_WEB_DATA ? path.resolve(process.env.NP_WEB_DATA) : path.join(root, 'data');
fs.mkdirSync(path.join(data, 'profile'), {recursive:true});
fs.mkdirSync(path.join(data, 'uploads'), {recursive:true});
const backend=require('./np-backend.cjs')(path.join(data,'np'));
global.__npLocalBackend=backend;
app.setPath('userData', path.join(data, 'profile'));
app.setPath('sessionData', path.join(data, 'profile'));
app.commandLine.appendSwitch('disable-gpu');
const handlers = new Map(), protocols = new Map(), clients = new Set(), uploads = new Map(), chunkUploads = new Map();
const windowDiagnostics = new WeakMap();
const uploadContext = new AsyncLocalStorage();
const webRequestContext = new AsyncLocalStorage();
function persistentSecret(name) {
  const file = path.join(data, `${name}.secret`);
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(value)) return value;
  } catch {}
  const value = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, value, {mode: 0o600});
  return value;
}
const accessCode = persistentSecret('web-access-code');
const cookie = persistentSecret('web-session');
const csrfToken = persistentSecret('web-csrf');
function stableWebMachineId() {
  const existingPath = path.join(data, 'profile', 'machine-id');
  try {
    const existing = fs.readFileSync(existingPath, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(existing)) return existing;
  } catch {}
  return persistentSecret('web-machine-id');
}
const webMachineId = stableWebMachineId();
const port = Number(process.env.NP_WEB_PORT || 4173);
const origin = `http://127.0.0.1:${port}`;
const publicOrigin = String(process.env.NP_PUBLIC_ORIGIN || process.env.NP_USER_ORIGIN || '').replace(/\/+$/,'');
const adminOrigin = String(process.env.NP_ADMIN_ORIGIN || '').replace(/\/+$/,'');
const fallbackPublicOrigin = 'https://tiktok-live.np-class.com';
const fallbackPublicAliasOrigin = 'https://live.np-class.com';
const fallbackAdminOrigin = 'https://admin-tiktok-live.np-class.com';
const allowedOrigins = new Set([origin, ...(publicOrigin ? [publicOrigin] : []), fallbackPublicOrigin, fallbackPublicAliasOrigin, ...(adminOrigin ? [adminOrigin] : []), fallbackAdminOrigin]);
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
if (publicOrigin) {
  try { allowedHosts.add(new URL(publicOrigin).host); } catch {}
}
try { allowedHosts.add(new URL(fallbackPublicOrigin).host); } catch {}
try { allowedHosts.add(new URL(fallbackPublicAliasOrigin).host); } catch {}
if (adminOrigin) {
  try { allowedHosts.add(new URL(adminOrigin).host); } catch {}
}
try { allowedHosts.add(new URL(fallbackAdminOrigin).host); } catch {}
const secureCookie = publicOrigin.startsWith('https://') || adminOrigin.startsWith('https://') || process.env.NP_SECURE_COOKIE === '1';
const ADS_MANAGER_ENABLED = false;
const maxUpload = 2 * 1024 * 1024 * 1024;
let server;
const serverKeepAlive = setInterval(() => {}, 60 * 60 * 1000);
app.on('window-all-closed', event => {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
});
const rateBuckets = new Map();
function unscopedAccountId(accountId) {
  const raw = String(accountId || 'main');
  const marker = raw.indexOf('__');
  return marker > 0 ? raw.slice(marker + 2) : raw;
}
function normalizeOutgoingArg(arg) {
  if (!arg || typeof arg !== 'object' || Array.isArray(arg)) return arg;
  if (typeof arg.accountId === 'string') return {...arg, accountId: unscopedAccountId(arg.accountId)};
  return arg;
}
function eventAccountIds(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (typeof value.accountId === 'string') result.push(value.accountId);
  if (Array.isArray(value)) for (const item of value) eventAccountIds(item, result);
  else for (const item of Object.values(value)) eventAccountIds(item, result);
  return result;
}
function eventVisibleForClient(res, args) {
  const accountIds = args.flatMap((arg) => eventAccountIds(arg));
  if (!accountIds.length) return true;
  const status = res.__npWebStatus;
  if (!status?.licensed) return false;
  const username = String(status.username || status.displayName || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  if (!username) return false;
  const prefix = `${username}__`;
  return accountIds.every((accountId) => {
    const value = String(accountId || '').toLowerCase();
    return value === prefix || value.startsWith(prefix);
  });
}
const emit = (channel, ...args) => {
  for (const res of clients) {
    if (!eventVisibleForClient(res, args)) continue;
    const packet = `data: ${JSON.stringify({channel,args: args.map(normalizeOutgoingArg)})}\n\n`;
    if (!res.write(packet)) {res.end(); clients.delete(res);}
  }
};
global.__npWebMainWindow = {webContents:{send:emit},isDestroyed:()=>false};
global.__npWebLicenseStatus = () => webRequestContext.getStore()?.webStatus;
ipcMain.handle = (name, fn) => handlers.set(name, fn);
const originalProtocolHandle = protocol.handle.bind(protocol);
protocol.handle = (scheme, fn) => {protocols.set(scheme,fn); return originalProtocolHandle(scheme,fn);};
dialog.showOpenDialog = async (_window, options) => {
  const file = uploadContext.getStore();
  if (!file) return {canceled:true,filePaths:[]};
  const allowed = options.filters.flatMap(f=>f.extensions);
  if (!allowed.includes(path.extname(file).slice(1).toLowerCase())) throw Error('ชนิดไฟล์ไม่ตรงกับรายการที่เลือก');
  return {canceled:false,filePaths:[file]};
};
const event = {senderFrame:{url:'file://' + path.join(__dirname,'dist/index.html')}};
require('./dist-electron/main.js');
const uploadChannels = new Set(['media:choose-video','media:choose-overlay','sales:choose-file','library:add','library:save-file']);
const protectedChannels = /^(tiktok:|pin:|stream:|chat:|history:|library:|sales:|debug:live-chat|debug:recover-chat-readers|ads:(get-link-config|set-link-config))/;
let licensedUntil = 0;
function scopedAccountId(username, accountId) {
  const user = String(username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const id = String(accountId || 'main').trim() || 'main';
  if (!user) return id;
  const prefix = `${user}__`;
  return id.startsWith(prefix) ? id : `${prefix}${id.replace(/[^a-zA-Z0-9_.:-]/g, '_')}`;
}
function scopeAccountArgs(channel, args, status) {
  const username = status?.username || status?.displayName || '';
  if (!username || !Array.isArray(args)) return args;
  if ((channel.startsWith('tiktok:') || channel.startsWith('pin:') || channel.startsWith('chat:') || channel.startsWith('ads:') || channel.startsWith('debug:live-chat') || channel === 'stream:status' || channel === 'stream:stop' || channel === 'stream:last-config' || channel === 'stream:clear-config' || channel.startsWith('stream:schedule:')) && typeof args[0] === 'string') {
    return [scopedAccountId(username, args[0]), ...args.slice(1)];
  }
  if ((channel === 'stream:start' || channel === 'stream:apply-config' || channel === 'stream:save-config') && args[0] && typeof args[0] === 'object') {
    return [{...args[0], accountId: scopedAccountId(username, args[0].accountId || 'main')}, ...args.slice(1)];
  }
  return args;
}
async function invoke(channel,args,uploadId,requestLicenseStatus=null) {
  if(channel.startsWith('admin:')) throw Error('ใช้หลังบ้าน NP สำหรับผู้ดูแลเท่านั้น');
  if (!handlers.has(channel)) throw Error('Unknown command');
  let activeLicenseStatus=null;
  if (channel.startsWith('update:')) {
    if(channel==='update:get-config'||channel==='update:set-config') return {autoUpdate:false};
    if(channel==='update:get-status') return {state:'none'};
    const status={state:'error',message:'เว็บเซิร์ฟเวอร์อัปเดตด้วยชุดไฟล์เว็บ ไม่ใช้ตัวติดตั้งเดสก์ท็อป'};emit('update:status',status);return status;
  }
  if (protectedChannels.test(channel)) {
    const status=requestLicenseStatus||await handlers.get('license:status')(event);
    activeLicenseStatus=status;
    if(!status.licensed) throw Error('กรุณาเข้าสู่ระบบด้วยบัญชีที่ใช้งานได้ก่อน');
    if(status.packageActive!==true) throw Error('กรุณาสมัครแพ็กเกจเพื่อใช้งานระบบ');
    if((channel==='stream:start'||channel==='stream:apply-config')&&Number.isFinite(status.videoLimit)&&Math.floor(status.videoLimit)>0){
      const count=Array.isArray(args?.[0]?.videoPaths)?args[0].videoPaths.length:0;
      if(count>Math.floor(status.videoLimit)) throw Error(`แพ็กเกจนี้เพิ่มวิดีโอได้สูงสุด ${Math.floor(status.videoLimit)} ไฟล์`);
    }
    args=scopeAccountArgs(channel,args,status);
    licensedUntil=Date.now()+60000;
  }
  if(channel==='license:logout') licensedUntil=0;
  if(channel==='shell:open-external') throw Error('เปิดลิงก์ผ่านเบราว์เซอร์เท่านั้น');
  let selected;
  if(uploadId){
    selected=resolveUploadPath(uploadId);
    if(!uploadChannels.has(channel)||!selected)throw Error('Invalid upload');
    uploads.delete(uploadId);
    if(channel==='library:save-file'){
      const first=args&&typeof args[0]==='object'&&args[0]?args[0]:{};
      args=[{...first,path:selected}];
    }
  }
  if(channel==='library:save-file'&&activeLicenseStatus&&Number.isFinite(activeLicenseStatus.videoLimit)&&Math.floor(activeLicenseStatus.videoLimit)>0){
    const limit=Math.floor(activeLicenseStatus.videoLimit);
    const library=await handlers.get('library:list')(event);
    const first=args&&typeof args[0]==='object'&&args[0]?args[0]:{};
    const incomingPath=String(first.path||'');
    const exists=Array.isArray(library)&&library.some(item=>String(item?.path||'')===incomingPath);
    if(Array.isArray(library)&&!exists&&library.length>=limit) throw Error(`ครบแพ็กเกจแล้วค่ะ เพิ่มวิดีโอได้สูงสุด ${limit} ไฟล์`);
  }
  const result=await uploadContext.run(selected,()=>handlers.get(channel)(event,...args));
  if(channel==='library:save-file'&&uploadId){
    chunkUploads.delete(String(uploadId));
    try { fs.unlinkSync(chunkUploadMetaPath(uploadId)); } catch {}
  }
  if(channel==='stream:list-configs'&&Array.isArray(result)){
    const username=activeLicenseStatus?.username||activeLicenseStatus?.displayName||'';
    const user=String(username||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'');
    const prefix=user?`${user}__`:'';
    return prefix?result.filter(item=>String(item?.accountId||'').startsWith(prefix)):result;
  }
  if(channel==='license:login') licensedUntil=result?.licensed?Date.now()+60000:0;
  return result;
}
function json(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function securityHeaders(res) {
  if (secureCookie) res.setHeader('Strict-Transport-Security','max-age=15552000; includeSubDomains');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'"
  ].join('; '));
}
function clientIp(req) {
  return String(req.socket?.remoteAddress || '').replace(/^::ffff:/,'');
}
function rateLimit(req, key, limit = 120, windowMs = 60000) {
  const now = Date.now();
  const bucketKey = `${key}:${clientIp(req)}`;
  const bucket = rateBuckets.get(bucketKey) || {count: 0, reset: now + windowMs};
  if (now > bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);
  if (bucket.count > limit) {
    const error = Error('Too many requests');
    error.statusCode = 429;
    throw error;
  }
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (now > bucket.reset + 60000) rateBuckets.delete(key);
}, 60000).unref?.();
async function body(req) {
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) throw Error('Content-Type must be application/json');
  let size=0; const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>2097152)throw Error('Request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString()||'{}');
}
function toNum(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}
const adsStoreFile = path.join(data, 'profile', 'ads-manager.json');
function defaultAdsStore() {
  return {version: 1, accounts: [], campaigns: [], rules: [], logs: []};
}
function readAdsStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(adsStoreFile, 'utf8'));
    return {
      ...defaultAdsStore(),
      ...parsed,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return defaultAdsStore();
  }
}
function writeAdsStore(store) {
  fs.mkdirSync(path.dirname(adsStoreFile), {recursive: true});
  fs.writeFileSync(adsStoreFile, JSON.stringify(store, null, 2));
}
function cleanText(value, fallback = '') {
  return String(value ?? fallback).replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 180);
}
function cleanMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function uploadRelative(file) {
  const relative = path.relative(data, file).replace(/\\/g, '/');
  if (!relative.startsWith('uploads/')) throw Error('Invalid upload path');
  return relative;
}
function chunkUploadMetaPath(id) {
  return path.join(data, 'uploads', String(id), '.upload.json');
}
function uploadOwner(value) {
  return String(value || 'local').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '') || 'local';
}
function writeChunkUploadState(id, state) {
  try {
    fs.writeFileSync(chunkUploadMetaPath(id), JSON.stringify({
      id,
      name: state.name,
      size: state.size,
      owner: uploadOwner(state.owner),
      kind: state.kind || 'generic',
      phase: state.phase || 'uploading',
      dir: state.dir,
      dest: state.dest,
      tmp: state.tmp,
      received: state.received,
      createdAt: state.createdAt || Date.now(),
      updatedAt: Date.now(),
    }, null, 2), 'utf8');
  } catch {}
}
function readChunkUploadState(id) {
  const cleanId = String(id || '');
  if (!/^[a-f0-9-]{36}$/i.test(cleanId)) return null;
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(chunkUploadMetaPath(cleanId), 'utf8')); } catch {}
  if (!parsed || typeof parsed !== 'object') return null;
  const dir = path.resolve(data, 'uploads', cleanId);
  const name = path.basename(String(parsed.name || 'upload')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180);
  const dest = path.resolve(dir, name);
  const tmp = dest + '.part';
  if (!dest.startsWith(path.resolve(data, 'uploads') + path.sep)) return null;
  const size = Number(parsed.size || 0);
  const received = fs.existsSync(tmp) ? fs.statSync(tmp).size : (fs.existsSync(dest) ? fs.statSync(dest).size : Number(parsed.received || 0));
  return {name, size, owner: uploadOwner(parsed.owner), kind: String(parsed.kind || 'generic'), phase: String(parsed.phase || 'uploading'), dir, dest, tmp, received, createdAt: Number(parsed.createdAt) || Date.now()};
}
function getChunkUploadState(id) {
  const cleanId = String(id || '');
  const current = chunkUploads.get(cleanId) || readChunkUploadState(cleanId);
  if (current) {
    current.received = fs.existsSync(current.tmp) ? fs.statSync(current.tmp).size : current.received;
    chunkUploads.set(cleanId, current);
  }
  return current;
}
function resolveUploadPath(uploadId) {
  const id = String(uploadId || '');
  if (uploads.has(id)) return uploads.get(id);
  const state = readChunkUploadState(id);
  if (state?.dest && fs.existsSync(state.dest)) {
    uploads.set(id, state.dest);
    return state.dest;
  }
  return null;
}
async function licensedUser() {
  const status = await requestLicenseStatus();
  if (!status.licensed) {
    const error = Error('เข้าสู่ระบบ NP ก่อน');
    error.statusCode = 401;
    throw error;
  }
  return String(status.username || status.displayName || '').trim().toLowerCase();
}
function listUploadJobsForOwner(owner) {
  const cleanOwner = uploadOwner(owner);
  const uploadRoot = path.join(data, 'uploads');
  let dirs = [];
  try { dirs = fs.readdirSync(uploadRoot, {withFileTypes:true}).filter(item=>item.isDirectory()).map(item=>item.name); } catch {}
  return dirs.map(id => {
    const state = getChunkUploadState(id);
    if (!state || uploadOwner(state.owner) !== cleanOwner || state.kind !== 'library') return null;
    const percent = state.size > 0 ? Math.min(100, Math.round((state.received / state.size) * 100)) : 0;
    return {
      uploadId: id,
      uploadToken: id,
      serverUploadId: id,
      name: state.name,
      fileName: state.name,
      size: state.size,
      loaded: state.received,
      total: state.size,
      percent,
      phase: state.phase || (state.received >= state.size ? 'processing' : 'uploading'),
      text: state.received >= state.size ? 'อัปโหลดครบแล้ว กำลังบันทึกเข้าคลัง' : `กำลังอัปโหลดขึ้น server ${percent}%`,
      updatedAt: Date.now(),
      createdAt: state.createdAt,
    };
  }).filter(Boolean).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
function cancelUploadJob(uploadId, owner) {
  const cleanId = String(uploadId || '');
  const state = getChunkUploadState(cleanId);
  if (!state || uploadOwner(state.owner) !== uploadOwner(owner)) return false;
  const dir = path.resolve(data, 'uploads', cleanId);
  if (!dir.startsWith(path.resolve(data, 'uploads') + path.sep)) return false;
  chunkUploads.delete(cleanId);
  uploads.delete(cleanId);
  fs.rmSync(dir, {recursive:true, force:true});
  return true;
}
async function activePackageUser() {
  const status = await activePackageStatus();
  return remoteOwner(status);
}
async function activePackageStatus() {
  const status = await requestLicenseStatus();
  if (!status.licensed) {
    const error = Error('เข้าสู่ระบบ NP ก่อน');
    error.statusCode = 401;
    throw error;
  }
  if (status.packageActive !== true) {
    const error = Error('กรุณาสมัครแพ็กเกจเพื่อใช้งานระบบ');
    error.statusCode = 403;
    throw error;
  }
  return status;
}
function adsOverview() {
  const store = readAdsStore();
  const accounts = store.accounts.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  const campaigns = store.campaigns.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  const rules = store.rules.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  const logs = store.logs.slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  return {
    ok: true,
    source: 'Digital NP Studio',
    local: true,
    summary: {
      accounts: accounts.length,
      healthy_accounts: accounts.filter(item => item.cookie_status === 'healthy').length,
      active_rules: rules.filter(item => item.status === 'active').length,
      active_campaigns: campaigns.filter(item => item.delivery_status === 'active').length,
      products: rules.reduce((sum,item)=>sum + toNum(item.product_count), 0),
    },
    accounts: accounts.slice(0, 20),
    campaigns: campaigns.slice(0, 20),
    rules: rules.slice(0, 20),
    logs: logs.slice(0, 20),
  };
}
function saveAdsItem(kind, input) {
  const store = readAdsStore();
  const now = new Date().toISOString();
  if (kind === 'account') {
    const item = {
      id: crypto.randomUUID(),
      account_name: cleanText(input.account_name || input.display_name, 'บัญชีแอดใหม่'),
      display_name: cleanText(input.display_name || input.account_name, 'บัญชีแอดใหม่'),
      brand: cleanText(input.brand, ''),
      cookie_status: 'healthy',
      updated_at: now,
    };
    store.accounts.unshift(item);
    store.logs.unshift({id: crypto.randomUUID(), brand: item.brand || item.display_name, event_type: 'account_create', reason: `เพิ่มบัญชีแอด ${item.display_name}`, status: 'success', created_at: now});
  } else if (kind === 'campaign') {
    const budget = cleanMoney(input.current_budget);
    const revenue = cleanMoney(input.gross_revenue);
    const cost = cleanMoney(input.cost);
    const item = {
      id: crypto.randomUUID(),
      brand: cleanText(input.brand, ''),
      campaign_id: cleanText(input.campaign_id, ''),
      campaign_name: cleanText(input.campaign_name, 'แคมเปญใหม่'),
      campaign_type: cleanText(input.campaign_type, 'LIVE GMV Max'),
      delivery_status: cleanText(input.delivery_status, 'active').toLowerCase() === 'paused' ? 'paused' : 'active',
      current_budget: budget,
      target_roi: cleanMoney(input.target_roi),
      cost,
      gross_revenue: revenue,
      roi: cost > 0 ? revenue / cost : cleanMoney(input.roi),
      updated_at: now,
    };
    store.campaigns.unshift(item);
    store.logs.unshift({id: crypto.randomUUID(), brand: item.brand, event_type: 'campaign_save', reason: `บันทึกแคมเปญ ${item.campaign_name}`, status: 'success', created_at: now});
  } else if (kind === 'rule') {
    const item = {
      id: crypto.randomUUID(),
      brand: cleanText(input.brand, ''),
      name: cleanText(input.name, 'กฎแคมเปญใหม่'),
      campaign_type: cleanText(input.campaign_type, 'LIVE GMV Max'),
      status: cleanText(input.status, 'active').toLowerCase() === 'paused' ? 'paused' : 'active',
      product_count: cleanMoney(input.product_count),
      last_run_at: '',
      updated_at: now,
    };
    store.rules.unshift(item);
    store.logs.unshift({id: crypto.randomUUID(), brand: item.brand, event_type: 'rule_save', reason: `บันทึกกฎ ${item.name}`, status: 'success', created_at: now});
  } else {
    const error = Error('Invalid ads item type');
    error.statusCode = 400;
    throw error;
  }
  store.accounts = store.accounts.slice(0, 100);
  store.campaigns = store.campaigns.slice(0, 300);
  store.rules = store.rules.slice(0, 300);
  store.logs = store.logs.slice(0, 500);
  writeAdsStore(store);
  return adsOverview();
}
function remoteOwner(value) {
  const raw = typeof value === 'object' && value ? (value.username || value.displayName || '') : value;
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
}
function remoteWindowAccount(w) {
  return remoteOwner(w.__npAccountId || '');
}
function remoteWindowMatchesStatus(w, status) {
  const owner = remoteOwner(status);
  const account = remoteWindowAccount(w);
  if (!owner || !account) return false;
  return account === owner || account.startsWith(`${owner}__`);
}
function remoteWindows(){return BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed());}
function remoteWindowsForStatus(status){return remoteWindows().filter(w=>remoteWindowMatchesStatus(w,status));}
function findWindowForStatus(id,status){const w=remoteWindowsForStatus(status).find(w=>String(w.id)===String(id));if(!w)throw Error('หน้าต่างนี้ปิดแล้ว');return w;}
async function diagnosticsFor(w){
  const recorded = windowDiagnostics.get(w) || {networkIssues:[]};
  let sessionPresent = false, multiSessionPresent = false;
  try {
    const [sessionId, multiSids] = await Promise.all([
      Promise.race([w.webContents.session.cookies.get({name:'sessionid'}), new Promise(resolve=>setTimeout(()=>resolve([]),2000))]),
      Promise.race([w.webContents.session.cookies.get({name:'multi_sids'}), new Promise(resolve=>setTimeout(()=>resolve([]),2000))]),
    ]);
    sessionPresent = sessionId.some(c=>Boolean(c.value));
    multiSessionPresent = multiSids.some(c=>Boolean(c.value));
  } catch {}
  return {
    mode:'background-chrome',
    url:w.webContents.getURL(),
    title:w.getTitle(),
    loading:w.webContents.isLoading(),
    sessionPresent,
    multiSessionPresent,
    networkIssues:recorded.networkIssues.slice(-10),
  };
}
async function captureWithTimeout(w){
  const url = w.webContents.getURL();
  if(!url || w.webContents.isLoading()) {
    const error = Error('หน้าต่าง TikTok กำลังโหลด กรุณารอสักครู่');
    error.statusCode = 409;
    throw error;
  }
  return await Promise.race([
    w.webContents.capturePage(),
    new Promise((_,reject)=>setTimeout(()=>{const error=Error('อ่านภาพจากหน้าต่าง TikTok ไม่ทันเวลา');error.statusCode=504;reject(error);},6000)),
  ]);
}
async function dispatchDomClickFallback(w,x,y){
  const currentUrl = w.webContents.getURL();
  if(/^https:\/\/shop\.tiktok\.com\//i.test(currentUrl))return;
  try{
    await w.webContents.executeJavaScript(`(() => {
      const x=${JSON.stringify(x)}, y=${JSON.stringify(y)};
      function deepElementFromPoint(root, px, py){
        let doc=root;
        let el=doc.elementFromPoint?.(px,py);
        for(let depth=0;el&&depth<5;depth+=1){
          if(el.shadowRoot){
            const inner=el.shadowRoot.elementFromPoint?.(px,py);
            if(inner&&inner!==el){el=inner;continue;}
          }
          if(el.tagName==='IFRAME'){
            try{
              const rect=el.getBoundingClientRect();
              const child=el.contentDocument;
              const inner=child?.elementFromPoint?.(px-rect.left,py-rect.top);
              if(inner){doc=child;el=inner;px-=rect.left;py-=rect.top;continue;}
            }catch{}
          }
          break;
        }
        return {el,doc,x:px,y:py};
      }
      const hit=deepElementFromPoint(document,x,y);
      const el=hit.el;
      if(!el)return false;
      const action=el.closest?.('button,[role="button"],a,[onclick],[tabindex]:not([tabindex="-1"])');
      const direct=el.closest?.('input[type="checkbox"],input[type="radio"],label,[role="checkbox"],[aria-checked]');
      const row=el.closest?.('tr,[role="row"],[class*="table-row"],[class*="TableRow"],[class*="row"],[class*="Row"],[class*="item"],[class*="Item"],[class*="option"],[class*="Option"]');
      const rowChoice=row?.querySelector?.('input[type="checkbox"],input[type="radio"],label,[role="checkbox"],[aria-checked],[class*="checkbox"],[class*="Checkbox"]');
      const clickableStyleTarget=[el,row].find(node=>{
        try{
          const style=getComputedStyle(node);
          return style.cursor==='pointer' || node.getAttribute?.('role')==='button' || node.hasAttribute?.('onclick');
        }catch{return false;}
      });
      const target=direct||rowChoice||action||clickableStyleTarget||row||el;
      if(!target)return false;
      const opts={bubbles:true,cancelable:true,composed:true,clientX:hit.x,clientY:hit.y,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true,view:hit.doc.defaultView||window};
      try{target.scrollIntoView?.({block:'nearest',inline:'nearest'});}catch{}
      try{target.focus?.({preventScroll:true});}catch{}
      const chain=[];
      for(let node=el;node&&chain.length<6;node=node.parentElement){
        chain.push(node);
        if(node===target)break;
      }
      if(!chain.includes(target))chain.push(target);
      for(const node of chain){
        try{node.dispatchEvent(new PointerEvent('pointerover',opts));}catch{}
        try{node.dispatchEvent(new MouseEvent('mouseover',opts));}catch{}
        try{node.dispatchEvent(new PointerEvent('pointermove',opts));}catch{}
        try{node.dispatchEvent(new MouseEvent('mousemove',opts));}catch{}
        try{node.dispatchEvent(new PointerEvent('pointerdown',opts));}catch{}
        try{node.dispatchEvent(new MouseEvent('mousedown',opts));}catch{}
        try{node.dispatchEvent(new PointerEvent('pointerup',{...opts,buttons:0}));}catch{}
        try{node.dispatchEvent(new MouseEvent('mouseup',{...opts,buttons:0}));}catch{}
        try{node.dispatchEvent(new MouseEvent('click',{...opts,buttons:0}));}catch{}
      }
      try{target.click?.();}catch{}
      const input=(target?.matches?.('input[type="checkbox"],input[type="radio"]')?target:null)||target?.querySelector?.('input[type="checkbox"],input[type="radio"]')||row?.querySelector?.('input[type="checkbox"],input[type="radio"]');
      const checkboxLike=target?.matches?.('label,[role="checkbox"],[aria-checked],[class*="checkbox"],[class*="Checkbox"]');
      if(input||checkboxLike){
        try{target.click?.();}catch{}
      }
      if(input&&(input.type==='checkbox'||input.type==='radio')){
        try{
          input.checked=true;
          input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
          input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
        }catch{}
      }else if(target?.getAttribute?.('role')==='checkbox'||target?.hasAttribute?.('aria-checked')){
        try{
          target.setAttribute('aria-checked','true');
          target.dispatchEvent(new Event('input',{bubbles:true,composed:true}));
          target.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
        }catch{}
      }
      return true;
    })()`);
  }catch{}
}
async function focusEditableAt(w,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  try{
    await w.webContents.executeJavaScript(`(() => {
      const x=${JSON.stringify(x)}, y=${JSON.stringify(y)};
      function deepElementFromPoint(root, px, py){
        let doc=root;
        let el=doc.elementFromPoint?.(px,py);
        for(let depth=0;el&&depth<5;depth+=1){
          if(el.shadowRoot){
            const inner=el.shadowRoot.elementFromPoint?.(px,py);
            if(inner&&inner!==el){el=inner;continue;}
          }
          if(el.tagName==='IFRAME'){
            try{
              const rect=el.getBoundingClientRect();
              const child=el.contentDocument;
              const inner=child?.elementFromPoint?.(px-rect.left,py-rect.top);
              if(inner){doc=child;el=inner;px-=rect.left;py-=rect.top;continue;}
            }catch{}
          }
          break;
        }
        return {el,doc,x:px,y:py};
      }
      const hit=deepElementFromPoint(document,x,y);
      const el=hit.el;
      if(!el)return false;
      const editable=el.closest?.('input:not([type="hidden"]),textarea,[contenteditable="true"],[role="textbox"]')||el;
      const win=hit.doc.defaultView||window;
      const opts={bubbles:true,cancelable:true,composed:true,clientX:hit.x,clientY:hit.y,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true,view:win};
      try{editable.scrollIntoView?.({block:'nearest',inline:'nearest'});}catch{}
      try{editable.dispatchEvent(new PointerEvent('pointerdown',opts));}catch{}
      try{editable.dispatchEvent(new MouseEvent('mousedown',opts));}catch{}
      try{editable.focus?.({preventScroll:true});}catch{}
      try{editable.click?.();}catch{}
      try{editable.dispatchEvent(new PointerEvent('pointerup',{...opts,buttons:0}));}catch{}
      try{editable.dispatchEvent(new MouseEvent('mouseup',{...opts,buttons:0}));}catch{}
      return hit.doc.activeElement===editable || hit.doc.activeElement===el || editable.contains?.(hit.doc.activeElement);
    })()`);
  }catch{}
}
app.on('browser-window-created',(_e,w)=>{
  windowDiagnostics.set(w,{networkIssues:[]});
  w.webContents.setFrameRate?.(10);
  w.webContents.on('did-finish-load',()=>emit('web:windows-changed'));
  w.webContents.on('did-fail-load',(_event,errorCode,errorDescription,validatedURL)=>{
    const d=windowDiagnostics.get(w);
    let host = '';
    try { host = validatedURL ? new URL(validatedURL).hostname : ''; } catch {}
    if(d)d.networkIssues.push({at:Date.now(),host,code:`${errorCode} ${errorDescription}`});
  });
  w.on('closed',()=>emit('web:windows-changed'));
  emit('web:windows-changed');
});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ttf':'font/ttf','.svg':'image/svg+xml'};
function requestHost(req) {
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return String(forwarded || req.headers.host || '').toLowerCase();
}
function adminHost() {
  try { return new URL(adminOrigin || fallbackAdminOrigin).host.toLowerCase(); } catch { return ''; }
}
function publicHost() {
  try { return new URL(publicOrigin || fallbackPublicOrigin).host.toLowerCase(); } catch { return ''; }
}
function configuredWebHost(req) {
  const host = requestHost(req);
  return host === publicHost() || host === adminHost() || host === 'live.np-class.com';
}
function requestCookie(req,name) {
  const prefix=`${name}=`;
  for(const part of String(req.headers.cookie||'').split(';')) {
    const value=part.trim();
    if(value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return '';
}
function webSessionId(req) {
  const existing=requestCookie(req,'np_web_session');
  return /^[a-f0-9]{64}$/i.test(existing)?existing:crypto.randomBytes(32).toString('hex');
}
function webSessionCookies(req,options={}) {
  const secure = secureCookie ? '; Secure' : '';
  const cookies = [
    `np_session=${cookie}; HttpOnly; SameSite=Strict; Path=/${secure}`,
    `np_csrf=${csrfToken}; SameSite=Strict; Path=/${secure}`,
    `np_web_session=${webSessionId(req)}; HttpOnly; SameSite=Strict; Path=/${secure}`
  ];
  if(options.licenseToken) cookies.push(`np_web_auth=${options.licenseToken}; HttpOnly; SameSite=Strict; Path=/${secure}`);
  if(options.clearLicense) cookies.push(`np_web_auth=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict; Path=/${secure}`);
  return cookies;
}
function webStatusResult(data) {
  return {
    licensed: true,
    username: data.username,
    displayName: data.displayName,
    plan: data.plan,
    packageActive: data.packageActive === true,
    packageId: data.packageId || '',
    packageName: data.packageName || '',
    channelLimit: Number.isFinite(data.channelLimit) ? data.channelLimit : null,
    videoLimit: Number.isFinite(data.videoLimit) ? data.videoLimit : null,
    startsAt: data.startsAt || null,
    expiresAt: data.expiresAt || null,
    machineLimit: Number.isFinite(data.machineLimit) ? data.machineLimit : null
  };
}
async function webLicenseLogin(req,payload) {
  const value=payload&&typeof payload==='object'?payload:{};
  try {
    const response=backend.request('POST','/api/login',{
      username:String(value.username||''),
      password:String(value.password||''),
      licenseKey:String(value.licenseKey||''),
      machineId:webMachineId
    });
    if(!response.ok||response.data?.ok!==true) return {result:{licensed:false,error:response.data?.error||'เข้าสู่ระบบไม่สำเร็จ'},token:''};
    return {result:webStatusResult(response.data),token:String(response.data.token||'')};
  } catch(error) {
    return {result:{licensed:false,error:error?.message||'เข้าสู่ระบบไม่สำเร็จ'},token:''};
  }
}
async function webLicenseStatus(req) {
  const token=requestCookie(req,'np_web_auth');
  if(!/^[a-f0-9]{64}$/i.test(token)) return {licensed:false};
  try {
    const response=backend.request('POST','/api/validate',{token,machineId:webMachineId});
    if(!response.ok||response.data?.ok!==true) return {licensed:false,error:response.data?.error||'เซสชันหมดอายุ'};
    return webStatusResult(response.data);
  } catch(error) {
    return {licensed:false,error:error?.message||'ตรวจสอบสิทธิ์ไม่สำเร็จ'};
  }
}
async function webLicenseCommand(req,p) {
  if(p.channel==='license:login') {
    const login=await webLicenseLogin(req,p.args?.[0]);
    return {result:login.result,cookies:webSessionCookies(req,login.token?{licenseToken:login.token}:{clearLicense:true})};
  }
  if(p.channel==='license:status') return {result:await webLicenseStatus(req),cookies:webSessionCookies(req)};
  return {result:{licensed:false,webOnly:true},cookies:webSessionCookies(req,{clearLicense:true})};
}
async function requestLicenseStatus() {
  const context=webRequestContext.getStore();
  if(context&&context.webStatus!==undefined) return context.webStatus;
  return handlers.get('license:status')(event);
}
function requireAdminHost(req, res) {
  const host = adminHost();
  if (!host) return true;
  if (requestHost(req) === host) return true;
  json(res,404,{error:'Not found'});
  return false;
}
function isAdminOnlyPath(pathname) {
  return pathname.startsWith('/manage/')
    || pathname.startsWith('/api/admin/')
    || pathname.startsWith('/secure-upload/')
    || pathname === '/admin.html'
    || pathname.startsWith('/backoffice/');
}
async function route(req,res){
  return webRequestContext.run({req,webStatus:undefined},()=>routeImpl(req,res));
}
async function routeImpl(req,res){
  securityHeaders(res);
  if(!allowedHosts.has(requestHost(req))){json(res,403,{error:'Invalid host'});return;}
  const u=new URL(req.url,origin);
  if (adminHost() && requestHost(req) === adminHost() && u.pathname === '/') {
    u.pathname = '/backoffice/admin.html';
  }
  if(!['GET','POST','PUT','DELETE','HEAD','OPTIONS'].includes(req.method)){json(res,405,{error:'Method not allowed'});return;}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store'});res.end();return;}
  if(isAdminOnlyPath(u.pathname)&&!requireAdminHost(req,res))return;
  if(u.pathname==='/health'){json(res,200,{ok:true,version:'0.1.3-web.1',commands:handlers.size});return;}
  if(u.pathname==='/auth'&&req.method==='GET'&&u.searchParams.get('code')===accessCode){
    const next = String(u.searchParams.get('next') || '/');
    const location = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    res.writeHead(303,{
      'Set-Cookie': webSessionCookies(req),
      'Location':location,
      'Cache-Control':'no-store'
    });res.end();return;
  }
  if(u.pathname==='/api/register'&&req.method==='POST'){
    rateLimit(req, 'register', 12, 60000);
    const result=backend.request('POST','/api/register',await body(req));json(res,result.status,result.data);return;
  }
  const authenticated=(req.headers.cookie||'').split(';').some(c=>c.trim()===`np_session=${cookie}`);
  const requestContext=webRequestContext.getStore();
  if(authenticated&&configuredWebHost(req)) requestContext.webStatus=await webLicenseStatus(req);
  const publicWebRequest = configuredWebHost(req) && (req.method === 'GET' || req.method === 'HEAD') && !u.pathname.startsWith('/api/') && !u.pathname.startsWith('/manage/') && !u.pathname.startsWith('/secure-upload/');
  const publicLicenseInvoke = configuredWebHost(req) && u.pathname==='/api/invoke' && req.method==='POST';
  if(!authenticated&&!publicWebRequest&&req.method==='GET'&&u.pathname==='/'){
    res.writeHead(303,{'Location':`/auth?code=${accessCode}`,'Cache-Control':'no-store'});
    res.end();
    return;
  }
  if(publicLicenseInvoke&&!authenticated){
    if(req.headers.origin && !allowedOrigins.has(String(req.headers.origin).replace(/\/+$/,''))){json(res,403,{error:'Invalid origin'});return;}
    if(req.headers.referer){
      try {
        const refererOrigin = new URL(req.headers.referer).origin;
        if(!allowedOrigins.has(refererOrigin)) { json(res,403,{error:'Invalid referer'}); return; }
      } catch { json(res,403,{error:'Invalid referer'}); return; }
    }
    const p=await body(req);
    if(typeof p.channel!=='string'||!Array.isArray(p.args)||p.args.length>10){json(res,400,{error:'Invalid command'});return;}
    if(!['license:login','license:status','license:logout'].includes(p.channel)){json(res,401,{error:'กรุณาเข้าสู่ระบบก่อน'});return;}
    if(req.headers['x-np-web']!=='1') { json(res,403,{error:'Request header required'}); return; }
    rateLimit(req, `public-license-invoke:${p.channel}`, p.channel==='license:status'?240:30, 60000);
    const response=await webLicenseCommand(req,p);
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Set-Cookie':response.cookies});
    res.end(JSON.stringify({result:response.result}));
    return;
  }
  if(!authenticated&&u.pathname.startsWith('/api/')){json(res,401,{error:'เซสชันเว็บหมดอายุ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่'});return;}
  if(!authenticated&&!publicWebRequest){res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});res.end('<html lang="th"><title>Digital NP Studio Web</title><body style="background:#080b12;color:white;font:18px system-ui;padding:40px"><h1>Digital NP Studio Web</h1><p>เซสชันเว็บหมดอายุ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่</p></body></html>');return;}
  if(!publicWebRequest && req.headers.origin && !allowedOrigins.has(String(req.headers.origin).replace(/\/+$/,''))){json(res,403,{error:'Invalid origin'});return;}
  if(!publicWebRequest && req.headers.referer){
    try {
      const refererOrigin = new URL(req.headers.referer).origin;
      if(!allowedOrigins.has(refererOrigin)) { json(res,403,{error:'Invalid referer'}); return; }
    } catch { json(res,403,{error:'Invalid referer'}); return; }
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){
    if(req.headers['x-np-web']!=='1') { json(res,403,{error:'Request header required'}); return; }
    if(req.headers['x-np-csrf']!==csrfToken) { json(res,403,{error:'Invalid CSRF token'}); return; }
  }
  if(u.pathname==='/events'&&req.method==='GET'){
    res.__npWebStatus=requestContext?.webStatus || null;
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);
    const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;
  }
  if(u.pathname==='/api/shutdown'&&req.method==='POST'){
    if(process.env.NP_ALLOW_WEB_SHUTDOWN !== '1') { json(res,403,{error:'Shutdown disabled'}); return; }
    rateLimit(req, 'shutdown', 3, 60000);
    json(res,200,{ok:true});setTimeout(()=>app.quit(),250);return;
  }
  if(u.pathname.startsWith('/manage/')&&u.pathname!=='/manage/info'){json(res,403,{error:'ใช้หลังบ้าน NP พร้อมบัญชีแอดมิน'});return;}
  if(u.pathname==='/manage/info'&&req.method==='GET'){json(res,200,await backend.info());return;}
  if(u.pathname==='/api/ads-tiktok/overview'&&req.method==='GET'){
    if(!ADS_MANAGER_ENABLED){json(res,404,{error:'Not found'});return;}
    json(res,200,adsOverview());return;
  }
  if(u.pathname==='/api/ads-tiktok/item'&&req.method==='POST'){
    if(!ADS_MANAGER_ENABLED){json(res,404,{error:'Not found'});return;}
    rateLimit(req, 'ads-item', 30, 60000);
    const payload=await body(req);json(res,200,saveAdsItem(payload.kind,payload));return;
  }
  if(u.pathname==='/manage/open'&&req.method==='POST'){licensedUntil=0;json(res,200,await global.__npSignInLocal());return;}
  if(u.pathname==='/manage/users'&&req.method==='GET'){const result=await backend.request('GET','/api/admin/users',{},backend.ownerToken);json(res,result.status,result.data);return;}
  if(u.pathname==='/manage/users'&&req.method==='POST'){const result=await backend.request('PUT','/api/admin/user',await body(req),backend.ownerToken);json(res,result.status,result.data);return;}
  if(['/manage/disable','/manage/reset-machines','/manage/password'].includes(u.pathname)&&req.method==='POST'){
    const result=await backend.request('POST','/api/admin/'+u.pathname.slice(8),await body(req),backend.ownerToken);licensedUntil=0;json(res,result.status,result.data);return;
  }
  if(u.pathname.startsWith('/api/admin/')&&backend.kind==='np'){
    const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const token=bearer;
    const payload=['GET','HEAD'].includes(req.method)?{}:await body(req);
    const result=await backend.request(req.method,u.pathname+u.search,payload,token);json(res,result.status,result.data);return;
  }
  if(u.pathname==='/api/invoke'&&req.method==='POST'){
    const p=await body(req);if(typeof p.channel!=='string'||!Array.isArray(p.args)||p.args.length>10)throw Error('Invalid command');
    rateLimit(req, `invoke:${p.channel}`, p.channel==='license:status'?600:240, 60000);
    if(configuredWebHost(req)&&['license:login','license:status','license:logout'].includes(p.channel)){
      const response=await webLicenseCommand(req,p);
      res.writeHead(200,{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store',
        'Set-Cookie':response.cookies
      });
      res.end(JSON.stringify({result:response.result}));
      return;
    }
    json(res,200,{result:await invoke(p.channel,p.args,p.uploadId,requestContext?.webStatus)});return;
  }
  if(u.pathname==='/np/announcements'&&req.method==='GET'){
    const status=await requestLicenseStatus();
    if(!status.licensed){json(res,401,{error:'เข้าสู่ระบบ NP ก่อน'});return;}
    const result=backend.request('GET','/api/announcements');json(res,result.status,{...result.data,viewer:status.displayName});return;
  }
  if(u.pathname==='/api/topup/overview'&&req.method==='GET'){
    const username=await licensedUser();
    const result=backend.topupOverview(username);json(res,result.status,result.data);return;
  }
  if(u.pathname==='/api/topup/request'&&req.method==='POST'){
    rateLimit(req, 'topup-request', 12, 60000);
    const username=await licensedUser(), payload=await body(req);
    const uploadPath=resolveUploadPath(payload.uploadId);
    if(!payload.uploadId||!uploadPath)throw Error('กรุณาแนบสลิปโอนเงิน');
    const slipPath=uploadRelative(uploadPath);
    uploads.delete(payload.uploadId);
    const result=backend.createTopup(username,{...payload,slipPath});json(res,result.status,result.data);return;
  }
  if(u.pathname.startsWith('/secure-upload/')&&req.method==='GET'){
    const relative=decodeURIComponent(u.pathname.slice('/secure-upload/'.length));
    if(!/^uploads\/[a-f0-9-]{36}\/[^/\\]+$/i.test(relative)){json(res,404,{error:'Not found'});return;}
    const file=path.resolve(data,relative);
    if(!file.startsWith(path.resolve(data,'uploads')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){json(res,404,{error:'Not found'});return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'private, no-store'});
    await pipeline(fs.createReadStream(file),res);return;
  }
  if(u.pathname==='/api/upload'&&req.method==='POST'){
    const owner=await licensedUser();
    rateLimit(req, 'upload', 20, 60000);
    const name=path.basename(u.searchParams.get('name')||'upload').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,180);
    const kind=String(u.searchParams.get('kind')||'generic')==='library'?'library':'generic';
    if(!/\.(mp4|mov|mkv|webm|m4v|png|webp|jpe?g|csv|tsv|txt)$/i.test(name))throw Error('ชนิดไฟล์นี้ไม่รองรับ');
    if(Number(req.headers['content-length'])>maxUpload){json(res,413,{error:'แต่ละคลิปต้องมีขนาดไม่เกิน 2 GB'});return;}
    const id=crypto.randomUUID(),dir=path.join(data,'uploads',id),dest=path.join(dir,name);fs.mkdirSync(dir);
    let count=0;const limit=new Transform({transform(chunk,_enc,cb){count+=chunk.length;cb(count>maxUpload?Error('แต่ละคลิปต้องมีขนาดไม่เกิน 2 GB'):null,chunk);}});
    try{await pipeline(req,limit,fs.createWriteStream(dest,{flags:'wx'}));}catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
    if(kind==='library'){
      chunkUploads.set(id,{name,size:count,owner,kind,phase:'processing',dir,dest,tmp:dest,received:count,createdAt:Date.now()});
      writeChunkUploadState(id, chunkUploads.get(id));
    }
    uploads.set(id,dest);json(res,200,{id,name,size:count});return;
  }
  if(u.pathname.startsWith('/api/upload-chunk')&&req.method==='POST'){
    const owner=await licensedUser();
    rateLimit(req, 'upload-chunk', 900, 60000);
    let action=String(u.searchParams.get('action')||'');
    if(!action&&u.searchParams.has('name')&&u.searchParams.has('size')) action='init';
    const cleanName=value=>path.basename(String(value||'upload')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,180);
    if(action==='init'){
      const name=cleanName(u.searchParams.get('name'));
      const size=Number(u.searchParams.get('size')||0);
      const kind=String(u.searchParams.get('kind')||'generic')==='library'?'library':'generic';
      if(!/\.(mp4|mov|mkv|webm|m4v|png|webp|jpe?g|csv|tsv|txt)$/i.test(name))throw Error('ชนิดไฟล์นี้ไม่รองรับ');
      if(!Number.isFinite(size)||size<0||size>maxUpload){json(res,413,{error:'แต่ละคลิปต้องมีขนาดไม่เกิน 2 GB'});return;}
      const resumeId=String(u.searchParams.get('resumeId')||'');
      const resumeState=getChunkUploadState(resumeId);
      if(resumeState&&resumeState.name===name&&resumeState.size===size&&resumeState.kind===kind&&uploadOwner(resumeState.owner)===uploadOwner(owner)){
        json(res,200,{id:resumeId,name,size,received:resumeState.received,resumed:true});return;
      }
      const id=crypto.randomUUID(),dir=path.join(data,'uploads',id),dest=path.join(dir,name),tmp=dest+'.part';
      fs.mkdirSync(dir);
      fs.closeSync(fs.openSync(tmp,'wx'));
      chunkUploads.set(id,{name,size,owner,kind,phase:'uploading',dir,dest,tmp,received:0,createdAt:Date.now()});
      writeChunkUploadState(id, chunkUploads.get(id));
      json(res,200,{id,name,size});return;
    }
    if(action==='status'){
      const id=String(u.searchParams.get('id')||''),state=getChunkUploadState(id);
      if(!state){json(res,404,{error:'ไม่พบงานอัปโหลด'});return;}
      if(uploadOwner(state.owner)!==uploadOwner(owner)){json(res,403,{error:'ไม่มีสิทธิ์ดูงานอัปโหลดนี้'});return;}
      json(res,200,{id,name:state.name,size:state.size,received:state.received,done:state.received===state.size&&fs.existsSync(state.dest)});return;
    }
    if(action==='append'){
      const id=String(u.searchParams.get('id')||''),state=getChunkUploadState(id);
      if(!state){json(res,404,{error:'ไม่พบงานอัปโหลด กรุณาเริ่มอัปโหลดใหม่'});return;}
      if(uploadOwner(state.owner)!==uploadOwner(owner)){json(res,403,{error:'ไม่มีสิทธิ์อัปโหลดงานนี้'});return;}
      const offset=Number(u.searchParams.get('offset')||0);
      if(offset!==state.received){json(res,409,{error:'ลำดับอัปโหลดไม่ถูกต้อง กรุณาเริ่มใหม่',received:state.received});return;}
      const chunkSize=Number(req.headers['content-length']||0);
      if(!Number.isFinite(chunkSize)||chunkSize<0||state.received+chunkSize>state.size||state.received+chunkSize>maxUpload){json(res,413,{error:'แต่ละคลิปต้องมีขนาดไม่เกิน 2 GB'});return;}
      let count=0;const counter=new Transform({transform(chunk,_enc,cb){count+=chunk.length;cb(null,chunk);}});
      try{await pipeline(req,counter,fs.createWriteStream(state.tmp,{flags:'a'}));}catch(error){throw error;}
      state.received+=count;
      writeChunkUploadState(id, state);
      json(res,200,{id,received:state.received,size:state.size,done:state.received===state.size});return;
    }
    if(action==='finish'){
      const id=String(u.searchParams.get('id')||''),state=getChunkUploadState(id);
      if(!state){json(res,404,{error:'ไม่พบงานอัปโหลด กรุณาเริ่มอัปโหลดใหม่'});return;}
      if(uploadOwner(state.owner)!==uploadOwner(owner)){json(res,403,{error:'ไม่มีสิทธิ์บันทึกงานนี้'});return;}
      if(state.received!==state.size){json(res,400,{error:'อัปโหลดยังไม่ครบ',received:state.received,size:state.size});return;}
      if(fs.existsSync(state.tmp)) fs.renameSync(state.tmp,state.dest);
      chunkUploads.delete(id);
      uploads.set(id,state.dest);
      state.phase='processing';
      state.received=state.size;
      writeChunkUploadState(id,state);
      json(res,200,{id,name:state.name,size:state.size});return;
    }
    json(res,400,{error:'คำสั่งอัปโหลดไม่ถูกต้อง'});return;
  }
  if(u.pathname==='/api/library-upload-jobs'&&req.method==='GET'){
    const owner=await activePackageUser();
    json(res,200,{jobs:listUploadJobsForOwner(owner)});return;
  }
  if(u.pathname==='/api/library-upload-jobs/cancel'&&req.method==='POST'){
    const owner=await activePackageUser();
    const payload=await body(req);
    const id=decodeURIComponent(String(payload?.id||''));
    json(res,200,{deleted:cancelUploadJob(id, owner)});return;
  }
  if(u.pathname.startsWith('/api/library-upload-jobs/')&&req.method==='DELETE'){
    const owner=await activePackageUser();
    const id=decodeURIComponent(u.pathname.slice('/api/library-upload-jobs/'.length));
    json(res,200,{deleted:cancelUploadJob(id, owner)});return;
  }
  if(u.pathname==='/api/windows'&&req.method==='GET'){
    const status=await activePackageStatus();
    json(res,200,remoteWindowsForStatus(status).map(w=>({id:w.id,title:w.getTitle(),url:w.webContents.getURL(),size:w.getContentSize(),target:w.__npTarget||'tiktok'})));return;
  }
  if(u.pathname==='/api/browser-mode'&&req.method==='GET'){
    await activePackageUser();
    json(res,200,{visible:false});return;
  }
  if(u.pathname==='/api/window/frame'&&req.method==='GET'){
    const status=await activePackageStatus();
    const w=findWindowForStatus(u.searchParams.get('id'),status);const screenshot=await captureWithTimeout(w);
    res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});res.end(screenshot.toPNG());return;
  }
  if(u.pathname==='/api/window/diagnostics'&&req.method==='GET'){
    const status=await activePackageStatus();
    const w=findWindowForStatus(u.searchParams.get('id'),status);json(res,200,await diagnosticsFor(w));return;
  }
  if(u.pathname==='/api/window/input'&&req.method==='POST'){
    const status=await activePackageStatus();
    rateLimit(req, 'window-input', 240, 60000);
    const p=await body(req),w=findWindowForStatus(p.id,status),wc=w.webContents;
    try{w.focus();wc.focus();}catch{}
    if(p.type==='close'){w.close();json(res,200,{ok:true});return;}
    if(p.type==='text'){
      if(typeof p.text!=='string'||p.text.length>20000)throw Error('Invalid text');
      const point=w.__npLastInputPoint;
      if(point)await focusEditableAt(w,point.x,point.y);
      await wc.insertText(p.text);
    }
    else if(p.type==='key'){
      if(!['Backspace','Delete','Tab','Enter','Escape','Left','Right','Up','Down','Home','End','PageUp','PageDown','A','C','V','X'].includes(p.key))throw Error('Invalid key');
      const modifiers=Array.isArray(p.modifiers)?p.modifiers.filter(m=>['control','shift','alt','meta'].includes(m)):[];
      const point=w.__npLastInputPoint;
      if(point)await focusEditableAt(w,point.x,point.y);
      await wc.sendInputEvent({type:'keyDown',keyCode:p.key,modifiers});await wc.sendInputEvent({type:'keyUp',keyCode:p.key,modifiers});
    }else if(p.type==='click'||p.type==='mouseDown'||p.type==='mouseUp'||p.type==='mouseMove'||p.type==='wheel'){
      const [width,height]=w.getContentSize(),x=Math.round(Number(p.x)),y=Math.round(Number(p.y));
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>width||y>height)throw Error('Invalid coordinates');
      if(p.type==='click'||p.type==='mouseDown')w.__npLastInputPoint={x,y};
      if(p.type==='click'){
        await wc.sendInputEvent({type:'mouseMove',x,y});
        await wc.sendInputEvent({type:'click',x,y,button:'left',clickCount:1});
        await dispatchDomClickFallback(w,x,y);
      }
      else if(p.type==='mouseDown')await wc.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
      else if(p.type==='mouseUp')await wc.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});
      else if(p.type==='mouseMove')await wc.sendInputEvent({type:'mouseMove',x,y});
      else await wc.sendInputEvent({type:'mouseWheel',x,y,deltaX:Math.max(-1000,Math.min(1000,Number(p.dx)||0)),deltaY:Math.max(-1000,Math.min(1000,-Number(p.dy)||0))});
    }else throw Error('Invalid input type');
    json(res,200,{ok:true});return;
  }
  if(u.pathname.startsWith('/media/')&&req.method==='GET'){
    const handler=protocols.get('rerun-media');const response=await handler(new Request(`rerun-media://local/${u.pathname.slice(7)}`,{headers:req.headers.range?{'Range':req.headers.range}:{}}));
    res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();return;
  }
  if(req.method==='GET'||req.method==='HEAD'){
    const pathname=u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname);
    const publicRoot=path.join(__dirname,'dist'),file=path.resolve(publicRoot,'.'+pathname);
    if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){json(res,404,{error:'Not found'});return;}
    const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'};
    if(!authenticated&&publicWebRequest)headers['Set-Cookie']=webSessionCookies(req);
    res.writeHead(200,headers);
    if(req.method==='HEAD')res.end();else await pipeline(fs.createReadStream(file),res);return;
  }
  json(res,404,{error:'Not found'});
}
app.whenReady().then(async()=>{
  // NP requires an explicitly issued customer account; no owner auto-login.
  server=http.createServer((req,res)=>route(req,res).catch(error=>{if(!res.headersSent)json(res,error.statusCode||400,{error:error.message});else res.destroy();}));
  server.requestTimeout=0;
  server.on('error',error=>{fs.writeFileSync(path.join(data,'startup-error.txt'),error.message);app.quit();});
  server.listen(port,'127.0.0.1',()=>{
    fs.writeFileSync(path.join(data,'launch.json'),JSON.stringify({url:`${origin}/auth?code=${accessCode}`,origin,pid:process.pid,startedAt:new Date().toISOString()},null,2));
    console.log(`Digital NP Studio Web running at ${origin}`);
  });
});
app.on('before-quit',()=>{clearInterval(serverKeepAlive);server?.close();for(const c of clients)c.end();});
process.on('SIGTERM',()=>app.quit());
