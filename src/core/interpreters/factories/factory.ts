// 抽象工厂：一类内容一个工厂（地图 / 机关 / 物品）。
// 工厂负责三件事：这一类的 **schema**（字段与允许的声明槽）、能产哪些类型、怎么校验自己那段数据。
// 工厂里没有运行时行为：行为声明写在类型上，由内核按固定阶段解释。

import type {
  Category, Factory, FactorySpec, SlotBag, StateDef, Terrain, TypeDefinition, TypeProduct, ValidationResult,
} from '../../contract/types.ts';

export const CATEGORIES = Object.freeze(['map', 'mechanism', 'item'] as const);

/** 工厂必须实现的接口方法——注册时按这张表校验，手写的工厂也不例外。 */
export const FACTORY_METHODS = Object.freeze(['has', 'create', 'list', 'parseSection'] as const);

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const PRODUCT_KEYS = Object.freeze(['version', 'defaultWidth', 'iconOffset'] as const);

/** 一份类型数据里工厂在意的部分。 */
type TypeInput = Partial<TypeDefinition> & {
  version: number;
  defaultWidth: number;
  iconOffset: number;
  states: StateDef[];
};

/** 类型产品：工厂 create(kind) 的返回值，契约层只读这几个字段。 */
function createProduct(category: Category, factoryVersion: number, kind: string, type: TypeInput): TypeProduct {
  if (!isObject(type)) throw new Error(category + ' 的类型 ' + kind + ' 必须是对象。');
  for (const key of PRODUCT_KEYS) {
    const value = type[key];
    if (!Number.isFinite(value) || (value as number) < 0) {
      throw new Error(category + ' 的类型 ' + kind + ' 需要合法的 ' + key + '。');
    }
  }
  if (!Array.isArray(type.states) || type.states.length === 0) {
    throw new Error(category + ' 的类型 ' + kind + ' 需要至少一个状态。');
  }
  const slots = type.slots ?? {};
  if (!isObject(slots)) {
    throw new Error(category + ' 的类型 ' + kind + ' 的 slots 必须是对象（键是声明槽名）。');
  }
  for (const [name, params] of Object.entries(slots)) {
    if (params !== null && params !== undefined && !isObject(params)) {
      throw new Error(category + ' 的类型 ' + kind + ' 的声明 ' + name + ' 必须是对象。');
    }
  }
  if (type.tags !== undefined && (!Array.isArray(type.tags) || type.tags.some((tag) => !isString(tag)))) {
    throw new Error(category + ' 的类型 ' + kind + ' 的 tags 必须是字符串数组。');
  }
  if (type.hiddenStates !== undefined && !Array.isArray(type.hiddenStates)) {
    throw new Error(category + ' 的类型 ' + kind + ' 的 hiddenStates 必须是数组。');
  }
  if (type.art !== undefined && !isString(type.art)) {
    throw new Error(category + ' 的类型 ' + kind + ' 的 art 必须是画法名（字符串）。');
  }
  const states: ReadonlyArray<StateDef> = Object.freeze(type.states.map((state) => {
    if (!isObject(state) || typeof state.id !== 'string' || typeof state.label !== 'string') {
      throw new Error(category + ' 的类型 ' + kind + ' 的状态必须是 {id,label}。');
    }
    return Object.freeze({ id: state.id, label: state.label });
  }));
  return Object.freeze({
    id: kind,
    category,
    version: type.version,
    factoryVersion,
    defaultWidth: type.defaultWidth,
    iconOffset: type.iconOffset,
    // 画法名：渲染器按它取图元。默认与类型同名，未知画法由渲染器兜底成占位图，
    // 所以新增类型不必改渲染代码。
    art: type.art ?? kind,
    states,
    slots: Object.freeze(Object.fromEntries(
      Object.entries(slots).map(([name, params]) => [name, Object.freeze({ ...(params ?? {}) })]),
    )) as Readonly<SlotBag>,
    tags: Object.freeze([...(type.tags ?? [])]) as ReadonlyArray<string>,
    hiddenStates: Object.freeze([...(type.hiddenStates ?? [])]) as ReadonlyArray<string>,
    consumedState: type.consumedState ?? null,
  }) as TypeProduct;
}

