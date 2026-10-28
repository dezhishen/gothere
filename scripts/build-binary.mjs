// 单一可执行文件：用 Node 26 的 SEA（single executable application）把 CLI 的
// CommonJS 形态嵌进 node 本体，得到一个不依赖 node/pnpm/仓库的二进制。
//
// 事实约束（都已实测）：
// - SEA 主脚本只接受 CommonJS，所以嵌入的是 dist/gothere-cli.cjs；
// - `node --build-sea` 用的是**当前运行的 node 二进制**，不能跨平台交叉编译，
//   每个平台要各自构建一次（CI 里是矩阵）；
// - 产物大小 ≈ node 本体（~150 MB），所以它不进 npm 包，只在 GitHub Release 里发。

import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCli } from './build-cli.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** 制品名：gothere-linux-x64 / gothere-darwin-arm64 / gothere-win32-x64.exe */
export function binaryName(platform = process.platform, arch = process.arch) {
  return 'gothere-' + platform + '-' + arch + (platform === 'win32' ? '.exe' : '');
}

/** 构建并自检：产出的二进制必须在空目录里跑得通。 */
export async function buildBinary({ quiet = false } = {}) {
  const { path: cliPath } = await buildCli({ quiet: true });
  const cjsPath = resolve(ROOT, 'dist', 'gothere-cli.cjs');
  const out = resolve(ROOT, 'dist');
  await mkdir(out, { recursive: true });
  const name = binaryName();
  const target = resolve(out, name);
  await rm(target, { force: true });

  const work = await mkdtemp(join(tmpdir(), 'gothere-sea-'));
  const configPath = join(work, 'sea-config-' + randomUUID() + '.json');
  await writeFile(configPath, JSON.stringify({
    main: cjsPath,
    output: target,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
  }), 'utf8');
  try {
    await run(process.execPath, ['--build-sea=' + configPath], { cwd: ROOT });
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  const size = (await stat(target)).size;
  if (size < 1024 * 1024) throw new Error('单二进制看起来不对：只有 ' + size + ' 字节。');
  if (process.platform !== 'win32') await chmod(target, 0o755);

  // 自检：造一个空目录，把二进制拷进去跑（证明它不依赖仓库与 node）。
  const solo = await mkdtemp(join(tmpdir(), 'gothere-solo-'));
  const moved = join(solo, name);
  try {
    await writeFile(moved, await readFile(target));
    if (process.platform !== 'win32') await chmod(moved, 0o755);
    const { stdout: versionOut } = await run(moved, ['--version', '--json'], { cwd: solo });
    const version = JSON.parse(versionOut).data.version;
    const { stdout: listOut } = await run(moved, ['level', 'list', '--json'], { cwd: solo });
    const levels = JSON.parse(listOut).data.levels;
    const { stdout: solvedOut } = await run(moved, ['level', 'simulate', 'all-together',
      '--inputs', '[{"tick":150,"source":"axe"},{"tick":200,"source":"guard"},{"tick":520,"source":"bridge-switch"},{"tick":800,"source":"lift-switch"}]', '--json'], { cwd: solo });
    if (JSON.parse(solvedOut).data.status !== 'won') throw new Error('单二进制跑不出已知解。');
    if (!quiet) {
      console.log('Binary: ' + target + ' (' + (size / 1024 / 1024).toFixed(0) + ' MB, node ' +
        process.version + ' ' + process.platform + '/' + process.arch + ') · v' + version +
        ' · ' + levels.length + ' levels · self-check ok');
    }
    return { path: target, name, bytes: size, version, levels: levels.length, cli: cliPath };
  } finally {
    await rm(solo, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildBinary({ quiet: process.argv.includes('--quiet') });
}
