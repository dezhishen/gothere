import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { archiveName } from '../scripts/archive.mjs';
import { PLATFORM } from '../src/core/contract/versions.js';
import { buildAgentPackage, buildSkillMarkdown, checkSkillFile } from '../scripts/build-skill.mjs';
import { buildWeb } from '../scripts/build-web.mjs';
import { listTypes, describe } from '../src/core/contract/registry.js';
import { binaryName } from '../scripts/build-binary.mjs';
import { TARGETS, nativeTarget, parseTarget } from '../scripts/targets.mjs';
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

test('the agent package is SKILL.md plus one self-contained binary', async () => {
  if (process.platform === 'win32') return;
  // 用占位文件当二进制：这里只验证包的形状，真正的二进制由 build-release 构建并自检。
  const scratch = await mkdtemp(join(tmpdir(), 'gothere-agent-test-'));
  try {
    const binary = join(scratch, 'gothere-linux-x64');
    await writeFile(binary, Buffer.alloc(4096, 7));
    const built = await buildAgentPackage({ quiet: true, binary, target: 'linux-x64', outDir: scratch });
    const contents = (await run('tar', ['-tzf', built.path])).stdout.trim().split('\n').sort();
    assert.deepEqual(contents, ['SKILL.md', 'gothere-cli']);
    const skill = await readFile(built.skill, 'utf8');
    assert.match(skill, /gothere-cli/, 'SKILL.md 要让 Agent 知道包里那个可执行文件叫什么');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('the static site package is an index.html ready for nginx', async () => {
  if (process.platform === 'win32') return;
  const built = await buildWeb({ quiet: true });
  const contents = (await run('tar', ['-tzf', built.path])).stdout.trim().split('\n');
  assert.deepEqual(contents, ['index.html'], '站点根只需要一个 index.html');
});

test('releases ship exactly three families of artifacts', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  // 1) 各平台 agent 包 2) 静态站点包 3) 各平台桌面端；裸二进制/脚本/SKILL.md 都不单独发布。
  assert.match(workflow, /cp dist\/gothere-agent-\$\{\{ matrix\.target \}\}\.\*/);
  assert.match(workflow, /cp dist\/gothere-desktop-\$\{\{ matrix\.target \}\}\.\*/);
  assert.match(workflow, /cp dist\/gothere-web\.tar\.gz release\//);
  assert.ok(!/cp dist\/gothere-play\.html/.test(workflow), 'HTML 由站点包代替，不再单独发布');
  assert.ok(!/cp dist\/gothere-cli\.mjs/.test(workflow), 'CLI 脚本只在 agent 包里');
  assert.ok(!/gothere-agent-node/.test(workflow), '不再发布只带脚本的 agent 包');
});

test('the committed skills/<name>/SKILL.md is generated, so it never drifts', async () => {
  const result = await checkSkillFile();
  assert.equal(result.path.endsWith('/skills/gothere-levels/SKILL.md'), true, '技能源文件要放在 skills/<name> 下');
  assert.ok(result.ok, 'skills/gothere-levels/SKILL.md 与 schema 不一致：请运行 `pnpm build:agent` 重新生成');
});

test('the skill layout follows the usual convention: skills/<name>/SKILL.md', async () => {
  const result = await checkSkillFile();
  const parts = result.path.split('/');
  assert.equal(parts.at(-1), 'SKILL.md', '文件名必须是 SKILL.md');
  const directory = parts.at(-2);
  assert.equal(parts.at(-3), 'skills', '必须放在仓库根的 skills/ 下');

  // 前置元数据里的 name 要和目录名一致，Agent 才认得出这个技能。
  const frontmatter = result.markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatter, 'SKILL.md 必须有 YAML 前置元数据');
  const name = frontmatter[1].match(/^name:\s*(.+)$/m);
  assert.ok(name, '前置元数据必须有 name');
  assert.equal(name[1].trim(), directory, 'name 必须与目录名一致');
  assert.match(frontmatter[1], /^description:\s*\S/m, '前置元数据必须有 description');
});

test('the platform version reported by the code matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(PLATFORM.version, pkg.version, '改版本号时 package.json 与 contract/versions.js 要一起改');
});

test('targets are parsed from the flag, not from the host platform', () => {
  assert.ok(TARGETS.includes(nativeTarget()));
  assert.deepEqual(parseTarget('win32-x64'), { name: 'win32-x64', platform: 'win32', arch: 'x64', exe: '.exe' });
  assert.equal(parseTarget('darwin-arm64').exe, '');
  assert.throws(() => parseTarget('beos-x64'), /不支持的目标平台/);
  // 压缩包后缀跟目标平台走，与宿主无关。
  assert.equal(archiveName('gothere-agent-win32-x64', 'win32'), 'gothere-agent-win32-x64.zip');
  assert.equal(archiveName('gothere-agent-darwin-arm64', 'darwin'), 'gothere-agent-darwin-arm64.tar.gz');
});
