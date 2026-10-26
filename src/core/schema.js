export const STATES = Object.freeze({
  switch: ['off', 'on'], bridge: ['folded', 'extended'], gate: ['closed', 'open'],
  hazard: ['running', 'stopped'], plate: ['idle', 'pressed'],
});
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const idPattern = /^[a-z][a-z0-9-]{0,47}$/;

/** Validate the supported DSL, including every reference, before simulation. */
export function validateLevel(input) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  if (!object(input)) return { valid: false, errors: ['关卡必须是一个 JSON 对象。'] };
  check(input.schemaVersion === 1, 'schemaVersion 必须为 1。');
  check(text(input.id, 48) && idPattern.test(input.id), 'id 必须是小写英文、数字或短横线，以字母开头。');
  check(text(input.name, 60), 'name 必须是 1～60 字的关卡名称。');
  check(text(input.description, 300), 'description 必须是 1～300 字的玩法说明。');
  check(input.hint === undefined || text(input.hint, 500), 'hint 必须是 1～500 字的提示。');
  const world = input.world;
  check(object(world) && world.width === 1200 && world.height === 640 && world.groundY === 440,
    '当前版本 world 必须为 {width:1200,height:640,groundY:440}。');
  check(object(input.actor) && number(input.actor.x, 20, 1150) && number(input.actor.speed, 15, 180),
    'actor 需要合法的 x（20～1150）和 speed（15～180，单位/秒）。');
  check(object(input.goal) && number(input.goal.x, 40, 1180) && input.goal.x > input.actor?.x,
    'goal.x 必须在角色起点右侧且不超过 1180。');
  const platforms = input.platforms;
  check(Array.isArray(platforms) && platforms.length > 0 && platforms.length <= 64, 'platforms 必须包含 1～64 段地面。');
  if (Array.isArray(platforms)) {
    platforms.slice(0, 65).forEach((p, index) => check(object(p) && number(p.x, 0, 1200) &&
      number(p.width, 1, 1200) && p.x + p.width <= 1200, 'platforms[' + index + '] 的范围不合法。'));
  }
  const entities = input.entities;
  check(Array.isArray(entities) && entities.length <= 64, 'entities 必须为最多 64 项的数组。');
  const byId = new Map();
  if (Array.isArray(entities)) {
    entities.slice(0, 65).forEach((entity, index) => {
      if (!object(entity)) { errors.push('entities[' + index + '] 必须是对象。'); return; }
      check(text(entity.id, 48) && idPattern.test(entity.id) && !byId.has(entity.id), '实体 id 无效或重复：' + String(entity.id));
      check(Object.hasOwn(STATES, entity.kind), '未知实体类型：' + String(entity.kind));
      check(Object.hasOwn(STATES, entity.kind) && STATES[entity.kind].includes(entity.state), '实体初始状态无效：' + String(entity.id));
      check(number(entity.x, 25, 1175) && (entity.width === undefined || number(entity.width, 8, 600)) &&
        entity.x + (entity.width ?? 28) <= 1200, '实体位置或宽度无效：' + String(entity.id));
      check(text(entity.label, 30), '实体需要 1～30 字的 label：' + String(entity.id));
      byId.set(entity.id, entity);
    });
  }
  const conditionsValid = (conditions, where) => {
    check(Array.isArray(conditions) && conditions.length <= 16, where + ' 的 if 必须是最多 16 项的数组。');
    if (!Array.isArray(conditions)) return;
    for (const condition of conditions.slice(0, 17)) {
      const entity = object(condition) ? byId.get(condition.entity) : null;
      check(Boolean(entity && Object.hasOwn(STATES, entity.kind) && STATES[entity.kind].includes(condition.state)),
        where + ' 的条件引用或状态无效。');
    }
  };
  let actionCount = 0;
  const actionsValid = (actions, depth = 0) => {
    if (!Array.isArray(actions) || actions.length === 0 || actions.length > 32 || depth > 4) {
      errors.push('actions 需要 1～32 项，after 嵌套最多 4 层。'); return;
    }
    for (const action of actions.slice(0, 33)) {
      actionCount++;
      if (actionCount > 512) { errors.push('关卡动作总数不能超过 512。'); return; }
      if (!object(action)) { errors.push('动作必须是对象。'); continue; }
      if (action.type === 'set') {
        const entity = byId.get(action.target);
        check(Boolean(entity && Object.hasOwn(STATES, entity.kind) && STATES[entity.kind].includes(action.state)),
          'set 动作的目标或状态无效：' + String(action.target));
      } else if (action.type === 'after') {
        check(Number.isInteger(action.ticks) && number(action.ticks, 1, 3600), 'after.ticks 必须是 1～3600 的整数。');
        actionsValid(action.actions, depth + 1);
      } else errors.push('未知动作类型：' + String(action.type));
    }
  };
  check(Array.isArray(input.rules) && input.rules.length <= 128, 'rules 必须为最多 128 项的数组。');
  if (Array.isArray(input.rules)) {
    input.rules.slice(0, 129).forEach((rule, index) => {
      if (!object(rule)) { errors.push('rules[' + index + '] 必须是对象。'); return; }
      const source = object(rule.on) ? byId.get(rule.on.source) : null;
      check(Boolean(source && ((rule.on.type === 'click' && ['switch', 'hazard'].includes(source.kind)) ||
        (rule.on.type === 'enter' && source.kind === 'plate'))), 'rules[' + index + '] 的事件源或事件类型无效。');
      if (rule.if !== undefined) conditionsValid(rule.if, 'rules[' + index + ']');
      actionsValid(rule.actions);
    });
  }
  if (errors.length === 0) {
    const supported = (x) => platforms.some((p) => x >= p.x && x <= p.x + p.width);
    check(supported(input.actor.x), '角色起点需要位于地面上。');
    check(supported(input.goal.x), '终点需要位于地面上。');
  }
  return { valid: errors.length === 0, errors };
}
