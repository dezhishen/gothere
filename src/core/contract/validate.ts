// 四层校验：版本 → 结构 → 类型 → 引用 → 语义。
// 版本先于内容；编辑器只跑前两层（editable），因此可以加载「暂时不可玩」的半成品。
// 实体字段按**类别 schema** 校验：物品能写的字段与机关不同，写错槽会被直接挡下。

import { LIMITS, WORLD } from './constants.ts';
import { eventsOfEntity, fieldsOfCategory, isSlot, isType, schemaOfCategory, tagsOfEntity, typeDescriptor } from './registry.ts';
import { factoryFor, getFactory } from '../interpreters/factories/index.ts';
import { SCHEMA_VERSION, requirementsOf } from './versions.ts';

import type { Action, Entity, LevelDoc, Rule, ValidationIssue, ValidationMode, ValidationResult } from './types.ts';

type Obj = Record<string, unknown>;
export interface ValidateOptions { mode?: ValidationMode }
export interface ValidateReport extends ValidationResult {
  valid: boolean;
  mode: ValidationMode;
  requirements: ReturnType<typeof requirementsOf>;
}

const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const REACT_INPUTS = Object.freeze(['input', 'contact']);

const isObject = (value: unknown): value is Obj => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number): boolean => isNumber(value) && value >= min && value <= max;
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

function finish(errors: ValidationIssue[], mode: ValidationMode, doc: unknown): ValidateReport {
  const ok = errors.length === 0;
  const code = ok ? 'OK' : (errors.some((item) => item.code === 'UNSUPPORTED_VERSION') ? 'UNSUPPORTED_VERSION' : 'VALIDATION_FAILED');
  return {
    ok,
    valid: ok,
    code,
    mode,
    errors,
    messages: errors.map((item) => item.message),
    requirements: requirementsOf(doc),
  };
}

function isStateOf(entity: Obj, state: unknown): boolean {
  const type = typeDescriptor(entity && (entity.kind as string | undefined));
  return Boolean(type) && type!.states.some((item) => item.id === state);
}

/** 运行前的完整校验（playable）。 */
export function validateLevel(input: unknown): ValidateReport {
  return validateDoc(input, { mode: 'playable' });
}

