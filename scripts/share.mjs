import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildPortable } from './build.mjs';
import { makeServer } from '../server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(root, 'artifacts'), { recursive:true });
await buildPortable();
const preview = makeServer({ portableOnly:true });
await new Promise((resolveListen,reject)=>{preview.once('error',reject);preview.listen(0,'127.0.0.1',resolveListen);});
const port = preview.address().port;
console.log('Read-only game preview listening on 127.0.0.1:' + port);
const args = ['-T','-o','BatchMode=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=30',
  '-o','ServerAliveCountMax=3','-o','ExitOnForwardFailure=yes','-o','LogLevel=ERROR',
  '-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+resolve(root,'artifacts/tunnel-known-hosts'),
  '-o','IdentityAgent=none','-o','IdentitiesOnly=yes','-o','IdentityFile=none',
  '-R','80:127.0.0.1:'+port,'nokey@localhost.run','--','--output','json'];
const tunnel = spawn('ssh',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
let saved = false, buffer = '';
const deadline = setTimeout(()=>{
  if(!saved){console.error('No public URL was received within 45 seconds.');tunnel.kill();}
},45000);
function consume(chunk) {
  const text=chunk.toString();process.stdout.write(text);buffer=(buffer+text).slice(-24000);
  const match=buffer.match(/\b([a-z0-9-]+\.(?:lhr\.life|localhost\.run))\b/i);
  if(match&&!saved&&!['admin.localhost.run','www.localhost.run'].includes(match[1])){
    saved=true;clearTimeout(deadline);
    const url='https://'+match[1];
    writeFile(resolve(root,'artifacts/share.json'),JSON.stringify({url,port,pid:process.pid,createdAt:new Date().toISOString()},null,2))
      .then(()=>console.log('\nMobile preview: '+url+'\nKeep this process running while testing.'))
      .catch(error=>{console.error('Cannot save preview URL:',error.message);tunnel.kill();});
  }
}
tunnel.stdout.on('data',consume);tunnel.stderr.on('data',consume);
let stopping=false;
function stop(code=0) {
  if(stopping)return;stopping=true;clearTimeout(deadline);tunnel.kill();
  preview.close(()=>{process.exitCode=code;});
}
tunnel.on('error',error=>{console.error('Cannot start SSH tunnel:',error.message);stop(1);});
tunnel.on('close',code=>{console.log('Public preview disconnected. Run pnpm share to reconnect.');stop(code??1);});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
