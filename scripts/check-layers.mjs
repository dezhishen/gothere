#!/usr/bin/env node
// 分层门禁：解析 src 的 import 图，依赖只允许向下。
//   L3 shell   → L2 features / L1 app / L1 interpreter / L0 contract / content
//   L1 app     → L1 interpreter / L1 kernel / L0 / content（只读数据模块）
//   L1 interp  → L1 kernel / L0
//   L1 kernel  → L0
//   L0         → 无
// 同时禁止 core 里出现 node:* 与 DOM 全局。

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC = resolve(ROOT, 'src');

const IMPORT_LINE = /^import\s+[^\n]*?['"]([^'"]+)['"];?\s*$/gm;

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
  // 能力实现是叶子：与契约同层，并且自身不 import 任何模块（否则 contract ↔ kernel 会成环）。
  if (path.startsWith('core/capabilities/')) return 'L0';
  if (path.startsWith('core/contract/')) return 'L0';
  if (path.startsWith('core/kernel/')) return 'L1-kernel';
  if (path.startsWith('core/interpreters/')) return 'L1-interpreter';
  if (path.startsWith('app/')) return 'L1-app';
  if (path === 'main.js') return 'L3-shell';
  return 'feature';
}

async function sourceFiles() {
  const entries = await readdir(SRC, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
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
      if (leaf.startsWith('core/capabilities/') && leaf !== 'core/capabilities/index.js') {
        violations.push({ file: from, target: specifier, reason: '能力实现必须是叶子模块，不能 import 任何东西。' });
        continue;
      }
      record(from, layer, isCore, specifier, violations, file);
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
