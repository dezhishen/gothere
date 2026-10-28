import test from 'node:test';
import assert from 'node:assert/strict';

import { compileModel } from '../src/core/contract/compile.js';
import { createLevelInterpreter } from '../src/core/interpreter/level-1.js';
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
import { levels } from './levels-fixture.mjs';

const fixture = () => structuredClone(levels[0]);
const level1 = createLevelInterpreter();

/** 只替换身份与 schema 声明，行为仍复用 level-1 的解析与运行。 */
function cloneAs(id, apiVersion, schema = [1]) {
  return {
    id,
    apiVersion,
    supports: { schema },
    parse: level1.parse,
    createSimulation: level1.createSimulation,
    replay: level1.replay,
  };
}

test.beforeEach(() => resetInterpreters());

test('an interpreter only claims a document schema; types come from data', () => {
  const platform = describePlatform();
  assert.equal(platform.interpreters.length, 1);
  assert.equal(platform.interpreters[0].id, 'level-1');
  assert.deepEqual(platform.interpreters[0].supports, { schema: [1] });
  assert.equal(platform.interpreters[0].supports.types, undefined, '解释器不再拥有类型');
  assert.deepEqual(platform.supports.schema, [1]);
  assert.deepEqual(platform.supports.types.axe, [1]);
  assert.deepEqual(platform.supports.capabilities.holdable, [1]);
});

test('resolution is deterministic: higher apiVersion first, then id ascending', () => {
  registerInterpreter(cloneAs('zz-late', 2));
  registerInterpreter(cloneAs('aa-late', 2));
  registerInterpreter(cloneAs('mm-old', 1));
  assert.deepEqual(listInterpreters().map((item) => item.id), ['aa-late', 'zz-late', 'level-1', 'mm-old']);
  assert.equal(resolveInterpreter(fixture()).interpreter.id, 'aa-late');
});

test('a document can target a newer schema when a newer interpreter is registered', () => {
  registerInterpreter({
    id: 'level-2',
    apiVersion: 2,
    supports: { schema: [2] },
    // 真实的 level-2 会自己处理 v2 语义；这里用 v1 编译后升版本号代表它。
    parse(input) {
      const model = compileModel({ ...input, schemaVersion: 1 });
      return { ok: true, code: 'OK', errors: [], model: { ...model, schemaVersion: 2 } };
    },
    createSimulation: level1.createSimulation,
    replay: level1.replay,
  });
  const level = fixture();
  level.schemaVersion = 2;
  const parsed = parseLevel(level);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.interpreter.id, 'level-2');
  assert.equal(parsed.model.compiled, true);
});

test('uncovered schema or type versions fail loudly with the exact gap', () => {
  const newerSchema = fixture();
  newerSchema.schemaVersion = 9;
  const schemaResult = parseLevel(newerSchema);
  assert.equal(schemaResult.ok, false);
  assert.equal(schemaResult.code, 'UNSUPPORTED_VERSION');
  assert.deepEqual(schemaResult.gaps[0].gaps, [{ layer: 'schema', name: 'schemaVersion', required: 9, supported: [1] }]);

  const newerType = fixture();
  newerType.entities[0].typeVersion = 2;
  const typeResult = parseLevel(newerType);
  assert.equal(typeResult.ok, false);
  assert.equal(typeResult.code, 'UNSUPPORTED_VERSION');
  assert.deepEqual(typeResult.gaps[0].gaps, [{ layer: 'type', name: 'bridge', required: 2, supported: [1] }]);

  unregisterInterpreter('level-1');
  assert.equal(resolveInterpreter(fixture()).ok, false);
});

test('broken content is reported before platform gaps', () => {
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
  assert.equal(parsed.interpreter.id, 'level-1');
  assert.equal(parsed.requirements.schema, 1);
  const bridge = parsed.model.entities.find((entity) => entity.id === 'bridge');
  assert.equal(bridge.traits.groundInState, 'extended');
  assert.deepEqual(Object.keys(bridge.capabilities), ['extendGround']);

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
  assert.throws(() => registerInterpreter({ id: 'no-schema', apiVersion: 1, supports: { schema: [] }, parse() {}, createSimulation() {} }), /supports\.schema/);
  assert.throws(() => registerInterpreter({ id: 'no-parse', apiVersion: 1, supports: { schema: [1] }, createSimulation() {} }), /parse/);
  assert.throws(() => registerInterpreter(cloneAs('level-1', 1)), /已注册/);
});