export function validateDoc(input: unknown, options: ValidateOptions = {}): ValidateReport {
  const mode: ValidationMode = options.mode === 'editable' ? 'editable' : 'playable';
  const errors: ValidationIssue[] = [];
  const fail = (code: string, path: string, message: string): void => { errors.push({ code, path, message }); };

  if (!isObject(input)) {
    fail('SCHEMA_INVALID', '', '关卡必须是一个 JSON 对象。');
    return finish(errors, mode, input);
  }

  // 1. 版本层：版本不符直接终止，不猜、不尽力解析。
  if (input.schemaVersion !== SCHEMA_VERSION) {
    fail('UNSUPPORTED_VERSION', 'schemaVersion',
      '只支持 schemaVersion ' + SCHEMA_VERSION + '，收到 ' + JSON.stringify(input.schemaVersion) + '。');
    return finish(errors, mode, input);
  }

  // 2. 结构层：骨架与取值范围。
  if (!isText(input.id, LIMITS.idMax) || !ID_PATTERN.test(input.id)) {
    fail('SCHEMA_INVALID', 'id', 'id 必须是小写英文、数字或短横线，以字母开头。');
  }
  if (!isText(input.name, LIMITS.nameMax)) {
    fail('SCHEMA_INVALID', 'name', 'name 必须是 1～' + LIMITS.nameMax + ' 字的关卡名称。');
  }
  if (!isText(input.description, LIMITS.descriptionMax)) {
    fail('SCHEMA_INVALID', 'description', 'description 必须是 1～' + LIMITS.descriptionMax + ' 字的玩法说明。');
  }
  if (input.hint !== undefined && !isText(input.hint, LIMITS.hintMax)) {
    fail('SCHEMA_INVALID', 'hint', 'hint 必须是 1～' + LIMITS.hintMax + ' 字的提示。');
  }

  // 地图那一段（世界 / 角色 / 终点 / 地面）由地图工厂校验，这里只管骨架字段与实体规则。
  const mapResult = getFactory('map')!.parseSection({
    world: input.world,
    actor: input.actor,
    goal: input.goal,
    platforms: input.platforms,
    stairs: input.stairs,
  });
  for (const item of mapResult.errors) fail(item.code, item.path, item.message);

  // 之后按“声明过的文档”读取；每个字段仍要过运行时检查，类型只是省掉噪音。
  const doc = input as unknown as LevelDoc;
  const rawEntities: Entity[] = Array.isArray(doc.entities) ? doc.entities : [];
  if (!Array.isArray(input.entities) || rawEntities.length > LIMITS.maxEntities) {
    fail('SCHEMA_INVALID', 'entities', 'entities 必须为最多 ' + LIMITS.maxEntities + ' 项的数组。');
  }

  // 3. 结构层（实体）：公共字段 + 类别 schema 的槽白名单。
  rawEntities.forEach((entity, index) => {
    const path = 'entities[' + index + ']';
    if (!isObject(entity)) { fail('SCHEMA_INVALID', path, path + ' 必须是对象。'); return; }
    if (!isText(entity.id, LIMITS.idMax) || !ID_PATTERN.test(entity.id)) {
      fail('SCHEMA_INVALID', path + '.id', '实体 id 无效：' + String(entity.id));
    }
    if (!isText(entity.label, LIMITS.labelMax)) {
      fail('SCHEMA_INVALID', path + '.label', '实体需要 1～' + LIMITS.labelMax + ' 字的 label：' + String(entity.id));
    }
    if (!inRange(entity.x, LIMITS.entityMinX, LIMITS.entityMaxX)) {
      fail('SCHEMA_INVALID', path + '.x', '实体 x 超出范围：' + String(entity.id));
    }
    if (entity.width !== undefined && !inRange(entity.width, LIMITS.minWidth, LIMITS.maxWidth)) {
      fail('SCHEMA_INVALID', path + '.width', '实体宽度超出范围：' + String(entity.id));
    }
    if (entity.y !== undefined && !inRange(entity.y, LIMITS.minFloorY, LIMITS.maxFloorY)) {
      fail('SCHEMA_INVALID', path + '.y', '实体所在楼层 y 超出范围：' + String(entity.id));
    }
    if (isNumber(entity.x) && entity.x + (isNumber(entity.width) ? entity.width : LIMITS.defaultWidth) > WORLD.width) {
      fail('SCHEMA_INVALID', path + '.width', '实体超出地图边界：' + String(entity.id));
    }
    if (entity.typeVersion !== undefined && !(Number.isInteger(entity.typeVersion) && entity.typeVersion > 0)) {
      fail('SCHEMA_INVALID', path + '.typeVersion', 'typeVersion 必须是正整数：' + String(entity.id));
    }
    const category = isType(entity.kind) ? typeDescriptor(entity.kind)!.category : null;
    if (!category) return; // 类型层会报 TYPE_UNKNOWN，这里不再猜字段
    const schema = schemaOfCategory(category);
    const allowed = fieldsOfCategory(category);
    for (const key of Object.keys(entity)) {
      if (allowed.includes(key)) continue;
      if (isSlot(key)) {
        fail('SLOT_UNKNOWN', path + '.' + key,
          category + '（' + (schema ? schema.label : category) + '）不接受 ' + key + '；可用：' + (schema ? schema.slots.join('、') || '（无）' : '（无）') + '。');
      } else {
        fail('SCHEMA_INVALID', path + '.' + key, '未知字段 ' + key + '：' + String(entity.id));
      }
    }
    if (entity.tags !== undefined && (!Array.isArray(entity.tags) || entity.tags.some((tag) => !isText(tag, LIMITS.labelMax)))) {
      fail('SCHEMA_INVALID', path + '.tags', 'tags 必须是字符串数组：' + String(entity.id));
    }
  });

  const rawRules: Rule[] = Array.isArray(doc.rules) ? doc.rules : [];
  if (!Array.isArray(input.rules) || rawRules.length > LIMITS.maxRules) {
    fail('SCHEMA_INVALID', 'rules', 'rules 必须为最多 ' + LIMITS.maxRules + ' 项的数组。');
  }

  // 4. 类型层：kind 与状态来自注册表；槽参数要与该类型的状态、该类的 schema 相符。
  const byId = new Map<string, Entity>();
  rawEntities.forEach((entity, index) => {
    if (!isObject(entity)) return;
    const path = 'entities[' + index + ']';
    if (!isType(entity.kind)) {
      fail('TYPE_UNKNOWN', path + '.kind', '未知实体类型：' + String(entity.kind));
      return;
    }
    const type = typeDescriptor(entity.kind)!;
    if (!isStateOf(entity, entity.state)) {
      fail('STATE_INVALID', path + '.state', '实体初始状态无效：' + String(entity.id));
    }
    for (const name of schemaOfCategory(type.category)!.slots) {
      const params = entity[name];
      if (params === undefined) continue;
      checkSlot(entity as unknown as Obj, name, params, path + '.' + name, fail);
    }
    if (!byId.has(entity.id)) byId.set(entity.id, entity);
  });

  // 5. 引用层：id 图、动作图与事件图。
  const seen = new Set<unknown>();
  rawEntities.forEach((entity, index) => {
    if (!isObject(entity) || typeof entity.id !== 'string') return;
    if (seen.has(entity.id)) fail('REFERENCE_INVALID', 'entities[' + index + '].id', '实体 id 重复：' + entity.id);
    else seen.add(entity.id);
  });

  let actionCount = 0;
  const checkActions = (actions: Action[], path: string, depth: number): void => {
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > LIMITS.maxActionsPerRule || depth > LIMITS.maxActionDepth) {
      fail('SCHEMA_INVALID', path, 'actions 需要 1～' + LIMITS.maxActionsPerRule + ' 项，after 嵌套最多 ' + LIMITS.maxActionDepth + ' 层。');
      return;
    }
    for (const [index, action] of actions.entries()) {
      const here = path + '[' + index + ']';
      actionCount += 1;
      if (actionCount > LIMITS.maxActionsPerLevel) {
        fail('SCHEMA_INVALID', here, '关卡动作总数不能超过 ' + LIMITS.maxActionsPerLevel + '。');
        return;
      }
      if (!isObject(action)) { fail('SCHEMA_INVALID', here, '动作必须是对象。'); continue; }
      if (action.type === 'set') {
        const target = byId.get(action.target);
        if (!target) fail('REFERENCE_INVALID', here + '.target', 'set 动作的目标无效：' + String(action.target));
        else if (!isStateOf(target as unknown as Obj, action.state)) fail('REFERENCE_INVALID', here + '.state', 'set 动作的状态无效：' + String(action.state));
      } else if (action.type === 'after') {
        if (!Number.isInteger(action.ticks) || !inRange(action.ticks, 1, LIMITS.maxDelayTicks)) {
          fail('SCHEMA_INVALID', here + '.ticks', 'after.ticks 必须是 1～' + LIMITS.maxDelayTicks + ' 的整数。');
        }
        checkActions(action.actions, here + '.actions', depth + 1);
      } else {
        fail('SCHEMA_INVALID', here + '.type', '未知动作类型：' + String(action.type));
      }
    }
  };

  rawRules.forEach((rule, index) => {
    const path = 'rules[' + index + ']';
    if (!isObject(rule)) { fail('SCHEMA_INVALID', path, path + ' 必须是对象。'); return; }
    if (rule.if !== undefined) {
      fail('SCHEMA_INVALID', path + '.if',
        '连线表不接受 if：条件请写进元素自己的声明（reacts.from / reacts.need / blocks.inState），连线只负责「事件 → 动作」。');
    }
    const on = rule.on;
    if (!isObject(on) || typeof on.type !== 'string' || typeof on.source !== 'string') {
      fail('SCHEMA_INVALID', path + '.on', '规则需要 on{type,source}。');
    } else {
      const source = byId.get(on.source);
      if (!source) fail('REFERENCE_INVALID', path + '.on.source', '事件源无效：' + on.source);
      else if (!eventsOfEntity(source).includes(on.type)) {
        fail('REFERENCE_INVALID', path + '.on.type', '实体 ' + on.source + ' 不能发出事件 ' + on.type + '。');
      }
    }
    checkActions(rule.actions, path + '.actions', 0);
  });

  // 6. 语义层：几何可达 + 需求有人能提供（只有 playable 才跑）。
  if (mode === 'playable' && errors.length === 0) {
    const terrain = getFactory('map')!.terrain!({ platforms: doc.platforms, stairs: doc.stairs });
    if (!terrain.supports(doc.actor.x)) fail('SEMANTIC_INVALID', 'actor.x', '角色起点需要位于地面上。');
    if (!terrain.supports(doc.goal.x)) fail('SEMANTIC_INVALID', 'goal.x', '终点需要位于地面上。');
    const provided = new Set<string>();
    for (const entity of rawEntities) {
      for (const tag of tagsOfEntity(entity)) provided.add(tag);
    }
    rawEntities.forEach((entity, index) => {
      const reacts = (entity as unknown as Obj).reacts;
      if (!isObject(reacts) || !isObject(reacts.need)) return;
      const here = 'entities[' + index + '].reacts.need';
      const needed = Array.isArray(reacts.need.tags) ? reacts.need.tags as string[] : [];
      for (const tag of needed) {
        if (!provided.has(tag)) {
          fail('SEMANTIC_INVALID', here + '.tags', '需求标签 ' + tag + ' 没有任何元素提供，这条需求永远满足不了。');
        }
      }
      if (typeof reacts.need.kind === 'string') {
        const factory = factoryFor(reacts.need.kind);
        if (!factory || factory.category !== 'item') {
          fail('REFERENCE_INVALID', here + '.kind', '需求只能指向物品类型，收到：' + reacts.need.kind);
        }
      }
    });
  }

  return finish(errors, mode, input);
}

