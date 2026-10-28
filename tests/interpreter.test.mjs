import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  describePlatform,
  listInterpreters,
  parseLevel,
  registerInterpreter,
  replayLevel,
  resetInterpreters,
  resolveInterpreter,
  unregisterInterpreter,
} from '../src/core/interpreter/registry.js';
import { createV1Interpreter } from '../src/core/interpreter/v1.js';
import { compileModel } from '../src/core/contract/compile.js';
import { levels } from './levels-fixture.mjs';

const fixture = () => structuredClone(levels[0]);
const v1 = createV1Interpreter();

function cloneAs(id, apiVersion, schema = [1], typeVersions = [1]) {
  const types = Object.fromEntries(Object.keys(v1.supports.types).map((kind) => [kind, [...typeVersions]]));
  return {
    id,
    apiVersion,
    supports: { schema, types, capabilities: { ...v1.supports.capabilities } },
    parse: v1.parse,
    createSimulation: v1.createSimulation,
    replay: v1.replay,
  };
}

test.beforeEach(() => resetInterpreters());

test('the platform exposes which schemas its interpreters support', () => {
  const platform = describePlatform();
  assert.equal(platform.interpreters.length, 1);
  assert.equal(platform.interpreters[0].id, 'core-v1');
  assert.deepEqual(platform.interpreters[0].supports.schema, [1]);
  assert.deepEqual(platform.supports.schema, [1]);
  assert.deepEqual(platform.supports.types.bridge, [1]);
  assert.deepEqual(Object.keys(platform.supports.capabilities).sort(), ['blockPath', 'clickable', 'extendGround', 'region']);
});

test('resolution is deterministic: higher apiVersion first, then id ascending', () => {
  registerInterpreter(cloneAs('zz-late', 2));
  registerInterpreter(cloneAs('aa-late', 2));
  registerInterpreter(cloneAs('mm-old', 1));
  assert.deepEqual(listInterpreters().map((item) => item.id), ['aa-late', 'zz-late', 'core-v1', 'mm-old']);
  assert.equal(resolveInterpreter(fixture()).interpreter.id, 'aa-late');
});

test('a document can target a newer interpreter when one is registered', () => {
  const kinds = Object.keys(v1.supports.types);
  registerInterpreter({
    id: 'future-v2',
    apiVersion: 2,
    supports: {
      schema: [1, 2],
      types: Object.fromEntries(kinds.map((kind) => [kind, [1, 2]])),
      capabilities: { ...v1.supports.capabilities },
    },
    // 真实的 v2 解释器会自己处理 v2 语义；这里用 v1 编译后升版本号来代表它。
    parse(input) {
      const model = compileModel({ ...input, schemaVersion: 1 });
      return { ok: true, code: 'OK', errors: [], model: { ...model, schemaVersion: 2 } };
    },
    createSimulation: v1.createSimulation,
    replay: v1.replay,
  });
  const level = fixture();
  level.schemaVersion = 2;
  level.entities.forEach((entity) => { entity.typeVersion = 2; });
  const parsed = parseLevel(level);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.interpreter.id, 'future-v2');
  assert.equal(parsed.model.compiled, true);
});

test('uncovered versions fail loudly with the exact gap instead of guessing', () => {
  const newerSchema = fixture();
  newerSchema.schemaVersion = 2;
  const schemaResult = parseLevel(newerSchema);
  assert.equal(schemaResult.ok, false);
  assert.equal(schemaResult.code, 'UNSUPPORTED_VERSION');

  const newerType = fixture();
  newerType.entities[0].typeVersion = 2;
  const typeResult = parseLevel(newerType);
  assert.equal(typeResult.ok, false);
  assert.equal(typeResult.code, 'UNSUPPORTED_VERSION');
  assert.deepEqual(typeResult.gaps[0].gaps, [{ layer: 'type', name: 'bridge', required: 2, supported: [1] }]);

  unregisterInterpreter('core-v1');
  assert.equal(resolveInterpreter(fixture()).ok, false);
});

test('broken content is reported before platform version gaps', () => {
  const level = fixture();
  level.entities[0].kind = 'teleport';
  const result = parseLevel(level);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_FAILED');
  assert.ok(result.errors.some((item) => item.code === 'TYPE_UNKNOWN'));
});

test('parse compiles a model and the same interpreter can run and replay it', () => {
  const level = fixture();
  const parsed = parseLevel(level);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.interpreter.id, 'core-v1');
  assert.equal(parsed.requirements.schema, 1);
  const bridge = parsed.model.entities.find((entity) => entity.id === 'bridge');
  assert.equal(bridge.traits.extendsGroundInState, 'extended');

  const game = createGame(level);
  game.start();
  game.click('lever');
  game.step(2000);
  assert.equal(game.snapshot().status, 'won');
  assert.deepEqual(replayLevel(level, game.recording()).snapshot(), game.snapshot());
});

test('malformed registrations are rejected', () => {
  assert.throws(() => registerInterpreter({}), /解析器必须是一个对象|id/);
  assert.throws(() => registerInterpreter({ id: 'Bad Id', apiVersion: 1, supports: { schema: [1] }, parse() {}, createSimulation() {} }), /id/);
  assert.throws(() => registerInterpreter({ id: 'zero', apiVersion: 0, supports: { schema: [1] }, parse() {}, createSimulation() {} }), /apiVersion/);
  assert.throws(() => registerInterpreter({ id: 'no-parse', apiVersion: 1, supports: { schema: [1] }, createSimulation() {} }), /parse/);
  assert.throws(() => registerInterpreter(cloneAs('core-v1', 1)), /已注册/);
});
