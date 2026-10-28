// CLI 独立制品：把 src/app/cli.ts 与它依赖的全部模块、以及内置关卡，
// 打进**一个**文件 dist/gothere-cli.mjs。
// 制品只依赖 node 内置模块，可以单独复制走、直接 `node gothere-cli.mjs` 或当 bin 用。

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleModules } from './bundle.mjs';
import { readLevelsContent, readTypesContent } from './content.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/**
 * 同一份包，两种外壳：
 * - esm（.mjs）：`node dist/gothere-cli.mjs`，也可当 bin；
 * - cjs（.cjs）：给 Node SEA 用——single executable 只接受 CommonJS 主脚本，
 *   而且没有顶层 await，所以外壳把 await 收进一个 async IIFE。
 */
export async function buildCliSources() {
  const { chunks, modules, entry } = await bundleModules({ entry: resolve(ROOT, 'src/app/cli.ts'), root: ROOT });
  const content = await readLevelsContent();
  const levelsJson = JSON.stringify(content.levels).replace(/</g, '\u003c');
  // 类型也是数据：制品内联同一份 JSON，CLI 里不生成、不手写任何类型。
  const typesJson = JSON.stringify((await readTypesContent()).types).replace(/</g, '\u003c');
  const version = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')).version;

  const common = [
    ...chunks,
    '',
    'const { runCli } = ' + entry + ';',
    'const LEVELS = ' + levelsJson + ';',
    'const TYPES = ' + typesJson + ';',
    'const VERSION = ' + JSON.stringify(version) + ';',
    '',
    '// Agent 常把输出接给 head / jq：下游提前关闭管道不应让 CLI 崩掉。',
    "process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); });",
    '',
  ];
  const call = [
    '  types: TYPES,',
    '  loadDocs: async () => structuredClone(LEVELS),',
    "  readText: (path) => readFile(path, 'utf8'),",
    '  resolvePath: (path) => resolve(process.cwd(), path),',
    '  stdout: (text) => process.stdout.write(text),',
    '  stderr: (text) => process.stderr.write(text),',
    '  version: VERSION,',
  ];

  const esm = [
    '#!/usr/bin/env node',
    '// gothere CLI 独立制品（单文件）：除 node 内置模块外没有任何依赖。',
    '// 由 `pnpm build:cli` 从 src/ 与 levels/ 生成，请勿手改；改源码后重新构建。',
    "import { readFile } from 'node:fs/promises';",
    "import { resolve } from 'node:path';",
    '',
    ...common,
    'process.exitCode = await runCli(process.argv.slice(2), {',
    ...call,
    '});',
    '',
  ].join('\n');

  const cjs = [
    '// gothere CLI 的 CommonJS 形态：给 Node SEA（单一可执行文件）嵌入用。',
    '// 由 `pnpm build:cli` 从 src/ 与 levels/ 生成，请勿手改。',
    "'use strict';",
    "const { readFile } = require('node:fs/promises');",
    "const { resolve } = require('node:path');",
    '',
    ...common,
    'void (async () => {',
    '  process.exitCode = await runCli(process.argv.slice(2), {',
    ...call.map((line) => '  ' + line),
    '  });',
    '})().catch((error) => {',
    "  process.stderr.write('✗ ' + (error && error.stack ? error.stack : String(error)) + '\\n');",
    '  process.exit(5);',
    '});',
    '',
  ].join('\n');

  assertSelfContained(esm, 'import');
  assertSelfContained(cjs, 'require');
  if (!esm.startsWith('#!/usr/bin/env node\n')) throw new Error('CLI 制品必须有 shebang。');
  return { esm, cjs, modules, version };
}

/** 制品必须自洽：只允许 node: 内置模块。 */
function assertSelfContained(source, kind) {
  const pattern = kind === 'import'
    ? /^import\s+[^\n]*?['"]([^'"]+)['"];?\s*$/gm
    : /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[1].startsWith('node:')) throw new Error('CLI 制品不能依赖外部模块：' + match[1]);
  }
}

export async function buildCli({ quiet = true } = {}) {
  const { esm, cjs, modules } = await buildCliSources();
  const out = resolve(ROOT, 'dist');
  await mkdir(out, { recursive: true });
  const write = async (name, source, mode) => {
    const target = resolve(out, name);
    const temporary = target + '.tmp-' + process.pid + '-' + randomUUID();
    await writeFile(temporary, source, 'utf8');
    if (mode) await chmod(temporary, mode);
    await rename(temporary, target);
    return { path: target, bytes: Buffer.byteLength(source) };
  };
  const mjs = await write('gothere-cli.mjs', esm, 0o755);
  const cjsFile = await write('gothere-cli.cjs', cjs, 0o644);
  if (!quiet) {
    console.log('Standalone CLI: ' + mjs.path + ' (' + Math.round(mjs.bytes / 1024) + ' KiB) · ' +
      cjsFile.path + ' (' + Math.round(cjsFile.bytes / 1024) + ' KiB) · ' + modules + ' modules');
  }
  return { path: mjs.path, files: [mjs, cjsFile], modules };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildCli({ quiet: process.argv.includes('--quiet') });
}
