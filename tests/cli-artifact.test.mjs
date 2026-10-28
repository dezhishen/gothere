import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCli } from '../scripts/build-cli.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let artifact = null;

test.before(async () => { artifact = (await buildCli()).path; });

const run = (cwd, file, args) => spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', windowsHide: true });

test('the CLI artifact is one file with no dependencies beyond node builtins', async () => {
  const source = await readFile(artifact, 'utf8');
  assert.ok(source.startsWith('#!/usr/bin/env node\n'), '制品必须可以直接执行');
  const imports = [...source.matchAll(/^import\s+[^\n]*?['"]([^'"]+)['"];?\s*$/gm)].map((match) => match[1]);
  assert.ok(imports.length > 0, '外壳自己要 import node 内置模块');
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('node:'), '制品不许依赖外部模块：' + specifier);
  }
  const mode = (await stat(artifact)).mode;
  if (process.platform !== 'win32') assert.ok((mode & 0o111) !== 0, '制品应当可执行');
});

test('a copied artifact runs the whole CLI outside the repository', async () => {
  const solo = await mkdtemp(join(tmpdir(), 'gothere-solo-'));
  const moved = join(solo, 'gothere-cli.mjs');
  await cp(artifact, moved);
  // 工作目录里没有 src/、没有 levels/、没有 node_modules：内置关卡必须自带给制品。
  const listed = run(solo, moved, ['level', 'list', '--json']);
  assert.equal(listed.status, 0, listed.stderr);
  const levels = JSON.parse(listed.stdout).data.levels;
  assert.equal(levels.length, 6);

  const solved = run(solo, moved, ['level', 'simulate', 'all-together',
    '--inputs', '[{"tick":150,"source":"axe"},{"tick":200,"source":"guard"},{"tick":520,"source":"bridge-switch"},{"tick":800,"source":"lift-switch"}]', '--json']);
  assert.equal(solved.status, 0, solved.stderr);
  assert.equal(JSON.parse(solved.stdout).data.status, 'won');

  const version = run(solo, moved, ['--version', '--json']);
  assert.equal(version.status, 0, version.stderr);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(JSON.parse(version.stdout).data.version, pkg.version);
});

test('the artifact and the source-tree CLI answer identically', () => {
  for (const args of [['platform', '--json'], ['schema', 'gate', '--json'], ['level', 'list', '--json']]) {
    const source = spawnSync(process.execPath, ['bin/gothere.mjs', ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
    const dist = run(root, artifact, args);
    assert.equal(dist.status, source.status, args.join(' '));
    assert.deepEqual(JSON.parse(dist.stdout), JSON.parse(source.stdout), args.join(' ') + ' 的输出必须一致');
  }
});

test('the package points its bin at the artifact', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.bin.gothere, 'dist/gothere-cli.mjs', 'bin 应当指向独立制品');
  assert.ok(pkg.scripts['build:cli'], '制品要有自己的构建脚本');
  assert.ok(pkg.files.includes('dist/gothere-cli.mjs'), '发布内容里要带上制品');
});
