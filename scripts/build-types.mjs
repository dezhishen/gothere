#!/usr/bin/env node
// 类型是**数据**：`types/<category>/<kind>.type.json` 就是权威来源。
// 这个脚本把它们编译成一个纯数据模块，供工厂在启动时读取——
// 于是「新增一种机关或物品」= 加一个 JSON 文件 + `pnpm types`，
// 不需要改工厂、校验、内核、渲染、CLI 或测试里的任何一行代码。

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATEGORIES } from '../src/core/interpreters/factories/factory.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MANIFEST = resolve(ROOT, 'types/manifest.json');
const TARGET = resolve(ROOT, 'src/core/interpreters/factories/generated-types.js');
const KIND_PATTERN = /^[a-z][a-z0-9-]*$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string' && value.length > 0;

/** 读出并校验所有类型数据；返回 { category: { kind: definition } } 与顺序信息。 */
export async function readTypeSources({ root = ROOT } = {}) {
  // 目录里的 .type.json 就是全部类型：新增一种机关/物品只需要放一个文件，
  // 连 manifest 都不用碰（manifest 只负责决定顺序，见下）。
  const discovered = [];
  for (const category of CATEGORIES) {
    const names = await readdir(resolve(root, 'types', category)).catch(() => []);
    for (const name of names.filter((entry) => entry.endsWith('.type.json')).sort()) {
      discovered.push(category + '/' + name);
    }
  }
  const manifest = JSON.parse(await readFile(resolve(root, 'types/manifest.json'), 'utf8')
    .catch(() => '{"schema":"types@1","files":[]}'));
  if (manifest.schema !== 'types@1' || !Array.isArray(manifest.files)) {
    throw new Error('types/manifest.json 格式不正确（需要 schema:"types@1" 与 files 数组）。');
  }
  const listed = manifest.files.filter((file) => discovered.includes(file));
  const unlisted = discovered.filter((file) => !listed.includes(file));
  const files = [...listed, ...unlisted];
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, {}]));
  const order = [];
  for (const file of files) {
    const definition = JSON.parse(await readFile(resolve(root, 'types', file), 'utf8'));
    const fail = (message) => { throw new Error(file + '：' + message); };
    if (!isObject(definition)) fail('类型定义必须是对象。');
    const { category, kind, version, defaultWidth, iconOffset, states, slots } = definition;
    if (!CATEGORIES.includes(category)) fail('category 必须是 ' + CATEGORIES.join(' / ') + '。');
    if (typeof kind !== 'string' || !KIND_PATTERN.test(kind)) fail('kind 必须以小写字母开头，只含小写字母、数字或短横线。');
    const expected = category + '/' + kind + '.type.json';
    if (file !== expected) fail('文件名必须与类型一致：期望 ' + expected + '。');
    if (!Number.isInteger(version) || version < 1) fail('version 必须是正整数。');
    if (!Number.isFinite(defaultWidth) || defaultWidth <= 0) fail('defaultWidth 必须是正数。');
    if (!Number.isFinite(iconOffset) || iconOffset < 0) fail('iconOffset 必须是非负数。');
    if (definition.art !== undefined && !isString(definition.art)) fail('art 必须是画法名。');
    if (!Array.isArray(states) || states.length === 0) fail('states 至少要有一个状态。');
    const stateIds = new Set();
    for (const state of states) {
      if (!isObject(state) || !isString(state.id) || !isString(state.label)) fail('states 必须是 {id,label}。');
      if (stateIds.has(state.id)) fail('状态 id 重复：' + state.id);
      stateIds.add(state.id);
    }
    if (!isObject(slots)) fail('slots 必须是对象（键是声明槽名）。');
    for (const [name, params] of Object.entries(slots)) {
      if (!isObject(params)) fail('槽 ' + name + ' 的参数必须是对象。');
    }
    if (definition.tags !== undefined && (!Array.isArray(definition.tags) || definition.tags.some((tag) => !isString(tag)))) {
      fail('tags 必须是字符串数组。');
    }
    if (definition.hiddenStates !== undefined) {
      if (!Array.isArray(definition.hiddenStates) || definition.hiddenStates.some((id) => !stateIds.has(id))) {
        fail('hiddenStates 必须是已声明状态的 id 数组。');
      }
    }
    if (definition.consumedState !== undefined && !stateIds.has(definition.consumedState)) {
      fail('consumedState 必须是已声明状态的 id。');
    }
    if (byCategory[category][kind]) fail('类型 ' + kind + ' 重复定义。');
    byCategory[category][kind] = definition;
    order.push(file);
  }
  return { byCategory, order };
}

const indent = (value, pad) => JSON.stringify(value, null, 2).split('\n').join('\n' + pad);

/** 生成纯数据模块的源码。 */
export async function buildTypesModule() {
  const { byCategory, order } = await readTypeSources();
  const blocks = CATEGORIES.map((category) => {
    const entries = Object.entries(byCategory[category]);
    if (entries.length === 0) return '  ' + JSON.stringify(category) + ': Object.freeze({}),';
    const body = entries.map(([kind, definition]) => {
      const source = { ...definition };
      delete source.category;
      delete source.kind;
      return '      ' + JSON.stringify(kind) + ': ' + indent(source, '      ') + ',';
    });
    return '  ' + JSON.stringify(category) + ': Object.freeze({\n' + body.join('\n') + '\n    }),';
  });
  const files = CATEGORIES.map((category) => '  ' + JSON.stringify(category) + ': Object.freeze([' +
    Object.keys(byCategory[category]).map((kind) => JSON.stringify(category + '/' + kind + '.type.json')).join(', ') + ']),');
  const total = Object.values(byCategory).reduce((sum, types) => sum + Object.keys(types).length, 0);
  return `// 生成物，请不要手改——运行 \`pnpm types\` 重新生成。
// 权威来源：types/<category>/<kind>.type.json（共 ${total} 个类型，清单见 types/manifest.json）。
// 新增一种机关或物品只需要加一个 JSON 文件，这里会跟着变，代码不用动。
export const CONTENT_TYPES = Object.freeze({
${blocks.join('\n')}
});

/** 每个类别实际用到的数据文件顺序（与 types/manifest.json 一致）。 */
export const TYPE_FILES = Object.freeze({
${files.join('\n')}
});
`;
}

/** 写回仓库里的生成物。 */
export async function writeTypesModule() {
  const source = await buildTypesModule();
  await mkdir(dirname(TARGET), { recursive: true });
  await writeFile(TARGET, source, 'utf8');
  return { path: TARGET, source };
}

/** 只检查生成物是否最新（CI / 提交前用，不写盘）。 */
export async function checkTypesModule() {
  const source = await buildTypesModule();
  let current = null;
  try {
    current = await readFile(TARGET, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ok: current === source, path: TARGET, source, current };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--check')) {
    const result = await checkTypesModule();
    if (!result.ok) {
      console.error('✗ ' + result.path + ' 与 types/ 不一致：请运行 `pnpm types` 重新生成。');
      process.exitCode = 1;
    } else {
      console.log('✓ ' + result.path + ' 与 types/ 一致');
    }
  } else {
    const { path } = await writeTypesModule();
    console.log('Types: ' + path);
  }
}
