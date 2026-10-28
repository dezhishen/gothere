// 类型 / 字段 / 状态的单点声明。类型是纯数据预设：能力组合 + 外观参数 + 默认行为。
// 能力本身的实现（traits 与 hook）在 src/core/capabilities/，这里只引用它的声明。

import { getCapability, listCapabilities } from '../capabilities/index.js';
import { LIMITS } from './constants.js';

const state = (id, label) => Object.freeze({ id, label });
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

/**
 * 预设：kind 只是名字。capabilities 的值是该能力在预设里的参数覆盖，
 * 顺序即语义（同一 tick 内按声明顺序执行 hook）。
 * iconOffset 只影响界面上操作热点的垂直位置，不参与模拟。
 */
export const TYPES = Object.freeze({
  switch: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    iconOffset: 91,
    states: Object.freeze([state('off', '待触发'), state('on', '已触发')]),
    capabilities: Object.freeze({ clickable: Object.freeze({}) }),
  }),
  bridge: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    iconOffset: 91,
    states: Object.freeze([state('folded', '收起'), state('extended', '已铺好')]),
    capabilities: Object.freeze({ extendGround: Object.freeze({ state: 'extended' }) }),
  }),
  gate: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    iconOffset: 91,
    states: Object.freeze([state('closed', '关闭'), state('open', '开启')]),
    capabilities: Object.freeze({
      blockPath: Object.freeze({
        state: 'closed',
        reason: 'gate',
        message: '门：此路暂时不通。先找个办法打开它。',
      }),
    }),
  }),
  hazard: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    iconOffset: 135,
    states: Object.freeze([state('running', '转动中'), state('stopped', '已停下')]),
    capabilities: Object.freeze({
      clickable: Object.freeze({}),
      blockPath: Object.freeze({
        state: 'running',
        reason: 'hazard',
        message: '风太大，被吹了个措手不及。经过之前先关风扇。',
      }),
    }),
  }),
  plate: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    iconOffset: 91,
    states: Object.freeze([state('idle', '等待踩下'), state('pressed', '已踩下')]),
    capabilities: Object.freeze({
      region: Object.freeze({ from: 'idle', to: 'pressed', event: 'enter', message: '踩下了' }),
    }),
  }),
  axe: Object.freeze({
    version: 1,
    defaultWidth: 34,
    iconOffset: 96,
    states: Object.freeze([state('idle', '放在地上'), state('held', '已举起')]),
    capabilities: Object.freeze({
      // 顺序有意义：先拿起，再判定伤害，否则拿起的同一 tick 就会被自己扎到。
      holdable: Object.freeze({}),
      damageOnContact: Object.freeze({ state: 'idle', reason: 'hurt', message: '地上的斧头可不认人。' }),
    }),
  }),
  hammer: Object.freeze({
    version: 1,
    defaultWidth: 32,
    iconOffset: 96,
    states: Object.freeze([state('idle', '放在地上'), state('held', '握在手里')]),
    capabilities: Object.freeze({
      holdable: Object.freeze({}),
      clickable: Object.freeze({}),
    }),
  }),
});

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

export function isType(kind) {
  return typeof kind === 'string' && Object.hasOwn(TYPES, kind);
}

export function typeDescriptor(kind) {
  return isType(kind) ? TYPES[kind] : null;
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

/** 实体能发出的事件：由它实际具备的能力声明。 */
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
  Object.values(TYPES).flatMap((type) => type.states.map((item) => [item.id, item.label])),
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
    version: type.version,
    defaultWidth: type.defaultWidth,
    iconOffset: type.iconOffset,
    states: type.states.map((item) => ({ id: item.id, label: item.label })),
    events: [...new Set(Object.keys(type.capabilities).flatMap((name) => CAPABILITIES[name].events))],
    capabilities: Object.entries(type.capabilities).map(([name, params]) => ({
      name,
      version: CAPABILITIES[name].version,
      params: { ...CAPABILITIES[name].params, ...params },
    })),
    fields: FIELDS,
  });
}

export function listTypes() {
  return Object.keys(TYPES).map((kind) => {
    const type = TYPES[kind];
    return {
      id: kind,
      version: type.version,
      states: type.states.map((item) => item.id),
      events: [...new Set(Object.keys(type.capabilities).flatMap((name) => CAPABILITIES[name].events))],
      capabilities: Object.keys(type.capabilities),
    };
  });
}
