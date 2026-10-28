// Agent 技能包：把 CLI 与一份 SKILL.md 打在一起，让 Agent 下载一个压缩包就能干活。
// SKILL.md 里「类别 / 字段 / 声明槽 / 类型 / 状态」全部由代码里的 schema 现算，
// 不手写第二份，所以文档不会和实现漂移。

import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describePlatform } from '../src/core/interpreters/index.ts';
import { resetFactories } from '../src/core/interpreters/factories/index.ts';
import { readTypesContent } from './content.mjs';
import { describe, listTypes } from '../src/core/contract/registry.ts';
// 类型是纯 JSON：生成 SKILL.md 前先把它们装上，否则 schema 表会是空的。
resetFactories((await readTypesContent()).types);
import { CODES } from '../src/app/errors.ts';
import { archiveFiles, archiveName } from './archive.mjs';
import { nativeTarget, parseTarget, targetFromArgv } from './targets.mjs';
import { buildCli } from './build-cli.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKILL_NAME = 'gothere-levels';
// 技能源文件就放在仓库里：skills/<name>/SKILL.md，跟着 PR 一起评审、在 GitHub 上直接可读。
// 它由 schema 生成（不是手写），所以不会被改出一个和实现不一致的版本。
const SKILL_FILE = resolve(ROOT, 'skills', SKILL_NAME, 'SKILL.md');

const bullet = (items) => items.map((item) => '- ' + item).join('\n');

/** 从 schema 现算「这一类能写什么」。 */
function categorySection() {
  const platform = describe();
  return platform.categories.map((category) => {
    const types = listTypes().filter((type) => type.category === category.category);
    const lines = ['### ' + category.label + '（`' + category.category + '`）', ''];
    lines.push('实体字段：`' + category.fields.join('`、`') + '`');
    lines.push('声明槽：' + (category.slots.length ? '`' + category.slots.join('`、`') + '`' : '（这一类不产出实体）'));
    lines.push('');
    if (!types.length) {
      lines.push('这一类的数据在关卡文档的顶层（`world` / `actor` / `goal` / `platforms` / `stairs`），不是实体。');
      lines.push('');
      return lines.join('\n');
    }
    lines.push('| 类型 | 状态 | 标签 | 自带的声明 |');
    lines.push('|---|---|---|---|');
    for (const type of types) {
      const full = describe(type.id);
      const states = full.states.map((state) => '`' + state.id + '`（' + state.label + '）').join(' ');
      const tags = full.tags.length ? '`' + full.tags.join('`、`') + '`' : '—';
      const slots = full.slots.map((slot) => '`' + slot.name + '`').join('、') || '—';
      const extra = full.consumedState ? '（被用掉后变 `' + full.consumedState + '`）' : '';
      lines.push('| `' + type.id + '` | ' + states + ' | ' + tags + ' | ' + slots + extra + ' |');
    }
    lines.push('');
    return lines.join('\n');
  }).join('\n');
}

