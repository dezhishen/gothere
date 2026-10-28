// gothere CLI 的**产品逻辑**：不碰 process、不碰文件系统，所有端口由 shell 注入。
// 这样同一份逻辑既能跑在源码树上（bin/gothere.mjs），也能打包成独立制品
// （dist/gothere-cli.mjs）：制品里除了 node 内置模块，没有任何外部依赖。
// 纪律：--json 时 stdout 只有协议对象，日志一律走 stderr；错误只靠稳定错误码。
// 退出码：0 成功 / 2 用法或找不到 / 3 校验失败 / 4 模拟失败 / 5 内部错误。

import { stateLabel } from '../core/contract/registry.js';
import { resetFactories } from '../core/interpreters/factories/index.js';
import { CODES, domainError, exitCode } from './errors.js';
import { createLevelService } from './levelService.js';
import { invoke } from './skills.js';

/**
 * runCli(argv, { loadDocs, readText, resolvePath, stdout, stderr, version }) → 退出码
 * - loadDocs(): → 关卡文档数组（内置关卡由 shell 决定从磁盘读还是内联读）
 * - readText(path): 读一个绝对路径（用户传入的 JSON 文件）
 * - resolvePath(path): 把相对路径按当前工作目录解析成绝对路径
 * - types: 类型数据（纯 JSON 解析后的 { category: { kind: {...} } }）——内容不是代码，
 *   由 shell 决定从磁盘读还是从制品内联块读。
 * 全部是端口：产品逻辑里不出现 process / 文件系统 / 路径拼接，制品才能单文件自洽。
 */
