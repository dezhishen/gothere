// 桌面端客户端：把构建好的单文件游戏塞进 Electron，按当前平台打成一个可解压即用的目录，
// 再压成 dist/gothere-desktop-<platform>-<arch>.zip。
//
// 为什么用 @electron/packager 而不是 electron-builder：这里只要「能跑」的最小闭环，
// 不需要安装器、签名与公证；产物是绿色版目录，跨平台命令一致，本地也好验证。
// 注意：Electron 不能可靠交叉打包（且 macOS 产物未签名），所以每个平台各自构建一次。

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packager } from '@electron/packager';
import { buildPortable } from './build.mjs';
import { archiveName, archivePaths } from './archive.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP_NAME = 'gothere-desktop';

/** 读 asar 头，列出包内条目（不启动 GUI 也能验证客户端内容）。 */
async function asarEntries(asarPath) {
  const buffer = await readFile(asarPath);
  const headerSize = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.subarray(16, 16 + headerSize).toString('utf8'));
  return Object.keys(header.files ?? {});
}

export async function buildDesktop({ quiet = false } = {}) {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  // 桌面端跑的就是单文件游戏产物：先确保它是最新的。
  await buildPortable();

  const stage = resolve(ROOT, 'dist', 'desktop', 'app');
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await copyFile(resolve(ROOT, 'dist', 'index.html'), resolve(stage, 'index.html'));
  await copyFile(resolve(ROOT, 'desktop', 'main.cjs'), resolve(stage, 'main.cjs'));
  await writeFile(resolve(stage, 'package.json'), JSON.stringify({
    name: APP_NAME,
    productName: 'gothere',
    version: pkg.version,
    description: pkg.description,
    main: 'main.cjs',
    private: true,
  }, null, 2) + '\n', 'utf8');

  const out = resolve(ROOT, 'dist', 'desktop');
  const [appPath] = await packager({
    dir: stage,
    out,
    name: APP_NAME,
    platform: process.platform,
    arch: process.arch,
    appVersion: pkg.version,
    electronVersion: JSON.parse(await readFile(resolve(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    asar: true,
    overwrite: true,
    prune: true,
    quiet: true,
    // 只要运行必需的东西；打包脚本、测试、源码都不进客户端。
    ignore: [/^\/scripts/, /^\/tests/, /^\/docs/, /^\/dist\/desktop/],
  });

  // 自检：客户端里只该有「游戏 + 主进程 + 清单」，一条都不多、一条都不少。
  const entries = await asarEntries(resolve(appPath, 'resources', 'app.asar'));
  for (const required of ['index.html', 'main.cjs', 'package.json']) {
    if (!entries.includes(required)) throw new Error('客户端缺少 ' + required + '：' + entries.join(', '));
  }

  const name = APP_NAME + '-' + process.platform + '-' + process.arch;
  const archive = resolve(ROOT, 'dist', archiveName(name));
  await rm(archive, { force: true });
  await archivePaths(archive, [appPath]);
  const size = (await stat(archive)).size;
  if (size < 1024 * 1024) throw new Error('桌面端压缩包看起来不对：只有 ' + size + ' 字节。');
  if (!quiet) {
    console.log('Desktop: ' + archive + ' (' + (size / 1024 / 1024).toFixed(0) + ' MB, electron ' +
      process.platform + '/' + process.arch + ', app ' + pkg.version + ', self-check ok)');
  }
  return { path: archive, name: basename(archive), bytes: size, dir: appPath, version: pkg.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildDesktop({ quiet: process.argv.includes('--quiet') });
}
