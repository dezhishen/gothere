import { validateLevel } from './schema.js';
export { validateLevel } from './schema.js';
export const TICKS_PER_SECOND = 60;
const clone = (value) => structuredClone(value);
const MAX_TICKS = 36000;

/** Mutable simulation instance; all external data and snapshots are copied. No DOM or wall clock. */
export function createSimulation(input) {
  const validation = validateLevel(input);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const level = clone(input);
  let state, pending, inputs, serial, actionBudget;
  const emit = (message, kind = 'action') => {
    state.events.push({ tick: state.tick, message, kind });
    if (state.events.length > 24) state.events.shift();
  };
  const reset = () => {
    state = { tick: 0, status: 'ready', reason: null, actor: { x: level.actor.x },
      entities: Object.fromEntries(level.entities.map((e) => [e.id, { ...e, width: e.width ?? 28 }])),
      events: [], clicks: 0, timers: [] };
    pending = []; inputs = []; serial = 0;
    return api;
  };
  const actions = (list) => {
    for (const action of list) {
      if (state.status !== 'running') return;
      if (--actionBudget < 0 || (action.type === 'after' && state.timers.length >= 256)) {
        lose('limit', '机关规则太忙了。请减少重复触发或延迟动作，再重新出发。');
        return;
      }
      if (action.type === 'set') {
        const entity = state.entities[action.target];
        if (entity.state !== action.state) {
          entity.state = action.state;
          emit(entity.label + ' → ' + stateLabel(entity.state));
        }
      } else {
        state.timers.push({ due: state.tick + action.ticks, order: serial++, actions: clone(action.actions) });
      }
    }
  };
  const trigger = (type, source) => {
    // Each rule observes the results of earlier rules in declaration order.
    for (const rule of level.rules) {
      if (state.status !== 'running') return;
      if (rule.on.type === type && rule.on.source === source &&
        (rule.if ?? []).every((condition) => state.entities[condition.entity].state === condition.state)) {
        actions(rule.actions);
      }
    }
  };
  const supported = (from, to) => {
    const spans = [...level.platforms.map((p) => [p.x, p.x + p.width]),
      ...Object.values(state.entities).filter((e) => e.kind === 'bridge' && e.state === 'extended')
        .map((e) => [e.x, e.x + e.width])].sort((a, b) => a[0] - b[0]);
    let covered = from;
    for (const [left, right] of spans) {
      if (right < covered) continue;
      if (left > covered + 0.000001) return false;
      covered = Math.max(covered, right);
      if (covered >= to) return true;
    }
    return false;
  };
  const lose = (reason, message) => { state.status = 'lost'; state.reason = reason; emit(message, 'lost'); };
  const advance = () => {
    state.tick++;
    actionBudget = 1024;
    const due = state.timers.filter((timer) => timer.due <= state.tick)
      .sort((a, b) => a.due - b.due || a.order - b.order);
    state.timers = state.timers.filter((timer) => timer.due > state.tick);
    for (const timer of due) actions(timer.actions);
    if (state.status !== 'running') { pending = []; return; }
    for (const source of pending) {
      if (state.status !== 'running') break;
      state.clicks++; inputs.push({ tick: state.tick, source }); trigger('click', source);
    }
    pending = [];
    if (state.status !== 'running') return;
    const from = state.actor.x;
    const to = Math.min(level.goal.x, Math.round((from + level.actor.speed / 60) * 1e6) / 1e6);
    state.actor.x = to;
    for (const entity of Object.values(state.entities)) {
      if (entity.kind === 'plate' && entity.state === 'idle' && to >= entity.x && from <= entity.x + entity.width) {
        entity.state = 'pressed'; emit('踩下了' + entity.label); trigger('enter', entity.id);
      }
    }
    if (state.status !== 'running') return;
    if (!supported(from, to)) { lose('fall', '脚下的路临时请假了。试试先把桥放下来。'); return; }
    for (const entity of Object.values(state.entities)) {
      if (to + 10 < entity.x || from - 10 > entity.x + entity.width) continue;
      if (entity.kind === 'gate' && entity.state === 'closed') {
        lose('gate', '门：此路暂时不通。先找个办法打开它。'); return;
      }
      if (entity.kind === 'hazard' && entity.state === 'running') {
        lose('hazard', '风太大，被吹了个措手不及。经过之前先关风扇。'); return;
      }
    }
    if (to >= level.goal.x) { state.status = 'won'; emit('到了！就说一定能到这里。', 'won'); }
    else if (state.tick >= MAX_TICKS) lose('timeout', '这段路走成了长征。歇一下，重新出发吧。');
  };
  const api = {
    start() { if (['ready', 'paused'].includes(state.status)) state.status = 'running'; return api; },
    pause() { if (state.status === 'running') state.status = 'paused'; return api; },
    click(source) {
      if (state.status !== 'running' || pending.length >= 32) return false;
      const entity = state.entities[source];
      if (!entity || !['switch', 'hazard'].includes(entity.kind)) return false;
      pending.push(source); return true;
    },
    step(count = 1) {
      if (!Number.isInteger(count) || count < 0 || count > MAX_TICKS) throw new Error('步数必须为 0～36000 的整数。');
      for (let i = 0; i < count && state.status === 'running'; i++) advance();
      return api;
    },
    singleStep() {
      if (['ready', 'paused'].includes(state.status)) {
        state.status = 'running'; advance();
        if (state.status === 'running') state.status = 'paused';
      }
      return api;
    },
    reset,
    snapshot: () => clone(state),
    recording: () => ({ schemaVersion: 1, levelId: level.id, inputs: clone(inputs), untilTick: state.tick, status: state.status }),
  };
  return reset();
}

export function replayRecording(level, recording) {
  if (!recording || recording.schemaVersion !== 1 || recording.levelId !== level.id ||
    !Number.isInteger(recording.untilTick) || recording.untilTick < 0 || recording.untilTick > MAX_TICKS ||
    !Array.isArray(recording.inputs) || recording.inputs.length > MAX_TICKS ||
    !['ready', 'running', 'paused', 'lost', 'won'].includes(recording.status)) throw new Error('回放格式或关卡不匹配。');
  let previous = 0;
  for (const input of recording.inputs) {
    if (!input || !Number.isInteger(input.tick) || input.tick < 1 || input.tick < previous ||
      input.tick > recording.untilTick || typeof input.source !== 'string') throw new Error('回放操作序列不合法。');
    previous = input.tick;
  }
  const game = createSimulation(level); game.start(); let index = 0;
  for (let tick = 1; tick <= recording.untilTick; tick++) {
    while (recording.inputs[index]?.tick === tick) {
      if (!game.click(recording.inputs[index++].source)) throw new Error('回放包含不可执行的机关操作。');
    }
    game.step();
    if (['won', 'lost'].includes(game.snapshot().status) && tick < recording.untilTick) throw new Error('回放在结束后仍包含时间或操作。');
  }
  if (recording.status === 'paused') game.pause();
  if (recording.status === 'ready' && recording.untilTick === 0) game.reset();
  if (game.snapshot().status !== recording.status) throw new Error('回放结果与记录不一致。');
  return game;
}

export function stateLabel(state) {
  return ({ off: '待触发', on: '已触发', folded: '收起', extended: '已铺好', closed: '关闭',
    open: '开启', running: '转动中', stopped: '已停下', idle: '等待踩下', pressed: '已踩下' })[state] ?? state;
}
