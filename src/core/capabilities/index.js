// 能力注册表：这是「解释器的实现单元」。
// 每个能力自己声明事件、参数、traits 派生与相位 hook；内核只按名字调度，不认识具体能力。
// 新增一种物品通常是「加一条类型数据」，只有出现全新行为时才需要新增这里的模块。

import { blockPath } from './blockPath.js';
import { clickable } from './clickable.js';
import { damageOnContact } from './damageOnContact.js';
import { extendGround } from './extendGround.js';
import { holdable } from './holdable.js';
import { region } from './region.js';
import { verticalRide } from './verticalRide.js';

const ID_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const registry = new Map();

export function registerCapability(capability) {
  if (!capability || typeof capability !== 'object') throw new Error('能力必须是一个对象。');
  if (typeof capability.id !== 'string' || !ID_PATTERN.test(capability.id)) {
    throw new Error('能力 id 必须以小写字母开头，只含字母与数字。');
  }
  if (!Number.isInteger(capability.version) || capability.version < 1) {
    throw new Error('能力 ' + capability.id + ' 的 version 必须是正整数。');
  }
  if (registry.has(capability.id)) throw new Error('能力 ' + capability.id + ' 已注册。');
  registry.set(capability.id, capability);
  return capability;
}

export function unregisterCapability(id) {
  return registry.delete(id);
}

export function getCapability(id) {
  return registry.get(id) ?? null;
}

export function listCapabilities() {
  return [...registry.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 恢复默认注册表：平台编译进哪些能力实现，就由这份清单决定。 */
export function resetCapabilities() {
  registry.clear();
  for (const capability of [blockPath, clickable, damageOnContact, extendGround, holdable, region, verticalRide]) {
    registerCapability(capability);
  }
}

resetCapabilities();
