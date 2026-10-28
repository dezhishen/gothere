// 内容制品：构建期把清单里的关卡读进来并逐张校验，产物（HTML / CLI）才能内联。
// 关卡不进编译；这里只做「读 + 校验 + 打成一个 JSON 块」。

import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../src/core/interpreters/factories/factory.ts';
import { resetFactories } from '../src/core/interpreters/factories/index.ts';
import { parseTypes, TYPES_SCHEMA } from '../src/core/interpreters/factories/types.ts';
import { validateLevel } from '../src/core/contract/validate.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export async function readLevelsContent() {
  // 先把类型装上：校验关卡要用到类型（未知 kind / 状态都要靠它判断）。
  resetFactories((await readTypesContent()).types);
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

/**
 * 类型数据：types/<category>/<kind>.type.json —— 纯 JSON，不经过任何代码生成。
 * manifest 只决定顺序与“哪些文件属于平台”；目录里多出来的文件会被报出来，
 * 避免加了文件却忘了登记、dev 模式静默少一个类型。
 */
export async function readTypesContent() {
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'types/manifest.json'), 'utf8'));
  if (manifest.schema !== TYPES_SCHEMA || !Array.isArray(manifest.files)) {
    throw new Error('types/manifest.json 格式不正确（需要 schema:"' + TYPES_SCHEMA + '" 与 files 数组）。');
  }
  const discovered = [];
  for (const category of CATEGORIES) {
    const names = await readdir(resolve(ROOT, 'types', category)).catch(() => []);
    for (const name of names.filter((entry) => entry.endsWith('.type.json'))) discovered.push(category + '/' + name);
  }
  const missing = discovered.filter((file) => !manifest.files.includes(file));
  const absent = manifest.files.filter((file) => !discovered.includes(file));
  if (missing.length > 0) throw new Error('这些类型文件没登记到 types/manifest.json：' + missing.join('、'));
  if (absent.length > 0) throw new Error('types/manifest.json 登记了不存在的文件：' + absent.join('、'));
  const files = [];
  for (const name of manifest.files) {
    files.push({ name, data: JSON.parse(await readFile(resolve(ROOT, 'types', name), 'utf8')) });
  }
  const result = parseTypes(files);
  if (!result.ok) {
    throw new Error('类型数据校验失败：' + result.errors.map((error) => error.path + '：' + error.message).join('；'));
  }
  return { schema: TYPES_SCHEMA, files, types: result.types };
}
