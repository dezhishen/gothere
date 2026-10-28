// 内容工厂注册表：类别固定三种（map / mechanism / item），注册只能落到已有类别上。
// 工厂之间不互相调用：跨类别交互只走关卡的连线表与内核的固定阶段。

import { assertFactory, CATEGORIES } from './factory.js';
import { createItemFactory } from './item.js';
import { createMapFactory } from './map.js';
import { createMechanismFactory } from './mechanism.js';

const registry = new Map();

export function registerFactory(factory) {
  assertFactory(factory);
  if (registry.has(factory.category)) throw new Error('工厂 ' + factory.category + ' 已注册。');
  registry.set(factory.category, factory);
  return factory;
}

export function unregisterFactory(category) {
  return registry.delete(category);
}

export function getFactory(category) {
  return registry.get(category) ?? null;
}

export function listFactories() {
  return [...registry.values()];
}

/** 按类别顺序找工厂：类型名 → 它属于哪一类。 */
export function factoryFor(kind) {
  for (const category of CATEGORIES) {
    const factory = registry.get(category);
    if (factory && factory.has(kind)) return factory;
  }
  return null;
}

export function createType(kind) {
  const factory = factoryFor(kind);
  return factory ? factory.create(kind) : null;
}

export function listTypeDescriptors() {
  return listFactories().flatMap((factory) => factory.list());
}

/** 恢复默认注册表：平台编译进哪些类别，就由这份清单决定。 */
export function resetFactories() {
  registry.clear();
  registerFactory(createMapFactory());
  registerFactory(createMechanismFactory());
  registerFactory(createItemFactory());
}

resetFactories();
