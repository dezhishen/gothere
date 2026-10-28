// 单一可执行文件：把 CLI 的 CommonJS 形态嵌进 node 本体（Node SEA）。
//
// 跨平台构建的关键，是把「跑 node --build-sea」拆成两步：
//   1) `node --experimental-sea-config` 产出一个与平台无关的 blob（只在宿主上做一次）；
//   2) 把 blob 用 postject 注入到**目标平台**的官方 node 本体里。
// 于是任何一台机器都能产出 linux/darwin/win32 的二进制，不需要对应的 runner。
// macOS 产物注入后签名失效，必须重新 ad-hoc 签名（Apple Silicon 不签名不给跑），
// 这一步用 rcodesign 在 Linux 上完成。

import { chmod, copyFile, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inject } from 'postject';
import { buildCli } from './build-cli.mjs';
import { readLevelsContent } from './content.mjs';
import { signMachO } from './rcodesign.mjs';
import { assertBinaryForTarget, fetchNodeBinary, nativeTarget, parseTarget, targetFromArgv } from './targets.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

/** 制品名：gothere-linux-x64 / gothere-darwin-arm64 / gothere-win32-x64.exe */
export function binaryName(platform = process.platform, arch = process.arch) {
  return 'gothere-' + platform + '-' + arch + (platform === 'win32' ? '.exe' : '');
}

/** 生成与平台无关的 SEA blob。 */
async function buildBlob(cjsPath) {
  const scratch = await mkdtemp(join(tmpdir(), 'gothere-sea-'));
  try {
    const blobPath = join(scratch, 'sea.blob');
    const configPath = join(scratch, 'sea.json');
    await writeFile(configPath, JSON.stringify({
      main: cjsPath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: false,
    }), 'utf8');
    await run(process.execPath, ['--experimental-sea-config=' + configPath], { cwd: ROOT });
    return await readFile(blobPath);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** 在产物里找 SEA 的 sentinel，确认 blob 真的注进去了。 */
async function assertInjected(path) {
  const data = await readFile(path);
  if (!data.includes(Buffer.from(SEA_FUSE))) throw new Error('SEA sentinel 不见了，注入失败：' + path);
}

export async function buildBinary({ quiet = false, target = nativeTarget() } = {}) {
  const { name, platform, arch, exe } = parseTarget(target);
  const { path: cliPath } = await buildCli({ quiet: true });
  const cjsPath = resolve(ROOT, 'dist', 'gothere-cli.cjs');
  const blob = await buildBlob(cjsPath);

  const out = resolve(ROOT, 'dist');
  const outName = binaryName(platform, arch);
  const targetPath = resolve(out, outName);
  await rm(targetPath, { force: true });
  const base = await fetchNodeBinary(platform, arch);
  // 先写临时名再改名：中途失败不会留下半个产物。
  const temporary = targetPath + '.tmp-' + process.pid;
  await copyFile(base, temporary);
  if (platform !== 'win32') await chmod(temporary, 0o755);
  // 官方 macOS node 自带签名，注入会让它失效；这里先注入，后面统一重签。
  await inject(temporary, 'NODE_SEA_BLOB', blob, { sentinelFuse: SEA_FUSE });
  await assertInjected(temporary);
  let signer = null;
  if (platform === 'darwin') signer = await signMachO(temporary);
  await rename(temporary, targetPath);

  const format = await assertBinaryForTarget(targetPath, name);
  const size = (await stat(targetPath)).size;
  if (size < 1024 * 1024) throw new Error('单二进制看起来不对：只有 ' + size + ' 字节。');

  // 只有目标平台就是本机时，才能真正跑起来——那就跑一遍。
  let checked = 'structural';
  if (name === nativeTarget()) {
    const solo = await mkdtemp(join(tmpdir(), 'gothere-solo-'));
    try {
      const moved = join(solo, outName);
      await copyFile(targetPath, moved);
      if (platform !== 'win32') await chmod(moved, 0o755);
      const { stdout: versionOut } = await run(moved, ['--version', '--json'], { cwd: solo });
      const { stdout: listOut } = await run(moved, ['level', 'list', '--json'], { cwd: solo });
      const { stdout: solvedOut } = await run(moved, ['level', 'simulate', 'all-together',
        '--inputs', '[{"tick":150,"source":"axe"},{"tick":200,"source":"guard"},{"tick":520,"source":"bridge-switch"},{"tick":800,"source":"lift-switch"}]', '--json'], { cwd: solo });
      if (JSON.parse(versionOut).data.version === undefined) throw new Error('版本号读不出来。');
      const bundled = (await readLevelsContent()).levels.length;
      if (JSON.parse(listOut).data.levels.length !== bundled) throw new Error('内置关卡不完整。');
      if (JSON.parse(solvedOut).data.status !== 'won') throw new Error('单二进制跑不出已知解。');
      checked = 'ran';
    } finally {
      await rm(solo, { recursive: true, force: true });
    }
  }

  if (!quiet) {
    console.log('Binary: ' + targetPath + ' (' + (size / 1024 / 1024).toFixed(0) + ' MB, ' + format +
      ', node ' + process.versions.node + ')' + (signer ? ' · signed with ' + signer : '') +
      ' · self-check ' + checked);
  }
  return { path: targetPath, name: outName, bytes: size, target: name, format, signer, checked, cli: cliPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  await buildBinary({ quiet: argv.includes('--quiet'), target: targetFromArgv(argv) });
}
