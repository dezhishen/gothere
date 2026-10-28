import test from 'node:test';
import assert from 'node:assert/strict';

import './types-fixture.mjs';

import { compileModel } from '../src/core/contract/compile.js';
import { diffDocs } from '../src/core/contract/diff.js';
import { migrate } from '../src/core/contract/migrate.js';
import { createRng } from '../src/core/contract/prng.js';
import { describe as describeType, eventsOfEntity, stateLabel } from '../src/core/contract/registry.js';
import { validateDoc, validateLevel } from '../src/core/contract/validate.js';
import { covers, platformSupports, requirementsOf } from '../src/core/contract/versions.js';
import { levels } from './levels-fixture.mjs';

const fixture = () => structuredClone(levels[0]);

test('registry describes each category from its own schema', () => {
  const switchType = describeType('switch');
  assert.deepEqual(switchType.states.map((item) => item.id), ['off', 'on']);
  assert.deepEqual(switchType.events, ['click']);
  assert.deepEqual(switchType.slots.map((item) => item.name), ['reacts']);
  assert.equal(switchType.schema.category, 'mechanism');
  assert.ok(switchType.fields.includes('blocks'));
  assert.ok(!switchType.fields.includes('carryable'), '机关没有「可携带」这种声明');
  assert.equal(describeType('ropeBridge'), null);

  const keyType = describeType('key');
  assert.deepEqual(keyType.tags, ['key', 'yellow']);
  assert.equal(keyType.consumedState, 'used');
  assert.deepEqual(keyType.fields, ['id', 'kind', 'typeVersion', 'x', 'y', 'width', 'label', 'state', 'tags', 'reacts', 'harms', 'carryable']);

  const all = describeType();
  assert.equal(all.categories.length, 3);
  assert.deepEqual(all.slots.map((item) => item.id).sort(), ['blocks', 'carryable', 'ground', 'harms', 'lifts', 'moves', 'reacts']);
});

test('an entity can gain behaviour by declaring a slot, without new code', () => {
  const level = fixture();
  // 木桥原本只会「提供地面」；给它加一条 reacts 声明，它就能被点。
  level.entities[0].reacts = { on: 'input', from: 'extended', actions: [{ type: 'become', state: 'folded' }] };
  level.rules.push({ on: { type: 'click', source: 'bridge' }, actions: [{ type: 'set', target: 'lever', state: 'on' }] });
  assert.equal(validateLevel(level).ok, true);
  assert.equal(eventsOfEntity(level.entities[0]).includes('click'), true);
  const model = compileModel(level);
  assert.equal(model.entities[0].reacts.on, 'input');
  assert.equal(model.entities[0].ground.inState, 'extended');
});

test('editable loads half-built levels while playable refuses unreachable geometry', () => {
  const level = fixture();
  level.platforms = [{ x: 0, width: 360 }];
  const editable = validateDoc(level, { mode: 'editable' });
  assert.equal(editable.ok, true, JSON.stringify(editable.errors));
  const playable = validateDoc(level, { mode: 'playable' });
  assert.equal(playable.ok, false);
  assert.equal(playable.code, 'VALIDATION_FAILED');
  assert.ok(playable.errors.some((item) => item.code === 'SEMANTIC_INVALID'));
});

