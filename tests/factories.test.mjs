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

test.beforeEach(() => resetFactories());

test('the system has exactly three content factories: map / mechanism / item', () => {
  assert.deepEqual([...CATEGORIES], ['map', 'mechanism', 'item']);
  const factories = listFactories();
  assert.deepEqual(factories.map((factory) => factory.category), ['map', 'mechanism', 'item']);
  assert.deepEqual(getFactory('map').kinds, []);
  assert.deepEqual(getFactory('mechanism').kinds, ['switch', 'bridge', 'gate', 'hazard', 'plate', 'lift', 'guard', 'crusher']);
  assert.deepEqual(getFactory('item').kinds, ['axe', 'hammer', 'key']);
});

test('a type belongs to exactly one factory and the factory is its only owner', () => {
  assert.equal(factoryFor('gate').category, 'mechanism');
  assert.equal(factoryFor('hammer').category, 'item');
  assert.equal(factoryFor('teleport'), null);
  assert.equal(createType('teleport'), null);
  const axe = createType('axe');
  assert.equal(axe.category, 'item');
  assert.deepEqual(axe.states.map((state) => state.id), ['idle', 'held']);
  assert.deepEqual(Object.keys(axe.capabilities), ['holdable', 'damageOnContact']);
  assert.equal(axe.version, 1);
});

test('every factory implements the same interface', () => {
  for (const factory of listFactories()) {
    for (const method of FACTORY_METHODS) {
      assert.equal(typeof factory[method], 'function', factory.category + '.' + method);
    }
    assert.equal(typeof factory.version, 'number');
    assert.ok(Array.isArray(factory.kinds));
  }
});

test('registration only accepts existing categories with the full interface', () => {
  const full = { category: 'theme', version: 1, kinds: [], has() {}, create() {}, list() {}, parseSection() {} };
  assert.throws(() => registerFactory(full), /类别/);
  assert.throws(() => registerFactory({ category: 'item', version: 1 }), /必须实现|version|kinds/);
  const partial = { category: 'item', version: 1, kinds: [], has() {}, create() {}, list() {} };
  assert.throws(() => registerFactory(partial), /parseSection/);
  assert.throws(() => registerFactory(getFactory('item')), /已注册/);
});

test('createFactory validates the products it produces', () => {
  assert.throws(() => createFactory({ category: 'nope', version: 1 }), /类别/);
  assert.throws(() => createFactory({ category: 'item', version: 1, types: { broken: { version: 1 } } }), /defaultWidth/);
  const factory = createFactory({
    category: 'item',
    version: 2,
    types: {
      rock: { version: 1, defaultWidth: 20, iconOffset: 90, states: [{ id: 'idle', label: '放着' }], capabilities: {} },
    },
  });
  assert.deepEqual(factory.kinds, ['rock']);
  assert.equal(factory.create('rock').category, 'item');
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