/** 槽参数校验：状态名必须是该类型声明过的，数字要在合理范围内。 */
function checkSlot(entity, name, params, path, fail) {
  if (params === false || params === null) return;
  if (!isObject(params)) {
    fail('SCHEMA_INVALID', path, name + ' 声明必须是对象或 false（关闭）：' + String(entity.id));
    return;
  }
  const requireState = (field) => {
    if (params[field] !== undefined && !isStateOf(entity, params[field])) {
      fail('REFERENCE_INVALID', path + '.' + field, name + '.' + field + ' 引用了未声明的状态：' + String(params[field]));
    }
  };
  if (name === 'reacts') {
    if (params.on !== undefined && !REACT_INPUTS.includes(params.on as string)) {
      fail('SCHEMA_INVALID', path + '.on', 'reacts.on 只能是 ' + REACT_INPUTS.join(' / ') + '。');
    }
    requireState('from');
    if (params.consume !== undefined && typeof params.consume !== 'boolean') {
      fail('SCHEMA_INVALID', path + '.consume', 'reacts.consume 必须是布尔值。');
    }
    if (params.need !== undefined && params.need !== null) {
      if (!isObject(params.need)) {
        fail('SCHEMA_INVALID', path + '.need', 'reacts.need 必须是 {kind,tags} 对象。');
      } else {
        if (params.need.kind !== undefined && typeof params.need.kind !== 'string') {
          fail('SCHEMA_INVALID', path + '.need.kind', 'need.kind 必须是类型名。');
        }
        if (params.need.tags !== undefined && (!Array.isArray(params.need.tags) || params.need.tags.some((tag) => !isText(tag, LIMITS.labelMax)))) {
          fail('SCHEMA_INVALID', path + '.need.tags', 'need.tags 必须是字符串数组。');
        }
      }
    }
    if (params.unmet !== undefined) {
      if (!isObject(params.unmet)) fail('SCHEMA_INVALID', path + '.unmet', 'reacts.unmet 必须是 {reason,message} 对象。');
      else if (params.unmet.message !== undefined && typeof params.unmet.message !== 'string') {
        fail('SCHEMA_INVALID', path + '.unmet.message', 'unmet.message 必须是字符串。');
      }
    }
    if (params.actions !== undefined) {
      if (!Array.isArray(params.actions)) {
        fail('SCHEMA_INVALID', path + '.actions', 'reacts.actions 必须是数组。');
      } else {
        params.actions.forEach((action, index) => {
          const here = path + '.actions[' + index + ']';
          if (!isObject(action)) { fail('SCHEMA_INVALID', here, '动作必须是对象。'); return; }
          if (action.type === 'become') {
            if (!isStateOf(entity, action.state)) {
              fail('REFERENCE_INVALID', here + '.state', 'become 引用了未声明的状态：' + String(action.state));
            }
          } else if (action.type === 'publish') {
            if (!isText(action.event, LIMITS.labelMax)) fail('SCHEMA_INVALID', here + '.event', 'publish.event 必须是非空字符串。');
          } else {
            fail('SCHEMA_INVALID', here + '.type', '未知动作类型：' + String(action.type) + '（只支持 become / publish）。');
          }
        });
      }
    }
  } else if (name === 'blocks' || name === 'harms' || name === 'moves' || name === 'ground') {
    requireState('inState');
    if (name === 'harms' && params.unlessHeld !== undefined && typeof params.unlessHeld !== 'boolean') {
      fail('SCHEMA_INVALID', path + '.unlessHeld', 'harms.unlessHeld 必须是布尔值。');
    }
    if (name === 'moves') {
      if (params.speed !== undefined && !(isNumber(params.speed) && params.speed >= 0)) {
        fail('SCHEMA_INVALID', path + '.speed', 'moves.speed 必须是非负数。');
      }
      if (params.between !== undefined) {
        const [min, max] = Array.isArray(params.between) ? params.between : [];
        if (!inRange(min, 0, WORLD.width) || !inRange(max, 0, WORLD.width) || min >= max) {
          fail('SCHEMA_INVALID', path + '.between', 'moves.between 必须是 [min,max] 且 0 ≤ min < max ≤ ' + WORLD.width + '。');
        }
      }
    }
  } else if (name === 'carryable') {
    requireState('from');
    requireState('to');
    for (const field of ['offset', 'drop']) {
      if (params[field] !== undefined && !isNumber(params[field])) {
        fail('SCHEMA_INVALID', path + '.' + field, 'carryable.' + field + ' 必须是数字。');
      }
    }
  } else if (name === 'lifts') {
    requireState('lowerState');
    requireState('upperState');
    for (const field of ['lowerY', 'upperY']) {
      if (params[field] !== undefined && !inRange(params[field], LIMITS.minFloorY, LIMITS.maxFloorY)) {
        fail('SCHEMA_INVALID', path + '.' + field, 'lifts.' + field + ' 必须是 ' + LIMITS.minFloorY + '～' + LIMITS.maxFloorY + ' 的楼层高度。');
      }
    }
    if (params.tolerance !== undefined && !(isNumber(params.tolerance) && params.tolerance >= 0)) {
      fail('SCHEMA_INVALID', path + '.tolerance', 'lifts.tolerance 必须是非负数。');
    }
  }
}
