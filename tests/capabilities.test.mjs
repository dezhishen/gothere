import test from 'node:test';
import assert from 'node:assert/strict';

import { STAGES, listSlots, registerSlot } from '../src/core/capabilities/index.ts';
import { slotsOfEntity } from '../src/core/contract/registry.ts';
import { createGame } from '../src/core/interpreters/index.ts';
import { levels } from './levels-fixture.mjs';

const axeLevel = () => structuredClone(levels.find((level) => level.id === 'the-axe'));
const keyLevel = () => structuredClone(levels.find((level) => level.id === 'all-together'));

const play = (doc, inputs = []) => {
  const game = createGame(doc);
  game.start();
  let index = 0;
  for (let tick = 1; tick <= 3000 && game.snapshot().status === 'running'; tick += 1) {
    while (index < inputs.length && inputs[index].tick === tick) game.click(inputs[index++].source);
    game.step();
  }
  return game.snapshot();
};

/** 递归找出任何函数——元素的声明里不许有代码。 */
const findFunction = (value, path = '') => {
  if (typeof value === 'function') return path || '根';
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    const found = findFunction(item, path ? path + '.' + key : key);
    if (found) return found;
  }
  return null;
};

test('slots are pure declarations: no functions, only known stages', () => {
  const ids = listSlots().map((slot) => slot.id);
  assert.deepEqual(ids, ['blocks', 'carryable', 'ground', 'harms', 'lifts', 'moves', 'reacts']);
  for (const slot of listSlots()) {
    assert.equal(findFunction(slot), null, slot.id + ' 必须是纯数据，不能带函数');
    assert.ok(Array.isArray(slot.stages) && slot.stages.length > 0, slot.id + ' 必须声明阶段');
    for (const stage of slot.stages) assert.ok(STAGES.includes(stage), slot.id + ' 声明的阶段必须存在：' + stage);
    assert.equal(typeof slot.params, 'object');
  }
  assert.throws(() => registerSlot({ id: 'reacts', version: 1 }), /已注册/);
  assert.throws(() => registerSlot({ id: 'Bad', version: 1 }), /id/);
  assert.throws(() => registerSlot({ id: 'ok', version: 0 }), /version/);
  assert.throws(() => registerSlot({ id: 'later', version: 1, stages: ['after'] }), /阶段/);
  assert.throws(() => registerSlot({ id: 'shout', version: 1, params: { run: () => 1 } }), /函数/);
});

test('an entity merges the type preset with its own declarations', () => {
  const axe = { id: 'axe', kind: 'axe', x: 10, width: 34, state: 'idle', label: '斧' };
  assert.deepEqual(Object.keys(slotsOfEntity(axe)).sort(), ['carryable', 'harms', 'reacts']);
  assert.equal(slotsOfEntity(axe).carryable.from, 'idle');
  assert.equal(slotsOfEntity(axe).harms.inState, 'idle');

  const disabled = { ...axe, carryable: false };
  assert.deepEqual(Object.keys(slotsOfEntity(disabled)).sort(), ['harms', 'reacts']);

  const moved = { ...axe, harms: { inState: 'held' } };
  assert.equal(slotsOfEntity(moved).harms.inState, 'held');
  assert.equal(slotsOfEntity(moved).harms.unlessHeld, true, '覆盖时未写的字段仍取默认值');
});

test('the same preset can be reconfigured per entity without a new type', () => {
  const doc = axeLevel();
  const axe = doc.entities.find((item) => item.id === 'axe');
  axe.carryable = false;
  const state = play(doc);
  assert.equal(state.status, 'lost');
  assert.equal(state.reason, 'hurt');
  assert.equal(state.actor.holding, null);
});

test('walking over an axe picks it up, and holding it stops the damage', () => {
  const state = play(axeLevel());
  assert.equal(state.status, 'lost');
  assert.equal(state.reason, 'gate', '没有操作时应当被门挡住');
  assert.equal(state.entities.axe.state, 'held');
  assert.equal(state.actor.holding, 'axe');
  assert.deepEqual(state.actor.tags, ['key', 'yellow'].filter((tag) => state.entities.axe.tags.includes(tag)));
});

test('clicking the held item drops it behind the traveller', () => {
  const game = createGame(axeLevel());
  game.start();
  while (game.snapshot().tick < 250) game.step();
  assert.equal(game.snapshot().entities.axe.state, 'held');
  game.click('axe');
  game.step();
  const state = game.snapshot();
  assert.equal(state.entities.axe.state, 'idle');
  assert.equal(state.actor.holding, null);
  assert.ok(state.entities.axe.x < state.actor.x, '放下后应在身后');
  game.step(100);
  assert.equal(game.snapshot().status, 'running', '放下后不应被自己的斧头伤到');
});

test('only one item can be carried at a time', () => {
  const state = play(axeLevel(), [{ tick: 250, source: 'axe' }]);
  assert.equal(state.actor.holding, 'hammer');
  assert.equal(state.entities.axe.state, 'idle');
});

test('a held item can drive the level wiring, an unheld one cannot', () => {
  const solved = play(axeLevel(), [{ tick: 250, source: 'axe' }, { tick: 520, source: 'hammer' }]);
  assert.equal(solved.status, 'won');
  assert.equal(solved.entities.gate.state, 'open');

  const tooEarly = play(axeLevel(), [{ tick: 100, source: 'hammer' }, { tick: 250, source: 'axe' }]);
  assert.equal(tooEarly.status, 'lost');
  assert.equal(tooEarly.entities.gate.state, 'closed');
});

test('a mechanism reads the item tags it needs and consumes the item', () => {
  const doc = keyLevel();
  const plate = doc.entities.find((entity) => entity.id === 'plate');
  assert.deepEqual(plate.reacts.need, { kind: 'key', tags: ['key', 'yellow'] });

  // 没有钥匙时踩不下去：板保持 idle，闸门不开，并且会得到一句提示。
  const withoutKey = structuredClone(doc);
  withoutKey.entities.find((entity) => entity.id === 'key').x = 1150;
  const blocked = play(withoutKey, [{ tick: 200, source: 'guard' }, { tick: 520, source: 'bridge-switch' }]);
  assert.equal(blocked.entities.plate.state, 'idle');
  assert.equal(blocked.entities.gate.state, 'closed');
  assert.ok(blocked.events.some((event) => event.message.includes('黄钥匙')));

  // 有钥匙时踩下去，钥匙变成物品自己声明的 used，手里空出来。
  const game = createGame(doc);
  game.start();
  let solved = null;
  for (let tick = 1; tick <= 3000 && game.snapshot().status === 'running'; tick += 1) {
    if (tick === 150) game.click('axe');
    if (tick === 200) game.click('guard');
    if (tick === 520) game.click('bridge-switch');
    game.step();
    const state = game.snapshot();
    if (state.entities.plate.state === 'pressed' && !solved) {
      solved = state;
      assert.equal(state.entities.key.state, 'used', '钥匙应当变成物品自己声明的 used');
      assert.equal(state.actor.holding, null, '用掉的钥匙不再占手');
    }
  }
  assert.ok(solved, '拿到钥匙后应当踩下压力板');
  assert.equal(solved.entities.gate.state, 'open');
});

test('a requirement nobody can satisfy is rejected before the level runs', () => {
  const doc = keyLevel();
  doc.entities = doc.entities.filter((entity) => entity.id !== 'key');
  const game = () => createGame(doc);
  assert.throws(game, /没有任何元素提供/);
});
