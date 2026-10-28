// 确定性内核：固定 60 tick 推进、相位顺序固定、预算超限即失败、快照深拷贝。
// 它只读已编译模型，按「实体声明顺序 → 能力声明顺序」调度能力 hook，不认识任何具体能力。

import { getCapability } from '../capabilities/index.js';
import { compileModel } from '../contract/compile.js';
import { LIMITS, MESSAGES, TICKS_PER_SECOND } from '../contract/constants.js';
import { stateLabel } from '../contract/registry.js';
import { validateDoc } from '../contract/validate.js';

const clone = (value) => structuredClone(value);

/**
 * 相位顺序即语义：接触（区域 / 拾取 / 接触伤害）→ 支撑 → 阻挡 → 终点。
 * 新增相位必须改这张表，并补一条 golden 回放回归。
 */
export const HOOK_PHASES = Object.freeze(['onContact', 'onBlock']);

/** 未编译的输入一律先走 playable 全量校验，模型则直接运行。 */
function modelOf(input) {
  if (input && input.compiled === true) return input;
  const validation = validateDoc(input, { mode: 'playable' });
  if (!validation.ok) {
    const error = new Error(validation.messages.join('\n'));
    error.code = validation.code;
    error.errors = validation.errors;
    throw error;
  }
  return compileModel(input);
}

export function createSimulation(input) {
  const model = modelOf(input);
  let state, pending, inputs, serial, actionBudget;

  const emit = (message, kind = 'action') => {
    state.events.push({ tick: state.tick, message, kind });
    if (state.events.length > LIMITS.recentEvents) state.events.shift();
  };

  const lose = (reason, message) => {
    state.status = 'lost';
    state.reason = reason;
    emit(message, 'lost');
  };

  const reset = () => {
    state = {
      tick: 0,
      status: 'ready',
      reason: null,
      actor: { x: model.actor.x, holding: null },
      entities: Object.fromEntries(model.entities.map((entity) => [entity.id, { ...entity }])),
      events: [],
      clicks: 0,
      timers: [],
    };
    pending = [];
    inputs = [];
    serial = 0;
    return api;
  };

  const runActions = (list) => {
    for (const action of list) {
      if (state.status !== 'running') return;
      if (actionBudget - 1 < 0 || (action.type === 'after' && state.timers.length >= LIMITS.maxTimers)) {
        lose('limit', MESSAGES.limit);
        return;
      }
      actionBudget -= 1;
      if (action.type === 'set') {
        const entity = state.entities[action.target];
        if (entity && entity.state !== action.state) {
          entity.state = action.state;
          emit(entity.label + ' → ' + stateLabel(entity.state));
        }
      } else {
        state.timers.push({ due: state.tick + action.ticks, order: serial, actions: clone(action.actions) });
        serial += 1;
      }
    }
  };

  // 每条规则都能看到前面规则的结果：顺序即语义。
  const trigger = (type, source) => {
    for (const rule of model.rules) {
      if (state.status !== 'running') return;
      if (rule.on.type !== type || rule.on.source !== source) continue;
      const conditionsMet = (rule.if ?? []).every((condition) => {
        const entity = state.entities[condition.entity];
        return Boolean(entity) && entity.state === condition.state;
      });
      if (conditionsMet) runActions(rule.actions);
    }
  };

  const supported = (from, to) => {
    const spans = [
      ...model.platforms.map((platform) => [platform.x, platform.x + platform.width]),
      ...Object.values(state.entities)
        .filter((entity) => entity.traits.groundInState !== undefined && entity.state === entity.traits.groundInState)
        .map((entity) => [entity.x, entity.x + entity.width]),
    ].sort((a, b) => a[0] - b[0]);
    let covered = from;
    for (const [left, right] of spans) {
      if (right < covered) continue;
      if (left > covered + 0.000001) return false;
      covered = Math.max(covered, right);
      if (covered >= to) return true;
    }
    return false;
  };

  const runPhase = (phase, ctx) => {
    for (const entity of Object.values(state.entities)) {
      if (state.status !== 'running') return;
      for (const [name, params] of Object.entries(entity.capabilities)) {
        const capability = getCapability(name);
        const hook = capability && capability.hooks ? capability.hooks[phase] : null;
        if (typeof hook !== 'function') continue;
        hook(ctx, entity, params);
        if (state.status !== 'running') return;
      }
    }
  };

  const advance = () => {
    state.tick += 1;
    actionBudget = LIMITS.actionsPerTick;

    // ① 到期动作（due/order）
    const due = state.timers
      .filter((timer) => timer.due <= state.tick)
      .sort((a, b) => a.due - b.due || a.order - b.order);
    state.timers = state.timers.filter((timer) => timer.due > state.tick);
    for (const timer of due) runActions(timer.actions);
    if (state.status !== 'running') { pending = []; return; }

    // ② 玩家输入只入队，按声明顺序执行
    for (const source of pending) {
      if (state.status !== 'running') break;
      state.clicks += 1;
      inputs.push({ tick: state.tick, source });
      trigger('click', source);
    }
    pending = [];
    if (state.status !== 'running') return;

    // ③ 行走与量化
    const from = state.actor.x;
    const to = Math.min(model.goal.x, Math.round((from + model.actor.speed / TICKS_PER_SECOND) * 1e6) / 1e6);
    state.actor.x = to;
    // 所有能力共用同一套「触及」定义，避免拾取比伤害慢一个容差。
    const overlaps = (entity, margin = 0) => to + margin >= entity.x && from - margin <= entity.x + entity.width;
    const ctx = { state, world: model.world, from, to, overlaps, emit, lose, trigger };

    // ④ 接触类能力：区域（踩板）、拾取（可持有）、接触伤害
    runPhase('onContact', ctx);
    if (state.status !== 'running') return;

    // ⑤ 支撑
    if (!supported(from, to)) {
      lose('fall', MESSAGES.fall);
      return;
    }

    // ⑥ 阻挡类能力
    runPhase('onBlock', ctx);
    if (state.status !== 'running') return;

    // ⑦ 终点与超时
    if (to >= model.goal.x) {
      state.status = 'won';
      emit(MESSAGES.won, 'won');
    } else if (state.tick >= LIMITS.maxTicks) {
      lose('timeout', MESSAGES.timeout);
    }
  };

  const api = {
    start() { if (state.status === 'ready' || state.status === 'paused') state.status = 'running'; return api; },
    pause() { if (state.status === 'running') state.status = 'paused'; return api; },
    click(source) {
      if (state.status !== 'running' || pending.length >= LIMITS.maxClicksPerTick) return false;
      const entity = state.entities[source];
      if (!entity || !entity.traits.clickable) return false;
      pending.push(source);
      return true;
    },
    step(count = 1) {
      if (!Number.isInteger(count) || count < 0 || count > LIMITS.maxTicks) {
        throw new Error('步数必须为 0～' + LIMITS.maxTicks + ' 的整数。');
      }
      for (let index = 0; index < count && state.status === 'running'; index += 1) advance();
      return api;
    },
    singleStep() {
      if (state.status === 'ready' || state.status === 'paused') {
        state.status = 'running';
        advance();
        if (state.status === 'running') state.status = 'paused';
      }
      return api;
    },
    reset,
    snapshot: () => clone(state),
    recording: () => ({ schemaVersion: model.schemaVersion, levelId: model.id, inputs: clone(inputs), untilTick: state.tick, status: state.status }),
  };

  return reset();
}
