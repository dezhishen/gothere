import test from 'node:test';
import assert from 'node:assert/strict';

import * as core from '../src/core/engine.js';

const fixture = () => ({
  schemaVersion: 1, id: 'fixture', name: '测试关卡', description: '测试',
  world: { width: 1200, height: 640, groundY: 440 },
  actor: { x: 80, speed: 90 }, goal: { x: 1100 },
  platforms: [{ x: 0, width: 360 }, { x: 500, width: 700 }],
  entities: [
    { id: 'bridge', kind: 'bridge', x: 360, width: 140, state: 'folded', label: '桥' },
    { id: 'lever', kind: 'switch', x: 260, state: 'off', label: '开关' },
  ],
  rules: [{ on: { type: 'click', source: 'lever' }, actions: [
    { type: 'set', target: 'bridge', state: 'extended' },
    { type: 'set', target: 'lever', state: 'on' },
  ] }],
});

test('provides a headless simulation independent of the renderer', () => {
  assert.equal(typeof core.createSimulation, 'function');
});

{
  const { createSimulation, validateLevel, replayRecording } = core;
  test('does not mutate the input level', () => {
    const level = fixture(); const before = structuredClone(level);
    const game = createSimulation(level); game.start(); game.click('lever'); game.step(100);
    assert.deepEqual(level, before);
  });
  test('the automatic walker falls when no bridge is deployed', () => {
    const game = createSimulation(fixture()); game.start(); game.step(1000);
    assert.equal(game.snapshot().status, 'lost');
    assert.equal(game.snapshot().reason, 'fall');
  });
  test('click rules deploy a bridge and allow reaching the goal', () => {
    const game = createSimulation(fixture()); game.start(); game.click('lever'); game.step(1000);
    assert.equal(game.snapshot().status, 'won');
    assert.equal(game.snapshot().entities.bridge.state, 'extended');
  });
  test('ready and paused states do not advance, while single-step is explicit', () => {
    const game = createSimulation(fixture()); game.step(50);
    assert.equal(game.snapshot().tick, 0); game.start(); game.step(20); game.pause(); game.step(50);
    assert.equal(game.snapshot().tick, 20); game.singleStep();
    assert.equal(game.snapshot().tick, 21); assert.equal(game.snapshot().status, 'paused');
    game.start(); game.step(); assert.equal(game.snapshot().tick, 22);
  });
  test('reset restores actor, entities, input log, pending actions and clock', () => {
    const game = createSimulation(fixture()); const initial = game.snapshot();
    game.start(); game.click('lever'); game.step(100); game.reset();
    assert.deepEqual(game.snapshot(), initial);
    assert.deepEqual(game.recording().inputs, []);
  });
  test('delay expires at the specified tick', () => {
    const level = fixture(); level.rules[0].actions.push({ type: 'after', ticks: 90, actions: [
      { type: 'set', target: 'bridge', state: 'folded' },
    ] });
    const game = createSimulation(level); game.start(); game.click('lever'); game.step();
    assert.equal(game.snapshot().entities.bridge.state, 'extended');
    game.step(89); assert.equal(game.snapshot().entities.bridge.state, 'extended');
    game.step(); assert.equal(game.snapshot().entities.bridge.state, 'folded');
  });
  test('rules respect state conditions', () => {
    const level = fixture(); level.rules[0].if = [{ entity: 'lever', state: 'on' }];
    const game = createSimulation(level); game.start(); game.click('lever'); game.step();
    assert.equal(game.snapshot().entities.bridge.state, 'folded');
  });
  test('input replay reproduces the exact terminal state', () => {
    const level = fixture(); const game = createSimulation(level); game.start(); game.step(45);
    game.click('lever'); game.step(1000);
    const played = replayRecording(level, game.recording());
    assert.deepEqual(played.snapshot(), game.snapshot());
  });
  test('entering a plate triggers a data-defined gate rule', () => {
    const level = fixture(); level.platforms = [{ x: 0, width: 1200 }];
    level.entities.push({ id: 'plate', kind: 'plate', x: 190, width: 45, state: 'idle', label: '压力板' },
      { id: 'gate', kind: 'gate', x: 350, width: 20, state: 'closed', label: '门' });
    level.rules.push({ on: { type: 'enter', source: 'plate' }, actions: [
      { type: 'set', target: 'gate', state: 'open' },
    ] });
    const game = createSimulation(level); game.start(); game.step(1000);
    assert.equal(game.snapshot().status, 'won');
    assert.equal(game.snapshot().entities.plate.state, 'pressed');
    assert.equal(game.snapshot().entities.gate.state, 'open');
  });
  test('unresolved gates and hazards stop the walker', () => {
    for (const [kind, state] of [['gate', 'closed'], ['hazard', 'running']]) {
      const level = fixture(); level.platforms = [{ x: 0, width: 1200 }];
      level.entities.push({ id: 'danger', kind, x: 200, width: 30, state, label: '危险' });
      const game = createSimulation(level); game.start(); game.step(1000);
      assert.equal(game.snapshot().status, 'lost');
      assert.equal(game.snapshot().reason, kind);
    }
  });
  test('rejects invalid references, duplicate ids, invalid states and unbounded delayed recursion', () => {
    const invalid = [];
    const a = fixture(); a.rules[0].actions[0].target = 'missing'; invalid.push(a);
    const b = fixture(); b.entities[1].id = 'bridge'; invalid.push(b);
    const c = fixture(); c.rules[0].actions[0].state = 'nonsense'; invalid.push(c);
    const d = fixture(); d.actor.speed = -5; invalid.push(d);
    const e = fixture(); e.rules[0].actions.push({ type: 'after', ticks: 0, actions: [] }); invalid.push(e);
    for (const level of invalid) {
      assert.equal(validateLevel(level).valid, false);
      assert.throws(() => createSimulation(level));
    }
  });
}
