// 确定性内核：固定 60 tick 推进、阶段顺序固定、预算超限即失败、快照深拷贝。
// 内核只做一件事：按固定阶段**解释元素自己声明的东西**。
// 元素里没有代码，所以没有任何人能改流程；要改流程只能改这里。

import { createActorView } from '../contract/actor.ts';
import { compileModel } from '../contract/compile.ts';
import { LIMITS, MESSAGES, TICKS_PER_SECOND } from '../contract/constants.ts';
import { itemCard } from '../contract/item.ts';
import { stateLabel } from '../contract/registry.ts';
import { validateDoc } from '../contract/validate.ts';

const clone = (value) => structuredClone(value);
const quantize = (value) => Math.round(value * 1e6) / 1e6;
const sameFloor = (entity, state) => Math.abs(entity.y - state.actor.y) <= LIMITS.floorTolerance;

/**
 * 阶段顺序即语义：输入 → 自走 → 携带同步 → 接触（反应/伤害/载人）→ 阻挡 → 终点。
 * 新增阶段必须改这张表，并补一条 golden 回放回归。
 */
export const STAGES = Object.freeze(['input', 'motion', 'carry', 'contact', 'block']);

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

/** 实体能提供的地面高度：桥铺好时的自身高度，或电梯轿厢当前所在楼层。 */
function groundOf(entity) {
  const ground = entity.ground;
  if (ground && ground.inState !== null && entity.state === ground.inState) return entity.y;
  const lifts = entity.lifts;
  if (lifts) return entity.state === lifts.upperState ? lifts.upperY : lifts.lowerY;
  return null;
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
      actor: { x: model.actor.x, y: model.actor.y, holding: null, riding: null },
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

  /** 唯一的写入点：元素自己变状态。元素不能改别人。 */
  const transition = (entity, target) => {
    if (typeof target !== 'string' || entity.state === target) return false;
    entity.state = target;
    emit(entity.label + ' → ' + stateLabel(target));
    return true;
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
        if (entity) transition(entity, action.state);
      } else {
        state.timers.push({ due: state.tick + action.ticks, order: serial, actions: clone(action.actions) });
        serial += 1;
      }
    }
  };

  // 连线表：事件 → 动作。没有条件——条件住在元素自己的声明里。
  const trigger = (type, source) => {
    for (const rule of model.rules) {
      if (state.status !== 'running') return;
      if (!rule.on || rule.on.type !== type || rule.on.source !== source) continue;
      runActions(rule.actions);
    }
  };

  /**
   * 解释一次「反应」声明：状态前置 → 需求（物品标签）→ 动作（变成什么 / 发布什么）。
   * 需求不满足时只说一次话，不改变任何状态。
   */
  const applyReact = (entity, reacts) => {
    if (reacts.from !== null && entity.state !== reacts.from) return false;
    if (reacts.need) {
      const actor = createActorView(state);
      const check = actor.can(reacts.need);
      if (!check.ok) {
        if (!entity.noticed) {
          entity.noticed = true;
          emit((reacts.unmet && reacts.unmet.message) || MESSAGES.need, 'notice');
        }
        return false;
      }
      if (reacts.consume) {
        const taken = actor.take(reacts.need);
        if (taken) emit('用掉了' + taken.label);
      }
    }
    for (const action of reacts.actions ?? []) {
      if (state.status !== 'running') return true;
      if (action.type === 'become') transition(entity, action.state);
      else if (action.type === 'publish') trigger(action.event, entity.id);
    }
    return true;
  };

  /** 某个 x 上所有可站的表面高度。 */
  const surfacesAt = (x) => {
    const surfaces = model.terrain ? model.terrain.at(x).map((surface) => surface.y) : [];
    for (const entity of Object.values(state.entities)) {
      const y = groundOf(entity);
      if (y === null) continue;
      if (x >= entity.x && x <= entity.x + entity.width) surfaces.push(y);
    }
    return surfaces;
  };

  /** 取离上一 tick 脚底最近、且在容差内的表面；没有就是踩空。 */
  const resolveSurface = (x, previousY) => {
    let best = null;
    for (const y of surfacesAt(x)) {
      const distance = Math.abs(y - previousY);
      if (distance > LIMITS.stepTolerance) continue;
      if (best === null || distance < Math.abs(best - previousY)) best = y;
    }
    return best;
  };

  /** 正在乘梯时，脚底跟着轿厢的当前楼层走（不受单步容差限制）。 */
  const ridingGround = () => {
    const id = state.actor.riding;
    if (!id) return null;
    const entity = state.entities[id];
    return entity ? groundOf(entity) : null;
  };

  /** ② 输入：元素声明了 reacts.on=input 才会被听见；听懂之后才发 click 给连线表。 */
  const runInput = () => {
    for (const source of pending) {
      if (state.status !== 'running') break;
      const entity = state.entities[source];
      if (!entity) continue;
      state.clicks += 1;
      inputs.push({ tick: state.tick, source });
      const reacts = entity.reacts;
      if (!reacts || reacts.on !== 'input') continue;
      if (applyReact(entity, reacts)) trigger('click', source);
    }
    pending = [];
  };

  /** ③ 自走：moves.inState 状态下的来回移动；被人拿着时不动。 */
  const runMotion = () => {
    for (const entity of Object.values(state.entities)) {
      if (state.status !== 'running') return;
      const moves = entity.moves;
      if (!moves || moves.inState === null || entity.state !== moves.inState) continue;
      if (state.actor.holding === entity.id) continue;
      const [min, max] = moves.between ?? [0, 0];
      const step = (moves.speed ?? 0) / TICKS_PER_SECOND;
      let direction = entity.moveDirection === -1 ? -1 : 1;
      let next = entity.x + direction * step;
      if (next >= max) { next = max; direction = -1; }
      else if (next <= min) { next = min; direction = 1; }
      entity.x = quantize(next);
      entity.moveDirection = direction;
    }
  };

  /** ④ 携带同步：拿起 / 跟随 / 放下。全部由 carryable 声明驱动。 */
  const runCarry = (from, to) => {
    for (const entity of Object.values(state.entities)) {
      if (state.status !== 'running') return;
      const carryable = entity.carryable;
      if (!carryable) continue;
      const follow = () => {
        const max = model.world.width - entity.width;
        entity.x = Math.max(0, Math.min(max, state.actor.x + (carryable.offset ?? 46)));
        entity.y = state.actor.y;
      };
      if (entity.state === carryable.to) {
        if (state.actor.holding === entity.id) follow();
        continue;
      }
      if (entity.state !== carryable.from) continue;
      if (state.actor.holding === entity.id) {
        // 被连线表改回初始状态：放下，并挪到身后，而不是留在脚底。
        state.actor.holding = null;
        const max = model.world.width - entity.width;
        entity.x = Math.max(0, Math.min(max, state.actor.x + (carryable.drop ?? -60)));
        emit('放下了' + entity.label);
        continue;
      }
      if (state.actor.holding) continue;
      if (!sameFloor(entity, state)) continue;
      if (!(to + 10 >= entity.x && from - 10 <= entity.x + entity.width)) continue;
      entity.state = carryable.to;
      state.actor.holding = entity.id;
      follow();
      emit('拿起了' + entity.label);
    }
  };

  /** ⑤ 接触：反应（含需求）、伤害、载人。 */
  const runContact = (from, to) => {
    for (const entity of Object.values(state.entities)) {
      if (state.status !== 'running') return;
      const floor = sameFloor(entity, state);
      const overlaps = (margin = 0) => to + margin >= entity.x && from - margin <= entity.x + entity.width;
      const reacts = entity.reacts;
      if (reacts && reacts.on === 'contact' && floor && overlaps()) {
        applyReact(entity, reacts);
        if (state.status !== 'running') return;
      }
      const harms = entity.harms;
      if (harms && harms.inState !== null && entity.state === harms.inState && floor && overlaps(10)) {
        const exempt = harms.unlessHeld !== false && state.actor.holding === entity.id;
        if (!exempt) lose(harms.reason ?? 'hurt', harms.message || MESSAGES.hurt);
        if (state.status !== 'running') return;
      }
      const lifts = entity.lifts;
      if (lifts) {
        const wasRiding = state.actor.riding === entity.id;
        if (!overlaps()) {
          if (wasRiding) state.actor.riding = null;
          continue;
        }
        const carY = entity.state === lifts.upperState ? lifts.upperY : lifts.lowerY;
        const onLevel = Math.abs(state.actor.y - carY) <= (lifts.tolerance ?? LIMITS.floorTolerance);
        if (!onLevel && !wasRiding) continue;
        state.actor.riding = entity.id;
        if (!wasRiding && onLevel) emit('乘上了' + entity.label);
        state.actor.y = carY;
      }
    }
  };

  /** ⑥ 阻挡：blocks.inState 状态下的去路。 */
  const runBlock = (from, to) => {
    for (const entity of Object.values(state.entities)) {
      if (state.status !== 'running') return;
      const blocks = entity.blocks;
      if (!blocks || blocks.inState === null || entity.state !== blocks.inState) continue;
      if (!sameFloor(entity, state)) continue;
      if (!(to + 10 >= entity.x && from - 10 <= entity.x + entity.width)) continue;
      lose(blocks.reason ?? 'gate', blocks.message || MESSAGES.gate);
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

    // ② 输入（元素自己决定听不听、听懂之后发什么事件）
    runInput();
    if (state.status !== 'running') return;

    // ③ 自走
    runMotion();
    if (state.status !== 'running') return;

    // ④ 行走与脚底高度：整段都要有地面（两端 + 中点采样，避免窄缝被跳过）
    const from = state.actor.x;
    const to = Math.min(model.goal.x, quantize(from + model.actor.speed / TICKS_PER_SECOND));
    const attached = ridingGround();
    let surfaceY = attached === null ? state.actor.y : attached;
    for (const x of [from, (from + to) / 2, to]) {
      const next = resolveSurface(x, surfaceY);
      if (next === null) {
        lose('fall', MESSAGES.fall);
        return;
      }
      surfaceY = next;
    }
    state.actor.x = to;
    state.actor.y = surfaceY;

    // ⑤ 携带同步
    runCarry(from, to);
    if (state.status !== 'running') return;

    // ⑥ 接触
    runContact(from, to);
    if (state.status !== 'running') return;

    // ⑦ 阻挡
    runBlock(from, to);
    if (state.status !== 'running') return;

    // ⑧ 终点与超时
    if (to >= model.goal.x && Math.abs(state.actor.y - model.goal.y) <= LIMITS.floorTolerance) {
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
      const reacts = entity ? entity.reacts : null;
      if (!reacts || reacts.on !== 'input') return false;
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
    snapshot: () => {
      const copy = clone(state);
      const held = state.actor.holding ? state.entities[state.actor.holding] : null;
      const card = held ? itemCard(held) : null;
      copy.actor.held = card;
      copy.actor.tags = held ? [...held.tags] : [];
      copy.actor.inventory = card ? [card] : [];
      return copy;
    },
    recording: () => ({ schemaVersion: model.schemaVersion, levelId: model.id, inputs: clone(inputs), untilTick: state.tick, status: state.status }),
  };

  return reset();
}
