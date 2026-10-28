// 测试用的类型装载：读 types/<category>/<kind>.type.json（纯 JSON），校验后装进注册表。
// 任何依赖“有哪些类型”的测试只要 import 这个文件，就会自动拿到内置类型。

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { CATEGORIES } from '../src/core/interpreters/factories/factory.ts';
import { resetFactories } from '../src/core/interpreters/factories/index.ts';
import { parseTypes } from '../src/core/interpreters/factories/types.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** 读仓库里的全部类型文件（manifest 决定顺序，目录扫描发现漏登记的）。 */
export async function readBuiltinTypes() {
  const manifest = JSON.parse(await readFile(ROOT + 'types/manifest.json', 'utf8'));
  const discovered = [];
  for (const category of CATEGORIES) {
    const names = await readdir(ROOT + 'types/' + category).catch(() => []);
    for (const name of names.filter((entry) => entry.endsWith('.type.json'))) discovered.push(category + '/' + name);
  }
  const files = [];
  for (const name of manifest.files) {
    files.push({ name, data: JSON.parse(await readFile(ROOT + 'types/' + name, 'utf8')) });
  }
  const result = parseTypes(files);
  return { ...result, discovered, manifest };
}

export async function installBuiltinTypes() {
  const result = await readBuiltinTypes();
  if (!result.ok) throw new Error('类型数据有问题：' + result.errors.map((error) => error.path + '：' + error.message).join('；'));
  resetFactories(result.types);
  return result;
}

await installBuiltinTypes();
