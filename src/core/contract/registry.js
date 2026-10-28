// 契约层的类型与能力视图：类型来自内容工厂（地图 / 机关 / 物品），
// 能力来自能力实现注册表。这里只做聚合，不定义任何具体类型。

import { getCapability, listCapabilities } from '../capabilities/index.js';
import { createType, listTypeDescriptors } from '../interpreters/factories/index.js';
import { LIMITS } from './constants.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 能力词汇表：版本、默认参数与事件，由能力注册表派生，校验与支持矩阵共用。 */
export const CAPABILITIES = Object.freeze(Object.fromEntries(
  listCapabilities().map((capability) => [
    capability.id,
    Object.freeze({
      version: capability.version,
      params: capability.params ?? Object.freeze({}),
      events: capability.events ?? Object.freeze([]),
    }),
  ]),
));

/** 实体字段元数据：检查面板与 CLI 共用，新增字段只加一行。 */
export const FIELDS = Object.freeze([
  Object.freeze({ key: 'id', type: 'string', purpose: 'identity' }),
  Object.freeze({ key: 'kind', type: 'enum', purpose: 'preset', optionsFrom: 'types' }),
  Object.freeze({ key: 'x', type: 'number', min: LIMITS.entityMinX, max: LIMITS.entityMaxX, step: 1, label: '脚底 x' }),
  Object.freeze({ key: 'width', type: 'number', min: LIMITS.minWidth, max: LIMITS.maxWidth, step: 1, label: '宽度', default: LIMITS.defaultWidth }),
  Object.freeze({ key: 'label', type: 'string', minLength: 1, maxLength: LIMITS.labelMax, label: '名称' }),
  Object.freeze({ key: 'state', type: 'enum', optionsFrom: 'states', label: '初始状态' }),
  Object.freeze({ key: 'typeVersion', type: 'integer', min: 1, optional: true, label: '类型版本' }),
  Object.freeze({ key: 'capabilities', type: 'object', optional: true, label: '能力覆盖（可用 false 关闭预设能力）' }),
]);

/** 一个实体类型归哪个工厂、能产什么状态与能力；未知类型返回 null。 */
export function typeDescriptor(kind) {
  return createType(kind);
}

export function isType(kind) {
  return Boolean(typeDescriptor(kind));
}

export function isCapability(name) {
  return typeof name === 'string' && Object.hasOwn(CAPABILITIES, name);
}

/**
 * 预设能力 + 实体上的覆盖，合并成一份「能力 → 参数」表。
 * `{ "holdable": false }` 表示关掉预设里的这条能力——同一贴图不同配置靠它，而不是新类型。
 */
export function capabilitiesOfEntity(entity) {
  const merged = {};
  const type = typeDescriptor(entity && entity.kind);
  if (type) {
    for (const [name, params] of Object.entries(type.capabilities)) {
      merged[name] = { ...(CAPABILITIES[name] ? CAPABILITIES[name].params : {}), ...params };
    }
  }
  const declared = entity && entity.capabilities;
  if (isPlainObject(declared)) {
    for (const [name, params] of Object.entries(declared)) {
      if (params === false || params === null) {
        delete merged[name];
        continue;
      }
      merged[name] = { ...(CAPABILITIES[name] ? CAPABILITIES[name].params : {}), ...(isPlainObject(params) ? params : {}) };
    }
  }
  return merged;
}

/** 内核只认这些 traits；它们由能力模块自己派生，内核不认识具体能力。 */
export function traitsOfEntity(entity) {
  const traits = {};
  for (const [name, params] of Object.entries(capabilitiesOfEntity(entity))) {
    const capability = getCapability(name);
    if (capability && typeof capability.traits === 'function') Object.assign(traits, capability.traits(params));
  }
  return Object.freeze(traits);
}

/** 实体能发出的事件：由它实际具备的能力声明。跨类别订阅事件就靠这一条。 */
export function eventsOfEntity(entity) {
  const names = new Set();
  for (const name of Object.keys(capabilitiesOfEntity(entity))) {
    const capability = getCapability(name);
    for (const event of capability ? capability.events ?? [] : []) names.add(event);
  }
  names.add('done');
  return [...names];
}

const STATE_LABELS = Object.freeze(Object.fromEntries(
  listTypeDescriptors().flatMap((type) => type.states.map((item) => [item.id, item.label])),
));

export function stateLabel(value) {
  return STATE_LABELS[value] ?? value;
}

/** describe(kind) 是检查面板、CLI --json 与文档生成的同一份元数据。 */
export function describe(kind) {
  if (kind === undefined || kind === null) {
    return Object.freeze({
      types: listTypes(),
      capabilities: Object.freeze(listCapabilities().map((capability) => Object.freeze({
        id: capability.id,
        version: capability.version,
        params: capability.params,
        events: capability.events,
      }))),
      fields: FIELDS,
    });
  }
  const type = typeDescriptor(kind);
  if (!type) return null;
  return Object.freeze({
    id: kind,
    category: type.category,
    version: type.version,
    defaultWidth: type.defaultWidth,
    iconOffset: type.iconOffset,
    states: type.states.map((item) => ({ id: item.id, label: item.label })),
    events: [...new Set(Object.keys(type.capabilities).flatMap((name) => (CAPABILITIES[name] ? CAPABILITIES[name].events : [])))],
    capabilities: Object.entries(type.capabilities).map(([name, params]) => ({
      name,
      version: CAPABILITIES[name].version,
      params: { ...CAPABILITIES[name].params, ...params },
    })),
    fields: FIELDS,
  });
}

export function listTypes() {
  return listTypeDescriptors().map((type) => ({
    id: type.id,
    category: type.category,
    version: type.version,
    states: type.states.map((item) => item.id),
    events: [...new Set(Object.keys(type.capabilities).flatMap((name) => (CAPABILITIES[name] ? CAPABILITIES[name].events : [])))],
    capabilities: Object.keys(type.capabilities),
  }));
}
