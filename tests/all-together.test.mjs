import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/core/interpreters/index.ts';
import { levels } from './levels-fixture.mjs';

const demo = () => structuredClone(levels.find((level) => level.id === 'all-together'));

const play = (doc, inputs = [], cap = 1400) => {
  const game = createGame(doc);
  game.start();
  let index = 0;
  for (let tick = 1; tick <= cap && game.snapshot().status === 'running'; tick += 1) {
    while (index < inputs.length && inputs[index].tick === tick) game.click(inputs[index++].source);
    game.step();
  }
  return game.snapshot();
};

const SOLUTION = [
  { tick: 150, source: 'axe' },
  { tick: 200, source: 'guard' },
  { tick: 520, source: 'bridge-switch' },
  { tick: 800, source: 'lift-switch' },
];

test('the demo level needs axe, key, guard, plate, bridge, lift and stairs together', () => {
  const state = play(demo(), SOLUTION);
  assert.equal(state.status, 'won');
  assert.equal(Math.round(state.tick), 1032);
  assert.equal(state.entities.gate.state, 'open');
  assert.equal(state.entities.lift.state, 'upper');
  assert.equal(state.entities.key.state, 'used', '钥匙被压力板用掉了');
  assert.equal(state.actor.holding, null, '用掉之后手就空出来了');
});

test('every mechanic is load bearing: skipping one loses the run', () => {
  const noGuard = play(demo(), SOLUTION.filter((item) => item.source !== 'guard'));
  assert.equal(noGuard.status, 'lost');
  assert.equal(noGuard.reason, 'hurt', '不拦守卫就会被撞');

  const noDrop = play(demo(), SOLUTION.filter((item) => item.source !== 'axe'));
  assert.equal(noDrop.status, 'lost');
  assert.equal(noDrop.reason, 'gate', '手上有斧头就拿不起钥匙，门不开');

  const noBridge = play(demo(), SOLUTION.filter((item) => item.source !== 'bridge-switch'));
  assert.equal(noBridge.status, 'lost');
  assert.equal(noBridge.reason, 'fall', '桥不放下就掉进沟里');

  const noLift = play(demo(), SOLUTION.filter((item) => item.source !== 'lift-switch'));
  assert.equal(noLift.status, 'lost');
  assert.equal(noLift.reason, 'fall', '电梯不上去就上不了二楼');
});

/** 一条平地 + 指定实体，用来单独观察某种机关的行为。 */
const flatLevel = (entities, rules = []) => ({
  schemaVersion: 1,
  id: 'flat-test',
  name: '平地测试',
  description: '测试用',
  world: { width: 1200, height: 640, groundY: 440 },
  actor: { x: 60, speed: 64, y: 440 },
  goal: { x: 1100, y: 440 },
  platforms: [{ x: 0, width: 1200, y: 440 }],
  entities,
  rules,
});

test('patrol moves the guard, stopping freezes it, and it restarts on its own', () => {
  const game = createGame(flatLevel([{
    id: 'guard',
    kind: 'guard',
    x: 380,
    width: 34,
    state: 'patrolling',
    label: '巡逻机关',
    moves: { inState: 'patrolling', speed: 48, between: [380, 470] },
  }], [{
    id: 'stop-guard',
    on: { type: 'click', source: 'guard' },
    actions: [
      { type: 'set', target: 'guard', state: 'stopped' },
      { type: 'after', ticks: 420, actions: [{ type: 'set', target: 'guard', state: 'patrolling' }] },
    ],
  }]));
  game.start();
  const start = game.snapshot().entities.guard.x;
  game.step(120);
  assert.notEqual(game.snapshot().entities.guard.x, start, '守卫会来回走');

  game.click('guard');
  game.step(1);
  assert.equal(game.snapshot().entities.guard.state, 'stopped');
  const frozen = game.snapshot().entities.guard.x;
  game.step(300);
  assert.equal(game.snapshot().entities.guard.x, frozen, '停下后不再移动');
  assert.equal(game.snapshot().entities.guard.state, 'stopped');

  game.step(130);
  assert.equal(game.snapshot().entities.guard.state, 'patrolling', '420 tick 后自己恢复巡逻');
});

test('a patrolling crusher blocks the way while it is active', () => {
  const flat = () => flatLevel([{
    id: 'crusher',
    kind: 'crusher',
    x: 400,
    width: 44,
    state: 'active',
    label: '碎石机',
    moves: { inState: 'active', speed: 36, between: [380, 460] },
  }]);

  const blocked = play(flat());
  assert.equal(blocked.status, 'lost');
  assert.equal(blocked.reason, 'crusher');

  const parked = flat();
  parked.entities[0].state = 'parked';
  const passed = play(parked);
  assert.equal(passed.status, 'won', '停在一侧的碎石机不挡路');
});

test('the demo level also survives a replay of the winning inputs', () => {
  const doc = demo();
  const game = createGame(doc);
  game.start();
  let index = 0;
  for (let tick = 1; tick <= 1400 && game.snapshot().status === 'running'; tick += 1) {
    while (index < SOLUTION.length && SOLUTION[index].tick === tick) game.click(SOLUTION[index++].source);
    game.step();
  }
  const recording = game.recording();
  const replay = createGame(doc);
  replay.start();
  let cursor = 0;
  for (let tick = 1; tick <= recording.untilTick; tick += 1) {
    while (cursor < recording.inputs.length && recording.inputs[cursor].tick === tick) replay.click(recording.inputs[cursor++].source);
    replay.step();
  }
  assert.deepEqual(replay.snapshot(), game.snapshot());
});
