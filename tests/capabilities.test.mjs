import test from 'node:test';
import assert from 'node:assert/strict';

import { listCapabilities, registerCapability } from '../src/core/capabilities/index.js';
import { capabilitiesOfEntity, eventsOfEntity, traitsOfEntity } from '../src/core/contract/registry.js';
import { createGame } from '../src/core/interpreters/index.js';
import { levels } from './levels-fixture.mjs';

const axeLevel = () => structuredClone(levels.find((level) => level.id === 'the-axe'));

const play = (doc, inputs = []) => {
  const game = createGame(doc);
  game.start();
  let index = 0;
  for (let tick = 1; tick <= 2000 && game.snapshot().status === 'running'; tick += 1) {
    while (index < inputs.length && inputs[index].tick === tick) game.click(inputs[index++].source);
    game.step();
  }
  return game.snapshot();
};

test('capabilities are the implementation units and declare their own vocabulary', () => {
  const ids = listCapabilities().map((capability) => capability.id);
  assert.deepEqual(ids, ['blockPath', 'clickable', 'damageOnContact', 'extendGround', 'holdable', 'region', 'verticalRide']);
  for (const capability of listCapabilities()) {
    assert.equal(typeof capability.traits, 'function', capability.id + ' 必须派生 traits');
    assert.ok(Array.isArray(capability.events), capability.id + ' 必须声明事件列表');
  }
  assert.throws(() => registerCapability({ id: 'clickable', version: 1 }), /已注册/);
  assert.throws(() => registerCapability({ id: 'Bad', version: 1 }), /id/);
  assert.throws(() => registerCapability({ id: 'ok', version: 0 }), /version/);
});

test('an axe composes holdable before damageOnContact, and traits follow the params', () => {
  const entity = { id: 'axe', kind: 'axe', x: 10, width: 34, state: 'idle', label: '斧' };
  assert.deepEqual(Object.keys(capabilitiesOfEntity(entity)), ['holdable', 'damageOnContact']);
  const traits = traitsOfEntity(entity);
  assert.equal(traits.holdFrom, 'idle');
  assert.equal(traits.harmsInState, 'idle');
  assert.deepEqual(eventsOfEntity({ id: 'hammer', kind: 'hammer' }).sort(), ['click', 'done']);
});

test('the same preset can be reconfigured per entity without a new type', () => {
  const entity = { id: 'axe', kind: 'axe', x: 10, width: 34, state: 'idle', label: '斧', capabilities: { holdable: false } };
  assert.deepEqual(Object.keys(capabilitiesOfEntity(entity)), ['damageOnContact']);

  const doc = axeLevel();
  doc.entities.find((item) => item.id === 'axe').capabilities = { holdable: false, clickable: {} };
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
});

test('setting the item back to idle drops it behind the traveller', () => {
  const doc = axeLevel();
  const game = createGame(doc);
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

test('a clickable held item can drive rules, an idle one cannot', () => {
  const solved = play(axeLevel(), [{ tick: 250, source: 'axe' }, { tick: 520, source: 'hammer' }]);
  assert.equal(solved.status, 'won');
  assert.equal(solved.entities.gate.state, 'open');

  const tooEarly = play(axeLevel(), [{ tick: 100, source: 'hammer' }, { tick: 250, source: 'axe' }]);
  assert.equal(tooEarly.status, 'lost');
  assert.equal(tooEarly.entities.gate.state, 'closed');
});
