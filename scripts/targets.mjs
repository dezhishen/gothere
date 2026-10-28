// 目标平台（不是宿主机平台）：跨平台构建的唯一入口。
// 每个目标要能回答三个问题：叫什么、node 官方包在哪、可执行文件带不带 .exe。

import { mkdir, mkdtemp, readdir, rename, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const run = promisify(execFile);

export const TARGETS = Object.freeze(['linux-x64', 'linux-arm64', 'darwin-arm64', 'darwin-x64', 'win32-x64']);

export function nativeTarget() {
  return process.platform + '-' + process.arch;
}

/** 'linux-x64' → { platform:'linux', arch:'x64', name:'linux-x64', exe:'' } */
export function parseTarget(target) {
  const name = target ?? nativeTarget();
  const index = name.lastIndexOf('-');
  const platform = name.slice(0, index);
  const arch = name.slice(index + 1);
  if (!TARGETS.includes(name)) {
    throw new Error('不支持的目标平台：' + name + '（可用：' + TARGETS.join(' / ') + '）');
  }
  return { name, platform, arch, exe: platform === 'win32' ? '.exe' : '' };
}

/** 从 `--target xxx` 里取目标；没写就用宿主平台。 */
export function targetFromArgv(argv) {
  const index = argv.indexOf('--target');
  if (index < 0) return nativeTarget();
  const value = argv[index + 1];
  if (!value) throw new Error('--target 需要一个值，例如 --target win32-x64。');
  return parseTarget(value).name;
}

const distUrl = (version, platform, arch) => {
  if (platform === 'win32') return 'https://nodejs.org/dist/v' + version + '/win-' + arch + '/node.exe';
  const name = platform === 'darwin' ? 'darwin' : 'linux';
  return 'https://nodejs.org/dist/v' + version + '/node-v' + version + '-' + name + '-' + arch + '.tar.gz';
};

/**
 * 取目标平台的官方 node 本体（带缓存）。SEA 的 blob 与平台无关，但外壳必须是目标平台的
 * node —— 所以跨平台构建的关键就是「下载目标 node + 注入 blob」，而不是在目标机器上跑。
 */
export async function fetchNodeBinary(platform, arch, { version = process.versions.node } = {}) {
  const cache = resolve(homedir(), '.cache', 'gothere-node', 'v' + version, platform + '-' + arch);
  const exe = join(cache, platform === 'win32' ? 'node.exe' : 'node');
  const cached = await stat(exe).then((info) => info.size > 1024 * 1024).catch(() => false);
  if (cached) return exe;

  await mkdir(cache, { recursive: true });
  const url = distUrl(version, platform, arch);
  const scratch = await mkdtemp(join(tmpdir(), 'gothere-node-'));
  try {
    const download = join(scratch, platform === 'win32' ? 'node.exe' : 'node.tar.gz');
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载 ' + url + ' 失败：HTTP ' + response.status);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(download));
    if (platform === 'win32') {
      await rename(download, exe).catch(async () => {
        await run('cp', [download, exe]);
      });
    } else {
      await run('tar', ['-xzf', download, '-C', scratch]);
      const extracted = (await readdir(scratch)).find((entry) => entry.startsWith('node-v'));
      if (!extracted) throw new Error('解开 node 包后找不到目录：' + url);
      await run('cp', [join(scratch, extracted, 'bin', 'node'), exe]);
    }
    if (platform !== 'win32') await run('chmod', ['755', exe]).catch(() => {});
    return exe;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** 目标平台结构自检：魔数 + CPU 类型，用来在非本机平台上也能验证产物。 */
export async function assertBinaryForTarget(path, target) {
  const { platform, arch } = parseTarget(target);
  const handle = await import('node:fs/promises');
  const buffer = Buffer.alloc(4096);
  const file = await handle.open(path, 'r');
  try {
    await file.read(buffer, 0, buffer.length, 0);
  } finally {
    await file.close();
  }
  if (platform === 'win32') {
    if (buffer.toString('latin1', 0, 2) !== 'MZ') throw new Error('不是 Windows PE 文件：' + path);
    return 'PE';
  }
  if (platform === 'linux') {
    if (buffer.readUInt32BE(0) !== 0x7f454c46) throw new Error('不是 ELF 文件：' + path);
    const machine = buffer.readUInt16LE(18);
    const expected = arch === 'x64' ? 0x3e : 0xb7;
    if (machine !== expected) throw new Error('ELF 架构不符：期望 ' + expected + '，实际 ' + machine);
    return 'ELF';
  }
  // Mach-O 的 0xfeedfacf 是小端存储，按 LE 读才是这个常量。
  if (buffer.readUInt32LE(0) !== 0xfeedfacf) throw new Error('不是 64 位 Mach-O 文件：' + path);
  const cpu = buffer.readUInt32LE(4);
  const expected = arch === 'arm64' ? 0x0100000c : 0x01000007;
  if (cpu !== expected) throw new Error('Mach-O 架构不符：期望 ' + expected + '，实际 ' + cpu);
  return 'Mach-O';
}