export async function runCli(argvIn, options = {}) {
  const { loadDocs, readText, resolvePath = (path) => path, stdout, stderr, version = 'unknown', types } = options;
  if (typeof loadDocs !== 'function') throw new Error('runCli 需要 loadDocs 端口。');
  if (typeof readText !== 'function') throw new Error('runCli 需要 readText 端口。');
  if (typeof stdout !== 'function' || typeof stderr !== 'function') throw new Error('runCli 需要 stdout / stderr 端口。');
  // 类型是数据：装上之后，后面所有 describe / validate / simulate 都认识它们。
  if (types) resetFactories(types);
  const out = (text) => stdout(text);
  const err = (text) => stderr(text);

  const USAGE = [
    'gothere — 一定要到达那里的创作侧 CLI',
    '',
    '用法：',
    '  gothere --version                              版本（制品自带，无需仓库）',
    '  gothere skills [--json]                        声明槽清单 + 平台支持矩阵',
    '  gothere platform [--json]                      解释器清单与支持的 schema / 类型 / 声明槽',
    '  gothere schema [describe] [类型] [--json]       类别 schema、声明槽、字段、状态、事件',
    '  gothere level list [--json]                    内置关卡清单',
    '  gothere level get <id|文件> [--json]           取一份关卡文档',
    '  gothere level validate <id|文件> [--mode editable|playable] [--json]',
    '  gothere level simulate <id|文件> [--inputs <json|@文件>] [--until <tick>] [--json]',
    '  gothere level replay <id|文件> --recording <json|@文件> [--json]',
    '  gothere level diff <a> <b> [--json]',
    '',
    '选项：',
    '  --json         stdout 只输出单个 JSON 对象，日志走 stderr',
    '  --mode         editable（只校验结构 + 类型）或 playable（默认，另加几何可达）',
    '',
    '退出码：0 成功 · 2 用法错误 · 3 校验失败 · 4 模拟失败 · 5 内部错误',
  ].join('\n');

  const VALUE_FLAGS = ['mode', 'inputs', 'until', 'recording'];

  const argv = argvIn;
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
    const absolute = resolvePath(path);
    let text;
    try {
      text = await readText(absolute);
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
    lines.push('解释器：' + (platform.interpreters ?? []).map((item) => item.id + ' v' + item.version + '（' + item.kind + '）').join('、'));
    lines.push('支持 schema：' + (platform.supports?.schema ?? []).join(', '));
    lines.push('支持类型：' + Object.entries(platform.supports?.types ?? {}).map(([kind, versions]) => kind + '@' + versions.join('/')).join(' · '));
    lines.push('支持声明槽：' + Object.entries(platform.supports?.capabilities ?? {}).map(([name, versions]) => name + '@' + versions.join('/')).join(' · '));
    return lines.join('\n');
  }

  function renderPlatform(result) {
    const data = result.data ?? {};
    const lines = ['平台 ' + data.platform?.name + ' ' + data.platform?.version + ' · schemaVersion ' + data.schemaVersion + ' · 数据类型 ' + (data.kinds ?? []).join(' / ')];
    const groups = new Map();
    for (const interpreter of data.interpreters ?? []) {
      if (!groups.has(interpreter.kind)) groups.set(interpreter.kind, []);
      groups.get(interpreter.kind).push(interpreter);
    }
    for (const [kind, items] of groups) {
      lines.push('');
      lines.push(kind + ' 解释器');
      for (const interpreter of items) {
        lines.push('  ' + interpreter.id + ' (v' + interpreter.version + ') · 支持 schema ' + (interpreter.supports.schema ?? []).join(', '));
      }
    }
    const table = (source) => Object.entries(source ?? {}).map(([name, versions]) => name + '@' + versions.join('/')).join(' · ');
    const factories = data.factories ?? [];
    if (factories.length) {
      lines.push('');
      lines.push('内容工厂（每类自带 schema）');
      for (const factory of factories) {
        lines.push('  ' + factory.category + ' (v' + factory.version + ') · 类型 ' + (factory.kinds.length ? factory.kinds.join(', ') : '（无实体）'));
        lines.push('    实体字段：' + (factory.fields ?? []).join('、'));
      }
    }
    lines.push('');
    lines.push('平台支持类型：' + table(data.supports?.types));
    lines.push('平台支持声明槽：' + table(data.supports?.capabilities));
    return lines.join('\n');
  }

  function renderSchema(result) {
    const data = result.data ?? {};
    if (Array.isArray(data.categories)) {
      const lines = ['类别 ' + data.categories.length + ' 个 · 声明槽 ' + (data.slots ?? []).length + ' 个'];
      for (const category of data.categories) {
        lines.push('  ' + pad(category.category, 10) + 'v' + category.version + '  ' + category.label);
        lines.push('    类型：' + (category.kinds.length ? category.kinds.join('、') : '（无实体）'));
        lines.push('    字段：' + category.fields.join('、'));
        lines.push('    声明槽：' + (category.slots.length ? category.slots.join('、') : '（无）'));
      }
      lines.push('声明槽词汇：' + (data.slots ?? []).map((item) => item.id + ' v' + item.version + ' → ' + item.stages.join('/')).join('、'));
      return lines.join('\n');
    }
    const lines = [data.id + ' v' + data.version + ' · 类别 ' + data.category + ' · 默认宽度 ' + data.defaultWidth];
    lines.push('状态：' + data.states.map((item) => item.id + '（' + item.label + '）').join('、'));
    if (data.tags && data.tags.length) lines.push('标签：' + data.tags.join('、'));
    if (data.consumedState) lines.push('被用掉后：' + data.consumedState + (data.hiddenStates.length ? '（不绘制：' + data.hiddenStates.join('、') + '）' : ''));
    lines.push('事件：' + (data.events.length ? data.events.join('、') : '无'));
    lines.push('声明：' + data.slots.map((item) => item.name + ' v' + item.version + ' ' + JSON.stringify(item.params)).join('、'));
    lines.push('字段：' + data.fields.join('、'));
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
    if (flags.version || command === 'version') {
      const data = { name: 'gothere', version, kind: 'cli' };
      return { result: { ok: true, code: CODES.OK, data }, render: () => 'gothere ' + version };
    }
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
      out(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    if (outcome && typeof outcome.render === 'function') {
      out(outcome.render(result) + '\n');
      return;
    }
    out(JSON.stringify(result, null, 2) + '\n');
  }

  async function main() {
    try {
      if (parseError) throw domainError(CODES.USAGE, parseError);
      const service = createLevelService(await loadDocs());
      const outcome = await run({ service });
      emit(outcome.result, outcome);
      const code = outcome.result.ok ? CODES.OK : outcome.result.code;
      return exitCode(code);
    } catch (error) {
      const code = typeof error.code === 'string' ? error.code : CODES.INTERNAL;
      const result = { ok: false, code, errors: error.errors ?? [{ code, path: '', message: error.message }] };
      if (wantsJson) out(JSON.stringify(result, null, 2) + '\n');
      else {
        err('✗ ' + error.message + '\n\n' + (code === CODES.USAGE ? USAGE + '\n' : ''));
        out(JSON.stringify(result, null, 2) + '\n');
      }
      return exitCode(code);
    }
  }

  return main();
}
