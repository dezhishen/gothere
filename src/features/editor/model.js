// 编辑器的纯逻辑：把「文档 = 数据」这件事做到位。
// 这里没有任何 DOM，每一步都是「旧文档 → 新文档」，所以撤销/重做、序列化、
// 以及「草稿不污染已发布关卡」都只是数据结构问题，UI 只是它的一个视图。

import { WORLD } from '../../core/contract/constants.js';
import { fieldsOfCategory, typeDescriptor } from '../../core/contract/registry.js';
import { validateLevel } from '../../core/contract/validate.js';
import { factoryFor } from '../../core/interpreters/factories/index.js';

const clone = (value) => structuredClone(value);
const ENTITY_MIN_X = 25;
const ENTITY_MAX_X = 1175;

/** 一张空关卡：一层地面、一个起点、一个终点，够作者从上手开始。 */
export function blankLevel(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'my-level',
    name: '我的关卡',
    description: '自己搭的一张关卡。',
    world: { width: WORLD.width, height: WORLD.height, groundY: WORLD.groundY },
    actor: { x: 60, speed: 64, y: WORLD.groundY },
    goal: { x: 1100, y: WORLD.groundY },
    platforms: [{ x: 0, width: 1200, y: WORLD.groundY }],
    entities: [],
    rules: [],
    ...overrides,
  };
}

/** 同类实体取一个不重名的 id：switch-1、switch-2 …… */
export function nextId(doc, kind) {
  const pattern = new RegExp('^' + kind.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '-(\\d+)$');
  let max = 0;
  for (const entity of doc.entities ?? []) {
    const match = pattern.exec(entity.id ?? '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return kind + '-' + (max + 1);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** 实体宽度：优先用实体自己的，其次类型默认值。 */
export const widthOf = (entity) => entity.width ?? typeDescriptor(entity.kind)?.defaultWidth ?? 28;

/** 这一类实体能写哪些字段——和校验用的是同一份 schema。 */
export function editableFields(kind) {
  const type = typeDescriptor(kind);
  if (!type) return [];
  return fieldsOfCategory(type.category);
}

/** 放置一个实体：位置按类型默认宽度夹在场景内，状态取类型声明的第一个。 */
export function addEntity(doc, { kind, x = 400, y = WORLD.groundY, label, state, ...rest }) {
  const type = typeDescriptor(kind);
  if (!type) throw new Error('未知实体类型：' + String(kind));
  const width = rest.width ?? type.defaultWidth;
  const entity = {
    id: nextId(doc, kind),
    kind,
    x: Math.round(clamp(x, ENTITY_MIN_X, ENTITY_MAX_X - width)),
    y,
    width,
    // 默认名称来自工厂（“门 1”“开关 2”），UI 里不写死任何类型的中文名。
    label: label ?? (factoryFor(kind)?.editor.labelOf(kind) ?? type.id) + ' ' + (doc.entities.length + 1),
    state: state ?? type.states[0].id,
    ...Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'width')),
  };
  return { ...doc, entities: [...doc.entities, entity] };
}

/** 点路径写入：`reacts.need.tags` → 深层字段，保持其它兄弟字段不变。 */
export function setPath(target, path, value) {
  const parts = String(path).split('.');
  const next = { ...target };
  let cursor = next;
  for (const part of parts.slice(0, -1)) {
    cursor[part] = { ...(cursor[part] ?? {}) };
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
  return next;
}

/**
 * 改动实体的字段：只允许这一类 schema 认可的字段，防止编辑器写进非法结构。
 * 键可以是点路径（`reacts.need.tags`），白名单只看根键——根键来自类型的 slot 列表。
 */
export function patchEntity(doc, id, patch) {
  const entity = doc.entities.find((item) => item.id === id);
  if (!entity) throw new Error('没有这个实体：' + id);
  const allowed = new Set(editableFields(entity.kind));
  const defaults = typeDescriptor(entity.kind)?.slots ?? {};
  let next = { ...entity };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const root = String(key).split('.')[0];
    if (!allowed.has(root)) continue;
    // 只写声明里的某一项时，先用类型的默认声明垫底：否则「改一下 need」
    // 会把整段 reacts（on / from / actions）挤掉，元素就不再响应了。
    if (key.includes('.') && next[root] === undefined && defaults[root] !== undefined) {
      next = { ...next, [root]: structuredClone(defaults[root]) };
    }
    next = setPath(next, key, value);
  }
  next.width = clamp(widthOf(next), 8, 600);
  next.x = Math.round(clamp(next.x, ENTITY_MIN_X, ENTITY_MAX_X - next.width));
  return { ...doc, entities: doc.entities.map((item) => (item.id === id ? next : item)) };
}

export function moveEntity(doc, id, x) {
  return patchEntity(doc, id, { x: Math.round(x) });
}

/**
 * 删除实体，并顺手清掉指向它的连线——否则文档会立刻变成「引用无效」，
 * 作者删一个东西却看到一堆红字，体验比删不掉还糟。
 */
export function removeEntity(doc, id) {
  const rules = (doc.rules ?? []).filter((rule) => {
    if (rule?.on?.source === id) return false;
    const touches = (actions) => (actions ?? []).some((action) => (
      (action?.type === 'set' && action.target === id) ||
      (action?.type === 'after' && touches(action.actions))
    ));
    return !touches(rule?.actions);
  });
  return { ...doc, entities: doc.entities.filter((item) => item.id !== id), rules };
}

/** 关卡级字段（名称、说明、角色、终点……）；点路径写法更省事。 */
export function patchLevel(doc, patch) {
  let next = { ...doc };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'actor' || key === 'goal') { next[key] = { ...doc[key], ...value }; continue; }
    if (key.includes('.')) { next = setPath(next, key, value); continue; }
    if (['name', 'description', 'hint', 'id'].includes(key)) next[key] = value;
  }
  return next;
}

