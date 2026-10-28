import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateLevel } from '../src/core/contract/validate.js';
import { createDocSource, createTextSource, parseManifest } from '../src/app/levelSource.js';
import { levels } from './levels-fixture.mjs';

const root = new URL('../', import.meta.url);
const readText = (path) => readFile(new URL(path, root), 'utf8');

test('the content manifest lists valid JSON level artifacts', async () => {
  const manifest = parseManifest(await readText('levels/manifest.json'));
  assert.equal(manifest.ok, true, JSON.stringify(manifest.errors));
  assert.equal(manifest.entries.length, levels.length);
  for (const entry of manifest.entries) {
    assert.equal(entry.file, entry.id + '.level.json');
    const doc = JSON.parse(await readText('levels/' + entry.file));
    assert.equal(doc.id, entry.id);
    assert.equal(validateLevel(doc).ok, true, entry.id);
  }
});

test('every builtin level loads through the text source and maps to a summary', async () => {
  const source = createTextSource({ readText });
  const ids = await source.ids();
  assert.deepEqual(ids, ['first-bridge', 'quiet-corner', 'just-in-time', 'the-axe']);
  const list = await source.list();
  assert.deepEqual(Object.keys(list[0]).sort(), ['description', 'entities', 'id', 'name', 'rules', 'schemaVersion']);
  assert.equal(list[0].entities, 2);
  assert.equal(list[0].rules, 1);
  const doc = await source.get('quiet-corner');
  assert.equal(doc.name, '借过一下');
  await assert.rejects(() => source.get('missing'), (error) => error.code === 'NOT_FOUND');
});

test('the text source reads the manifest once and clones what it hands out', async () => {
  let reads = 0;
  const source = createTextSource({
    readText: (path) => { reads += 1; return readText(path); },
  });
  const first = await source.all();
  const second = await source.all();
  assert.equal(reads, 1 + levels.length, '清单 + 每张关卡各读一次');
  first[0].name = '被改坏了';
  assert.notEqual(second[0].name, '被改坏了');
});

test('a broken manifest fails with a stable code instead of guessing', async () => {
  assert.equal(parseManifest('{').code, 'SCHEMA_INVALID');
  assert.equal(parseManifest('{"schema":"levels@2","levels":[]}').code, 'UNSUPPORTED_VERSION');
  assert.equal(parseManifest('{"schema":"levels@1","levels":[]}').code, 'SCHEMA_INVALID');
  assert.equal(parseManifest('{"schema":"levels@1","levels":[{"id":"a","file":"../../etc/passwd"}]}').code, 'VALIDATION_FAILED');
  assert.equal(parseManifest('{"schema":"levels@1","levels":[{"id":"a","file":"a.level.json"},{"id":"a","file":"a.level.json"}]}').code, 'VALIDATION_FAILED');

  const missing = createTextSource({ readText: () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); } });
  await assert.rejects(() => missing.all(), (error) => error.code === 'NOT_FOUND');
});

test('a level file whose id disagrees with the manifest is rejected', async () => {
  const source = createTextSource({
    readText: async (path) => {
      if (path === 'levels/manifest.json') return JSON.stringify({ schema: 'levels@1', levels: [{ id: 'x', file: 'x.level.json' }] });
      return JSON.stringify({ ...structuredClone(levels[0]), id: 'other' });
    },
  });
  await assert.rejects(() => source.all(), (error) => /id 与清单不一致/.test(error.message));
});

test('the inline document source serves the single-file build', async () => {
  const source = createDocSource(levels);
  assert.equal((await source.ids()).length, levels.length);
  const doc = await source.get('just-in-time');
  doc.name = '改坏了';
  assert.equal((await source.get('just-in-time')).name, '赶个巧');
});