export async function buildSkillMarkdown() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  const platform = describePlatform();
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'levels', 'manifest.json'), 'utf8')).levels;
  const levels = [];
  for (const entry of manifest) {
    const doc = JSON.parse(await readFile(resolve(ROOT, 'levels', entry.file), 'utf8'));
    levels.push({
      id: doc.id,
      name: doc.name,
      entities: Array.isArray(doc.entities) ? doc.entities.length : 0,
      rules: Array.isArray(doc.rules) ? doc.rules.length : 0,
    });
  }
  const slots = describe().slots;

  return `---
name: ${SKILL_NAME}
description: 写、改、验证 gothere 的 JSON 关卡（数据驱动的 2D 环境解谜）。当用户要新增或修改关卡、调机关数值、验证解法时序，或排查“走不过去”时使用。
---

# gothere 关卡创作

gothere 把「解析关卡」和「运行关卡」分开：关卡是纯 JSON，平台按 \`schemaVersion\` 挑一个
解释器解析，再用固定 60 tick/秒的确定性内核跑一遍。所以**你不需要读代码**：查 schema →
写 JSON → 校验 → 模拟，就能知道改得对不对。

## 这个包里有什么

| 文件 | 用途 |
|---|---|
| \`SKILL.md\` | 本文件 |
| \`gothere-cli\` / \`gothere-cli.exe\` | 单二进制，自带运行时不依赖 node |
| \`gothere-cli.mjs\` / \`gothere-cli.cjs\` | 同功能的单文件脚本，需要 node ≥ 26 |

平台版本 ${pkg.version} · schemaVersion ${platform.schemaVersion} · 内置关卡 ${levels.length} 张。

## 第一件事：确认能跑

\`\`\`sh
./gothere-cli --version           # 二进制（Windows 是 gothere-cli.exe）
node gothere-cli.mjs --version    # 没有二进制时用这个
\`\`\`

所有命令都支持 \`--json\`：**stdout 只有一个协议对象**，日志走 stderr，所以可以放心接
\`jq\` / 解析。错误只看稳定错误码，不看文案。

## 命令

| 命令 | 作用 |
|---|---|
| \`platform --json\` | 解释器清单、类别 schema、平台支持的 schema/类型/声明槽版本 |
| \`schema --json\` | 三个类别的字段、声明槽与全部类型的元数据 |
| \`schema <类型> --json\` | 单个类型的字段、状态、声明 |
| \`level list --json\` | 内置关卡清单 |
| \`level get <id> --json\` | 取一份关卡文档（改关卡就从这里抄） |
| \`level validate <id\\|文件> [--mode editable] --json\` | 四层校验；editable 只查结构与类型 |
| \`level simulate <id\\|文件> [--inputs <json\\|@文件>] [--until 2000] --json\` | 跑一遍，拿状态、tick、事件与终态 |
| \`level replay <id\\|文件> --recording <json\\|@文件> --json\` | 用录制好的输入确定性地重跑 |
| \`level diff <a> <b> --json\` | 两份关卡的差异（提交前用） |
| \`skills --json\` | 机器可读的技能清单与支持矩阵 |

\`--inputs\` 是点击序列，格式为 \`[{"tick":150,"source":"axe"}]\`：**tick 是内核时钟**（60 tick = 1 秒），
source 是实体 id。也可以写 \`--inputs @inputs.json\`。

## 关卡文档（schemaVersion ${platform.schemaVersion}）

\`\`\`json
{
  "schemaVersion": 1,
  "id": "my-level",
  "name": "新关卡",
  "description": "一句话玩法说明",
  "hint": "可选：给玩家的提示",
  "world": { "width": 1200, "height": 640, "groundY": 440 },
  "actor": { "x": 60, "speed": 64, "y": 440 },
  "goal": { "x": 1100, "y": 440 },
  "platforms": [{ "x": 0, "width": 1200, "y": 440 }],
  "stairs": [{ "x": 1040, "width": 80, "fromY": 300, "toY": 440 }],
  "entities": [
    { "id": "lever", "kind": "switch", "x": 150, "width": 28, "state": "off", "label": "旧开关" },
    { "id": "bridge", "kind": "bridge", "x": 700, "width": 60, "state": "folded", "label": "木桥" }
  ],
  "rules": [
    { "on": { "type": "click", "source": "lever" }, "actions": [{ "type": "set", "target": "bridge", "state": "extended" }] }
  ]
}
\`\`\`

\`id\` 只允许小写字母、数字与短横线；\`actor.x\` 必须在终点左边；\`platforms\` 要铺满角色要走的路。

## 每一类能写什么（由 schema 生成，不要手改这份文档）

${categorySection()}

写错类别会被直接拒绝：给物品写 \`blocks\` 会得到 \`SLOT_UNKNOWN\`，提示这一类允许哪些槽。

## 元素只声明自己

物品/机关里**没有代码**，只有声明；“什么时候生效、按什么顺序”由内核的固定阶段决定：
到期动作 → 输入 → 自走 → 行走支撑 → 携带同步 → 接触 → 阻挡 → 终点。

- \`reacts\`：我在什么输入/接触下、满足什么需求时，变成什么态、发布什么事件
- \`blocks\` / \`harms\`：我在哪个状态下挡路 / 伤人
- \`carryable\`：我能被拿起、跟随、放下
- \`moves\`：我在哪个状态下自己来回走
- \`ground\` / \`lifts\`：我在哪个状态下提供地面 / 载人上下楼

声明槽词汇（${slots.length} 个，来自平台）：${slots.map((slot) => '`' + slot.id + '`（' + slot.stages.join('/') + '）').join('、')}。

## 机关需要物品时：让机关自己读

物品只说自己是什么（\`tags\`），角色把身上的物品暴露成只读卡片，机关在接触时读卡判断。
把需求写在**机关**身上，不要写规则条件：

\`\`\`json
{ "id": "gate", "kind": "gate", "x": 600, "width": 28, "state": "closed", "label": "铁门",
  "reacts": {
    "on": "contact",
    "need": { "kind": "key", "tags": ["key", "yellow"] },
    "consume": true,
    "actions": [{ "type": "become", "state": "open" }],
    "unmet": { "reason": "locked", "message": "锁眼要一把黄色的钥匙。" }
  } }
\`\`\`

- 需求不满足：机关只提示一次、不改任何状态，\`simulate\` 的 \`events\` 里能看到那句话。
- 需求满足：\`consume: true\` 时物品变成它自己声明的 \`consumedState\`（例如 key 变 \`used\`），手会空出来。
- 标签必须有人在关卡里提供，否则**加载期**就报「没有任何元素提供」。

## 连线表：只有“事件 → 动作”，没有 if

\`\`\`json
{ "on": { "type": "click", "source": "lever" },
  "actions": [{ "type": "set", "target": "bridge", "state": "extended" },
              { "type": "after", "ticks": 300, "actions": [{ "type": "set", "target": "bridge", "state": "folded" }] }] }
\`\`\`

条件写在元素自己的声明里（\`reacts.from\` / \`reacts.need\` / \`blocks.inState\`）。写 \`if\` 会被拒绝并提示改法。
\`after\` 的延迟相对动作真正执行的 tick 计算。

## 失败原因与错误码

\`data.reason\`（角色为什么停下）：\`fall\`（踩空）· \`gate\`（被门挡）· \`hazard\`（风扇）·
\`hurt\`（扎脚/守卫）· \`crusher\`（碎石机）· \`locked\`（需求不满足）· \`timeout\`（超时）· \`limit\`（预算超限）。

校验错误码：\`${CODES.SCHEMA_INVALID}\`（结构）· \`SLOT_UNKNOWN\`（写错类别）· \`TYPE_UNKNOWN\`（未知类型）·
\`STATE_INVALID\`（状态不存在）· \`REFERENCE_INVALID\`（引用了不存在的实体/状态）· \`SEMANTIC_INVALID\`（几何不可达或需求没人提供）·
\`${CODES.UNSUPPORTED_VERSION}\`（schemaVersion 不符）。

退出码：0 成功 · 2 用法错误 · 3 校验失败 · 4 模拟失败 · 5 内部错误。

## 推荐工作流

1. \`level list --json\` 挑一张最像的关卡，\`level get <id> --json > my.json\` 抄下来。
2. 改 JSON（\`schema <类型> --json\` 查字段与声明）。
3. \`level validate my.json --json\` —— 先过校验，错误码会指出 \`path\`。
4. \`level simulate my.json --inputs @inputs.json --json\` —— 看 \`data.status\`/\`data.reason\`/\`data.tick\`/\`data.events\`，
   事件里带 tick 与文案，是最快的定位手段。
5. 调 \`--inputs\` 的 tick 直到 \`status\` 变成 \`won\`；然后用 \`level replay\` 确认可复现。
6. 提交前 \`level diff\` 看差异。

## 内置关卡（可当范例）

${levels.map((level) => '- `' + level.id + '` · ' + level.name + '（' + level.entities + ' 实体 / ' + level.rules + ' 条连线）').join('\n')}
`;
}