/**
 * 造一个类别工厂。
 * spec: { category, version, schema, types?, parseSection?, terrain? }
 * - schema：这一类的字段与允许的声明槽（校验、面板、CLI 都读它）
 * - types：这一族能产出的实体类型（地图没有实体，可以留空；机关/物品来自 types/ 里的 JSON）
 * - parseSection：这一类自己那段文档数据的校验
 * - terrain：地图专用，给「角色/终点是否站在地面」这类几何查询
 *
 * 工厂之间不互相调用：跨类别交互只走两条通道——关卡的连线表（事件 → 动作）、
 * 内核的固定阶段（所有类别的实体同一张表调度）。
 */
export function createFactory(spec: FactorySpec): Factory {
  if (!isObject(spec)) throw new Error('工厂描述必须是对象。');
  const { category, version, schema, types = {}, parseSection, terrain } = spec;
  if (!CATEGORIES.includes(category)) throw new Error('工厂类别必须是 ' + CATEGORIES.join(' / ') + '，收到 ' + String(category) + '。');
  if (!Number.isInteger(version) || version < 1) throw new Error(category + ' 工厂的 version 必须是正整数。');
  if (!isObject(schema)) throw new Error(category + ' 工厂必须声明 schema（字段与声明槽）。');
  if (!Array.isArray(schema.slots)) throw new Error(category + ' 工厂的 schema.slots 必须是数组。');
  if (!isObject(types)) throw new Error(category + ' 工厂的 types 必须是对象。');
  if (parseSection !== undefined && typeof parseSection !== 'function') throw new Error(category + ' 工厂的 parseSection 必须是函数。');
  if (terrain !== undefined && typeof terrain !== 'function') throw new Error(category + ' 工厂的 terrain 必须是函数。');

  const products = new Map<string, TypeProduct>();
  for (const [kind, type] of Object.entries(types)) products.set(kind, createProduct(category, version, kind, type as TypeInput));

  const ok: ValidationResult = Object.freeze({ ok: true, code: 'OK', errors: [] as never[], messages: [] as never[] });
  return assertFactory({
    category,
    version,
    schema: Object.freeze({
      category,
      label: schema.label ?? category,
      slots: Object.freeze([...schema.slots]),
      sections: Object.freeze([...(schema.sections ?? [])]),
    }),
    kinds: Object.freeze([...products.keys()]),
    has: (kind: string) => products.has(kind),
    create: (kind: string) => products.get(kind) ?? null,
    list: () => [...products.values()],
    parseSection: parseSection ?? (() => ok),
    terrain: terrain ?? null,
  } as Factory);
}

/** 注册前的一致性检查：只认已有类别 + 完整接口。 */
export function assertFactory(factory: Factory): Factory {
  if (!isObject(factory)) throw new Error('工厂必须是对象。');
  if (!CATEGORIES.includes(factory.category)) {
    throw new Error('工厂类别必须是 ' + CATEGORIES.join(' / ') + '，收到 ' + String(factory.category) + '。');
  }
  if (!Number.isInteger(factory.version) || factory.version < 1) {
    throw new Error(factory.category + ' 工厂的 version 必须是正整数。');
  }
  for (const method of FACTORY_METHODS) {
    if (typeof factory[method] !== 'function') throw new Error(factory.category + ' 工厂必须实现 ' + method + '()。');
  }
  if (!isObject(factory.schema) || !Array.isArray(factory.schema.slots)) {
    throw new Error(factory.category + ' 工厂必须声明 schema.slots。');
  }
  if (!Array.isArray(factory.kinds)) throw new Error(factory.category + ' 工厂必须声明 kinds。');
  if (factory.terrain !== undefined && factory.terrain !== null && typeof factory.terrain !== 'function') {
    throw new Error(factory.category + ' 工厂的 terrain 必须是函数或 null。');
  }
  return factory;
}

export type { Terrain };
