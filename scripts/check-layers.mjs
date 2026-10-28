#!/usr/bin/env node
// 分层门禁：解析 src 的 import 图，依赖只允许向下。
//   L3 shell   → L2 features / L1 app / L1 interpreter / L0 contract / content
//   L1 app     → L1 interpreter / L1 kernel / L0 / content（只读数据模块）
//   L1 interp  → L1 kernel / L0
//   L1 kernel  → L0
//   L0         → 无
// 源码是 TypeScript；这里只看运行时依赖方向（type-only import 也算边）。

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = resolve(ROOT, 'src');

// 只统计**运行时**依赖：`import type ...` 与 `import { type X }` 会被 TypeScript 擦掉，
// 不构成运行时的边，因此不参与分层判定（类型词汇表可以被任意层引用）。
const IMPORT_LINE = /^import\s+(?!type\s)[^\n]*?['"]([^'"]+)['"];?\s*$/gm;

const ALLOWED = Object.freeze({
  L0: [],
  'L1-kernel': ['L0'],
  'L1-interpreter': ['L0', 'L1-kernel'],
  'L1-app': ['L0', 'L1-kernel', 'L1-interpreter', 'content'],
  content: [],
  feature: ['L0', 'L1-app', 'L1-interpreter', 'content'],
  'L3-shell': ['L0', 'L1-app', 'L1-interpreter', 'content', 'feature'],
});

export function layerOf(relativePath) {
  const path = relativePath.split(sep).join('/');
  // 能力实现与内容工厂是叶子层：契约要读它们，所以它们必须呆在最底层。
  if (path.startsWith('core/capabilities/')) return 'L0';
  if (path.startsWith('core/interpreters/factories/')) return 'L0';
  if (path.startsWith('core/contract/')) return 'L0';
  if (path.startsWith('core/kernel/')) return 'L1-kernel';
  if (path.startsWith('core/interpreters/')) return 'L1-interpreter';
  if (path.startsWith('app/')) return 'L1-app';
  if (path === 'main.ts') return 'L3-shell';
  return 'feature';
}

async function sourceFiles() {
  const entries = await readdir(SRC, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => resolve(entry.parentPath ?? entry.path, entry.name));
}

export async function checkLayers() {
  const files = await sourceFiles();
  const violations = [];
  for (const file of files) {
    const from = relative(SRC, file);
    const source = await readFile(file, 'utf8');
    const layer = layerOf(from);
    const isCore = from.split(sep).join('/').startsWith('core/');

    for (const match of source.matchAll(IMPORT_LINE)) {
      const specifier = match[1];
      const leaf = from.split(sep).join('/');
      if (leaf.startsWith('core/capabilities/') && leaf !== 'core/capabilities/index.ts') {
        violations.push({ file: from, target: specifier, reason: '声明槽必须是叶子模块，不能 import 任何东西。' });
        continue;
      }
      if (leaf.startsWith('core/interpreters/factories/')) {
        const target = relative(SRC, resolve(dirname(file), specifier)).split(sep).join('/');
        const allowed = target.startsWith('core/interpreters/factories/') || target === 'core/contract/constants.ts';
        if (!allowed) {
          violations.push({ file: from, target, reason: '内容工厂只能依赖 constants 与同目录，否则契约 ↔ 工厂会成环。' });
        }
        continue;
      }
      record(from, layer, isCore, specifier, violations, file);
    }
    const leaf = from.split(sep).join('/');
    if (leaf.startsWith('core/capabilities/') && leaf !== 'core/capabilities/index.ts' && /(\bfunction\b|=>)/.test(source)) {
      violations.push({ file: from, target: '行为代码', reason: '元素只能声明自己：声明槽里不允许出现函数。' });
    }
    if (isCore && /\b(document|window)\s*\./.test(source)) {
      violations.push({ file: from, target: 'DOM', reason: 'core 不允许引用 DOM 全局。' });
    }
  }
  return { modules: files.length, violations };
}

function record(from, layer, isCore, specifier, violations, file) {
  if (specifier.startsWith('node:')) {
    if (isCore) violations.push({ file: from, target: specifier, reason: 'core 不允许 import node:*，请改成端口注入。' });
    return;
  }
  if (!specifier.startsWith('.')) {
    violations.push({ file: from, target: specifier, reason: '只允许本地相对模块。' });
    return;
  }
  const target = resolve(dirname(file), specifier);
  const targetRelative = relative(SRC, target);
  if (targetRelative.startsWith('..') || targetRelative.startsWith(sep)) {
    violations.push({ file: from, target: specifier, reason: '依赖跑出了 src 目录。' });
    return;
  }
  const targetLayer = layerOf(targetRelative);
  if (targetLayer !== layer && !ALLOWED[layer].includes(targetLayer)) {
    violations.push({
      file: from,
      target: targetRelative.split(sep).join('/'),
      reason: layer + ' 不允许依赖 ' + targetLayer + '。',
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await checkLayers();
  if (report.violations.length === 0) {
    console.log('分层门禁通过：' + report.modules + ' 个模块，依赖全部向下。');
  } else {
    for (const violation of report.violations) {
      console.error('✗ ' + violation.file + ' → ' + violation.target + '：' + violation.reason);
    }
    process.exitCode = 1;
  }
}
