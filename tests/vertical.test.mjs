import test from 'node:test';
import assert from 'node:assert/strict';

import { compileModel } from '../src/core/contract/compile.js';
import { validateDoc } from '../src/core/contract/validate.js';
import { createGame } from '../src/core/interpreters/index.js';
import { levels } from './levels-fixture.mjs';

const level5 = () => structuredClone(levels.find((level) => level.id === 'up-and-down'));

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

test('the map declares floors and stairs, and the model carries the terrain', () => {
  const model = compileModel(level5());
  assert.deepEqual(model.platforms.map((platform) => platform.y), [440, 300, 440]);
  assert.equal(model.stairs.length, 1);
  assert.equal(model.actor.y, 440);
  assert.equal(model.goal.y, 440);
  assert.deepEqual(model.terrain.at(560).map((surface) => surface.kind), ['stairs']);
  assert.deepEqual(model.terrain.at(200).map((surface) => surface.y), [440]);
});

test('riding the lift changes the foot height by a whole floor in one tick', () => {
  const game = createGame(level5());
  game.start();
  const heights = [];
  for (let tick = 1; tick <= 260; tick += 1) {
    if (tick === 200) game.click('lever');
    game.step();
    heights.push(game.snapshot().actor.y);
  }
  assert.equal(heights[0], 440);
  assert.ok(heights.includes(300), '电梯把角色送到了二楼');
  const jump = Math.max(...heights.map((value, index) => (index === 0 ? 0 : Math.abs(value - heights[index - 1]))));
  assert.equal(jump, 140, '乘梯时脚底一次跨一层，而不是掉下去');
});

test('stairs carry the traveller down without any input', () => {
  const state = play(level5(), [{ tick: 200, source: 'lever' }]);
  assert.equal(state.status, 'won');
  assert.equal(state.actor.y, 440, '走完楼梯又回到地面');
});

test('the lift does not wait: calling it too early means falling into the shaft', () => {
  const state = play(level5(), [{ tick: 60, source: 'lever' }]);
  assert.equal(state.status, 'lost');
  assert.equal(state.reason, 'fall');
});

test('the same x on another floor is a different place', () => {
  const withLowerGate = level5();
  withLowerGate.entities.push({ id: 'gate-low', kind: 'gate', x: 400, width: 28, state: 'closed', label: '楼下栅栏' });
  assert.equal(play(withLowerGate, [{ tick: 200, source: 'lever' }]).status, 'won', '楼下的门挡不住楼上的路');

  const withUpperGate = level5();
  withUpperGate.entities.push({ id: 'gate-up', kind: 'gate', x: 400, width: 28, state: 'closed', label: '楼上栅栏', y: 300 });
  const blocked = play(withUpperGate, [{ tick: 200, source: 'lever' }]);
  assert.equal(blocked.status, 'lost');
  assert.equal(blocked.reason, 'gate', '同一层就挡得住');
});

test('the goal also has a floor', () => {
  const doc = level5();
  doc.goal = { ...doc.goal, y: 300 };
  const state = play(doc, [{ tick: 200, source: 'lever' }], 1200);
  assert.equal(state.status, 'running');
  assert.equal(Math.round(state.actor.x), 1120, '走到终点线但不在那一层，不算到达');
});

test('stairs and floors are validated like other map data', () => {
  const outside = level5();
  outside.stairs = [{ x: 1100, width: 200, fromY: 300, toY: 440 }];
  const stairResult = validateDoc(outside);
  assert.equal(stairResult.ok, false);
  assert.ok(stairResult.errors.some((error) => error.path === 'stairs[0]'));

  const tooHigh = level5();
  tooHigh.platforms[1].y = 100;
  const floorResult = validateDoc(tooHigh);
  assert.equal(floorResult.ok, false);
  assert.ok(floorResult.errors.some((error) => error.path.startsWith('platforms[')));
});
