// 契约层的类别与声明视图：类别 schema 归工厂所有，声明槽词汇归 capabilities 注册表。
// 这里只做聚合：不定义任何具体类型，也不解释任何槽——解释是内核的事。

import { getSlot, listSlots } from '../capabilities/index.js';
import { createType, getFactory, listFactories, listTypeDescriptors } from '../interpreters/factories/index.js';
import { LIMITS } from './constants.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 声明槽词汇表：版本、所属阶段、默认参数，由注册表派生。 */
export const SLOTS = Object.freeze(Object.fromEntries(
  listSlots().map((slot) => [
    slot.id,
    Object.freeze({
      version: slot.version,
      stages: Object.freeze([...(slot.stages ?? [])]),
      params: slot.params ?? Object.freeze({}),
    }),
  ]),
));

/** 所有类别都认的实体字段；其余字段必须出现在该类别 schema 的 slots 里。 */
export const COMMON_FIELDS = Object.freeze(['id', 'kind', 'typeVersion', 'x', 'y', 'width', 'label', 'state']);

/** 实体上可以写哪些字段：公共字段 + 该类别 schema 声明允许的槽。 */
export function fieldsOfCategory(category) {
  const factory = getFactory(category);
  const slots = factory && factory.schema ? factory.schema.slots : [];
  return [...COMMON_FIELDS, ...slots];
}

export function schemaOfCategory(category) {
  const factory = getFactory(category);
  return factory && factory.schema ? factory.schema : null;
}

export function categoryOf(kind) {
  const type = createType(kind);
  return type ? type.category : null;
}

export function typeDescriptor(kind) {
  return createType(kind);
}

export function isType(kind) {
  return Boolean(typeDescriptor(kind));
}

export function isSlot(name) {
  return typeof name === 'string' && Object.hasOwn(SLOTS, name);
}

/**
 * 实体实际生效的声明：类型预设 + 实体上的同名槽按字段合并。
 * `blocks: false` 表示关掉预设里的这条声明——同一贴图不同配置靠它，而不是新类型。
 */
export function slotsOfEntity(entity) {
  const merged = {};
  const type = typeDescriptor(entity && entity.kind);
  const declared = {};
  for (const [name, params] of Object.entries(type ? type.slots : {})) {
    merged[name] = { ...(SLOTS[name] ? SLOTS[name].params : {}), ...params };
  }
  if (entity && isPlainObject(entity)) {
    for (const name of Object.keys(SLOTS)) {
      if (entity[name] !== undefined) declared[name] = entity[name];
    }
  }
  for (const [name, params] of Object.entries(declared)) {
    if (params === false || params === null) {
      delete merged[name];
      continue;
    }
    merged[name] = {
      ...(SLOTS[name] ? SLOTS[name].params : {}),
      ...(merged[name] ?? {}),
      ...(isPlainObject(params) ? params : {}),
    };
  }
  return merged;
}

/** 元素自己声明的东西：标签、被用掉之后变成什么态、哪些状态不画。 */
export function tagsOfEntity(entity) {
  const type = typeDescriptor(entity && entity.kind);
  const declared = entity && Array.isArray(entity.tags) ? entity.tags : null;
  if (declared) return [...declared];
  return type && Array.isArray(type.tags) ? [...type.tags] : [];
}

export function consumedStateOf(entity) {
  const type = typeDescriptor(entity && entity.kind);
  return type && typeof type.consumedState === 'string' ? type.consumedState : null;
}

export function hiddenStatesOf(entity) {
  const type = typeDescriptor(entity && entity.kind);
  return type && Array.isArray(type.hiddenStates) ? [...type.hiddenStates] : [];
}

/** 接受玩家输入的元素：声明了 reacts 且 on 是 input。 */
export function acceptsInput(entity) {
  const reacts = entity && isPlainObject(entity) ? slotsOfEntity(entity).reacts : null;
  return Boolean(reacts && reacts.on === 'input');
}

/** 元素能发出的事件：自己 publish 的 + 输入产生的 click（若接受输入）。 */
export function eventsOfEntity(entity) {
  const names = new Set();
  const reacts = isPlainObject(entity) ? slotsOfEntity(entity).reacts : null;
  if (reacts && reacts.on === 'input') names.add('click');
  for (const action of (reacts && reacts.actions) ?? []) {
    if (action && action.type === 'publish' && typeof action.event === 'string') names.add(action.event);
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

function slotSummary(type) {
  return Object.entries(type.slots ?? {}).map(([name, params]) => ({
    name,
    version: SLOTS[name] ? SLOTS[name].version : 1,
    stages: SLOTS[name] ? [...SLOTS[name].stages] : [],
    params: { ...(SLOTS[name] ? SLOTS[name].params : {}), ...params },
  }));
}

/** describe(kind)：检查面板、CLI 与文档生成的同一份元数据，字段按类别取值。 */
export function describe(kind) {
  if (kind === undefined || kind === null) {
    return Object.freeze({
      categories: Object.freeze(listFactories().map((factory) => Object.freeze({
        category: factory.category,
        version: factory.version,
        label: factory.schema ? factory.schema.label : factory.category,
        kinds: Object.freeze([...factory.kinds]),
        fields: Object.freeze(fieldsOfCategory(factory.category)),
        slots: Object.freeze([...(factory.schema ? factory.schema.slots : [])]),
      }))),
      slots: Object.freeze(listSlots().map((slot) => Object.freeze({
        id: slot.id,
        version: slot.version,
        stages: Object.freeze([...(slot.stages ?? [])]),
        params: slot.params ?? Object.freeze({}),
      }))),
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
    art: type.art,
    states: type.states.map((item) => ({ id: item.id, label: item.label })),
    tags: [...(type.tags ?? [])],
    hiddenStates: [...(type.hiddenStates ?? [])],
    consumedState: type.consumedState ?? null,
    events: [...new Set(Object.values(type.slots ?? {}).flatMap((params) => {
      const events = [];
      if (params && params.on === 'input') events.push('click');
      for (const action of (params && params.actions) ?? []) {
        if (action && action.type === 'publish') events.push(action.event);
      }
      return events;
    }))],
    slots: slotSummary(type),
    fields: fieldsOfCategory(type.category),
    schema: schemaOfCategory(type.category),
  });
}

export function listTypes() {
  return listTypeDescriptors().map((type) => ({
    id: type.id,
    category: type.category,
    version: type.version,
    states: type.states.map((state) => state.id),
    tags: [...(type.tags ?? [])],
    slots: Object.keys(type.slots ?? {}),
  }));
}

/** 类型面板里展示的宽度默认值，未声明时退回全局默认。 */
export function defaultWidthOf(kind) {
  const type = typeDescriptor(kind);
  return type ? type.defaultWidth : LIMITS.defaultWidth;
}
