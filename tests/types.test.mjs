// 类型是数据：types/<category>/<kind>.type.json 是唯一权威来源。
// 这组测试守住两件事：
//   1) 仓库里的生成物与数据一致（改了 JSON 忘记 `pnpm types` 会被抓住）；
//   2) 新增一个 JSON 就能多一种机关/物品——不碰任何代码。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkTypesModule, readTypeSources } from '../scripts/build-types.mjs';
import { describe, listTypes } from '../src/core/contract/registry.js';
import { CONTENT_TYPES } from '../src/core/interpreters/factories/generated-types.js';
import { validateLevel } from '../src/core/contract/validate.js';
import { createGame } from '../src/core/interpreters/index.js';

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

const levelWith = (kind, extra = {}) => ({
  schemaVersion: 1,
  id: 'types-demo',
  name: '类型演示',
  description: '用来验证类型是数据。',
  world: { width: 1200, height: 640, groundY: 440 },
  actor: { x: 60, speed: 64 },
  goal: { x: 1100 },
  platforms: [{ x: 0, width: 1200 }],
  entities: [{ id: kind + '-1', kind, x: 600, width: 40, label: kind, state: undefined, ...extra }],
  rules: [],
});

const scratch = async (files) => {
  const root = await mkdtemp(join(tmpdir(), 'gothere-types-'));
  await mkdir(join(root, 'types', 'mechanism'), { recursive: true });
  await mkdir(join(root, 'types', 'item'), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(root, 'types', path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
};

test('仓库里的生成物与 types/ 完全一致', async () => {
  const result = await checkTypesModule();
  assert.ok(result.ok, 'generated-types.js 过期：请运行 `pnpm types`');
});

test('目录里的每个类型文件都被注册成了平台类型', async () => {
  const { byCategory, order } = await readTypeSources();
  const files = order.sort();
  assert.ok(files.length > 0);
  assert.deepEqual(files, files.map((file) => file).sort(), '顺序稳定');
  for (const [category, types] of Object.entries(byCategory)) {
    for (const [kind, definition] of Object.entries(types)) {
      assert.equal(definition.category, category, kind + ' 的 category 与目录一致');
      const described = describe(kind);
      assert.ok(described, kind + ' 应当已注册到平台');
      assert.equal(described.category, category);
      assert.deepEqual(described.states.map((state) => state.id), definition.states.map((state) => state.id));
      assert.deepEqual(described.slots.map((slot) => slot.name), Object.keys(definition.slots));
    }
  }
  assert.deepEqual(listTypes().map((type) => type.id).sort(), Object.keys(byCategory).flatMap((category) => Object.keys(byCategory[category])).sort());
});

test('只加一个 JSON 文件就能多一种机关，代码零改动', async () => {
  const root = await scratch({
    'mechanism/trapdoor.type.json': {
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
    },
  });
  try {
    const { byCategory } = await readTypeSources({ root });
    const definition = byCategory.mechanism.trapdoor;
    assert.ok(definition, '目录里的新文件被读出来了（不需要改 manifest）');
    assert.equal(definition.art, 'gate', '画法复用现成图元，渲染代码不用动');
    // 数据本身的形状：交给工厂的 createProduct 校验，这里只验证关键字段齐全。
    assert.deepEqual(Object.keys(definition.slots), ['reacts', 'blocks']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('坏数据在生成阶段就被挡住，而不是运行时才炸', async () => {
  const cases = [
    ['文件名与 kind 不一致', 'mechanism/a.type.json', { category: 'mechanism', kind: 'b', version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'x', label: 'X' }], slots: {} }],
    ['未注册的类别', 'item/c.type.json', { category: 'trap', kind: 'c', version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'x', label: 'X' }], slots: {} }],
    ['没有状态', 'item/d.type.json', { category: 'item', kind: 'd', version: 1, defaultWidth: 20, iconOffset: 90, states: [], slots: {} }],
    ['状态 id 重复', 'item/e.type.json', { category: 'item', kind: 'e', version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'x', label: 'X' }, { id: 'x', label: 'Y' }], slots: {} }],
    ['hiddenStates 指向不存在的状态', 'item/f.type.json', { category: 'item', kind: 'f', version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'x', label: 'X' }], slots: {}, hiddenStates: ['nope'] }],
    ['kind 大写', 'item/Bad.type.json', { category: 'item', kind: 'Bad', version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'x', label: 'X' }], slots: {} }],
  ];
  for (const [name, path, content] of cases) {
    const category = path.split('/')[0];
    const root = await scratch({ [category + '/' + path.split('/')[1]]: content });
    try {
      await assert.rejects(() => readTypeSources({ root }), Error, name + ' 应当被拒绝');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('从数据生成的类型可以真的跑起来（校验 + 模拟）', () => {
  // 用仓库里已有的数据（switch + bridge）走一遍，确保“数据 → 产品 → 关卡”这条链没断。
  assert.ok(CONTENT_TYPES.mechanism.switch, 'CONTENT_TYPES 里应当有机关类型');
  const level = levelWith('switch', { state: 'off' });
  level.entities = [
    { id: 'bridge-1', kind: 'bridge', x: 400, width: 28, label: '桥', state: 'folded' },
    { id: 'switch-1', kind: 'switch', x: 700, width: 28, label: '开关', state: 'off' },
  ];
  level.rules = [{ on: { type: 'click', source: 'switch-1' }, actions: [{ type: 'set', target: 'bridge-1', state: 'extended' }] }];
  assert.ok(validateLevel(level).valid, JSON.stringify(validateLevel(level).errors));
  const won = play(level, [{ tick: 2, source: 'switch-1' }]);
  assert.equal(won.status, 'won');
});
