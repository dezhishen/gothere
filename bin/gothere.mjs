#!/usr/bin/env node
// gothere CLI：Agent 的创作侧入口。
// 纪律：--json 时 stdout 只有协议对象，日志一律走 stderr；错误只靠稳定错误码。
// 退出码：0 成功 / 2 用法或找不到 / 3 校验失败 / 4 模拟失败 / 5 内部错误。

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateLabel } from '../src/core/contract/registry.js';
import { CODES, domainError, exitCode } from '../src/app/errors.js';
import { createLevelService } from '../src/app/levelService.js';
import { createTextSource } from '../src/app/levelSource.js';
import { invoke } from '../src/app/skills.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Agent 常把输出接给 head / jq：下游提前关闭管道不应让 CLI 崩掉。
process.stdout.on('error', (error) => { if (error.code === 'EPIPE') process.exit(0); });

const USAGE = `gothere — 一定要到达那里的创作侧 CLI

用法：
  gothere skills [--json]                              能力清单 + 平台支持矩阵
  gothere platform [--json]                            解释器清单与支持的 schema / 类型 / 能力
  gothere schema [describe] [类型] [--json]             类型、能力、字段、状态、事件
  gothere level list [--json]                          内置关卡清单
  gothere level get <id|文件> [--json]                 取一份关卡文档
  gothere level validate <id|文件> [--mode editable|playable] [--json]
  gothere level simulate <id|文件> [--inputs <json|@文件>] [--until <tick>] [--json]
  gothere level replay <id|文件> --recording <json|@文件> [--json]
  gothere level diff <a> <b> [--json]

选项：
  --json         stdout 只输出单个 JSON 对象，日志走 stderr
  --mode         editable（只校验结构 + 类型）或 playable（默认，另加几何可达）
  --dry-run      只读命令下等同于 --json；写操作实现前不存在

退出码：0 成功 · 2 用法错误 · 3 校验失败 · 4 模拟失败 · 5 内部错误`;

const VALUE_FLAGS = ['mode', 'inputs', 'until', 'recording'];

const argv = process.argv.slice(2);
const wantsJson = argv.includes('--json');
const flags = {};
const words = [];
let parseError = null;

for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index];
  if (token === '--json') continue;
  if (token === '--help' || token === '-h') { flags.help = true; continue; }
  if (token === '--dry-run') { flags.dryRun = true; continue; }
  if (token.startsWith('--')) {
    const [name, inline] = token.slice(2).split('=');
    if (inline !== undefined) { flags[name] = inline; continue; }
    if (VALUE_FLAGS.includes(name)) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) {
        parseError = '--' + name + ' 需要一个值。';
        break;
      }
      flags[name] = next;
      index += 1;
      continue;
    }
    flags[name] = true;
    continue;
  }
  words.push(token);
}

const isFileToken = (token) => /\.json$/i.test(token) || token.includes('/') || token.includes('\\');

async function readJsonFile(path, label) {
  const absolute = resolve(process.cwd(), path);
  let text;
  try {
    text = await readFile(absolute, 'utf8');
  } catch (error) {
    throw domainError(CODES.NOT_FOUND, '读不到' + label + '：' + path + '（' + (error.code ?? error.message) + '）。');
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw domainError(CODES.SCHEMA_INVALID, label + '不是合法 JSON：' + error.message + '。');
  }
}

async function docRef(token) {
  if (!token) throw domainError(CODES.USAGE, '缺少关卡 id 或 JSON 文件路径。');
  if (isFileToken(token)) return { doc: await readJsonFile(token, '关卡文件') };
  return { id: token };
}

async function jsonValue(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw domainError(CODES.USAGE, label + ' 需要 JSON 字符串或 @文件。');
  if (!value.startsWith('@')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw domainError(CODES.USAGE, label + ' 不是合法 JSON：' + error.message + '。');
    }
  }
  return readJsonFile(value.slice(1), label);
}

function modeOption() {
  if (flags.mode === undefined) return undefined;
  if (flags.mode !== 'editable' && flags.mode !== 'playable') throw domainError(CODES.USAGE, '--mode 只能是 editable 或 playable。');
  return flags.mode;
}

const pad = (text, width) => (text.length >= width ? text : text + ' '.repeat(width - text.length));
const clock = (tick) => {
  const total = Math.floor(tick / 60);
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
};

