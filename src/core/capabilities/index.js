// 声明槽注册表：元素能说的全部词汇。
// 每个槽只是一份参数模板（阶段 + 默认值），**不带任何函数**——元素因此无法控制流程。
// 内核按固定阶段（input → motion → carry → contact → block）自己解释这些声明。

import { blocks } from './blocks.js';
import { carryable } from './carryable.js';
import { ground } from './ground.js';
import { harms } from './harms.js';
import { lifts } from './lifts.js';
import { moves } from './moves.js';
import { reacts } from './reacts.js';

/** 内核的固定阶段；声明槽只能挂到这些阶段上。 */
export const STAGES = Object.freeze(['input', 'motion', 'carry', 'contact', 'block', 'ground']);

const ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const registry = new Map();

export function registerSlot(slot) {
  if (!slot || typeof slot !== 'object') throw new Error('声明槽必须是一个对象。');
  if (typeof slot.id !== 'string' || !ID_PATTERN.test(slot.id)) {
    throw new Error('声明槽 id 必须以小写字母开头，只含字母与数字。');
  }
  if (!Number.isInteger(slot.version) || slot.version < 1) {
    throw new Error('声明槽 ' + slot.id + ' 的 version 必须是正整数。');
  }
  for (const stage of slot.stages ?? []) {
    if (!STAGES.includes(stage)) throw new Error('声明槽 ' + slot.id + ' 声明了未知阶段：' + stage);
  }
  for (const value of Object.values(slot.params ?? {})) {
    if (typeof value === 'function') throw new Error('声明槽 ' + slot.id + ' 只能声明数据，不能带函数。');
  }
  if (registry.has(slot.id)) throw new Error('声明槽 ' + slot.id + ' 已注册。');
  registry.set(slot.id, slot);
  return slot;
}

export function unregisterSlot(id) {
  return registry.delete(id);
}

export function getSlot(id) {
  return registry.get(id) ?? null;
}

export function listSlots() {
  return [...registry.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 恢复默认注册表：平台编译进哪些声明槽，就由这份清单决定。 */
export function resetSlots() {
  registry.clear();
  for (const slot of [blocks, carryable, ground, harms, lifts, moves, reacts]) registerSlot(slot);
}

resetSlots();
