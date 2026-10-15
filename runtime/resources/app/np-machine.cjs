const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
let cached;
module.exports=()=>{if(cached)return cached;
 const output=execFileSync('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\Cryptography','/v','MachineGuid'],{encoding:'utf8',windowsHide:true,timeout:5000});
 const guid=output.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i)?.[1];if(!guid)throw Error('อ่านรหัสเครื่อง Windows ไม่ได้');
 return cached=createHash('sha256').update('NP-Studio-Windows-v1:'+guid.toLowerCase()).digest('hex');};
