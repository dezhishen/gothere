// 打包用的压缩助手：不引入第三方依赖，用系统自带工具。
// - posix：tar -czf（保留符号链接与可执行位，macOS 的 .app 需要；zip 并非处处都有）
// - Windows：PowerShell 的 Compress-Archive（.zip）
// 所以同一份东西在不同平台的文件名后缀不同，发布时按平台列清楚。

import { execFile } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 按平台给出压缩包名：posix 用 .tar.gz，Windows 用 .zip。 */
export function archiveName(baseName) {
  return baseName + (process.platform === 'win32' ? '.zip' : '.tar.gz');
}

/**
 * 把一组同目录下的路径打进一个压缩包。
 * 目录会连目录本身一起打包（保留结构），散装文件则整齐地放在包根下。
 */
export async function archivePaths(targetZip, paths) {
  const target = resolve(targetZip);
  const absolute = paths.map((path) => resolve(path));
  if (absolute.length === 0) throw new Error('archivePaths 需要至少一个路径。');
  const parent = dirname(absolute[0]);
  for (const path of absolute) {
    if (dirname(path) !== parent) throw new Error('同一个压缩包里的条目必须同目录：' + path);
  }
  const names = absolute.map((path) => basename(path));

  if (process.platform === 'win32') {
    const script = 'Compress-Archive -Force -Path ' +
      names.map((name) => "'" + (parent + '\\' + name).replace(/'/g, "''") + "'").join(',') +
      " -DestinationPath '" + target.replace(/'/g, "''") + "'";
    await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return target;
  }

  await run('tar', ['-czf', target, '-C', parent, ...names]);
  return target;
}
