import test from 'node:test';
import assert from 'node:assert/strict';

import { CATEGORIES, FACTORY_METHODS, createFactory } from '../src/core/interpreters/factories/factory.js';
import {
  createType,
  factoryFor,
  getFactory,
  listFactories,
  registerFactory,
  resetFactories,
} from '../src/core/interpreters/factories/index.js';
import { fieldsOfCategory, listTypes, schemaOfCategory } from '../src/core/contract/registry.js';
import { validateDoc } from '../src/core/contract/validate.js';
import { levels } from './levels-fixture.mjs';
import { installBuiltinTypes } from './types-fixture.mjs';

test.beforeEach(async () => { await installBuiltinTypes(); });

test('the system has exactly three content factories: map / mechanism / item', () => {
  assert.deepEqual([...CATEGORIES], ['map', 'mechanism', 'item']);
  const factories = listFactories();
  assert.deepEqual(factories.map((factory) => factory.category), ['map', 'mechanism', 'item']);
  assert.deepEqual(getFactory('map').kinds, []);
  // 不写死类型清单：新增机关/物品只改它自己的工厂，这里必须照常通过。
  for (const category of ['mechanism', 'item']) {
    const kinds = getFactory(category).kinds;
    assert.ok(kinds.length > 0, category + ' 至少要有一个内建类型');
    assert.equal(new Set(kinds).size, kinds.length, category + ' 的类型不能重名');
    assert.deepEqual(kinds, listTypes().filter((type) => type.category === category).map((type) => type.id),
      '工厂的 kinds 必须与注册表一致');
  }
});

test('every category owns its own schema, so the field sets differ', () => {
  const item = schemaOfCategory('item');
  const mechanism = schemaOfCategory('mechanism');
  assert.equal(item.label, '物品');
  assert.equal(mechanism.label, '机关');
  assert.deepEqual(item.slots, ['tags', 'reacts', 'harms', 'carryable']);
  assert.deepEqual(mechanism.slots, ['reacts', 'blocks', 'harms', 'moves', 'ground', 'lifts']);
  assert.deepEqual(schemaOfCategory('map').slots, []);
  assert.notDeepEqual(fieldsOfCategory('item'), fieldsOfCategory('mechanism'));
  assert.ok(fieldsOfCategory('mechanism').includes('blocks'));
  assert.ok(!fieldsOfCategory('item').includes('blocks'), '物品没有阻挡这种动作');
  assert.ok(fieldsOfCategory('item').includes('tags'));
});

test('a type belongs to exactly one factory and the factory is its only owner', () => {
  assert.equal(factoryFor('gate').category, 'mechanism');
  assert.equal(factoryFor('hammer').category, 'item');
  assert.equal(factoryFor('teleport'), null);
  assert.equal(createType('teleport'), null);
  const axe = createType('axe');
  assert.equal(axe.category, 'item');
  assert.deepEqual(axe.states.map((state) => state.id), ['idle', 'held']);
  assert.deepEqual(Object.keys(axe.slots).sort(), ['carryable', 'harms', 'reacts']);
  assert.equal(axe.version, 1);
  const key = createType('key');
  assert.deepEqual(key.tags, ['key', 'yellow']);
  assert.equal(key.consumedState, 'used');
  assert.deepEqual(key.hiddenStates, ['used']);
});

test('a category rejects declarations that belong to another category', () => {
  const doc = structuredClone(levels[0]);
  doc.entities.push({
    id: 'sneaky-key', kind: 'key', x: 100, width: 20, state: 'idle', label: '想挡路的钥匙',
    blocks: { inState: 'idle', reason: 'gate' },
  });
  const result = validateDoc(doc);
  assert.equal(result.ok, false);
  const error = result.errors.find((item) => item.path.endsWith('.blocks'));
  assert.equal(error.code, 'SLOT_UNKNOWN');
  assert.match(error.message, /item|物品/);
});

