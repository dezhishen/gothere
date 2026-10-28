import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PLATFORM } from '../src/core/contract/versions.js';
import { invoke, listSkills } from '../src/app/skills.js';
import { levels, service } from './levels-fixture.mjs';

const call = (id, input = {}) => invoke(id, input, { service });

test('every listed skill answers through invoke, unknown ids are usage errors', () => {
  const skills = listSkills();
  assert.ok(skills.length >= 6);
  for (const skill of skills) {
    assert.equal(typeof skill.id, 'string');
    assert.equal(typeof skill.summary, 'string');
    assert.equal(skill.write, false, skill.id + ' 目前只做只读能力');
    const result = call(skill.id, {});
    assert.equal(typeof result.ok, 'boolean', skill.id + ' 必须返回 {ok} 结果对象');
  }
  const unknown = call('level.apply', {});
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'USAGE');
});

test('content-backed skills refuse to run without a content source', () => {
  const result = invoke('level.list', {});
  assert.equal(result.ok, false);
  assert.equal(result.code, 'USAGE');
  assert.match(result.errors[0].message, /内容源/);
});

test('the manifest never exposes player-side skills', () => {
  for (const skill of listSkills()) {
    assert.equal(/^(game|save|player)\./.test(skill.id), false, skill.id);
  }
});

test('skills.list publishes the platform and interpreter support matrix', () => {
  const result = call('skills.list');
  assert.equal(result.ok, true);
  assert.equal(result.data.skills.length, listSkills().length);
  const platform = result.data.platform;
  assert.deepEqual(platform.supports.schema, [1]);
  assert.equal(platform.interpreters[0].id, 'core-v1');
  assert.ok(platform.supports.types.bridge.includes(1));
});

test('level.list reads the content manifest', () => {
  const result = call('level.list');
  assert.equal(result.ok, true);
  assert.equal(result.data.levels.length, levels.length);
  assert.deepEqual(result.data.levels.map((item) => item.id), levels.map((item) => item.id));
  assert.ok(result.data.levels.every((item) => item.schemaVersion === 1));
});

test('level.validate passes builtin levels and reports broken geometry', () => {
  const ok = call('level.validate', { id: 'first-bridge' });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.valid, true);
  assert.equal(ok.data.interpreter.id, 'core-v1');

  const broken = structuredClone(levels[0]);
  broken.platforms = [{ x: 0, width: 360 }];
  const failed = call('level.validate', { doc: broken });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'VALIDATION_FAILED');
  assert.ok(failed.errors.some((item) => item.code === 'SEMANTIC_INVALID'));

  const editable = call('level.validate', { doc: broken, mode: 'editable' });
  assert.equal(editable.ok, true, JSON.stringify(editable.errors));
});

test('level.simulate reproduces the known solution and rejects unusable inputs', () => {
  const solved = call('level.simulate', { id: 'first-bridge', inputs: [{ tick: 1, source: 'lever' }] });
  assert.equal(solved.ok, true);
  assert.equal(solved.data.status, 'won');
  assert.equal(solved.data.terminalCode, null);
  assert.ok(solved.data.events.length > 0);

  const idle = call('level.simulate', { id: 'first-bridge' });
  assert.equal(idle.ok, true);
  assert.equal(idle.data.status, 'lost');
  assert.equal(idle.data.reason, 'fall');

  const unusable = call('level.simulate', { id: 'first-bridge', inputs: [{ tick: 5, source: 'bridge' }] });
  assert.equal(unusable.ok, false);
  assert.equal(unusable.code, 'SIM_FAILED');
});

test('level.replay accepts recorded inputs and rejects mismatched ones', () => {
  const solved = call('level.simulate', { id: 'first-bridge', inputs: [{ tick: 1, source: 'lever' }] });
  const replay = call('level.replay', { id: 'first-bridge', recording: solved.data.recording });
  assert.equal(replay.ok, true, JSON.stringify(replay.errors));
  assert.equal(replay.data.status, 'won');

  const mismatched = call('level.replay', { id: 'first-bridge', recording: { ...solved.data.recording, levelId: 'other' } });
  assert.equal(mismatched.ok, false);
});

test('level.get returns a defensive copy and unknown ids are NOT_FOUND', () => {
  const first = service.getLevel('first-bridge');
  first.name = '被改掉了';
  assert.notEqual(service.getLevel('first-bridge').name, '被改掉了');
  const missing = call('level.get', { id: 'nope' });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'NOT_FOUND');
  assert.equal(service.listLevels().length, levels.length);
});

test('level.diff compares two documents structurally', () => {
  const after = structuredClone(levels[0]);
  after.entities[1].state = 'on';
  const result = call('level.diff', { before: { id: 'first-bridge' }, after: { doc: after } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.diff.entities.changed, ['lever']);
  const missing = call('level.diff', { before: { id: 'first-bridge' } });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'USAGE');
});

test('the platform version stays in sync with package.json', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(PLATFORM.name, manifest.name);
  assert.equal(PLATFORM.version, manifest.version);
});