/** 地面段：至少留一段，否则角色没有落脚点。 */
export function addPlatform(doc, { x = 0, width = 240 } = {}) {
  return { ...doc, platforms: [...doc.platforms, { x: Math.round(x), width: Math.round(width), y: WORLD.groundY }] };
}

export function patchPlatform(doc, index, patch) {
  const platforms = doc.platforms.map((platform, position) => {
    if (position !== index) return platform;
    const next = { ...platform };
    if (patch.x !== undefined) next.x = Math.round(clamp(patch.x, 0, WORLD.width - 8));
    if (patch.width !== undefined) next.width = Math.round(clamp(patch.width, 8, WORLD.width - next.x));
    return next;
  });
  return { ...doc, platforms };
}

export function removePlatform(doc, index) {
  if (doc.platforms.length <= 1) throw new Error('至少要保留一段地面。');
  return { ...doc, platforms: doc.platforms.filter((_, position) => position !== index) };
}

/** 连线（规则）的增删改；没有 if，条件住在元素自己的声明里。 */
export function addRule(doc, rule) {
  return { ...doc, rules: [...(doc.rules ?? []), rule] };
}

export function patchRule(doc, index, rule) {
  return { ...doc, rules: (doc.rules ?? []).map((item, position) => (position === index ? rule : item)) };
}

export function removeRule(doc, index) {
  return { ...doc, rules: (doc.rules ?? []).filter((_, position) => position !== index) };
}

/**
 * 校验并把错误按实体分组：UI 才能把红框画在出问题的那一件上，
 * 而不是甩一段谁都看不懂的 path。
 */
export function issues(doc) {
  const result = validateLevel(doc);
  const byEntity = new Map();
  for (const error of result.errors) {
    const match = /^entities\[(\d+)\]/.exec(error.path ?? '');
    if (!match) continue;
    const entity = doc.entities[Number(match[1])];
    if (!entity) continue;
    const list = byEntity.get(entity.id) ?? [];
    list.push(error.message);
    byEntity.set(entity.id, list);
  }
  return { ok: result.ok, errors: result.errors, byEntity };
}

/** 撤销/重做：只存文档快照，简单可靠；上限之内足够覆盖一次编辑会。 */
export function createHistory(initial, { limit = 60 } = {}) {
  let stack = [clone(initial)];
  let cursor = 0;
  return {
    current: () => clone(stack[cursor]),
    canUndo: () => cursor > 0,
    canRedo: () => cursor < stack.length - 1,
    push(next) {
      stack = stack.slice(0, cursor + 1);
      stack.push(clone(next));
      if (stack.length > limit) stack.shift();
      cursor = stack.length - 1;
      return clone(stack[cursor]);
    },
    undo() {
      if (cursor > 0) cursor -= 1;
      return clone(stack[cursor]);
    },
    redo() {
      if (cursor < stack.length - 1) cursor += 1;
      return clone(stack[cursor]);
    },
    reset(next) {
      stack = [clone(next)];
      cursor = 0;
      return clone(stack[cursor]);
    },
  };
}

// 调色板不在这里：它由解释器注册表按工厂的回调给出（见 interpreters 的 editorPalette）。
