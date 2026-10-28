import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/kernel/engine.ts';
import { replayRecording } from '../src/core/kernel/replay.ts';
import { levels } from './levels-fixture.mjs';

test('imported rules cannot accumulate an unbounded pending timer queue', () => {
  const level=structuredClone(levels[0]);
  // 让开关不改变自己的状态：每次点击都能真的触发连线表，才测得到计时器上限。
  level.entities.find((entity)=>entity.id==='lever').reacts={actions:[]};
  level.rules=[{on:{type:'click',source:'lever'},actions:[
    {type:'after',ticks:3600,actions:[{type:'set',target:'bridge',state:'extended'}]},
  ]}];
  const game=createSimulation(level);game.start();
  for(let tick=0;tick<9;tick++){for(let i=0;i<32;i++)game.click('lever');game.step();}
  assert.equal(game.snapshot().status,'lost');
  assert.equal(game.snapshot().reason,'limit');
  assert.ok(game.snapshot().timers.length<=256);
  assert.deepEqual(replayRecording(level,game.recording()).snapshot(),game.snapshot());
});
test('excessive rule work stops cleanly within one tick', () => {
  const level=structuredClone(levels[0]);
  level.entities.find((entity)=>entity.id==='lever').reacts={actions:[]};
  level.rules=Array.from({length:16},()=>({on:{type:'click',source:'lever'},actions:
    Array.from({length:32},()=>({type:'set',target:'bridge',state:'folded'}))}));
  const game=createSimulation(level);game.start();
  for(let i=0;i<3;i++)game.click('lever');game.step();
  assert.equal(game.snapshot().status,'lost');
  assert.equal(game.snapshot().reason,'limit');
  assert.deepEqual(replayRecording(level,game.recording()).snapshot(),game.snapshot());
});