/** 生成仓库里的技能文件：skills/<name>/SKILL.md。 */
export async function writeSkillFile() {
  const markdown = await buildSkillMarkdown();
  await mkdir(resolve(ROOT, 'skills', SKILL_NAME), { recursive: true });
  await writeFile(SKILL_FILE, markdown, 'utf8');
  return { path: SKILL_FILE, markdown };
}

/** 只检查仓库里的技能文件是不是最新的（CI / 提交前用，不写盘）。 */
export async function checkSkillFile() {
  const markdown = await buildSkillMarkdown();
  let current = null;
  try {
    current = await readFile(SKILL_FILE, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ok: current === markdown, path: SKILL_FILE, markdown, current };
}

/**
 * Agent 技能包：SKILL.md + 该平台的单二进制（改名为 gothere-cli）。
 * 只有这一种形态——不产出「只带脚本」的口味，也不单独发布 SKILL.md。
 */
export async function buildAgentPackage({ quiet = false, binary, target = nativeTarget(), outDir = resolve(ROOT, 'dist'), refreshRepoSkill = true } = {}) {
  if (!binary) throw new Error('buildAgentPackage 需要一个已构建好的二进制（--binary）。');
  const { name: targetName, platform, exe } = parseTarget(target);
  // refreshRepoSkill=false 只打包、不动仓库里的生成物（测试用，避免测试改工作区）。
  const { markdown, path: skillFile } = refreshRepoSkill
    ? await writeSkillFile()
    : { markdown: await buildSkillMarkdown(), path: SKILL_FILE };

  const dir = resolve(outDir, 'skill');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const skillPath = resolve(dir, 'SKILL.md');
  await writeFile(skillPath, markdown, 'utf8');
  // 包内把二进制改名成 gothere-cli（Windows 是 gothere-cli.exe），SKILL.md 就是这么写的。
  const renamed = resolve(dir, 'gothere-cli' + exe);
  await copyFile(binary, renamed);

  const archive = resolve(outDir, archiveName('gothere-agent-' + targetName, platform));
  await rm(archive, { force: true });
  await archiveFiles(archive, [skillPath, renamed], platform);
  const size = (await stat(archive)).size;
  if (size < 1024) throw new Error('技能包看起来不对：' + size + ' 字节。');
  if (!quiet) {
    console.log('Agent: ' + archive + ' (' + (size / 1024 / 1024).toFixed(0) + ' MB, ' +
      targetName + ', SKILL.md ' + Math.round(markdown.length / 1024) + ' KiB)');
  }
  return { path: archive, name: basename(archive), bytes: size, target: targetName, skill: skillFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--check')) {
    const result = await checkSkillFile();
    if (!result.ok) {
      console.error('✗ ' + result.path + ' 不是最新的：请运行 `pnpm skill` 重新生成。');
      process.exitCode = 1;
    } else {
      console.log('✓ ' + result.path + ' 与 schema 一致');
    }
  } else {
    // 不带 --binary：只重新生成仓库里的 SKILL.md（发布用的技能包由 build-release 产出）。
    const index = argv.indexOf('--binary');
    const binary = index >= 0 ? resolve(argv[index + 1]) : null;
    if (binary) await buildAgentPackage({ quiet: argv.includes('--quiet'), binary, target: targetFromArgv(argv) });
    else {
      const { path } = await writeSkillFile();
      if (!argv.includes('--quiet')) console.log('Skill: ' + path);
    }
  }
}
