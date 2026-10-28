// 抽象工厂：一类内容一个工厂（地图 / 机关 / 物品）。
// 工厂负责三件事：这一类的 **schema**（字段与允许的声明槽）、能产哪些类型、怎么校验自己那段数据。
// 工厂里没有运行时行为：行为声明写在类型上，由内核按固定阶段解释。

import { assertEditor, declarationEditor, entityFields, safeFields } from './editor.js';

export const CATEGORIES = Object.freeze(['map', 'mechanism', 'item']);

/** 工厂必须实现的接口方法——注册时按这张表校验，手写的工厂也不例外。 */
export const FACTORY_METHODS = Object.freeze(['has', 'create', 'list', 'parseSection']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string' && value.length > 0;

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
    slots: Object.freeze(Object.fromEntries(
      Object.entries(slots).map(([name, params]) => [name, Object.freeze({ ...(params ?? {}) })]),
    )),
    tags: Object.freeze([...(type.tags ?? [])]),
    hiddenStates: Object.freeze([...(type.hiddenStates ?? [])]),
    consumedState: type.consumedState ?? null,
  });
}

/**
 * 编辑器描述：全部由工厂自己回答，UI 不认识任何具体类型。
 * 工厂可以只写 `editor.labels`（中文名），其余走通用默认值。
 * - fields(entity)      实体面板的字段（文本/数字/下拉/标签/JSON）
 * - level(doc)          关卡级字段（地图类别用）
 * - platform(seg, i)    地面段字段（地图类别用）
 * - declarations(entity)声明槽面板；默认按类型的槽默认值反推控件
 * 连线（事件 → 动作）属于内核流程，不在这里声明。
 */
function buildEditor(category, schema, products, spec) {
  const labels = Object.freeze({ ...(spec?.labels ?? {}) });
  const accents = Object.freeze({ ...(spec?.accents ?? {}) });
  const fallbackFields = (entity) => {
    const type = products.get(entity.kind);
    return type ? entityFields(type, entity) : [];
  };
  const declarations = (entity) => {
    if (typeof spec?.declarations === 'function') return safeFields(() => spec.declarations(entity), []);
    const type = products.get(entity.kind);
    if (!type) return [];
    const slots = new Set([...Object.keys(type.slots), ...Object.keys(entity).filter((key) => type.slots[key] !== undefined)]);
    return [...slots]
      .filter((slot) => slot !== 'tags' || type.tags.length === 0)
      .map((slot) => {
        const params = entity[slot] !== undefined ? entity[slot] : type.slots[slot];
        if (params === undefined || params === null || typeof params !== 'object') return null;
        return declarationEditor(slot, params);
      })
      .filter(Boolean);
  };
  return Object.freeze({
    label: spec?.label ?? schema.label ?? category,
    accent: spec?.accent ?? '#7c8f5a',
    labels,
    labelOf: (kind) => labels[kind] ?? kind,
    accentOf: (kind) => accents[kind] ?? spec?.accent ?? '#7c8f5a',
    hintOf: (kind) => (spec?.hints ?? {})[kind] ?? '',
    fields: (entity) => safeFields(() => spec.fields({ type: products.get(entity.kind), entity }), fallbackFields(entity)),
    level: (doc) => safeFields(() => spec.level(doc), []),
    platform: (segment, index) => safeFields(() => spec.platform(segment, index), []),
    declarations,
  });
}

/**
 * 造一个类别工厂。
 * spec: { category, version, schema, types?, parseSection?, terrain? }
 * - schema：这一类的字段与允许的声明槽（校验、面板、CLI 都读它）
 * - types：这一族能产出的实体类型（地图没有实体，可以留空）
 * - parseSection：这一类自己那段文档数据的校验
 * - terrain：地图专用，给「角色/终点是否站在地面」这类几何查询
 *
 * 工厂之间不互相调用：跨类别交互只走两条通道——关卡的连线表（事件 → 动作）、
 * 内核的固定阶段（所有类别的实体同一张表调度）。
 */
export function createFactory(spec) {
  if (!isObject(spec)) throw new Error('工厂描述必须是对象。');
  const { category, version, schema, types = {}, parseSection, terrain, editor } = spec;
  if (!CATEGORIES.includes(category)) throw new Error('工厂类别必须是 ' + CATEGORIES.join(' / ') + '，收到 ' + String(category) + '。');
  if (!Number.isInteger(version) || version < 1) throw new Error(category + ' 工厂的 version 必须是正整数。');
  if (!isObject(schema)) throw new Error(category + ' 工厂必须声明 schema（字段与声明槽）。');
  if (!Array.isArray(schema.slots)) throw new Error(category + ' 工厂的 schema.slots 必须是数组。');
  if (!isObject(types)) throw new Error(category + ' 工厂的 types 必须是对象。');
  if (parseSection !== undefined && typeof parseSection !== 'function') throw new Error(category + ' 工厂的 parseSection 必须是函数。');
  if (terrain !== undefined && typeof terrain !== 'function') throw new Error(category + ' 工厂的 terrain 必须是函数。');
  const editorSpec = assertEditor(editor, category);

  const products = new Map();
  for (const [kind, type] of Object.entries(types)) products.set(kind, createProduct(category, version, kind, type));
  const editorApi = buildEditor(category, schema, products, editorSpec);

  const ok = Object.freeze({ ok: true, code: 'OK', errors: [] });
  return assertFactory(Object.freeze({
    category,
    version,
    schema: Object.freeze({
      category,
      label: schema.label ?? category,
      slots: Object.freeze([...schema.slots]),
      sections: Object.freeze([...(schema.sections ?? [])]),
    }),
    kinds: Object.freeze([...products.keys()]),
    has: (kind) => products.has(kind),
    create: (kind) => products.get(kind) ?? null,
    list: () => [...products.values()],
    parseSection: parseSection === undefined ? () => ok : parseSection,
    terrain: terrain ?? null,
    editor: editorApi,
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
  if (!isObject(factory.schema) || !Array.isArray(factory.schema.slots)) {
    throw new Error(factory.category + ' 工厂必须声明 schema.slots。');
  }
  if (!Array.isArray(factory.kinds)) throw new Error(factory.category + ' 工厂必须声明 kinds。');
  if (factory.terrain !== undefined && factory.terrain !== null && typeof factory.terrain !== 'function') {
    throw new Error(factory.category + ' 工厂的 terrain 必须是函数或 null。');
  }
  return factory;
}
