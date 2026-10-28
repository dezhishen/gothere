// CLI 独立制品：把 src/app/cli.js 与它依赖的全部模块、以及内置关卡，
// 打进**一个**文件 dist/gothere-cli.mjs。
// 制品只依赖 node 内置模块，可以单独复制走、直接 `node gothere-cli.mjs` 或当 bin 用。

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleModules } from './bundle.mjs';
import { readLevelsContent } from './content.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** 组装制品源码：shebang + 一次 node 内置导入 + 模块块 + 外壳。 */
export async function buildCliSource() {
  const { chunks, modules, entry } = await bundleModules({ entry: resolve(ROOT, 'src/app/cli.js'), root: ROOT });
  const content = await readLevelsContent();
  const levelsJson = JSON.stringify(content.levels).replace(/</g, '\\u003c');
  const source = [
    '#!/usr/bin/env node',
    '// gothere CLI 独立制品（单文件）：除 node 内置模块外没有任何依赖。',
    '// 由 `pnpm build:cli` 从 src/ 与 levels/ 生成，请勿手改；改源码后重新构建。',
    "import { readFile } from 'node:fs/promises';",
    "import { resolve } from 'node:path';",
    '',
    ...chunks,
    '',
    'const { runCli } = ' + entry + ';',
    'const LEVELS = ' + levelsJson + ';',
    'const VERSION = ' + JSON.stringify(JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')).version) + ';',
    '',
    '// Agent 常把输出接给 head / jq：下游提前关闭管道不应让 CLI 崩掉。',
    "process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); });",
    '',
    'process.exitCode = await runCli(process.argv.slice(2), {',
    '  loadDocs: async () => structuredClone(LEVELS),',
    "  readText: (path) => readFile(path, 'utf8'),",
    '  resolvePath: (path) => resolve(process.cwd(), path),',
    '  stdout: (text) => process.stdout.write(text),',
    '  stderr: (text) => process.stderr.write(text),',
    '  version: VERSION,',
    '});',
    '',
  ].join('\n');
  // 制品必须自洽：除了 node: 之外不许出现任何 import。
  for (const match of source.matchAll(/^import\s+[^\n]*?['"]([^'"]+)['"];?\s*$/gm)) {
    if (!match[1].startsWith('node:')) throw new Error('CLI 制品不能依赖外部模块：' + match[1]);
  }
  if (!source.startsWith('#!/usr/bin/env node\n')) throw new Error('CLI 制品必须有 shebang。');
  return { source, modules };
}

export async function buildCli() {
  const { source, modules } = await buildCliSource();
  const out = resolve(ROOT, 'dist');
  await mkdir(out, { recursive: true });
  const target = resolve(out, 'gothere-cli.mjs');
  const temporary = target + '.tmp-' + process.pid + '-' + randomUUID();
  await writeFile(temporary, source, 'utf8');
  await chmod(temporary, 0o755);
  await rename(temporary, target);
  return { path: target, bytes: Buffer.byteLength(source), modules };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const built = await buildCli();
  if (!process.argv.includes('--quiet')) {
    console.log('Standalone CLI: ' + built.path + ' (' + Math.round(built.bytes / 1024) + ' KiB, ' + built.modules + ' modules)');
  }
}
