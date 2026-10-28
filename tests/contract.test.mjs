import test from 'node:test';
import assert from 'node:assert/strict';

import { compileModel } from '../src/core/contract/compile.js';
import { diffDocs } from '../src/core/contract/diff.js';
import { migrate } from '../src/core/contract/migrate.js';
import { createRng } from '../src/core/contract/prng.js';
import { describe as describeType, eventsOfEntity, stateLabel } from '../src/core/contract/registry.js';
import { validateDoc, validateLevel } from '../src/core/contract/validate.js';
import { covers, platformSupports, requirementsOf } from '../src/core/contract/versions.js';
import { levels } from './levels-fixture.mjs';

const fixture = () => structuredClone(levels[0]);

test('registry describes types, capabilities and fields from a single table', () => {
  const described = describeType('switch');
  assert.deepEqual(described.states.map((item) => item.id), ['off', 'on']);
  assert.deepEqual(described.events, ['click']);
  assert.deepEqual(described.capabilities.map((item) => item.name), ['clickable']);
  assert.ok(described.fields.some((field) => field.key === 'x'));
  assert.equal(describeType('ropeBridge'), null);
  const all = describeType();
  assert.ok(all.types.length >= 7);
  assert.deepEqual(all.capabilities.map((item) => item.id).sort(), ['blockPath', 'clickable', 'damageOnContact', 'extendGround', 'holdable', 'region', 'verticalRide']);
});

test('capabilities are data: a preset can gain an event without new code', () => {
  const level = fixture();
  level.entities[0].capabilities = { clickable: {} };
  level.rules.push({ on: { type: 'click', source: 'bridge' }, actions: [{ type: 'set', target: 'lever', state: 'on' }] });
  assert.equal(validateLevel(level).ok, true);
  assert.deepEqual(eventsOfEntity(level.entities[0]).includes('click'), true);
  const model = compileModel(level);
  assert.equal(model.entities[0].traits.clickable, true);
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

test('unknown types and unknown capabilities report their own codes', () => {
  const unknownType = fixture();
  unknownType.entities[0].kind = 'teleport';
  const typeResult = validateDoc(unknownType);
  assert.equal(typeResult.ok, false);
  assert.ok(typeResult.errors.some((item) => item.code === 'TYPE_UNKNOWN'));
  const unknownCapability = fixture();
  unknownCapability.entities[0].capabilities = { teleport: {} };
  const capabilityResult = validateDoc(unknownCapability);
  assert.equal(capabilityResult.ok, false);
  assert.ok(capabilityResult.errors.some((item) => item.code === 'CAPABILITY_UNKNOWN'));
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

test('platform support multiplies interpreters, type data and capability implementations', () => {
  const supports = platformSupports([{ supports: { schema: [1] } }, { supports: { schema: [1, 2] } }]);
  assert.deepEqual(supports.schema, [1, 2]);
  assert.deepEqual(supports.types.axe, [1]);
  assert.deepEqual(supports.capabilities.holdable, [1]);
  assert.equal(supports.types.wand, undefined, '数据里没有的类型就不是「能跑」的类型');
});

test('compileModel derives traits and normalizes width', () => {
  const model = compileModel(fixture());
  assert.equal(model.compiled, true);
  const bridge = model.entities.find((entity) => entity.id === 'bridge');
  assert.equal(bridge.traits.groundInState, 'extended');
  assert.equal(bridge.width, 180);
  const lever = model.entities.find((entity) => entity.id === 'lever');
  assert.equal(lever.width, 28);
  assert.equal(lever.traits.clickable, true);
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
