// macOS 产物的临时签名：Apple Silicon 上未签名的 Mach-O 根本不会执行，而签名通常要一台
// Mac。这里在 Linux 上用 rcodesign（apple-codesign，Rust 写的全平台 codesign）做 ad-hoc
// 签名，于是「一个 ubuntu runner 构建全部平台」才成立。
// 在 macOS 宿主上则直接用系统 codesign，效果一样且更可信。

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, chmod, rm, stat, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const RCODESIGN_VERSION = '0.29.0';

const assetFor = () => {
  if (process.platform === 'linux' && process.arch === 'x64') {
    return 'apple-codesign-' + RCODESIGN_VERSION + '-x86_64-unknown-linux-musl';
  }
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'apple-codesign-' + RCODESIGN_VERSION + '-aarch64-apple-darwin';
  }
  if (process.platform === 'darwin' && process.arch === 'x64') {
    return 'apple-codesign-' + RCODESIGN_VERSION + '-x86_64-apple-darwin';
  }
  return null;
};

/** 取 rcodesign（带缓存）；本机是 macOS 时返回 null，调用方改用系统 codesign。 */
export async function ensureRcodesign() {
  if (process.platform === 'darwin') return null;
  const asset = assetFor();
  if (!asset) throw new Error('这台宿主机没有可用的 rcodesign（' + process.platform + '/' + process.arch + '）：macOS 产物请在 macOS 上构建。');
  const cache = resolve(homedir(), '.cache', 'gothere-tools', 'rcodesign-' + RCODESIGN_VERSION);
  const binary = join(cache, 'rcodesign');
  const cached = await stat(binary).then((info) => info.size > 1024 * 1024).catch(() => false);
  if (cached) return binary;

  await mkdir(cache, { recursive: true });
  const url = 'https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F' +
    RCODESIGN_VERSION + '/' + asset + '.tar.gz';
  const scratch = await mkdtemp(join(tmpdir(), 'gothere-rcodesign-'));
  try {
    const archive = join(scratch, 'rc.tar.gz');
    const response = await fetch(url);
    if (!response.ok) throw new Error('下载 rcodesign 失败：HTTP ' + response.status + '（' + url + '）');
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    await run('tar', ['-xzf', archive, '-C', scratch]);
    await run('cp', [join(scratch, asset, 'rcodesign'), binary]);
    await chmod(binary, 0o755);
    return binary;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** ad-hoc 签名一个 Mach-O 或 .app（macOS 上用系统 codesign，其他平台用 rcodesign）。 */
export async function signMachO(target) {
  if (process.platform === 'darwin') {
    await run('codesign', ['--force', '--sign', '-', '--timestamp=none', target]);
    return 'codesign';
  }
  const rcodesign = await ensureRcodesign();
  await run(rcodesign, ['sign', '--binary-identifier', 'com.dezhishen.gothere', target]);
  return 'rcodesign';
}