test('every factory implements the same interface, schema included', () => {
  for (const factory of listFactories()) {
    for (const method of FACTORY_METHODS) {
      assert.equal(typeof factory[method], 'function', factory.category + '.' + method);
    }
    assert.equal(typeof factory.version, 'number');
    assert.ok(Array.isArray(factory.kinds));
    assert.ok(Array.isArray(factory.schema.slots), factory.category + ' 必须声明 schema.slots');
    assert.equal(factory.schema.category, factory.category);
  }
});

test('registration only accepts existing categories with the full interface', () => {
  const full = { category: 'theme', version: 1, schema: { slots: [] }, kinds: [], has() {}, create() {}, list() {}, parseSection() {} };
  assert.throws(() => registerFactory(full), /类别/);
  assert.throws(() => registerFactory({ category: 'item', version: 1 }), /必须实现|version|kinds|schema/);
  const partial = { category: 'item', version: 1, schema: { slots: [] }, kinds: [], has() {}, create() {}, list() {} };
  assert.throws(() => registerFactory(partial), /parseSection/);
  assert.throws(() => registerFactory(getFactory('item')), /已注册/);
});

test('createFactory validates the products it produces', () => {
  assert.throws(() => createFactory({ category: 'nope', version: 1 }), /类别/);
  assert.throws(() => createFactory({ category: 'item', version: 1, schema: { slots: [] }, types: { broken: { version: 1 } } }), /defaultWidth/);
  assert.throws(() => createFactory({ category: 'item', version: 1, types: {} }), /schema/);
  const factory = createFactory({
    category: 'item',
    version: 2,
    schema: { label: '物品', slots: ['carryable'] },
    types: {
      rock: { version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'idle', label: '放着' }], slots: {} },
    },
  });
  assert.deepEqual(factory.kinds, ['rock']);
  assert.equal(factory.create('rock').category, 'item');
  assert.deepEqual(factory.create('rock').slots, {});
  assert.equal(factory.create('missing'), null);
  assert.deepEqual(factory.parseSection({}), { ok: true, code: 'OK', errors: [] });
});

test('the map factory owns the world section and the terrain query', () => {
  const map = getFactory('map');
  const base = {
    world: { width: 1200, height: 640, groundY: 440 },
    actor: { x: 80, speed: 60 },
    goal: { x: 900 },
    platforms: [{ x: 0, width: 400 }, { x: 600, width: 600 }],
  };
  assert.equal(map.parseSection(base).ok, true);
  const badWorld = map.parseSection({ ...base, world: { width: 100, height: 100, groundY: 0 } });
  assert.equal(badWorld.ok, false);
  assert.ok(badWorld.errors.some((error) => error.path === 'world'));
  const noGround = map.parseSection({ ...base, platforms: [] });
  assert.ok(noGround.errors.some((error) => error.path === 'platforms'));
  const behind = map.parseSection({ ...base, goal: { x: 10 } });
  assert.ok(behind.errors.some((error) => error.path === 'goal'));

  const terrain = map.terrain(base);
  assert.deepEqual(terrain.at(200).map((surface) => surface.y), [440]);
  assert.deepEqual(terrain.at(500), []);
  assert.equal(terrain.supports(500), false);
  assert.equal(terrain.resolve(200, 440), 440);
  assert.equal(terrain.resolve(500, 440), null, '跨层不能直接走过去');

  const withStairs = map.terrain({
    platforms: [{ x: 0, width: 400, y: 440 }, { x: 600, width: 600, y: 240 }],
    stairs: [{ x: 400, width: 200, fromY: 440, toY: 240 }],
  });
  let walked = 440;
  for (let x = 400; x <= 600; x += 1) {
    walked = withStairs.resolve(x, walked);
    assert.notEqual(walked, null, 'x=' + x + ' 处应该还踩得到楼梯');
  }
  assert.equal(walked, 240, '走完楼梯后到达楼上');
  assert.equal(withStairs.resolve(600, 440), null, '一步落差过大就算跳不过去');
});
