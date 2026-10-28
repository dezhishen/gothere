import test from 'node:test';
import assert from 'node:assert/strict';

import { eventsOfEntity, typeDescriptor } from '../src/core/contract/registry.js';
import { validateDoc } from '../src/core/contract/validate.js';
import { describePlatform, createGame } from '../src/core/interpreters/index.js';
import { factoryFor } from '../src/core/interpreters/factories/index.js';
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

test('factories never call each other: interactions are declared as data', () => {
  const level = axeLevel();
  const hammer = level.entities.find((entity) => entity.id === 'hammer');
  const rule = level.rules.find((item) => item.id === 'hammer-opens');
  // 事件来自物品工厂（hammer 的 clickable），状态来自机关工厂（gate 的 open）
  assert.equal(factoryFor(hammer.kind).category, 'item');
  assert.equal(factoryFor(rule.actions[0].target).category, 'mechanism');
  assert.ok(eventsOfEntity(hammer).includes('click'));
  assert.ok(typeDescriptor('gate').states.some((state) => state.id === 'open'));
  assert.deepEqual(rule.if, [{ entity: 'hammer', state: 'held' }]);
});

test('an item can drive a mechanism through a rule', () => {
  const solved = play(axeLevel(), [{ tick: 250, source: 'axe' }, { tick: 520, source: 'hammer' }]);
  assert.equal(solved.status, 'won');
  assert.equal(solved.entities.gate.state, 'open');
});

test('a mechanism can drive an item through a rule', () => {
  const level = axeLevel();
  level.entities.push({ id: 'plate', kind: 'plate', x: 400, width: 40, state: 'idle', label: '压力板' });
  level.rules.push({
    id: 'plate-drops-axe',
    on: { type: 'enter', source: 'plate' },
    if: [{ entity: 'axe', state: 'held' }],
    actions: [{ type: 'set', target: 'axe', state: 'idle' }],
  });
  assert.equal(validateDoc(level).ok, true);
  const state = play(level);
  assert.equal(state.entities.axe.state, 'idle', '机关把物品放回了地面');
  assert.equal(state.actor.holding, 'hammer', '手空出来之后才拿得起锤子');
});

test('cross-category actions are validated against the target factory', () => {
  const level = axeLevel();
  level.rules.push({
    on: { type: 'click', source: 'hammer' },
    actions: [{ type: 'set', target: 'gate', state: 'folded' }],
  });
  const result = validateDoc(level);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'REFERENCE_INVALID' && error.path.endsWith('.state')),
    'gate 没有 folded 状态，跨类别写状态必须被拒');
});

test('physical interaction happens in shared phases, not inside a factory', () => {
  const level = axeLevel();
  const axe = level.entities.find((entity) => entity.id === 'axe');
  axe.capabilities = { holdable: false, clickable: {} };
  axe.x = 940;
  const state = play(level);
  assert.equal(state.status, 'lost');
  assert.equal(state.reason, 'hurt', '接触伤害（onContact）先于阻挡（onBlock）');
});

test('the platform groups interpreters by data kind and types by content factory', () => {
  const platform = describePlatform();
  assert.deepEqual(platform.factories.map((factory) => factory.category), ['map', 'mechanism', 'item']);
  assert.deepEqual(platform.factories.map((factory) => factory.kinds.length), [0, 6, 2]);
  assert.deepEqual(platform.types.map((type) => type.category), ['mechanism', 'mechanism', 'mechanism', 'mechanism', 'mechanism', 'mechanism', 'item', 'item']);
});
