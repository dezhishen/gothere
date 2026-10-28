// 桌面端客户端：把构建好的单文件游戏塞进 Electron，产出可解压即用的绿色版目录 + 压缩包。
//
// 跨平台：@electron/packager 只是「下载目标平台的 Electron + 组装目录」，所以一个 Linux
// 宿主机就能产出 linux / win32 / darwin 三种包（Windows 元数据由纯 JS 的 resedit 写）。
// macOS 的 .app 组装完签名必然失效，Apple Silicon 上不签名不给运行 —— 用 rcodesign
// 在本机做 ad-hoc 签名，因此不需要 macOS runner。

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packager } from '@electron/packager';
import { buildPortable } from './build.mjs';
import { archiveDirectory, archiveName } from './archive.mjs';
import { signMachO } from './rcodesign.mjs';
import { nativeTarget, parseTarget, targetFromArgv } from './targets.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const APP_NAME = 'gothere-desktop';
const APP_ID = 'io.github.dezhishen.gothere';

/** 读 asar 头，列出包内条目（不启动 GUI 也能验证客户端内容）。 */
async function asarEntries(asarPath) {
  const buffer = await readFile(asarPath);
  const headerSize = buffer.readUInt32LE(12);
  const header = JSON.parse(buffer.subarray(16, 16 + headerSize).toString('utf8'));
  return Object.keys(header.files ?? {});
}

export async function buildDesktop({ quiet = false, target = nativeTarget() } = {}) {
  const { name: targetName, platform, arch, exe } = parseTarget(target);
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
    author: pkg.author,
    main: 'main.cjs',
    private: true,
  }, null, 2) + '\n', 'utf8');

  const out = resolve(ROOT, 'dist', 'desktop', targetName);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const [appPath] = await packager({
    dir: stage,
    out,
    name: APP_NAME,
    platform,
    arch,
    appVersion: pkg.version,
    appCopyright: '© ' + new Date().getFullYear() + ' ' + pkg.author,
    electronVersion: JSON.parse(await readFile(resolve(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version,
    asar: true,
    overwrite: true,
    prune: true,
    quiet: true,
    win32metadata: platform === 'win32' ? {
      CompanyName: pkg.author,
      FileDescription: pkg.description,
      ProductName: 'gothere',
      InternalName: APP_NAME,
      OriginalFilename: APP_NAME + '.exe',
    } : undefined,
    // 只要运行必需的东西；打包脚本、测试、源码都不进客户端。
    ignore: [/^\/scripts/, /^\/tests/, /^\/docs/, /^\/dist/, /^\/skills/],
  });

  // macOS 的 .app 多一层 Contents/Resources，其余平台是平铺的 resources/。
  const resources = platform === 'darwin'
    ? resolve(appPath, APP_NAME + '.app', 'Contents', 'Resources')
    : resolve(appPath, 'resources');
  // 自检 1：客户端里只该有「游戏 + 主进程 + 清单」。
  const entries = await asarEntries(resolve(resources, 'app.asar'));
  for (const required of ['index.html', 'main.cjs', 'package.json']) {
    if (!entries.includes(required)) throw new Error('客户端缺少 ' + required + '：' + entries.join(', '));
  }
  // 自检 2：可执行文件该在的地方真的有东西（跨平台构建时这是唯一的结构性证据）。
  // 注意 macOS 的启动器只有几十 KB，真正的 Electron 在 Frameworks 里的 framework 中。
  const executable = platform === 'darwin'
    ? resolve(appPath, APP_NAME + '.app', 'Contents', 'MacOS', APP_NAME)
    : resolve(appPath, APP_NAME + exe);
  const executableInfo = await stat(executable).catch(() => null);
  if (!executableInfo) throw new Error('客户端里找不到可执行文件：' + executable);
  if (platform === 'darwin') {
    const framework = await stat(resolve(appPath, APP_NAME + '.app', 'Contents', 'Frameworks',
      'Electron Framework.framework')).catch(() => null);
    if (!framework) throw new Error('macOS 客户端缺少 Electron Framework：' + appPath);
  } else if (executableInfo.size < 1024 * 1024) {
    throw new Error('可执行文件看起来不对（' + executableInfo.size + ' 字节）：' + executable);
  }

  let signer = null;
  if (platform === 'darwin') signer = await signMachO(resolve(appPath, APP_NAME + '.app'));

  const name = 'gothere-desktop-' + targetName;
  const archive = resolve(ROOT, 'dist', archiveName(name, platform));
  await rm(archive, { force: true });
  await archiveDirectory(archive, appPath, platform);
  const size = (await stat(archive)).size;
  if (size < 1024 * 1024) throw new Error('桌面端压缩包看起来不对：只有 ' + size + ' 字节。');
  if (!quiet) {
    console.log('Desktop: ' + archive + ' (' + (size / 1024 / 1024).toFixed(0) + ' MB, ' +
      targetName + ', electron ' + platform + '/' + arch + ', app ' + pkg.version +
      ')' + (signer ? ' · signed with ' + signer : '') + ' · self-check ok');
  }
  return { path: archive, name: basename(archive), bytes: size, dir: appPath, version: pkg.version, target: targetName, signer };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  await buildDesktop({ quiet: argv.includes('--quiet'), target: targetFromArgv(argv) });
}
