// 抽象工厂：一类内容一个工厂（地图 / 机关 / 物品）。
// 工厂负责「这一类数据怎么算合法、能产哪些类型」；具体行为仍由能力实现提供。
// 三个类别共用同一份接口，注册表只按接口调度，不认识具体类别。

export const CATEGORIES = Object.freeze(['map', 'mechanism', 'item']);

/** 工厂必须实现的接口方法——注册时按这张表校验，手写的工厂也不例外。 */
export const FACTORY_METHODS = Object.freeze(['has', 'create', 'list', 'parseSection']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const PRODUCT_KEYS = Object.freeze(['version', 'defaultWidth', 'iconOffset']);

/** 类型产品：工厂 create(kind) 的返回值，契约层只读这几个字段。 */
function createProduct(category, factoryVersion, kind, type) {
  if (!isObject(type)) throw new Error(category + ' 的类型 ' + kind + ' 必须是对象。');
  for (const key of PRODUCT_KEYS) {
    if (!Number.isFinite(type[key]) || type[key] < 0) {
      throw new Error(category + ' 的类型 ' + kind + ' 需要合法的 ' + key + '。');
    }
  }
  if (!Array.isArray(type.states) || type.states.length === 0) {
    throw new Error(category + ' 的类型 ' + kind + ' 需要至少一个状态。');
  }
  if (!isObject(type.capabilities)) {
    throw new Error(category + ' 的类型 ' + kind + ' 需要 capabilities 声明。');
  }
  const states = Object.freeze(type.states.map((state) => {
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
    states,
    capabilities: Object.freeze(Object.fromEntries(
      Object.entries(type.capabilities).map(([name, params]) => [name, Object.freeze({ ...(params ?? {}) })]),
    )),
  });
}

/**
 * 造一个类别工厂。
 * spec: { category, version, types?, parseSection?, terrain? }
 * - types：这一族能产出的实体类型（地图没有实体，可以留空）
 * - parseSection：这一类自己那段文档数据的校验
 * - terrain：地图专用，给「角色/终点是否站在地面」这类几何查询
 *
 * 工厂之间不互相调用：跨类别交互只走三条通道——规则（事件/条件/动作）、
 * 内核相位（所有类别的实体同表调度）、traits 与状态（公共语言）。
 */
export function createFactory(spec) {
  if (!isObject(spec)) throw new Error('工厂描述必须是对象。');
  const { category, version, types = {}, parseSection, terrain } = spec;
  if (!CATEGORIES.includes(category)) throw new Error('工厂类别必须是 ' + CATEGORIES.join(' / ') + '，收到 ' + String(category) + '。');
  if (!Number.isInteger(version) || version < 1) throw new Error(category + ' 工厂的 version 必须是正整数。');
  if (!isObject(types)) throw new Error(category + ' 工厂的 types 必须是对象。');
  if (parseSection !== undefined && typeof parseSection !== 'function') throw new Error(category + ' 工厂的 parseSection 必须是函数。');
  if (terrain !== undefined && typeof terrain !== 'function') throw new Error(category + ' 工厂的 terrain 必须是函数。');

  const products = new Map();
  for (const [kind, type] of Object.entries(types)) products.set(kind, createProduct(category, version, kind, type));

  const ok = Object.freeze({ ok: true, code: 'OK', errors: [] });
  return assertFactory(Object.freeze({
    category,
    version,
    kinds: Object.freeze([...products.keys()]),
    has: (kind) => products.has(kind),
    create: (kind) => products.get(kind) ?? null,
    list: () => [...products.values()],
    parseSection: parseSection === undefined ? () => ok : parseSection,
    terrain: terrain ?? null,
  }));
}

/** 注册前的一致性检查：只认已有类别 + 完整接口。 */
export function assertFactory(factory) {
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
  if (!Array.isArray(factory.kinds)) throw new Error(factory.category + ' 工厂必须声明 kinds。');
  if (factory.terrain !== undefined && factory.terrain !== null && typeof factory.terrain !== 'function') {
    throw new Error(factory.category + ' 工厂的 terrain 必须是函数或 null。');
  }
  return factory;
}
