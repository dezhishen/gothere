// HTML 静态站点包：给 nginx 之类的静态服务器直接解压使用。
// 内容是单文件游戏产物（样式、脚本、关卡全部内联），所以包里只有一个 index.html。

import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPortable } from './build.mjs';
import { archiveName, tarPaths } from './archive.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function buildWeb({ quiet = false } = {}) {
  await buildPortable();
  const stage = resolve(ROOT, 'dist', 'web');
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  // 站点根就一个 index.html：nginx 的 root 指向解压目录即可。
  await copyFile(resolve(ROOT, 'dist', 'index.html'), resolve(stage, 'index.html'));

  const archive = resolve(ROOT, 'dist', archiveName('gothere-web', 'linux'));
  await rm(archive, { force: true });
  await tarPaths(archive, [resolve(stage, 'index.html')]);
  const size = (await stat(archive)).size;
  if (size < 1024) throw new Error('静态站点压缩包看起来不对：' + size + ' 字节。');
  if (!quiet) {
    console.log('Web: ' + archive + ' (' + Math.round(size / 1024) + ' KiB, index.html 单文件)');
  }
  return { path: archive, name: archive.split('/').pop(), bytes: size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildWeb({ quiet: process.argv.includes('--quiet') });
}
