// 扩展性守护：新增一种解析结果（类型 / 工厂）时，**只改它自己的文件**就该全通。
// 这份测试不看具体数量、不列内建清单，因此新增机关或物品不会让它失败；
// 它会失败，只会是因为平台里出现了新的硬编码耦合。

import test from 'node:test';
import assert from 'node:assert/strict';

import { createFactory } from '../src/core/interpreters/factories/factory.js';
import { registerFactory, resetFactories, unregisterFactory } from '../src/core/interpreters/factories/index.js';
import { describe, listTypes, typeDescriptor } from '../src/core/contract/registry.js';
import { validateLevel } from '../src/core/contract/validate.js';
import { createGame, describePlatform } from '../src/core/interpreters/index.js';

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

/** 一个新机关：翻板。它只声明自己（状态、挡住、被点时打开），不认识任何别的东西。 */
const trapdoorFactory = () => createFactory({
  category: 'mechanism',
  version: 1,
  schema: { label: '机关', slots: ['reacts', 'blocks'] },
  types: {
    trapdoor: {
      version: 1,
      defaultWidth: 40,
      iconOffset: 96,
      art: 'gate', // 复用现有画法：渲染器不用改
      states: [{ id: 'shut', label: '关着' }, { id: 'open', label: '打开' }],
      slots: {
        reacts: { on: 'input', from: 'shut', actions: [{ type: 'become', state: 'open' }] },
        blocks: { inState: 'shut', reason: 'gate', message: '翻板关着，过不去。' },
      },
    },
  },
});

const levelWithTrapdoor = () => ({
  schemaVersion: 1,
  id: 'trapdoor-demo',
  name: '翻板',
  description: '只用一个新类型搭出来的关卡。',
  world: { width: 1200, height: 640, groundY: 440 },
  actor: { x: 60, speed: 64 },
  goal: { x: 1100 },
  platforms: [{ x: 0, width: 1200 }],
  entities: [
    { id: 'trapdoor-1', kind: 'trapdoor', x: 600, width: 40, label: '翻板', state: 'shut' },
  ],
  rules: [],
});

test.beforeEach(() => resetFactories());
test.afterEach(() => resetFactories());

test('只注册一个新类型：校验、模拟、平台描述全部自动认识它', () => {
  unregisterFactory('mechanism');
  registerFactory(trapdoorFactory());

  // 1) 契约层：类型可查、外观由类型自己声明
  const described = describe('trapdoor');
  assert.equal(described.category, 'mechanism');
  assert.equal(described.art, 'gate', '画法名跟着类型走，渲染器按名字取图元');
  assert.deepEqual(described.states.map((state) => state.id), ['shut', 'open']);

  // 2) 校验层：不需要给校验器加任何规则
  const level = levelWithTrapdoor();
  const report = validateLevel(level);
  assert.ok(report.valid, JSON.stringify(report.errors));

  // 3) 内核层：被点一下就开，然后角色走过去
  const blocked = play(level);
  assert.equal(blocked.status, 'lost', '关着的翻板应该挡住去路');
  const solved = play(level, [{ tick: 2, source: 'trapdoor-1' }]);
  assert.equal(solved.status, 'won');
  assert.equal(solved.entities['trapdoor-1'].state, 'open');

  // 4) 平台描述层：CLI / SKILL.md / 浏览器里的 agent 读的就是它
  const platform = describePlatform();
  assert.ok(platform.types.some((type) => type.id === 'trapdoor'));
  const mechanism = platform.factories.find((factory) => factory.category === 'mechanism');
  assert.deepEqual(mechanism.kinds, ['trapdoor']);

  // 5) 注册表与工厂始终一致（新增类型不该出现“描述里有一份、工厂里另一份”）
  assert.deepEqual(platform.types.map((type) => type.id), listTypes().map((type) => type.id));
});

test('新工厂只要实现接口就能替换整个类别，其他代码不动', () => {
  const replaced = createFactory({
    category: 'item',
    version: 1,
    schema: { label: '物品', slots: ['tags', 'carryable'] },
    types: {
      lantern: {
        version: 1, defaultWidth: 24, iconOffset: 92,
        tags: ['light'],
        states: [{ id: 'out', label: '熄着' }, { id: 'lit', label: '亮着' }],
        slots: { carryable: {} },
      },
    },
  });
  unregisterFactory('item');
  registerFactory(replaced);

  const type = typeDescriptor('lantern');
  assert.equal(type.category, 'item');
  assert.deepEqual(type.tags, ['light']);
  assert.equal(type.art, 'lantern', '没声明画法时默认用类型名，渲染器兜底为占位图');

  // 只放新物品，不带任何机关，验证「换掉整个类别」后仍然自成闭环。
  const level = { ...levelWithTrapdoor(), id: 'lantern-demo' };
  level.entities = [{ id: 'lantern-1', kind: 'lantern', x: 300, width: 24, label: '灯笼', state: 'out' }];
  const report = validateLevel(level);
  assert.ok(report.valid, JSON.stringify(report.errors));
  assert.equal(play(level).status, 'won', '没有任何阻碍时角色应当走到终点');

  const platform = describePlatform();
  const item = platform.factories.find((factory) => factory.category === 'item');
  assert.deepEqual(item.kinds, ['lantern']);
  assert.equal(platform.types.find((type) => type.id === 'lantern').tags[0], 'light');
});

test('平台的内建类型之间没有隐式的数量耦合', () => {
  const platform = describePlatform();
  assert.equal(platform.types.length, listTypes().length);
  for (const factory of platform.factories) {
    const declared = platform.types.filter((type) => type.category === factory.category).map((type) => type.id);
    assert.deepEqual(factory.kinds, declared, factory.category + ' 的 kinds 必须与平台类型表一致');
  }
});
