// 类型数据的 schema：**纯数据**，没有生成物、没有代码。
// 一份类型就是一个 JSON 文件 `types/<category>/<kind>.type.json`；
// 宿主（浏览器 / CLI / 编辑器）把它读进来，交给 parseTypes 校验并分组。
// 外部地图编辑器拿到的也是同一份 JSON 与同一个校验函数。

import { CATEGORIES } from './factory.ts';

import type { Category, ParseTypesResult, TypeDefinition, TypeSourceFile, TypesByCategory, ValidationIssue } from '../../contract/types.ts';

export const TYPES_SCHEMA = 'types@1';
export const KIND_PATTERN = /^[a-z][a-z0-9-]*$/;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * 校验一组类型文件并分组。
 * input：`[{ name: 'mechanism/switch.type.json', data: {...} }, ...]`
 * 返回：`{ ok, errors, types: { mechanism: { switch: {...} }, item: {} }, files }`
 */
export function parseTypes(input: unknown): ParseTypesResult {
  const errors: ValidationIssue[] = [];
  const fail = (name: string, message: string): void => { errors.push({ code: 'SCHEMA_INVALID', path: name, message }); };
  const types = Object.fromEntries(CATEGORIES.map((category) => [category, {}])) as TypesByCategory;
  const files: string[] = [];
  if (!Array.isArray(input)) {
    return {
      ok: false, types, files,
      errors: [{ code: 'SCHEMA_INVALID', path: 'types', message: '类型数据必须是数组。' }],
    };
  }
  for (const entry of input as unknown[]) {
    if (!isObject(entry) || !isString(entry.name) || !isObject(entry.data)) {
      fail('types', '每一项必须是 { name, data }。');
      continue;
    }
    const name = entry.name;
    const data = entry.data as unknown as TypeDefinition & Record<string, unknown>;
    const before = errors.length;
    const { category, kind, version, defaultWidth, iconOffset, states, slots } = data;
    if (!CATEGORIES.includes(category)) fail(name, 'category 必须是 ' + CATEGORIES.join(' / ') + '，收到 ' + String(category) + '。');
    if (typeof kind !== 'string' || !KIND_PATTERN.test(kind)) fail(name, 'kind 必须以小写字母开头，只含小写字母、数字或短横线。');
    if (typeof category === 'string' && typeof kind === 'string') {
      const expected = category + '/' + kind + '.type.json';
      if (name !== expected) fail(name, '文件名必须与类型一致：期望 ' + expected + '。');
    }
    if (!Number.isInteger(version) || version < 1) fail(name, 'version 必须是正整数。');
    if (!Number.isFinite(defaultWidth) || defaultWidth <= 0) fail(name, 'defaultWidth 必须是正数。');
    if (!Number.isFinite(iconOffset) || iconOffset < 0) fail(name, 'iconOffset 必须是非负数。');
    if (data.art !== undefined && !isString(data.art)) fail(name, 'art 必须是画法名（字符串）。');
    const stateIds = new Set<string>();
    if (!Array.isArray(states) || states.length === 0) {
      fail(name, 'states 至少要有一个状态。');
    } else {
      for (const state of states) {
        if (!isObject(state) || !isString(state.id) || !isString(state.label)) fail(name, 'states 必须是 {id,label}。');
        else if (stateIds.has(state.id)) fail(name, '状态 id 重复：' + state.id);
        else stateIds.add(state.id);
      }
    }
    if (!isObject(slots)) {
      fail(name, 'slots 必须是对象（键是声明槽名）。');
    } else {
      for (const [slot, params] of Object.entries(slots)) {
        if (!isObject(params)) fail(name, '槽 ' + slot + ' 的参数必须是对象。');
      }
    }
    if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some((tag) => !isString(tag)))) {
      fail(name, 'tags 必须是字符串数组。');
    }
    if (data.hiddenStates !== undefined) {
      if (!Array.isArray(data.hiddenStates) || data.hiddenStates.some((id) => !stateIds.has(id))) {
        fail(name, 'hiddenStates 必须是已声明状态的 id 数组。');
      }
    }
    if (data.consumedState !== undefined && !stateIds.has(data.consumedState)) {
      fail(name, 'consumedState 必须是已声明状态的 id。');
    }
    if (errors.length > before) continue;
    const bucket = types[category] as Record<string, TypeDefinition>;
    if (bucket[kind]) {
      fail(name, '类型 ' + kind + ' 重复定义。');
      continue;
    }
    bucket[kind] = data as TypeDefinition;
    files.push(name);
  }
  return { ok: errors.length === 0, errors, types, files };
}

export type { TypeSourceFile, Category };
