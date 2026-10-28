// 类型 / 能力 / 字段 / 状态 / 事件的单点声明。
// 新增类型或能力只改这里；校验、面板、DSL、解释器支持矩阵都从这张表派生。

import { LIMITS } from './constants.js';

const state = (id, label) => Object.freeze({ id, label });

/**
 * 能力是数据：声明内核 hook 需要的参数与它产生的事件，不新增代码分支。
 * 物体 = 外观 + 能力集合 + 行为集合 + 事件槽。
 */
export const CAPABILITIES = Object.freeze({
  clickable: Object.freeze({
    version: 1,
    params: Object.freeze({}),
    events: Object.freeze(['click']),
  }),
  extendGround: Object.freeze({
    version: 1,
    params: Object.freeze({ state: 'extended' }),
    events: Object.freeze([]),
  }),
  blockPath: Object.freeze({
    version: 1,
    params: Object.freeze({ state: 'closed', reason: 'gate', message: '' }),
    events: Object.freeze([]),
  }),
  region: Object.freeze({
    version: 1,
    params: Object.freeze({ from: 'idle', to: 'pressed', event: 'enter', message: '' }),
    events: Object.freeze(['enter']),
  }),
});

/**
 * 预设：能力包 + 外观 + 默认行为。既有 kind 就是预设名，由迁移表保持语义不变。
 * capabilities 的值是该能力在预设里的参数覆盖。
 */
export const TYPES = Object.freeze({
  switch: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    states: Object.freeze([state('off', '待触发'), state('on', '已触发')]),
    capabilities: Object.freeze({ clickable: Object.freeze({}) }),
  }),
  bridge: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
    states: Object.freeze([state('folded', '收起'), state('extended', '已铺好')]),
    capabilities: Object.freeze({ extendGround: Object.freeze({ state: 'extended' }) }),
  }),
  gate: Object.freeze({
    version: 1,
    defaultWidth: LIMITS.defaultWidth,
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
    states: Object.freeze([state('idle', '等待踩下'), state('pressed', '已踩下')]),
    capabilities: Object.freeze({
      region: Object.freeze({ from: 'idle', to: 'pressed', event: 'enter', message: '踩下了' }),
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
  Object.freeze({ key: 'capabilities', type: 'object', optional: true, label: '能力覆盖' }),
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

/** 预设能力 + 文档在实体上声明的能力覆盖，合并成一份参数表。 */
export function capabilitiesOfEntity(entity) {
  const merged = {};
  const type = typeDescriptor(entity && entity.kind);
  if (type) {
    for (const [name, params] of Object.entries(type.capabilities)) {
      merged[name] = { ...CAPABILITIES[name].params, ...params };
    }
  }
  const declared = entity && entity.capabilities;
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [name, params] of Object.entries(declared)) {
      merged[name] = { ...(CAPABILITIES[name] ? CAPABILITIES[name].params : {}), ...(params ?? {}) };
    }
  }
  return merged;
}

/** 内核只认这些 traits，不再比对 kind 字符串。 */
export function traitsOfEntity(entity) {
  const capabilities = capabilitiesOfEntity(entity);
  const clickable = Boolean(capabilities.clickable);
  const ground = capabilities.extendGround;
  const block = capabilities.blockPath;
  const region = capabilities.region;
  return Object.freeze({
    clickable,
    extendsGroundInState: ground ? ground.state : null,
    blocksInState: block ? block.state : null,
    blockReason: block ? block.reason : null,
    blockMessage: block ? block.message : null,
    enterFrom: region ? region.from : null,
    enterTo: region ? region.to : null,
    enterEvent: region ? region.event : null,
    enterMessage: region ? region.message : null,
  });
}

/** 实体能发出的事件：由它实际具备的能力声明。 */
export function eventsOfEntity(entity) {
  const names = new Set();
  for (const name of Object.keys(capabilitiesOfEntity(entity))) {
    for (const event of CAPABILITIES[name].events) names.add(event);
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
      capabilities: Object.freeze(Object.entries(CAPABILITIES).map(([id, capability]) => Object.freeze({
        id,
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
