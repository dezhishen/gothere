// 类型是**纯 JSON**：types/<category>/<kind>.type.json。
// 这组测试守住三件事：
//   1) 仓库里的 JSON 全部合法，且 manifest 与目录一一对应；
//   2) 每个类型都真的注册进了平台（没有“文件在、平台不认”的漂移）；
//   3) 加一个 JSON 就能多一种机关/物品——不碰任何代码。

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTypes } from '../src/core/interpreters/factories/types.ts';
import { resetFactories } from '../src/core/interpreters/factories/index.ts';
import { describe, listTypes } from '../src/core/contract/registry.ts';
import { validateLevel } from '../src/core/contract/validate.ts';
import { createGame } from '../src/core/interpreters/index.ts';
import { readBuiltinTypes } from './types-fixture.mjs';

const trapdoor = {
  category: 'mechanism',
  kind: 'trapdoor',
  version: 1,
  defaultWidth: 40,
  iconOffset: 96,
  art: 'gate',
  states: [{ id: 'shut', label: '关着' }, { id: 'open', label: '打开' }],
  slots: {
    reacts: { on: 'input', from: 'shut', actions: [{ type: 'become', state: 'open' }] },
    blocks: { inState: 'shut', reason: 'gate', message: '翻板关着，过不去。' },
  },
};

const play = (level, inputs = []) => {
  const game = createGame(level);
  game.start();
  let index = 0;
  for (let tick = 1; tick <= 2400 && game.snapshot().status === 'running'; tick += 1) {
    while (index < inputs.length && inputs[index].tick === tick) game.click(inputs[index++].source);
    game.step();
  }
  return game.snapshot();
};

test('仓库里的类型 JSON 全部合法，且 manifest 与目录一一对应', async () => {
  const result = await readBuiltinTypes();
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.deepEqual(result.files, result.manifest.files, 'manifest 的顺序就是加载顺序');
  assert.deepEqual([...result.discovered].sort(), [...result.manifest.files].sort(),
    '目录里的每个 .type.json 都要登记到 types/manifest.json');
});

test('每个类型文件都注册成了平台类型（状态与声明槽一致）', async () => {
  const { types } = await readBuiltinTypes();
  for (const [category, kinds] of Object.entries(types)) {
    for (const [kind, definition] of Object.entries(kinds)) {
      const described = describe(kind);
      assert.ok(described, kind + ' 应当已注册到平台');
      assert.equal(described.category, category);
      assert.equal(described.art, definition.art ?? kind);
      assert.deepEqual(described.states.map((state) => state.id), definition.states.map((state) => state.id));
      assert.deepEqual(described.slots.map((slot) => slot.name), Object.keys(definition.slots));
    }
  }
  const registered = listTypes().map((type) => type.id).sort();
  const fromFiles = Object.values(types).flatMap((kinds) => Object.keys(kinds)).sort();
  assert.deepEqual(registered, fromFiles, '平台类型表必须与 JSON 数据一致');
});

test('只加一个 JSON（同时在 manifest 里登记一行）就能多一种机关', async () => {
  const builtin = await readBuiltinTypes();
  const added = parseTypes([
    { name: 'mechanism/switch.type.json', data: builtin.types.mechanism.switch },
    { name: 'mechanism/trapdoor.type.json', data: trapdoor },
  ]);
  assert.ok(added.ok, JSON.stringify(added.errors));
  assert.deepEqual(Object.keys(added.types.mechanism), ['switch', 'trapdoor'], '顺序按传入顺序');
  assert.equal(added.files.at(-1), 'mechanism/trapdoor.type.json');

  // 装上之后平台立刻认识它，且能真的跑通一关。
  resetFactories(added.types);
  assert.equal(describe('trapdoor').art, 'gate', '画法复用现成图元，渲染代码不用动');
  const level = {
    schemaVersion: 1, id: 'trapdoor-demo', name: '翻板', description: '只加了一个 JSON。',
    world: { width: 1200, height: 640, groundY: 440 }, actor: { x: 60, speed: 64 }, goal: { x: 1100 },
    platforms: [{ x: 0, width: 1200 }],
    entities: [{ id: 'trapdoor-1', kind: 'trapdoor', x: 600, width: 40, label: '翻板', state: 'shut' }],
    rules: [],
  };
  assert.ok(validateLevel(level).valid, JSON.stringify(validateLevel(level).errors));
  assert.equal(play(level).status, 'lost', '关着的翻板挡住去路');
  assert.equal(play(level, [{ tick: 2, source: 'trapdoor-1' }]).status, 'won');
});

test('坏数据在装载时就被挡住，而不是运行时才炸', () => {
  const cases = [
    ['文件名与 kind 不一致', 'mechanism/a.type.json', { ...trapdoor, kind: 'b' }],
    ['未知类别', 'item/c.type.json', { ...trapdoor, category: 'trap', kind: 'c' }],
    ['没有状态', 'item/d.type.json', { ...trapdoor, category: 'item', kind: 'd', states: [] }],
    ['状态 id 重复', 'item/e.type.json', { ...trapdoor, category: 'item', kind: 'e', states: [{ id: 'x', label: 'X' }, { id: 'x', label: 'Y' }] }],
    ['hiddenStates 指向不存在的状态', 'item/f.type.json', { ...trapdoor, category: 'item', kind: 'f', hiddenStates: ['nope'] }],
    ['kind 大写', 'item/Bad.type.json', { ...trapdoor, category: 'item' }],
    ['槽参数不是对象', 'item/g.type.json', { ...trapdoor, category: 'item', kind: 'g', slots: { reacts: 1 } }],
  ];
  for (const [name, file, data] of cases) {
    const result = parseTypes([{ name: file, data }]);
    assert.equal(result.ok, false, name + ' 应当被拒绝');
  }
});