function renderSkills(result) {
  const data = result.data ?? {};
  const platform = data.platform ?? {};
  const lines = ['skills ' + (data.skills ?? []).length + ' 项 · 平台 ' + platform.platform?.name + ' ' + platform.platform?.version + ' · schemaVersion ' + platform.schemaVersion];
  for (const skill of data.skills ?? []) lines.push('  ' + pad(skill.id, 18) + skill.summary);
  lines.push('');
  lines.push('解释器：' + (platform.interpreters ?? []).map((item) => item.id + ' (apiVersion ' + item.apiVersion + ')').join('、'));
  lines.push('支持 schema：' + (platform.supports?.schema ?? []).join(', '));
  lines.push('支持类型：' + Object.entries(platform.supports?.types ?? {}).map(([kind, versions]) => kind + '@' + versions.join('/')).join(' · '));
  lines.push('支持能力：' + Object.entries(platform.supports?.capabilities ?? {}).map(([name, versions]) => name + '@' + versions.join('/')).join(' · '));
  return lines.join('\n');
}

function renderPlatform(result) {
  const data = result.data ?? {};
  const lines = ['平台 ' + data.platform?.name + ' ' + data.platform?.version + ' · schemaVersion ' + data.schemaVersion];
  for (const interpreter of data.interpreters ?? []) {
    lines.push('');
    lines.push('解释器 ' + interpreter.id + '（apiVersion ' + interpreter.apiVersion + '）');
    lines.push('  schema : ' + (interpreter.supports.schema ?? []).join(', '));
    lines.push('  types  : ' + Object.entries(interpreter.supports.types ?? {}).map(([kind, versions]) => kind + ' ' + versions.join('/')).join(', '));
    lines.push('  caps   : ' + Object.entries(interpreter.supports.capabilities ?? {}).map(([name, versions]) => name + ' ' + versions.join('/')).join(', '));
  }
  lines.push('');
  lines.push('平台整体支持：schema ' + (data.supports?.schema ?? []).join(', ') +
    ' · ' + Object.keys(data.supports?.types ?? {}).length + ' 类型 · ' + Object.keys(data.supports?.capabilities ?? {}).length + ' 能力');
  return lines.join('\n');
}

function renderSchema(result) {
  const data = result.data ?? {};
  if (Array.isArray(data.types)) {
    const lines = ['类型 ' + data.types.length + ' 个 · 能力 ' + (data.capabilities ?? []).length + ' 个'];
    for (const type of data.types) {
      lines.push('  ' + pad(type.id, 10) + 'v' + type.version + '  状态 ' + type.states.join('/') + (type.events.length ? '  事件 ' + type.events.join('/') : ''));
    }
    lines.push('能力：' + (data.capabilities ?? []).map((item) => item.id + ' v' + item.version).join('、'));
    return lines.join('\n');
  }
  const lines = [data.id + ' v' + data.version + ' · 默认宽度 ' + data.defaultWidth];
  lines.push('状态：' + data.states.map((item) => item.id + '（' + item.label + '）').join('、'));
  lines.push('事件：' + (data.events.length ? data.events.join('、') : '无'));
  lines.push('能力：' + data.capabilities.map((item) => item.name + ' v' + item.version + ' ' + JSON.stringify(item.params)).join('、'));
  lines.push('字段：' + data.fields.map((field) => field.key + (field.optional ? '?' : '')).join('、'));
  return lines.join('\n');
}

function renderLevels(result) {
  const lines = ['内置关卡 ' + (result.data?.levels ?? []).length + ' 张'];
  for (const level of result.data?.levels ?? []) {
    lines.push('  ' + pad(level.id, 16) + level.name + '  （' + level.entities + ' 实体 / ' + level.rules + ' 规则）');
  }
  return lines.join('\n');
}

function renderValidate(result) {
  const data = result.data ?? {};
  if (result.ok) {
    const requirements = data.requirements ?? {};
    const types = Object.entries(requirements.types ?? {}).map(([kind, version]) => kind + '@' + version).join(' · ');
    return '✓ ' + data.id + ' 通过（' + data.mode + '）· 解释器 ' + (data.interpreter?.id ?? '-') +
      ' · schemaVersion ' + requirements.schema + (types ? ' · ' + types : '');
  }
  const lines = ['✗ 校验失败（' + result.code + '）' + (result.errors ?? []).length + ' 条'];
  for (const item of result.errors ?? []) lines.push('  [' + item.code + '] ' + (item.path ? item.path + ' ' : '') + item.message);
  for (const gap of data.gaps ?? []) {
    for (const item of gap.gaps ?? []) {
      const supported = item.supported.length ? item.supported.join(', ') : '无';
      lines.push('  缺口 ' + gap.interpreter + '：' + item.layer + ' ' + item.name + ' 需要 ' + item.required + '（支持 ' + supported + '）');
    }
  }
  return lines.join('\n');
}

