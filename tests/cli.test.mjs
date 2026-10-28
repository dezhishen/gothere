import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function cli(args) {
  return spawnSync(process.execPath, ['bin/gothere.mjs', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
}

function json(result) {
  assert.equal(result.stdout.trim().startsWith('{'), true, 'stdout 必须只有协议 JSON，实际：' + result.stdout.slice(0, 200));
  return JSON.parse(result.stdout);
}

test('--json keeps stdout machine readable for discovery', () => {
  const result = cli(['skills', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = json(result);
  assert.equal(payload.ok, true);
  assert.ok(payload.data.skills.length >= 6);
  assert.equal(payload.data.platform.interpreters[0].id, 'level-1');
  assert.deepEqual(payload.data.platform.supports.schema, [1]);
});

test('the human view still explains interpreters and skills', () => {
  const result = cli(['skills']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /level-1/);
  assert.match(result.stdout, /level\.simulate/);
});

test('level simulate runs a known solution through the selected interpreter', () => {
  const result = cli(['level', 'simulate', 'first-bridge', '--inputs', '[{"tick":1,"source":"lever"}]', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = json(result);
  assert.equal(payload.data.status, 'won');
  assert.equal(payload.data.interpreter.id, 'level-1');
});

test('exit codes follow the contract: 2 usage, 3 validation, 4 simulation', async () => {
  const missing = cli(['level', 'validate', 'nope', '--json']);
  assert.equal(missing.status, 2);
  assert.equal(json(missing).code, 'NOT_FOUND');

  const badMode = cli(['level', 'validate', 'first-bridge', '--mode', 'nope', '--json']);
  assert.equal(badMode.status, 2);
  assert.equal(json(badMode).code, 'USAGE');

  const directory = await mkdtemp(join(tmpdir(), 'gothere-cli-'));
  const invalid = join(directory, 'invalid.level.json');
  await writeFile(invalid, JSON.stringify({ schemaVersion: 2, id: 'x' }), 'utf8');
  const versioned = cli(['level', 'validate', invalid, '--json']);
  assert.equal(versioned.status, 3);
  assert.equal(json(versioned).code, 'UNSUPPORTED_VERSION');

  const broken = join(directory, 'broken.level.json');
  await writeFile(broken, JSON.stringify({ schemaVersion: 1, id: 'x', name: '', description: '', world: null }), 'utf8');
  const content = cli(['level', 'validate', broken, '--json']);
  assert.equal(content.status, 3);
  assert.equal(json(content).code, 'VALIDATION_FAILED');

  const impossible = cli(['level', 'simulate', 'first-bridge', '--inputs', '[{"tick":3,"source":"bridge"}]', '--json']);
  assert.equal(impossible.status, 4);
  assert.equal(json(impossible).code, 'SIM_FAILED');
});

test('level diff and unknown commands behave', () => {
  const diff = cli(['level', 'diff', 'first-bridge', 'quiet-corner', '--json']);
  assert.equal(diff.status, 0, diff.stderr);
  const payload = json(diff);
  assert.equal(payload.data.diff.identical, false);
  assert.ok(payload.data.diff.entities.added.length > 0);

  const unknown = cli(['nonsense', '--json']);
  assert.equal(unknown.status, 2);
  assert.equal(json(unknown).code, 'USAGE');
});

test('help prints usage without touching the exit contract', () => {
  const result = cli(['--help', '--json']);
  assert.equal(result.status, 0);
  const payload = json(result);
  assert.match(payload.data.usage, /gothere skills/);
});
