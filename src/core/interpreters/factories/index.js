// 内容工厂注册表：类别是**固定的三种**（地图 / 机关 / 物品）。
// 注册只能落到已有类别上，并且必须实现该类别的工厂接口（factory.js 的 assertFactory）。
// 工厂之间不互相调用；跨类别交互走规则、内核相位与 traits 三条通道。

import { CATEGORIES, assertFactory } from './factory.js';
import { createItemFactory } from './item.js';
import { createMapFactory } from './map.js';
import { createMechanismFactory } from './mechanism.js';

const factories = new Map();

export function registerFactory(factory) {
  assertFactory(factory);
  if (factories.has(factory.category)) throw new Error('类别 ' + factory.category + ' 的工厂已注册。');
  factories.set(factory.category, factory);
  return factory;
}

export function unregisterFactory(category) {
  return factories.delete(category);
}

export function getFactory(category) {
  return factories.get(category) ?? null;
}

/** 固定顺序遍历，保证类型清单与错误顺序可复现。 */
export function listFactories() {
  return CATEGORIES.map((category) => factories.get(category)).filter(Boolean);
}

/** 一个实体类型归哪个工厂管；没有工厂认领就是未知类型。 */
export function factoryFor(kind) {
  for (const factory of listFactories()) {
    if (factory.has(kind)) return factory;
  }
  return null;
}

/** 抽象工厂的核心动作：按类型取产品（类型描述符）。 */
export function createType(kind) {
  const factory = factoryFor(kind);
  return factory ? factory.create(kind) : null;
}

export function listTypeDescriptors() {
  return listFactories().flatMap((factory) => factory.list());
}

/** 平台编译进哪些内容工厂，就由这份清单决定。 */
export function resetFactories() {
  factories.clear();
  registerFactory(createMapFactory());
  registerFactory(createMechanismFactory());
  registerFactory(createItemFactory());
}

resetFactories();