test('the version gate runs before content and does not guess', () => {
  const result = validateDoc({ schemaVersion: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNSUPPORTED_VERSION');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].path, 'schemaVersion');
});

test('unknown types and cross-category slots report their own codes', () => {
  const unknownType = fixture();
  unknownType.entities[0].kind = 'teleport';
  const typeResult = validateDoc(unknownType);
  assert.equal(typeResult.ok, false);
  assert.ok(typeResult.errors.some((item) => item.code === 'TYPE_UNKNOWN'));

  // 把「阻挡」写到物品上：这是类别边界，必须被挡住。
  const crossSlot = structuredClone(levels.find((level) => level.id === 'the-axe'));
  crossSlot.entities.find((entity) => entity.id === 'axe').blocks = { inState: 'idle' };
  const slotResult = validateDoc(crossSlot);
  assert.equal(slotResult.ok, false);
  assert.ok(slotResult.errors.some((item) => item.code === 'SLOT_UNKNOWN'));

  // 完全不认识的字段。
  const unknownField = fixture();
  unknownField.entities[0].teleport = {};
  const fieldResult = validateDoc(unknownField);
  assert.equal(fieldResult.ok, false);
  assert.ok(fieldResult.errors.some((item) => item.code === 'SCHEMA_INVALID' && item.path.endsWith('.teleport')));
});

test('the wiring table refuses if: conditions live in declarations', () => {
  const level = fixture();
  level.rules[0].if = [{ entity: 'lever', state: 'off' }];
  const result = validateDoc(level);
  assert.equal(result.ok, false);
  const error = result.errors.find((item) => item.path.endsWith('.if'));
  assert.equal(error.code, 'SCHEMA_INVALID');
  assert.match(error.message, /reacts.from/);
});

test('requirements and support matrices are matched per type version', () => {
  const level = fixture();
  level.entities[0].typeVersion = 2;
  const requirements = requirementsOf(level);
  assert.equal(requirements.schema, 1);
  assert.equal(requirements.types.bridge, 2);
  const coverage = covers({ schema: [1], types: { bridge: [1], switch: [1] } }, requirements);
  assert.equal(coverage.ok, false);
  assert.deepEqual(coverage.gaps, [{ layer: 'type', name: 'bridge', required: 2, supported: [1] }]);
});

test('platform support multiplies interpreters, type data and slot implementations', () => {
  const supports = platformSupports([{ supports: { schema: [1] } }, { supports: { schema: [1, 2] } }]);
  assert.deepEqual(supports.schema, [1, 2]);
  assert.deepEqual(supports.types.axe, [1]);
  assert.deepEqual(supports.capabilities.carryable, [1]);
  assert.equal(supports.types.wand, undefined, '数据里没有的类型就不是「能跑」的类型');
});

test('compileModel merges declarations and normalizes width', () => {
  const model = compileModel(fixture());
  assert.equal(model.compiled, true);
  const bridge = model.entities.find((entity) => entity.id === 'bridge');
  assert.equal(bridge.ground.inState, 'extended');
  assert.equal(bridge.width, 180);
  const lever = model.entities.find((entity) => entity.id === 'lever');
  assert.equal(lever.width, 28);
  assert.equal(lever.reacts.from, 'off');
  assert.equal(lever.reacts.actions[0].state, 'on');
  assert.equal(lever.traits, undefined, '编译后只剩数据，不再派生 traits');
});

test('diff reports added, removed and changed items by id', () => {
  const before = fixture();
  const after = structuredClone(before);
  after.entities.pop();
  after.entities[0].state = 'extended';
  after.entities.push({ id: 'plate', kind: 'plate', x: 500, width: 40, state: 'idle', label: '板' });
  after.name = '换个名字';
  const diff = diffDocs(before, after);
  assert.deepEqual(diff.entities.added, ['plate']);
  assert.deepEqual(diff.entities.removed, ['lever']);
  assert.deepEqual(diff.entities.changed, ['bridge']);
  assert.ok(diff.areas.includes('meta'));
  assert.equal(diff.identical, false);
  assert.equal(diffDocs(before, before).identical, true);
});

test('PRNG is deterministic, seed-dependent and never uses Math.random', () => {
  const first = createRng(1234);
  const second = createRng(1234);
  const a = [first.next(), first.int(10), first.pick(['x', 'y', 'z'])];
  const b = [second.next(), second.int(10), second.pick(['x', 'y', 'z'])];
  assert.deepEqual(a, b);
  assert.notEqual(createRng(99).next(), createRng(1234).next());
  assert.throws(() => createRng(1).int(0));
});

test('migrate passes the current version through and refuses newer ones', () => {
  const level = fixture();
  const passthrough = migrate(level);
  assert.equal(passthrough.ok, true);
  assert.deepEqual(passthrough.applied, []);
  const newer = migrate({ ...level, schemaVersion: 3 });
  assert.equal(newer.ok, false);
  assert.equal(newer.code, 'UNSUPPORTED_VERSION');
});

test('state labels come from the registry with a safe fallback', () => {
  assert.equal(stateLabel('folded'), '收起');
  assert.equal(stateLabel('made-up'), 'made-up');
});
