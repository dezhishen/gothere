// 契约层的类别与声明视图：类别 schema 归工厂所有，声明槽词汇归 capabilities 注册表。
// 这里只做聚合：不定义任何具体类型，也不解释任何槽——解释是内核的事。

import { getSlot, listSlots } from '../capabilities/index.ts';
import { createType, getFactory, listFactories, listTypeDescriptors } from '../interpreters/factories/index.ts';
import { LIMITS } from './constants.ts';

import type { Action, Category, Entity, ReactsSlot, SlotBag, SlotName, StateDef, TypeProduct } from './types.ts';

/** 契约函数接收“文档 / 编译 / 快照里的实体”——形状由调用方保证，内部按对象收窄。 */
export type EntityLike = object;

export interface SlotMeta {
  version: number;
  stages: ReadonlyArray<string>;
  params: Readonly<Record<string, unknown>>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 声明槽词汇表：版本、所属阶段、默认参数，由注册表派生。 */
export const SLOTS: Readonly<Record<string, SlotMeta>> = Object.freeze(Object.fromEntries(
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
export const COMMON_FIELDS: ReadonlyArray<string> = Object.freeze(['id', 'kind', 'typeVersion', 'x', 'y', 'width', 'label', 'state']);

/** 实体上可以写哪些字段：公共字段 + 该类别 schema 声明允许的槽。 */
export function fieldsOfCategory(category: Category): string[] {
  const factory = getFactory(category);
  const slots = factory && factory.schema ? factory.schema.slots : [];
  return [...COMMON_FIELDS, ...slots];
}

export function schemaOfCategory(category: Category) {
  const factory = getFactory(category);
  return factory && factory.schema ? factory.schema : null;
}

export function categoryOf(kind: string): Category | null {
  const type = createType(kind);
  return type ? type.category : null;
}

export function typeDescriptor(kind: string | undefined | null): TypeProduct | null {
  return createType(kind as string);
}

export function isType(kind: string): boolean {
  return Boolean(typeDescriptor(kind));
}

export function isSlot(name: unknown): boolean {
  return typeof name === 'string' && Object.hasOwn(SLOTS, name);
}

/**
 * 实体实际生效的声明：类型预设 + 实体上的同名槽按字段合并。
 * `blocks: false` 表示关掉预设里的这条声明——同一贴图不同配置靠它，而不是新类型。
 */
export function slotsOfEntity(entity: unknown): SlotBag {
  const merged: Record<string, Record<string, unknown>> = {};
  const record = isPlainObject(entity) ? entity : {};
  const type = typeDescriptor(record.kind as string | undefined);
  const declared: Record<string, unknown> = {};
  for (const [name, params] of Object.entries(type ? type.slots : {})) {
    merged[name] = { ...((SLOTS[name]?.params ?? {}) as Record<string, unknown>), ...(params as Record<string, unknown>) };
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
      ...((SLOTS[name]?.params ?? {}) as Record<string, unknown>),
      ...(merged[name] ?? {}),
      ...(isPlainObject(params) ? params : {}),
    };
  }
  return merged as SlotBag;
}

/** 元素自己声明的东西：标签、被用掉之后变成什么态、哪些状态不画。 */
export function tagsOfEntity(entity: unknown): string[] {
  const record = isPlainObject(entity) ? entity : {};
  const type = typeDescriptor(record.kind as string | undefined);
  const declared = Array.isArray(record.tags) ? (record.tags as string[]) : null;
  if (declared) return [...declared];
  return type && Array.isArray(type.tags) ? [...type.tags] : [];
}

export function consumedStateOf(entity: unknown): string | null {
  const record = isPlainObject(entity) ? entity : {};
  const type = typeDescriptor(record.kind as string | undefined);
  return type && typeof type.consumedState === 'string' ? type.consumedState : null;
}

export function hiddenStatesOf(entity: unknown): string[] {
  const record = isPlainObject(entity) ? entity : {};
  const type = typeDescriptor(record.kind as string | undefined);
  return type && Array.isArray(type.hiddenStates) ? [...type.hiddenStates] : [];
}

/** 接受玩家输入的元素：声明了 reacts 且 on 是 input。 */
export function acceptsInput(entity: unknown): boolean {
  const reacts = entity && isPlainObject(entity) ? slotsOfEntity(entity).reacts : null;
  return Boolean(reacts && reacts.on === 'input');
}

/** 元素能发出的事件：自己 publish 的 + 输入产生的 click（若接受输入）。 */
export function eventsOfEntity(entity: unknown): string[] {
  const names = new Set<string>();
  const reacts = entity && isPlainObject(entity) ? slotsOfEntity(entity).reacts : null;
  const params = (reacts ?? null) as ReactsSlot | null;
  if (params && params.on === 'input') names.add('click');
  for (const action of (params?.actions ?? []) as Action[]) {
    if (action && action.type === 'publish' && typeof action.event === 'string') names.add(action.event);
  }
  names.add('done');
  return [...names];
}

/**
 * 状态 id → 中文名。**现算**，不在模块加载时缓存：
 * 类型是启动时注入的数据（types/<category>/<kind>.type.json），缓存会在注入前就被冻成空表。
 */
export function stateLabel(value: string): string {
  for (const type of listTypeDescriptors()) {
    for (const state of type.states) if (state.id === value) return state.label;
  }
  return value;
}

export interface SlotSummary {
  name: string;
  version: number;
  stages: string[];
  params: Record<string, unknown>;
}

function slotSummary(type: TypeProduct): SlotSummary[] {
  return Object.entries(type.slots ?? {}).map(([name, params]) => ({
    name,
    version: SLOTS[name] ? SLOTS[name]!.version : 1,
    stages: SLOTS[name] ? [...SLOTS[name]!.stages] : [],
    params: { ...((SLOTS[name]?.params ?? {}) as Record<string, unknown>), ...(params as Record<string, unknown>) },
  }));
}

export interface CategoryDescription {
  category: Category;
  version: number;
  label: string;
  kinds: string[];
  fields: string[];
  slots: string[];
  editor?: unknown;
}

export interface SlotDescription {
  id: string;
  version: number;
  stages: string[];
  params: Record<string, unknown>;
}

export interface PlatformDescription {
  categories: CategoryDescription[];
  slots: SlotDescription[];
}

export interface TypeDescription {
  id: string;
  category: Category;
  version: number;
  defaultWidth: number;
  iconOffset: number;
  art: string;
  states: StateDef[];
  tags: string[];
  hiddenStates: string[];
  consumedState: string | null;
  events: string[];
  slots: SlotSummary[];
  fields: string[];
  schema: { category: Category; label: string; slots: ReadonlyArray<string>; sections: ReadonlyArray<string> } | null;
}

/** describe()：平台目录；describe(kind)：单个类型的元数据。 */
export function describe(): PlatformDescription;
export function describe(kind: string): TypeDescription | null;
export function describe(kind?: string | null): PlatformDescription | TypeDescription | null {
  if (kind === undefined || kind === null) {
    return Object.freeze({
      categories: Object.freeze(listFactories().map((factory) => Object.freeze({
        category: factory.category,
        version: factory.version,
        label: factory.schema ? factory.schema.label : factory.category,
        kinds: Object.freeze([...factory.kinds]) as unknown as string[],
        fields: Object.freeze(fieldsOfCategory(factory.category)) as unknown as string[],
        slots: Object.freeze([...(factory.schema ? factory.schema.slots : [])]) as unknown as string[],
      }))) as unknown as CategoryDescription[],
      slots: Object.freeze(listSlots().map((slot) => Object.freeze({
        id: slot.id,
        version: slot.version,
        stages: Object.freeze([...(slot.stages ?? [])]) as unknown as string[],
        params: slot.params ?? Object.freeze({}),
      }))) as unknown as SlotDescription[],
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
      const reacts = (params ?? null) as ReactsSlot | null;
      const events: string[] = [];
      if (reacts && reacts.on === 'input') events.push('click');
      for (const action of (reacts?.actions ?? []) as Action[]) {
        if (action && action.type === 'publish') events.push(action.event);
      }
      return events;
    }))],
    slots: slotSummary(type),
    fields: fieldsOfCategory(type.category),
    schema: schemaOfCategory(type.category) as TypeDescription['schema'],
  }) as TypeDescription;
}

export interface TypeSummary {
  id: string;
  category: Category;
  version: number;
  states: string[];
  tags: string[];
  slots: string[];
}

export function listTypes(): TypeSummary[] {
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
export function defaultWidthOf(kind: string): number {
  const type = typeDescriptor(kind);
  return type ? type.defaultWidth : LIMITS.defaultWidth;
}

// 让 `SlotName` 参与导出，供上层写“槽名”类型时使用（纯类型，无运行时开销）。
export type { SlotName, Entity };
