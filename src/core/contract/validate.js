// 四层校验：版本 → 结构 → 类型 → 引用 → 语义。
// 版本先于内容；编辑器只跑前两层（editable），因此可以加载「暂时不可玩」的半成品。

import { LIMITS, WORLD } from './constants.js';
import { eventsOfEntity, isCapability, isType, typeDescriptor } from './registry.js';
import { getFactory } from '../interpreters/factories/index.js';
import { SCHEMA_VERSION, requirementsOf } from './versions.js';

const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const inRange = (value, min, max) => isNumber(value) && value >= min && value <= max;
const isText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

function finish(errors, mode, doc) {
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

function isStateOf(entity, state) {
  const type = typeDescriptor(entity && entity.kind);
  return Boolean(type) && type.states.some((item) => item.id === state);
}

/** 运行前的完整校验（playable）。 */
export function validateLevel(input) {
  return validateDoc(input, { mode: 'playable' });
}

export function validateDoc(input, options = {}) {
  const mode = options.mode === 'editable' ? 'editable' : 'playable';
  const errors = [];
  const fail = (code, path, message) => { errors.push({ code, path, message }); };

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
  const mapResult = getFactory('map').parseSection({
    world: input.world,
    actor: input.actor,
    goal: input.goal,
    platforms: input.platforms,
  });
  for (const item of mapResult.errors) fail(item.code, item.path, item.message);

  const rawEntities = Array.isArray(input.entities) ? input.entities : [];
  if (!Array.isArray(input.entities) || rawEntities.length > LIMITS.maxEntities) {
    fail('SCHEMA_INVALID', 'entities', 'entities 必须为最多 ' + LIMITS.maxEntities + ' 项的数组。');
  }
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
    if (isNumber(entity.x) && entity.x + (isNumber(entity.width) ? entity.width : LIMITS.defaultWidth) > WORLD.width) {
      fail('SCHEMA_INVALID', path + '.width', '实体超出地图边界：' + String(entity.id));
    }
    if (entity.typeVersion !== undefined && !(Number.isInteger(entity.typeVersion) && entity.typeVersion > 0)) {
      fail('SCHEMA_INVALID', path + '.typeVersion', 'typeVersion 必须是正整数：' + String(entity.id));
    }
    if (entity.capabilities !== undefined && !isObject(entity.capabilities)) {
      fail('SCHEMA_INVALID', path + '.capabilities', 'capabilities 必须是对象：' + String(entity.id));
    }
    if (isObject(entity.capabilities)) {
      for (const [name, params] of Object.entries(entity.capabilities)) {
        if (params !== false && params !== null && !isObject(params)) {
          fail('SCHEMA_INVALID', path + '.capabilities.' + name, '能力参数必须是对象或 false（关闭）：' + String(entity.id));
        }
      }
    }
  });

  const rawRules = Array.isArray(input.rules) ? input.rules : [];
  if (!Array.isArray(input.rules) || rawRules.length > LIMITS.maxRules) {
    fail('SCHEMA_INVALID', 'rules', 'rules 必须为最多 ' + LIMITS.maxRules + ' 项的数组。');
  }

  // 3. 类型层：kind 与状态来自注册表；能力名来自能力注册表。
  const byId = new Map();
  rawEntities.forEach((entity, index) => {
    if (!isObject(entity)) return;
    const path = 'entities[' + index + ']';
    if (!isType(entity.kind)) {
      fail('TYPE_UNKNOWN', path + '.kind', '未知实体类型：' + String(entity.kind));
    } else if (!isStateOf(entity, entity.state)) {
      fail('STATE_INVALID', path + '.state', '实体初始状态无效：' + String(entity.id));
    }
    if (isObject(entity.capabilities)) {
      for (const name of Object.keys(entity.capabilities)) {
        if (!isCapability(name)) fail('CAPABILITY_UNKNOWN', path + '.capabilities.' + name, '未知能力：' + name);
      }
    }
    if (typeof entity.id === 'string' && !byId.has(entity.id)) byId.set(entity.id, entity);
  });

  // 4. 引用层：id 图与动作图。
  const seen = new Set();
  rawEntities.forEach((entity, index) => {
    if (!isObject(entity) || typeof entity.id !== 'string') return;
    if (seen.has(entity.id)) fail('REFERENCE_INVALID', 'entities[' + index + '].id', '实体 id 重复：' + entity.id);
    else seen.add(entity.id);
  });

  let actionCount = 0;
  const checkActions = (actions, path, depth) => {
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
        else if (!isStateOf(target, action.state)) fail('REFERENCE_INVALID', here + '.state', 'set 动作的状态无效：' + String(action.state));
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
    if (rule.if !== undefined) {
      if (!Array.isArray(rule.if) || rule.if.length > LIMITS.maxConditions) {
        fail('SCHEMA_INVALID', path + '.if', 'if 必须是最多 ' + LIMITS.maxConditions + ' 项的数组。');
      } else {
        rule.if.forEach((condition, position) => {
          const here = path + '.if[' + position + ']';
          const entity = isObject(condition) ? byId.get(condition.entity) : null;
          if (!entity) fail('REFERENCE_INVALID', here + '.entity', '条件引用的实体无效。');
          else if (!isStateOf(entity, condition.state)) fail('REFERENCE_INVALID', here + '.state', '条件引用的状态无效。');
        });
      }
    }
    checkActions(rule.actions, path + '.actions', 0);
  });

  // 5. 语义层：几何可达，同样由地图工厂提供查询。只有 playable 才跑。
  if (mode === 'playable' && errors.length === 0) {
    const terrain = getFactory('map').terrain({ platforms: input.platforms });
    if (!terrain.supports(input.actor.x)) fail('SEMANTIC_INVALID', 'actor.x', '角色起点需要位于地面上。');
    if (!terrain.supports(input.goal.x)) fail('SEMANTIC_INVALID', 'goal.x', '终点需要位于地面上。');
  }

  return finish(errors, mode, input);
}
