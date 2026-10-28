// 内容工厂注册表：类别固定三种（map / mechanism / item），注册只能落到已有类别上。
// 工厂之间不互相调用：跨类别交互只走关卡的连线表与内核的固定阶段。

import { CATEGORIES, assertFactory } from './factory.ts';
import { createItemFactory } from './item.ts';
import { createMapFactory } from './map.ts';
import { createMechanismFactory } from './mechanism.ts';

import type { Category, Factory, TypesByCategory, TypeProduct } from '../../contract/types.ts';

const registry = new Map<Category, Factory>();

export function registerFactory(factory: Factory): Factory {
  assertFactory(factory);
  if (registry.has(factory.category)) throw new Error('工厂 ' + factory.category + ' 已注册。');
  registry.set(factory.category, factory);
  return factory;
}

export function unregisterFactory(category: Category): boolean {
  return registry.delete(category);
}

export function getFactory(category: Category): Factory | null {
  return registry.get(category) ?? null;
}

export function listFactories(): Factory[] {
  return [...registry.values()];
}

/** 按类别顺序找工厂：类型名 → 它属于哪一类。 */
export function factoryFor(kind: string): Factory | null {
  for (const category of CATEGORIES) {
    const factory = registry.get(category);
    if (factory && factory.has(kind)) return factory;
  }
  return null;
}

export function createType(kind: string | undefined | null): TypeProduct | null {
  if (typeof kind !== 'string') return null;
  const factory = factoryFor(kind);
  return factory ? factory.create(kind) : null;
}

export function listTypeDescriptors(): TypeProduct[] {
  return listFactories().flatMap((factory) => factory.list());
}

/**
 * 重建注册表。`types` 是纯数据（来自 types/<category>/<kind>.type.json）：
 *   { mechanism: { switch: {...}, ... }, item: { axe: {...} } }
 * 宿主（浏览器启动、CLI 外壳、测试）负责把 JSON 读进来；core 不碰文件系统。
 */
export function resetFactories(types: Partial<TypesByCategory> = {}): Map<Category, Factory> {
  registry.clear();
  registerFactory(createMapFactory());
  registerFactory(createMechanismFactory(types.mechanism ?? {}));
  registerFactory(createItemFactory(types.item ?? {}));
  return registry;
}

resetFactories();
