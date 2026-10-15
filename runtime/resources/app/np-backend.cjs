const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const encode=p=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(p,salt,64).toString('hex');};
function matches(p,s){try{const [salt,h]=s.split(':');return crypto.timingSafeEqual(Buffer.from(h,'hex'),crypto.scryptSync(p,salt,64));}catch{return false;}}
const clamp=(value,min,max,fallback)=>{const n=Math.floor(Number(value));return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;};
const clampDecimal=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;};
const toMs=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);if(Number.isFinite(n)&&n>0)return n;const t=Date.parse(String(value));return Number.isFinite(t)?t:null;};
const valueOr=(value,fallback)=>value===null||value===undefined?fallback:value;
module.exports=function(directory){
 fs.mkdirSync(directory,{recursive:true});const db=new DatabaseSync(path.join(directory,'np.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,license_key TEXT UNIQUE NOT NULL,machine_id TEXT,disabled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,username TEXT REFERENCES users(username),machine_id TEXT,expires_at INTEGER);CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY,title TEXT,body TEXT,image TEXT,active INTEGER,created_at INTEGER,updated_at INTEGER);CREATE TABLE IF NOT EXISTS admin(username TEXT PRIMARY KEY,password_hash TEXT);CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,action TEXT,username TEXT,at INTEGER);CREATE TABLE IF NOT EXISTS packages(id TEXT PRIMARY KEY,name TEXT NOT NULL,machine_limit INTEGER NOT NULL,channel_limit INTEGER NOT NULL,video_limit INTEGER NOT NULL,notes TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS user_machines(username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,machine_id TEXT NOT NULL,bound_at INTEGER NOT NULL,PRIMARY KEY(username,machine_id));CREATE TABLE IF NOT EXISTS payment_account(id INTEGER PRIMARY KEY CHECK(id=1),bank_name TEXT NOT NULL DEFAULT '',account_name TEXT NOT NULL DEFAULT '',account_number TEXT NOT NULL DEFAULT '',qr_image TEXT NOT NULL DEFAULT '',icon_image TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS topup_requests(id TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,package_id TEXT NOT NULL,amount INTEGER NOT NULL,slip_path TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,reviewed_at INTEGER,reviewed_by TEXT);CREATE TABLE IF NOT EXISTS user_packages(id TEXT PRIMARY KEY,username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,package_id TEXT NOT NULL,topup_request_id TEXT NOT NULL,activated_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'active');`);
 for(const [col,def] of [['package_id','TEXT'],['machine_limit','INTEGER NOT NULL DEFAULT 1'],['channel_limit','INTEGER NOT NULL DEFAULT 5'],['video_limit','INTEGER NOT NULL DEFAULT 10'],['starts_at','INTEGER'],['expires_at','INTEGER'],['phone','TEXT NOT NULL DEFAULT ""'],['line_id','TEXT NOT NULL DEFAULT ""'],['note','TEXT NOT NULL DEFAULT ""'],['email','TEXT NOT NULL DEFAULT ""'],['full_name','TEXT NOT NULL DEFAULT ""']]){try{db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);}catch{}}
 for(const [col,def] of [['starts_at','INTEGER'],['ends_at','INTEGER'],['price','INTEGER NOT NULL DEFAULT 0'],['is_active','INTEGER NOT NULL DEFAULT 1'],['duration_days','INTEGER NOT NULL DEFAULT 30'],['shopee_limit','INTEGER NOT NULL DEFAULT 0'],['clip_size_gb','REAL NOT NULL DEFAULT 0']]){try{db.exec(`ALTER TABLE packages ADD COLUMN ${col} ${def}`);}catch{}}
 db.prepare('INSERT OR IGNORE INTO payment_account(id,updated_at) VALUES(1,?)').run(Date.now());
 if(!db.prepare('SELECT 1 FROM packages WHERE id=?').get('starter')){const now=Date.now();db.prepare('INSERT INTO packages(id,name,machine_limit,channel_limit,video_limit,notes,created_at,updated_at,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('starter','Starter',1,5,10,'แพ็กเกจเริ่มต้น: 5 ช่อง TikTok, 10 วิดีโอ, 1 เครื่อง',now,now,null,null);}
 db.prepare(`UPDATE users SET machine_limit=CASE WHEN machine_limit<0 THEN 0 ELSE machine_limit END,channel_limit=CASE WHEN channel_limit<0 THEN 0 ELSE channel_limit END,video_limit=CASE WHEN video_limit<0 THEN 0 ELSE video_limit END`).run();
 db.prepare(`INSERT OR IGNORE INTO user_machines(username,machine_id,bound_at) SELECT username,machine_id,created_at FROM users WHERE machine_id IS NOT NULL AND machine_id<>''`).run();
 if(!db.prepare('SELECT 1 FROM admin').get()){
  const password='NP!'+crypto.randomBytes(12).toString('base64url');db.prepare('INSERT INTO admin VALUES(?,?)').run('npadmin',encode(password));
  fs.writeFileSync(path.join(directory,'admin-initial.json'),JSON.stringify({username:'npadmin',password},null,2),{mode:0o600});
 }
 const admins=new Map(),attempts=new Map();
 const result=(status,data)=>({ok:status<400,status,data}),fail=(status,error)=>result(status,{ok:false,error});
 const get=n=>db.prepare('SELECT * FROM users WHERE username=?').get(String(n||'').trim().toLowerCase());
 const audit=(a,n)=>db.prepare('INSERT INTO audit(action,username,at) VALUES(?,?,?)').run(a,n||null,Date.now());
 const pkg=id=>db.prepare('SELECT * FROM packages WHERE id=?').get(String(id||'starter'))||db.prepare('SELECT * FROM packages WHERE id=?').get('starter');
 const effectiveMachineLimit=(u,p)=>{const packageLimit=Number(valueOr(p?.machine_limit,u?.machine_limit??1)),userLimit=Number(valueOr(u?.machine_limit,packageLimit));if(packageLimit<=0)return 0;return Math.max(packageLimit,Number.isFinite(userLimit)?userLimit:packageLimit);};
 const packageView=p=>({id:p.id,name:p.name,machineLimit:valueOr(p.machine_limit,0),channelLimit:valueOr(p.channel_limit,0),videoLimit:valueOr(p.video_limit,0),shopeeLimit:valueOr(p.shopee_limit,0),clipSizeGb:valueOr(p.clip_size_gb,0),durationDays:valueOr(p.duration_days,0),price:valueOr(p.price,0),isActive:p.is_active!==0,startsAt:p.starts_at||null,endsAt:p.ends_at||null,notes:p.notes||'',createdAt:p.created_at,updatedAt:p.updated_at});
 const packageDates=(p,base=Date.now())=>{const days=Math.max(0,Number(p?.duration_days||0));return {startsAt:base,expiresAt:days?base+days*86400000:null};};
 const limitsFrom=(body,base)=>({packageId:String(body.packageId||base?.package_id||'starter'),machineLimit:clamp(body.machineLimit,0,999999,valueOr(base?.machine_limit,1)),channelLimit:clamp(body.channelLimit,0,999999,valueOr(base?.channel_limit,5)),videoLimit:clamp(body.videoLimit,0,999999,valueOr(base?.video_limit,10)),startsAt:toMs(body.startsAt!==undefined?body.startsAt:base?.starts_at),expiresAt:toMs(body.expiresAt!==undefined?body.expiresAt:base?.expires_at)});
 const machineSummary=u=>{const rows=db.prepare('SELECT machine_id FROM user_machines WHERE username=? ORDER BY bound_at ASC').all(u.username);return {count:rows.length,fingerprint:rows[0]?.machine_id?.slice(0,12)||null};};
 const view=u=>{const m=machineSummary(u),hasPackage=!!u.package_id,p=hasPackage?pkg(u.package_id):null;return {username:u.username,displayName:u.display_name,fullName:u.full_name||'',email:u.email||'',phone:u.phone||'',lineId:u.line_id||'',note:u.note||'',plan:hasPackage?(u.expires_at?'limited':'lifetime'):'unpaid',packageActive:hasPackage,packageId:u.package_id||'',packageName:hasPackage?(p?.name||'แพ็กเกจ'):'ยังไม่สมัครแพ็กเกจ',startsAt:u.starts_at||null,expiresAt:u.expires_at||null,machineLimit:hasPackage?effectiveMachineLimit(u,p):valueOr(u.machine_limit,1),machineCount:m.count,machineFingerprint:m.fingerprint,channelLimit:hasPackage?valueOr(p?.channel_limit,valueOr(u.channel_limit,0)):valueOr(u.channel_limit,0),videoLimit:hasPackage?valueOr(p?.video_limit,valueOr(u.video_limit,0)):valueOr(u.video_limit,0),disabled:!!u.disabled,createdAt:u.created_at};};
 const isAdminToken=t=>typeof t==='string'&&(admins.get(digest(t))||0)>Date.now();
 const licensed=(u,token)=>{const hasPackage=!!u.package_id,p=hasPackage?pkg(u.package_id):null;return {ok:true,token,username:u.username,displayName:u.display_name,plan:hasPackage?(u.expires_at?'limited':'lifetime'):'unpaid',packageActive:hasPackage,packageId:u.package_id||'',packageName:hasPackage?(p?.name||'แพ็กเกจ'):'ยังไม่สมัครแพ็กเกจ',startsAt:u.starts_at||null,expiresAt:hasPackage?(u.expires_at||253402214400000):null,machineLimit:hasPackage?effectiveMachineLimit(u,p):valueOr(u.machine_limit,1),channelLimit:hasPackage?valueOr(p?.channel_limit,valueOr(u.channel_limit,0)):0,videoLimit:hasPackage?valueOr(p?.video_limit,valueOr(u.video_limit,0)):0};};
 const blockedByDate=u=>!u.package_id?null:u.starts_at&&Date.now()<u.starts_at?'สิทธิ์นี้ยังไม่ถึงวันเริ่มใช้งาน':u.expires_at&&Date.now()>u.expires_at?'สิทธิ์ใช้งานหมดอายุแล้ว':null;
 const paymentView=()=>{const a=db.prepare('SELECT * FROM payment_account WHERE id=1').get()||{};return {bankName:a.bank_name||'',accountName:a.account_name||'',accountNumber:a.account_number||'',qrImage:a.qr_image||'',iconImage:a.icon_image||'',updatedAt:a.updated_at||0};};
 const topupView=r=>({id:r.id,username:r.username,packageId:r.package_id,packageName:pkg(r.package_id)?.name||r.package_id,amount:r.amount,slipPath:r.slip_path,status:r.status,note:r.note||'',createdAt:r.created_at,reviewedAt:r.reviewed_at||null,reviewedBy:r.reviewed_by||''});
 const topupRows=(where='',params=[])=>db.prepare(`SELECT * FROM topup_requests ${where} ORDER BY created_at DESC`).all(...params).map(topupView);
 function activatePackage(username,packageId,requestId){
  const p=pkg(packageId);if(!p)return;
  const now=Date.now(),dates=packageDates(p,now);
  db.prepare('UPDATE users SET package_id=?,machine_limit=?,channel_limit=?,video_limit=?,starts_at=?,expires_at=? WHERE username=?').run(p.id,p.machine_limit,p.channel_limit,p.video_limit,dates.startsAt,dates.expiresAt,username);
  db.prepare('INSERT INTO user_packages(id,username,package_id,topup_request_id,activated_at,status) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),username,p.id,requestId,now,'active');
 }
 function topupOverview(username){
  const user=get(username);if(!user)return fail(404,'ไม่พบผู้ใช้');
  const active=db.prepare('SELECT * FROM user_packages WHERE username=? AND status=? ORDER BY activated_at DESC').all(user.username,'active').map(x=>({id:x.id,packageId:x.package_id,packageName:pkg(x.package_id)?.name||x.package_id,topupRequestId:x.topup_request_id,activatedAt:x.activated_at,status:x.status}));
  return result(200,{ok:true,paymentAccount:paymentView(),currentPackage:user.package_id?packageView(pkg(user.package_id)):null,paymentPackages:active,packages:db.prepare('SELECT * FROM packages WHERE is_active=1 ORDER BY price ASC, created_at ASC').all().map(packageView),requests:topupRows('WHERE username=?',[user.username]),activePackages:active,balanceApproved:topupRows('WHERE username=? AND status=?',[user.username,'approved']).reduce((sum,item)=>sum+Number(item.amount||0),0)});
 }
 function createTopup(username,body={}){
  const user=get(username);if(!user)return fail(404,'ไม่พบผู้ใช้');
  const p=pkg(body.packageId);if(!p||p.is_active===0||Number(p.price||0)<=0)return fail(400,'แพ็กเกจนี้ยังไม่เปิดให้สมัคร');
  const slip=String(body.slipPath||'').trim();if(!/^uploads\/[a-f0-9-]{36}\/[^/\\]+$/i.test(slip))return fail(400,'กรุณาแนบสลิปโอนเงิน');
  const pending=db.prepare('SELECT 1 FROM topup_requests WHERE username=? AND package_id=? AND status=?').get(user.username,p.id,'pending');
  if(pending)return fail(409,'มีคำขอแพ็กเกจนี้รอตรวจสอบอยู่แล้ว');
  const id=crypto.randomUUID(),now=Date.now();
  db.prepare('INSERT INTO topup_requests(id,username,package_id,amount,slip_path,status,note,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,user.username,p.id,p.price,slip,'pending','',now);
  audit('topup-request',user.username);return topupOverview(user.username);
 }
 function throttle(name){const a=attempts.get(name);return a&&a.count>=8&&Date.now()-a.at<60000;}
 function failed(name){const a=attempts.get(name);attempts.set(name,{at:Date.now(),count:a&&Date.now()-a.at<60000?a.count+1:1});}
 function request(method,pathname,body={},token){try{
  const url=new URL(pathname,'http://local'),route=url.pathname;
  if(route==='/api/admin/login'&&method==='POST'){
   const name=String(body.username||'').trim(),bucket='admin:'+name;if(throttle(bucket))return fail(429,'กรุณารอ 1 นาที');
   const a=db.prepare('SELECT * FROM admin WHERE username=?').get(name);
   if(!a||!matches(String(body.password||''),a.password_hash)){failed(bucket);return fail(401,'ชื่อผู้ใช้หรือรหัสผ่านแอดมินไม่ถูกต้อง');}
   attempts.delete(bucket);const t=crypto.randomBytes(32).toString('hex');admins.set(digest(t),Date.now()+8*3600000);audit('admin-login',name);return result(200,{ok:true,token:t});
  }
  if(route==='/api/login'&&method==='POST'){
   const name=String(body.username||'').trim().toLowerCase(),u=get(name);if(throttle(name))return fail(429,'กรุณารอ 1 นาที');
   if(!name)return fail(400,'กรุณากรอกชื่อผู้ใช้');
   if(!String(body.password||''))return fail(400,'กรุณากรอกรหัสผ่าน');
   if(!u){failed(name);return fail(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');}
   if(!matches(String(body.password||''),u.password_hash)){failed(name);return fail(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');}
   if(body.licenseKey&&body.licenseKey!==u.license_key){failed(name);return fail(401,'License key ไม่ตรงกับบัญชีนี้');}
   if(u.disabled)return fail(403,'บัญชีถูกระงับ');const dateError=blockedByDate(u);if(dateError)return fail(403,dateError);
   const machine=String(body.machineId||'');if(!/^[a-f0-9]{64}$/.test(machine))return fail(400,'ไม่สามารถระบุเครื่อง Windows ได้');
   db.exec('BEGIN IMMEDIATE');
   try{const bound=get(name),boundPackage=bound.package_id?pkg(bound.package_id):null,known=db.prepare('SELECT 1 FROM user_machines WHERE username=? AND machine_id=?').get(name,machine),count=db.prepare('SELECT COUNT(*) n FROM user_machines WHERE username=?').get(name).n,limit=Math.max(0,Math.floor(Number(boundPackage?effectiveMachineLimit(bound,boundPackage):valueOr(bound.machine_limit,1))));
    if(!known&&limit>0&&count>=limit){db.exec('ROLLBACK');return fail(403,`รหัสนี้ใช้ครบ ${limit} เครื่องแล้ว หากต้องการล็อกอินเครื่องใหม่ให้แอดมินกดปลดล็อกเครื่องก่อน`);}
    if(!known){db.prepare('INSERT INTO user_machines(username,machine_id,bound_at) VALUES(?,?,?)').run(name,machine,Date.now());db.prepare('UPDATE users SET machine_id=COALESCE(machine_id,?) WHERE username=?').run(machine,name);audit('bind-machine',name);}
    const sessionExpires=Math.min(Date.now()+30*86400000,bound.expires_at||253402214400000);const t=crypto.randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(t),name,machine,sessionExpires);db.exec('COMMIT');attempts.delete(name);return result(200,licensed(get(name),t));
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(route==='/api/validate'){
   const s=db.prepare('SELECT * FROM sessions WHERE token=?').get(digest(String(body.token||''))),u=s&&get(s.username);const dateError=u&&blockedByDate(u);
   if(!s||!u||u.disabled||dateError||s.expires_at<=Date.now()||s.machine_id!==body.machineId||!db.prepare('SELECT 1 FROM user_machines WHERE username=? AND machine_id=?').get(u.username,body.machineId))return fail(401,dateError||'เซสชันหรือเครื่องไม่ถูกต้อง กรุณาเข้าสู่ระบบ');
   return result(200,licensed(u,body.token));
  }
  if(route==='/api/announcements')return result(200,{ok:true,items:db.prepare('SELECT * FROM announcements WHERE active=1 ORDER BY updated_at DESC').all().map(a=>({...a,message:a.body,type:'info'}))});
  if(route==='/api/register'&&method==='POST'){
   const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||''),email=String(body.email||'').trim().toLowerCase(),fullName=String(body.fullName||'').trim(),phone=String(body.phone||'').trim(),lineId=String(body.lineId||'').trim();
   if(!/^[a-z0-9_.-]{3,60}$/.test(username)||password.length<8||password.length>256)return fail(400,'User ต้องมี 3–60 ตัว และ Password อย่างน้อย 8 ตัว');
   if(!fullName||fullName.length>120)return fail(400,'กรุณากรอกชื่อ-สกุล');
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160)return fail(400,'กรุณากรอกอีเมลให้ถูกต้อง');
   if(!phone||phone.length>40)return fail(400,'กรุณากรอกเบอร์โทร');
   if(get(username))return fail(409,'มีผู้ใช้งานชื่อนี้แล้วค่ะ');
   const existsEmail=db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email);if(existsEmail)return fail(409,'อีเมลนี้สมัครไว้แล้ว');
   const license='NP-'+crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
   try{
    db.prepare('INSERT INTO users(username,display_name,full_name,email,phone,line_id,note,password_hash,license_key,machine_id,disabled,created_at,package_id,machine_limit,channel_limit,video_limit,starts_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,0,?,NULL,1,0,0,NULL,NULL)').run(username,fullName,fullName,email,phone,lineId,'สมัครสมาชิกจากหน้า Studio',encode(password),license,Date.now());
   }catch(error){
    if(String(error?.message||'').includes('UNIQUE')&&String(error?.message||'').includes('users.username'))return fail(409,'มีผู้ใช้งานชื่อนี้แล้วค่ะ');
    throw error;
   }
   audit('self-register',username);return result(200,{ok:true,user:view(get(username))});
  }
  if(!route.startsWith('/api/admin/'))return fail(404,'ไม่พบคำสั่ง');
  if(!isAdminToken(token))return fail(401,'กรุณาเข้าสู่ระบบแอดมิน NP');
  if(route==='/api/admin/logout'){admins.delete(digest(token));return result(200,{ok:true});}
  if(route==='/api/admin/session')return result(200,{ok:true});
  if(route==='/api/admin/packages'){
   if(method==='GET')return result(200,{ok:true,packages:db.prepare('SELECT * FROM packages ORDER BY created_at ASC').all().map(packageView)});
   if(method==='PUT'){
    const id=String(body.id||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'-')||crypto.randomUUID(),name=String(body.name||'').trim();
    if(!name||name.length>80)return fail(400,'ชื่อแพ็กเกจต้องมี 1–80 ตัวอักษร');
    const now=Date.now(),old=db.prepare('SELECT * FROM packages WHERE id=?').get(id);
    db.prepare('INSERT INTO packages(id,name,machine_limit,channel_limit,video_limit,notes,created_at,updated_at,starts_at,ends_at,price,is_active,duration_days,shopee_limit,clip_size_gb) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,machine_limit=excluded.machine_limit,channel_limit=excluded.channel_limit,video_limit=excluded.video_limit,notes=excluded.notes,starts_at=excluded.starts_at,ends_at=excluded.ends_at,price=excluded.price,is_active=excluded.is_active,duration_days=excluded.duration_days,shopee_limit=excluded.shopee_limit,clip_size_gb=excluded.clip_size_gb,updated_at=excluded.updated_at').run(id,name,clamp(body.machineLimit,0,999999,1),clamp(body.channelLimit,0,999999,5),clamp(body.videoLimit,0,999999,10),String(body.notes||'').slice(0,500),old?.created_at||now,now,null,null,clamp(body.price,0,9999999,0),body.isActive===false?0:1,clamp(body.durationDays,0,3650,30),clamp(body.shopeeLimit,0,999999,0),clampDecimal(body.clipSizeGb,0,999999,0));
    audit('save-package',id);return result(200,{ok:true,package:packageView(pkg(id))});
   }
  }
  if(route==='/api/admin/users'&&method==='GET')return result(200,{ok:true,users:db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(view)});
  if(route==='/api/admin/topup'&&method==='GET')return result(200,{ok:true,paymentAccount:paymentView(),requests:topupRows(),packages:db.prepare('SELECT * FROM packages ORDER BY created_at ASC').all().map(packageView)});
  if(route==='/api/admin/payment-account'&&method==='PUT'){
   const bank=String(body.bankName||'').trim(),name=String(body.accountName||'').trim(),number=String(body.accountNumber||'').replace(/[^\d-]/g,'').slice(0,40),qr=String(body.qrImage||''),icon=String(body.iconImage||'');
   if(bank.length>80||name.length>120||number.length>40)return fail(400,'ข้อมูลบัญชีรับเงินยาวเกินไป');
   if(qr.length>1500000||qr&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(qr))return fail(400,'QR ต้องเป็น PNG/JPEG/WebP ขนาดไม่เกิน 1 MB');
   if(icon.length>700000||icon&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(icon))return fail(400,'ไอคอนต้องเป็น PNG/JPEG/WebP ขนาดไม่เกิน 500 KB');
   db.prepare('UPDATE payment_account SET bank_name=?,account_name=?,account_number=?,qr_image=?,icon_image=?,updated_at=? WHERE id=1').run(bank,name,number,qr,icon,Date.now());
   audit('save-payment-account','superAdmin');return result(200,{ok:true,paymentAccount:paymentView()});
  }
  if(route==='/api/admin/topup-review'&&method==='POST'){
   const id=String(body.id||''),status=String(body.status||'');
   if(!['approved','rejected'].includes(status))return fail(400,'สถานะไม่ถูกต้อง');
   const r=db.prepare('SELECT * FROM topup_requests WHERE id=?').get(id);if(!r)return fail(404,'ไม่พบคำขอแพ็กเกจ');
   if(r.status!=='pending')return fail(409,'คำขอนี้ถูกตรวจแล้ว');
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('UPDATE topup_requests SET status=?,note=?,reviewed_at=?,reviewed_by=? WHERE id=?').run(status,String(body.note||'').slice(0,500),Date.now(),'superAdmin',id);
    if(status==='approved')activatePackage(r.username,r.package_id,id);
    audit(status==='approved'?'approve-topup':'reject-topup',r.username);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   return result(200,{ok:true,requests:topupRows()});
  }
  if(route==='/api/admin/user'&&method==='PUT'){
   const username=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
   if(!/^[a-z0-9_.-]{3,60}$/.test(username)||password.length<8||password.length>256)return fail(400,'Username ต้องมี 3–60 ตัว (a-z, 0-9, . _ -) และ Password 8–256 ตัว');
   if(get(username))return fail(409,'มีผู้ใช้งานชื่อนี้แล้วค่ะ');
   const hasPackage=!!body.packageId, p=hasPackage?pkg(body.packageId):null,dates=hasPackage?packageDates(p):{startsAt:null,expiresAt:null},limits=hasPackage?limitsFrom({...body,packageId:p.id,machineLimit:body.machineLimit??p.machine_limit,channelLimit:body.channelLimit??p.channel_limit,videoLimit:body.videoLimit??p.video_limit,startsAt:body.startsAt??dates.startsAt,expiresAt:body.expiresAt??dates.expiresAt},p):{packageId:null,machineLimit:1,channelLimit:0,videoLimit:0,startsAt:null,expiresAt:null};
   if(limits.startsAt&&limits.expiresAt&&limits.expiresAt<limits.startsAt)return fail(400,'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มใช้งาน');
   const license='NP-'+crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
   try{
    db.prepare('INSERT INTO users(username,display_name,full_name,email,phone,line_id,note,password_hash,license_key,machine_id,disabled,created_at,package_id,machine_limit,channel_limit,video_limit,starts_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,0,?,?,?,?,?,?,?)').run(username,String(body.displayName||username).trim().slice(0,120)||username,String(body.fullName||'').trim().slice(0,120),String(body.email||'').trim().toLowerCase().slice(0,160),String(body.phone||'').trim().slice(0,40),String(body.lineId||'').trim().slice(0,80),String(body.note||'').trim().slice(0,500),encode(password),license,Date.now(),limits.packageId,limits.machineLimit,limits.channelLimit,limits.videoLimit,limits.startsAt,limits.expiresAt);
   }catch(error){
    if(String(error?.message||'').includes('UNIQUE')&&String(error?.message||'').includes('users.username'))return fail(409,'มีผู้ใช้งานชื่อนี้แล้วค่ะ');
    throw error;
   }
   audit('create-user',username);return result(200,{ok:true,user:view(get(username))});
  }
  if(route==='/api/admin/reset-machines'&&method==='POST'){
   const u=get(body.username);if(!u)return fail(404,'ไม่พบผู้ใช้');
   const current=Number(valueOr(u.machine_limit,1));const next=current<=0?0:clamp(current+1,1,999999,2);db.prepare('UPDATE users SET machine_limit=? WHERE username=?').run(next,u.username);audit('unlock-machine',u.username);return result(200,{ok:true,user:view(get(u.username))});
  }
  if(route==='/api/admin/add-machine-slot'&&method==='POST'){
   const u=get(body.username);if(!u)return fail(404,'ไม่พบผู้ใช้');
   const current=Number(valueOr(u.machine_limit,1));const next=current<=0?0:clamp(current+1,1,999999,2);db.prepare('UPDATE users SET machine_limit=? WHERE username=?').run(next,u.username);audit('add-machine-slot',u.username);return result(200,{ok:true,user:view(get(u.username))});
  }
  if(route==='/api/admin/user-info'&&method==='POST'){
   const u=get(body.username);if(!u)return fail(404,'ไม่พบผู้ใช้');
   const display=String(body.displayName||u.username).trim();if(!display||display.length>120)return fail(400,'ชื่อแสดงผลต้องมี 1–120 ตัวอักษร');
   const phone=String(body.phone||'').trim().slice(0,40),lineId=String(body.lineId||'').trim().slice(0,80),note=String(body.note||'').trim().slice(0,500),email=String(body.email||u.email||'').trim().toLowerCase().slice(0,160),fullName=String(body.fullName||u.full_name||'').trim().slice(0,120);
   const packageInput=body.packageId!==undefined?String(body.packageId||''):u.package_id;
   const p=packageInput?pkg(packageInput):null,dates=p?packageDates(p):{startsAt:null,expiresAt:null},limits=p?limitsFrom({...body,packageId:p.id,machineLimit:body.machineLimit??p.machine_limit,channelLimit:body.channelLimit??p.channel_limit,videoLimit:body.videoLimit??p.video_limit,startsAt:body.startsAt??dates.startsAt,expiresAt:body.expiresAt??dates.expiresAt},u):{packageId:null,machineLimit:valueOr(u.machine_limit,1),channelLimit:0,videoLimit:0,startsAt:null,expiresAt:null};
   if(limits.startsAt&&limits.expiresAt&&limits.expiresAt<limits.startsAt)return fail(400,'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มใช้งาน');
   db.prepare('UPDATE users SET display_name=?,full_name=?,email=?,phone=?,line_id=?,note=?,disabled=?,package_id=?,machine_limit=?,channel_limit=?,video_limit=?,starts_at=?,expires_at=? WHERE username=?').run(display,fullName,email,phone,lineId,note,body.disabled?1:0,limits.packageId,limits.machineLimit,limits.channelLimit,limits.videoLimit,limits.startsAt,limits.expiresAt,u.username);
   if(body.disabled)db.prepare('DELETE FROM sessions WHERE username=?').run(u.username);
   audit('update-user',u.username);return result(200,{ok:true,user:view(get(u.username))});
  }
  if(route==='/api/admin/delete-user'&&method==='POST'){
   const u=get(body.username);if(!u)return fail(404,'ไม่พบผู้ใช้');
   db.exec('BEGIN IMMEDIATE');
   try{db.prepare('DELETE FROM sessions WHERE username=?').run(u.username);db.prepare('DELETE FROM users WHERE username=?').run(u.username);audit('delete-user',u.username);db.exec('COMMIT');return result(200,{ok:true});}
   catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(route==='/api/admin/disable'||route==='/api/admin/password'){
   const u=get(body.username);if(!u)return fail(404,'ไม่พบผู้ใช้');
   if(route.endsWith('/disable'))db.prepare('UPDATE users SET disabled=? WHERE username=?').run(body.disabled?1:0,u.username);
   else{const password=String(body.password||'');if(password.length<8||password.length>256)return fail(400,'Password ต้องมี 8–256 ตัว');db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(encode(password),u.username);}
   db.prepare('DELETE FROM sessions WHERE username=?').run(u.username);audit(route.endsWith('/disable')?'set-status':'reset-password',u.username);return result(200,{ok:true});
  }
  if(route==='/api/admin/announcements'){
   if(method==='GET')return result(200,{ok:true,items:db.prepare('SELECT * FROM announcements ORDER BY updated_at DESC').all()});
   if(method==='PUT'){
    const title=String(body.title||'').trim(),message=String(body.body||'').trim(),image=String(body.image||'');
    if(!title||title.length>150||message.length>5000)return fail(400,'ระบุหัวข้อไม่เกิน 150 ตัว และข้อความไม่เกิน 5,000 ตัว');
    if(image.length>1500000||image&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))return fail(400,'รูปต้องเป็น PNG/JPEG/WebP ขนาดไม่เกิน 1 MB');
    const id=body.id?String(body.id):crypto.randomUUID(),old=db.prepare('SELECT * FROM announcements WHERE id=?').get(id);if(body.id&&!old)return fail(404,'ไม่พบประกาศ');
    db.prepare('INSERT INTO announcements VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,image=excluded.image,active=excluded.active,updated_at=excluded.updated_at').run(id,title,message,image,body.active?1:0,old?.created_at||Date.now(),Date.now());audit('save-announcement',id);return result(200,{ok:true,id});
   }
  }
  return fail(404,'ไม่พบคำสั่ง');
 }catch{return fail(500,'ไม่สามารถบันทึกข้อมูล NP ได้');}}
 return {kind:'np',request,isAdminToken,topupOverview,createTopup,info:()=>({mode:'np-local',database:'NP / SQLite'}),close:()=>db.close()};
};
