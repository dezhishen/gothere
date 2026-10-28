// 打包用的压缩助手：不引入第三方依赖。
// - posix 目标：tar -czf（系统自带；保留符号链接与可执行位，macOS 的 .app 需要）
// - Windows 目标：本文件里的极简 ZIP 写入器（deflate + UTF-8 名），因此在任何宿主机上
//   都能产出 .zip，不必依赖 Windows 的 Compress-Archive，也不依赖系统有没有 zip。

import { execFile } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** 压缩包后缀跟「目标平台」走，而不是宿主机。 */
export function archiveName(baseName, targetPlatform = process.platform) {
  return baseName + (targetPlatform === 'win32' ? '.zip' : '.tar.gz');
}

/** 把若干同目录条目打进 tar.gz（目录会保留结构）。 */
export async function tarPaths(targetArchive, paths) {
  const target = resolve(targetArchive);
  const absolute = paths.map((path) => resolve(path));
  if (absolute.length === 0) throw new Error('tarPaths 需要至少一个路径。');
  const parent = dirname(absolute[0]);
  for (const path of absolute) {
    if (dirname(path) !== parent) throw new Error('同一个压缩包里的条目必须同目录：' + path);
  }
  await run('tar', ['-czf', target, '-C', parent, ...absolute.map((path) => basename(path))]);
  return target;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** 递归列出目录里的文件（相对路径），用于 ZIP 写入。 */
async function walk(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await walk(root, relative));
    else if (entry.isFile()) files.push(relative);
    // 符号链接不进 ZIP：Windows 产物里没有，macOS 产物走 tar.gz。
  }
  return files;
}

/** 极简 ZIP（deflate）：只写文件、UTF-8 文件名，足够 Windows 绿色包用。 */
export async function zipDirectory(sourceDir, targetZip) {
  const root = resolve(sourceDir);
  const files = (await walk(root)).sort();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of files) {
    const data = await readFile(join(root, name));
    const deflated = deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const nameBytes = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // 文件名是 UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(0, 10); // 时间
    local.writeUInt16LE(0x21, 12); // 日期：1980-01-01，保证可复现
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(targetZip, Buffer.concat([...locals, centralBuffer, end]));
  return targetZip;
}

/** 统一入口：目录 → 目标平台对应的压缩包。 */
export async function archiveDirectory(targetArchive, sourceDir, targetPlatform = process.platform) {
  const info = await stat(sourceDir);
  if (!info.isDirectory()) throw new Error('archiveDirectory 需要一个目录：' + sourceDir);
  if (targetPlatform === 'win32') return zipDirectory(sourceDir, targetArchive);
  return tarPaths(targetArchive, [sourceDir]);
}

/** 统一入口：若干散装文件 → 目标平台对应的压缩包。 */
export async function archiveFiles(targetArchive, paths, targetPlatform = process.platform) {
  if (targetPlatform === 'win32') {
    // ZIP 写入器按目录工作：散装文件放进临时目录再打。
    const parent = dirname(resolve(paths[0]));
    for (const path of paths) {
      if (dirname(resolve(path)) !== parent) throw new Error('同一个压缩包里的条目必须同目录：' + path);
    }
    const staged = await readdir(parent);
    const { mkdtemp, cp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const scratch = await mkdtemp(join(tmpdir(), 'gothere-zip-'));
    try {
      for (const path of paths) await cp(path, join(scratch, basename(path)));
      await zipDirectory(scratch, targetArchive);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
    void staged;
    return targetArchive;
  }
  return tarPaths(targetArchive, paths);
}
