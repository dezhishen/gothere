// 内容制品：构建期把清单里的关卡读进来并逐张校验，产物（HTML / CLI）才能内联。
// 关卡不进编译；这里只做「读 + 校验 + 打成一个 JSON 块」。

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLevel } from '../src/core/contract/validate.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function readLevelsContent() {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'levels/manifest.json'), 'utf8'));
  if (manifest.schema !== 'levels@1' || !Array.isArray(manifest.levels)) {
    throw new Error('levels/manifest.json 格式不正确。');
  }
  const levels = [];
  for (const entry of manifest.levels) {
    const level = JSON.parse(await readFile(resolve(ROOT, 'levels', entry.file), 'utf8'));
    if (level.id !== entry.id) throw new Error('关卡 ' + entry.file + ' 的 id 与清单不一致。');
    const result = validateLevel(level);
    if (!result.ok) throw new Error('关卡 ' + entry.file + ' 校验失败：' + result.messages.join('；'));
    levels.push(level);
  }
  return { schema: 'levels@1', levels };
}
