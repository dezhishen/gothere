import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 开发服务器：Tailwind 监听 src/styles/app.css 生成 src/style.css，
 * 同时启动静态服务器。任一进程退出则整体退出。
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, [resolve(ROOT, 'scripts/css.mjs'), '--watch'], { cwd: ROOT, stdio: 'inherit' }),
  spawn(process.execPath, [resolve(ROOT, 'server.mjs')], { cwd: ROOT, stdio: 'inherit' }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}

for (const child of children) {
  child.on('error', (error) => { console.error('Cannot start dev process:', error.message); stop(1); });
  child.on('exit', (code, signal) => stop(code ?? (signal ? 1 : 0)));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
