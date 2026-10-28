import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('builds a self-contained playable HTML without a local server', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  const html = await readFile(new URL('../dist/gothere-play.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<title>一定要到达那里</title>'));
  assert.ok(html.includes('id="portable-data"'));
  assert.ok(html.includes('id="levels-data"'), 'levels are inlined as JSON');
  const embeddedLevels = html.match(/<script id="levels-data" type="application\/json">([\s\S]*?)<\/script>/);
  const levelPayload = JSON.parse(embeddedLevels[1]);
  assert.equal(levelPayload.schema, 'levels@1');
  assert.ok(levelPayload.levels.length >= 3);
  assert.equal(levelPayload.levels[0].id, 'first-bridge');
  assert.ok(levelPayload.levels.every((level) => level.schemaVersion === 1));
  assert.ok(html.includes('function createSimulation'));
  assert.ok(html.includes('--color-paper'), 'Tailwind design tokens are inlined');
  assert.ok(html.includes('--font-serif'), 'Tailwind font tokens are inlined');
  assert.ok(!/<script[^>]+src=/i.test(html), 'scripts must be embedded');
  assert.ok(!/<link[^>]+rel="stylesheet"/i.test(html), 'styles must be embedded');
  assert.ok(!html.includes('src="/src/'));
  assert.ok(!html.includes('## 风险与范围控制'), 'private project notes are not published in the game package');
});
