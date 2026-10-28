import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { archiveName } from '../scripts/archive.mjs';
import { buildSkill, buildSkillMarkdown, checkSkillFile } from '../scripts/build-skill.mjs';
import { listTypes, describe } from '../src/core/contract/registry.js';
import { binaryName } from '../scripts/build-binary.mjs';
import { levels } from './levels-fixture.mjs';

const run = promisify(execFile);

test('release archives are named per platform so assets never collide', () => {
  const expected = process.platform === 'win32' ? '.zip' : '.tar.gz';
  assert.equal(archiveName('gothere-agent-node'), 'gothere-agent-node' + expected);
  assert.equal(binaryName('linux', 'arm64'), 'gothere-linux-arm64');
});

test('SKILL.md is generated from the live schema, not a second copy of it', async () => {
  const markdown = await buildSkillMarkdown();
  assert.ok(markdown.startsWith('---\nname: gothere-levels\n'), '需要 Agent 技能的前置元数据');
  assert.match(markdown, /^description: .+/m);

  // 三类 schema 的字段与声明槽都要出现，且与 describe() 完全一致。
  for (const category of describe().categories) {
    assert.ok(markdown.includes('`' + category.category + '`'), '缺少类别 ' + category.category);
    for (const field of category.fields) assert.ok(markdown.includes('`' + field + '`'), category.category + ' 缺字段 ' + field);
    for (const slot of category.slots) assert.ok(markdown.includes('`' + slot + '`'), category.category + ' 缺声明槽 ' + slot);
  }
  // 每个类型的 id 与状态都要列出来。
  for (const type of listTypes()) {
    assert.ok(markdown.includes('`' + type.id + '`'), '缺类型 ' + type.id);
    for (const state of type.states) assert.ok(markdown.includes('`' + state + '`'), type.id + ' 缺状态 ' + state);
  }
  // 关键约定必须在文档里，否则 Agent 会照着旧写法（if / capabilities）写。
  for (const phrase of ['schemaVersion', 'reacts.need', 'SLOT_UNKNOWN', '--json', 'level simulate']) {
    assert.ok(markdown.includes(phrase), 'SKILL.md 缺少关键说明：' + phrase);
  }
  for (const level of levels) assert.ok(markdown.includes('`' + level.id + '`'), '缺范例关卡 ' + level.id);
  assert.ok(!/"capabilities"/.test(markdown), '不要教 Agent 写已删除的 capabilities 槽');
});

test('the agent package ships SKILL.md next to a runnable CLI', async () => {
  const built = await buildSkill({ quiet: true });
  const contents = process.platform === 'win32'
    ? null
    : (await run('tar', ['-tzf', built.nodeArchive])).stdout.trim().split('\n');
  if (contents) {
    assert.deepEqual(contents.sort(), ['SKILL.md', 'gothere-cli.cjs', 'gothere-cli.mjs']);
  }
  const skill = await readFile(built.skill, 'utf8');
  assert.match(skill, /gothere-cli\.mjs/);
});

test('the committed skills/<name>/SKILL.md is generated, so it never drifts', async () => {
  const result = await checkSkillFile();
  assert.equal(result.path.endsWith('/skills/gothere-levels/SKILL.md'), true, '技能源文件要放在 skills/<name>/ 下');
  assert.ok(result.ok, 'skills/gothere-levels/SKILL.md 与 schema 不一致：请运行 `pnpm build:agent` 重新生成');
});
