import test from 'node:test';
import assert from 'node:assert/strict';
import { levels } from './levels-fixture.mjs';
import { createSimulation } from '../src/core/kernel/engine.js';
import { replayRecording } from '../src/core/kernel/replay.js';
import { validateLevel } from '../src/core/contract/validate.js';

const solutions = [
  [{ tick: 1, source: 'lever' }],
  [{ tick: 301, source: 'fan' }],
  [{ tick: 181, source: 'lever' }, { tick: 501, source: 'fan' }],
  [{ tick: 250, source: 'axe' }, { tick: 520, source: 'hammer' }],
  [{ tick: 200, source: 'lever' }],
  [
    { tick: 150, source: 'axe' },
    { tick: 200, source: 'guard' },
    { tick: 520, source: 'bridge-switch' },
    { tick: 800, source: 'lift-switch' },
  ],
];
for (const [index, level] of levels.entries()) {
  test(level.name + ': validates and cannot be won without intervention', () => {
    assert.equal(validateLevel(level).valid, true);
    const game = createSimulation(level); game.start().step(2000);
    assert.equal(game.snapshot().status, 'lost');
  });
  test(level.name + ': known solution wins and exactly replays', () => {
    const game = createSimulation(level); game.start();
    for (let tick = 1; tick <= 2000 && game.snapshot().status === 'running'; tick++) {
      for (const input of solutions[index].filter((item) => item.tick === tick)) assert.equal(game.click(input.source), true);
      game.step();
    }
    assert.equal(game.snapshot().status, 'won');
    assert.deepEqual(replayRecording(level, game.recording()).snapshot(), game.snapshot());
  });
}
test('activating both timed mechanisms at the beginning is not a solution', () => {
  const game = createSimulation(levels[2]); game.start(); game.click('lever'); game.click('fan'); game.step(2000);
  assert.equal(game.snapshot().status, 'lost');
});
test('terminal games ignore further clicks and steps; reset allows a fresh attempt', () => {
  const game = createSimulation(levels[0]); assert.equal(game.click('lever'), false);
  game.start(); assert.equal(game.click('missing'), false); assert.equal(game.click('bridge'), false);
  game.step(2000); const end = game.snapshot();
  game.start().pause().singleStep().step(50);
  assert.deepEqual(game.snapshot(), end); assert.equal(game.click('lever'), false);
  game.reset().start(); assert.equal(game.click('lever'), true);
});
test('pending input is not applied while paused and snapshots are isolated', () => {
  const game = createSimulation(levels[0]); game.start(); game.click('lever'); game.pause().step(3);
  assert.equal(game.snapshot().entities.bridge.state, 'folded');
  assert.equal(game.click('lever'), false); game.start().step();
  const state = game.snapshot(); state.entities.bridge.state = 'folded';
  assert.equal(game.snapshot().entities.bridge.state, 'extended');
});
test('a single step from ready pauses after exactly one tick', () => {
  const game = createSimulation(levels[0]); game.singleStep();
  assert.equal(game.snapshot().tick, 1); assert.equal(game.snapshot().status, 'paused');
});
test('simulation rejects invalid step counts', () => {
  const game = createSimulation(levels[0]);
  for (const count of [-1, 1.5, NaN, Infinity, 36001]) assert.throws(() => game.step(count));
  game.step(0); assert.equal(game.snapshot().tick, 0);
});
test('recording validates malformed, mismatched and impossible operation streams', () => {
  const base = { schemaVersion: 1, levelId: levels[0].id, inputs: [], untilTick: 1, status: 'running' };
  for (const recording of [null, {}, { ...base, levelId: 'other' }, { ...base, untilTick: -1 },
    { ...base, untilTick: 36001 }, { ...base, inputs: [{ tick: 0, source: 'lever' }] },
    { ...base, inputs: [{ tick: 2, source: 'lever' }] },
    { ...base, inputs: [{ tick: 1, source: 3 }] },
    { ...base, inputs: [{ tick: 1, source: 'missing' }] },
    { ...base, status: 'won' }, { ...base, untilTick: 2000, status: 'lost' }]) {
    assert.throws(() => replayRecording(levels[0], recording));
  }
});
test('ready and paused recordings preserve their status', () => {
  const game = createSimulation(levels[0]);
  assert.deepEqual(replayRecording(levels[0], game.recording()).snapshot(), game.snapshot());
  game.start().step(40).pause();
  assert.deepEqual(replayRecording(levels[0], game.recording()).snapshot(), game.snapshot());
});
test('same tick inputs preserve their declared order', () => {
  const level = structuredClone(levels[0]);
  level.rules.push({ on: { type: 'click', source: 'lever' }, if: [{ entity: 'lever', state: 'on' }],
    actions: [{ type: 'set', target: 'bridge', state: 'folded' }] });
  const game = createSimulation(level); game.start(); game.click('lever'); game.step();
  assert.equal(game.snapshot().entities.bridge.state, 'folded');
});
test('later scheduled actions execute deterministically when due times match', () => {
  const level = structuredClone(levels[0]);
  level.rules[0].actions = [
    { type: 'after', ticks: 10, actions: [{ type: 'set', target: 'bridge', state: 'extended' }] },
    { type: 'after', ticks: 10, actions: [{ type: 'set', target: 'bridge', state: 'folded' }] },
  ];
  const game = createSimulation(level); game.start(); game.click('lever'); game.step(11);
  assert.equal(game.snapshot().entities.bridge.state, 'folded');
});
test('nested delayed actions schedule relative to the tick of execution', () => {
  const level = structuredClone(levels[0]);
  level.rules[0].actions = [{ type: 'after', ticks: 3, actions: [
    { type: 'after', ticks: 4, actions: [{ type: 'set', target: 'bridge', state: 'extended' }] },
  ] }];
  const game = createSimulation(level); game.start(); game.click('lever'); game.step(7);
  assert.equal(game.snapshot().entities.bridge.state, 'folded'); game.step();
  assert.equal(game.snapshot().entities.bridge.state, 'extended');
});
test('missing width is normalized and input queues are bounded', () => {
  const level = structuredClone(levels[0]); delete level.entities[1].width;
  const game = createSimulation(level); game.start();
  for(let i=0;i<32;i++) assert.equal(game.click('lever'), true);
  assert.equal(game.click('lever'), false); game.step();
  assert.equal(game.snapshot().entities.lever.width, 28);
});
test('invalid geometry, malformed DSL and unknown capabilities are rejected safely', () => {
  for (const input of [null, [], 3, 'hello']) assert.equal(validateLevel(input).valid, false);
  const mutate = [
    l=>l.schemaVersion=2, l=>l.id='__proto__', l=>l.name='', l=>l.description='', l=>l.hint=3,
    l=>l.world=null, l=>l.actor=null, l=>l.goal=null, l=>l.platforms=[], l=>l.platforms=[null],
    l=>l.entities=null, l=>l.entities=[null], l=>l.entities[0].kind='arbitrary-code',
    l=>l.entities[0].state='missing', l=>l.entities[0].x=1199, l=>l.entities[0].label='',
    l=>l.rules=null, l=>l.rules=[null], l=>l.rules[0].on=null,
    l=>l.rules[0].on.source='missing', l=>l.rules[0].if=null, l=>l.rules[0].if=[null],
    l=>l.rules[0].if=[{entity:'missing',state:'off'}], l=>l.rules[0].actions=[],
    l=>l.rules[0].actions=[null], l=>l.rules[0].actions=[{type:'eval',code:'alert(1)'}],
    l=>l.rules[0].actions=[{type:'after',ticks:1,actions:[]}],
    l=>l.actor.x=500, l=>l.goal.x=500,
  ];
  for(const change of mutate) {
    const level=structuredClone(levels[0]); change(level);
    assert.equal(validateLevel(level).valid,false, String(change));
  }
});