function renderSimulate(result) {
  const data = result.data ?? {};
  if (!result.ok) {
    const lines = ['✗ 模拟失败（' + result.code + '）'];
    for (const item of result.errors ?? []) lines.push('  ' + (item.path ? item.path + ' ' : '') + item.message);
    return lines.join('\n');
  }
  const lines = [data.id + '：' + data.status + ' · tick ' + data.tick + ' · 点击 ' + data.clicks +
    (data.reason ? ' · reason ' + data.reason : '') + (data.terminalCode ? ' · ' + data.terminalCode : '')];
  for (const event of (data.events ?? []).slice(-5)) lines.push('  ' + clock(event.tick) + ' ' + event.message);
  const states = Object.values(data.entities ?? {}).map((entity) => entity.label + '=' + stateLabel(entity.state));
  if (states.length) lines.push('  终态：' + states.join(' · '));
  return lines.join('\n');
}

function renderDiff(result) {
  const data = result.data ?? {};
  const diff = data.diff ?? {};
  const lines = [data.before + ' → ' + data.after + (diff.identical ? '：完全一致' : '：' + diff.changed + ' 处差异')];
  for (const area of ['entities', 'rules']) {
    const part = diff[area] ?? {};
    const parts = [];
    if (part.added?.length) parts.push('+' + part.added.join(','));
    if (part.removed?.length) parts.push('-' + part.removed.join(','));
    if (part.changed?.length) parts.push('~' + part.changed.join(','));
    if (parts.length) lines.push('  ' + area + '：' + parts.join(' '));
  }
  if (diff.areas?.length) lines.push('  其他：' + diff.areas.join(', '));
  return lines.join('\n');
}

async function run(context) {
  const [command, sub, ...rest] = words;
  if (!command || command === 'help' || flags.help) {
    return { result: { ok: true, code: CODES.OK, data: { usage: USAGE } }, human: USAGE };
  }
  if (command === 'skills') {
    return { result: invoke('skills.list', {}, context), render: renderSkills };
  }
  if (command === 'platform' || command === 'interpreters') {
    return { result: invoke('platform.describe', {}, context), render: renderPlatform };
  }
  if (command === 'schema') {
    const kind = sub === 'describe' ? rest[0] : sub;
    return { result: invoke('schema.describe', { kind }, context), render: renderSchema };
  }
  if (command === 'level') {
    const action = sub ?? 'list';
    if (action === 'list') return { result: invoke('level.list', {}, context), render: renderLevels };
    if (action === 'get') {
      const ref = await docRef(rest[0]);
      const result = ref.doc ? { ok: true, code: CODES.OK, data: { level: ref.doc } } : invoke('level.get', ref, context);
      return { result, render: (value) => JSON.stringify(value.data?.level ?? null, null, 2) };
    }
    if (action === 'validate') {
      const ref = await docRef(rest[0]);
      return { result: invoke('level.validate', { ...ref, mode: modeOption() }, context), render: renderValidate };
    }
    if (action === 'simulate') {
      const ref = await docRef(rest[0]);
      const inputs = await jsonValue(flags.inputs, 'inputs');
      const until = flags.until === undefined ? undefined : Number(flags.until);
      return { result: invoke('level.simulate', { ...ref, inputs, until }, context), render: renderSimulate };
    }
    if (action === 'replay') {
      const ref = await docRef(rest[0]);
      const recording = await jsonValue(flags.recording, 'recording');
      return { result: invoke('level.replay', { ...ref, recording }, context), render: (value) => value.ok ? value.data.status + ' · tick ' + value.data.tick : JSON.stringify(value.errors, null, 2) };
    }
    if (action === 'diff') {
      const before = await docRef(rest[0]);
      const after = await docRef(rest[1]);
      return { result: invoke('level.diff', { before, after }, context), render: renderDiff };
    }
    throw domainError(CODES.USAGE, '未知 level 子命令：' + action + '。可用：list / get / validate / simulate / replay / diff。');
  }
  throw domainError(CODES.USAGE, '未知命令：' + command + '。');
}

function emit(result, outcome) {
  if (wantsJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }
  if (outcome && typeof outcome.render === 'function') {
    process.stdout.write(outcome.render(result) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

async function main() {
  try {
    if (parseError) throw domainError(CODES.USAGE, parseError);
    const source = createTextSource({ readText: (path) => readFile(resolve(ROOT, path), 'utf8') });
    const service = createLevelService(await source.all());
    const outcome = await run({ service });
    emit(outcome.result, outcome);
    const code = outcome.result.ok ? CODES.OK : outcome.result.code;
    return exitCode(code);
  } catch (error) {
    const code = typeof error.code === 'string' ? error.code : CODES.INTERNAL;
    const result = { ok: false, code, errors: error.errors ?? [{ code, path: '', message: error.message }] };
    if (wantsJson) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      process.stderr.write('✗ ' + error.message + '\n\n' + (code === CODES.USAGE ? USAGE + '\n' : ''));
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
    return exitCode(code);
  }
}

process.exitCode = await main();
