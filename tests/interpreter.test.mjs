import test from 'node:test';
import assert from 'node:assert/strict';

import { compileModel } from '../src/core/contract/compile.js';
import { createLevelInterpreter } from '../src/core/interpreters/level-1.js';
import { parseRecording } from '../src/core/interpreters/recording-1.js';
import {
  KINDS,
  createGame,
  describePlatform,
  listInterpreters,
  parseBundle,
  parseLevel,
  parseManifest,
  registerInterpreter,
  replayLevel,
  resetInterpreters,
  resolveInterpreter,
  unregisterInterpreter,
} from '../src/core/interpreters/index.js';
import { levels } from './levels-fixture.mjs';

const fixture = () => structuredClone(levels[0]);
const level1 = createLevelInterpreter();

/** 只替换身份与 schema 声明，行为仍复用 level-1 的解析与运行。 */
function cloneAs(id, version, schema = [1]) {
  return {
    kind: 'level',
    id,
    version,
    supports: { schema },
    parse: level1.parse,
    createSimulation: level1.createSimulation,
  };
}

test.beforeEach(() => resetInterpreters());

test('the platform ships one interpreter per data kind', () => {
  const platform = describePlatform();
  assert.deepEqual(platform.kinds, [...KINDS]);
  assert.deepEqual(platform.interpreters.map((item) => item.kind), ['level', 'bundle', 'manifest', 'recording']);
  assert.deepEqual(platform.interpreters.map((item) => item.id), ['level-1', 'bundle-1', 'levels-manifest-1', 'recording-1']);
  const level = platform.interpreters.find((item) => item.kind === 'level');
  assert.deepEqual(level.supports, { schema: [1] });
  assert.equal(level.supports.types, undefined, '关卡解释器不拥有类型');
  assert.deepEqual(platform.supports.types.axe, [1]);
  assert.deepEqual(platform.supports.capabilities.carryable, [1]);
});

test('level resolution is deterministic: higher version first, then id ascending', () => {
  registerInterpreter(cloneAs('zz-late', 2));
  registerInterpreter(cloneAs('aa-late', 2));
  registerInterpreter(cloneAs('mm-old', 1));
  assert.deepEqual(listInterpreters('level').map((item) => item.id), ['aa-late', 'zz-late', 'level-1', 'mm-old']);
  assert.equal(resolveInterpreter(fixture()).interpreter.id, 'aa-late');
});

test('a document can target a newer schema when a newer interpreter is registered', () => {
  registerInterpreter({
    kind: 'level',
    id: 'level-2',
    version: 2,
    supports: { schema: [2] },
    // 真实的 level-2 会自己处理 v2 语义；这里用 v1 编译后升版本号代表它。
    parse(input) {
      const model = compileModel({ ...input, schemaVersion: 1 });
      return { ok: true, code: 'OK', errors: [], model: { ...model, schemaVersion: 2 } };
    },
    createSimulation: level1.createSimulation,
  });
  const level = fixture();
  level.schemaVersion = 2;
  const parsed = parseLevel(level);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.interpreter.id, 'level-2');
  assert.equal(parsed.interpreter.kind, 'level');
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

test('parse compiles a model and the level interpreter can run and replay it', () => {
  const level = fixture();
  const parsed = parseLevel(level);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.interpreter.id, 'level-1');
  assert.equal(parsed.requirements.schema, 1);
  const bridge = parsed.model.entities.find((entity) => entity.id === 'bridge');
  assert.equal(bridge.ground.inState, 'extended');

  const game = createGame(level);
  game.start();
  game.click('lever');
  game.step(2000);
  assert.equal(game.snapshot().status, 'won');
  assert.deepEqual(replayLevel(level, game.recording()).snapshot(), game.snapshot());
});

test('the recording interpreter validates operation sequences before replaying', () => {
  const level = fixture();
  const game = createGame(level);
  game.start();
  game.click('lever');
  game.step(2000);
  const recording = game.recording();
  assert.equal(parseRecording(recording).ok, true);
  assert.equal(parseRecording(null).code, 'SCHEMA_INVALID');
  assert.equal(parseRecording({}).code, 'UNSUPPORTED_VERSION');
  assert.equal(parseRecording({ ...recording, untilTick: -1 }).code, 'SCHEMA_INVALID');
  assert.equal(parseRecording({ ...recording, status: 'paused-forever' }).code, 'SCHEMA_INVALID');
  assert.equal(parseRecording({ ...recording, inputs: [{ tick: 5, source: 'lever' }, { tick: 3, source: 'lever' }] }).code, 'VALIDATION_FAILED');
  assert.equal(parseRecording({ ...recording, inputs: [{ tick: 0, source: 'lever' }] }).code, 'VALIDATION_FAILED');

  assert.throws(() => replayLevel(level, { schemaVersion: 9 }), (error) => error.code === 'UNSUPPORTED_VERSION');
  assert.equal(replayLevel(level, recording).snapshot().status, 'won');
});

test('the manifest interpreter owns the level catalog format', () => {
  const manifest = parseManifest(JSON.stringify({ schema: 'levels@1', levels: [{ id: 'demo', file: 'demo.level.json' }] }));
  assert.equal(manifest.ok, true);
  assert.deepEqual(manifest.entries, [{ id: 'demo', file: 'demo.level.json' }]);
  assert.equal(parseManifest('{"schema":"levels@2","levels":[]}').code, 'UNSUPPORTED_VERSION');
  assert.equal(parseManifest('{"schema":"levels@1","levels":[{"id":"a","file":"../a.json"}]}').code, 'VALIDATION_FAILED');
});

test('the bundle interpreter validates what the single-file build inlines', () => {
  const bundle = parseBundle({ schema: 'levels@1', levels: [fixture()] });
  assert.equal(bundle.ok, true);
  assert.equal(bundle.levels.length, 1);
  assert.equal(parseBundle('{').code, 'SCHEMA_INVALID');
  assert.equal(parseBundle({ schema: 'levels@2', levels: [] }).code, 'UNSUPPORTED_VERSION');
  assert.equal(parseBundle({ schema: 'levels@1', levels: [] }).code, 'SCHEMA_INVALID');
  assert.equal(parseBundle({ schema: 'levels@1', levels: [fixture(), fixture()] }).code, 'VALIDATION_FAILED');
});

test('malformed registrations are rejected', () => {
  assert.throws(() => registerInterpreter({}), /kind/);
  assert.throws(() => registerInterpreter({ kind: 'theme', id: 'x', version: 1, supports: { schema: [1] }, parse() {} }), /kind/);
  assert.throws(() => registerInterpreter({ kind: 'level', id: 'Bad Id', version: 1, supports: { schema: [1] }, parse() {}, createSimulation() {} }), /id/);
  assert.throws(() => registerInterpreter({ kind: 'level', id: 'zero', version: 0, supports: { schema: [1] }, parse() {}, createSimulation() {} }), /version/);
  assert.throws(() => registerInterpreter({ kind: 'level', id: 'no-schema', version: 1, supports: { schema: [] }, parse() {}, createSimulation() {} }), /supports\.schema/);
  assert.throws(() => registerInterpreter({ kind: 'level', id: 'no-parse', version: 1, supports: { schema: [1] }, createSimulation() {} }), /parse/);
  assert.throws(() => registerInterpreter({ kind: 'manifest', id: 'no-parse', version: 1, supports: { schema: [1] } }), /parse/);
  assert.throws(() => registerInterpreter(cloneAs('level-1', 1)), /已注册/);
});
