// 解析器注册表：平台可以注册多个解释器，按文档的版本要求选一个来解析并运行。
// 选择是确定的：apiVersion 降序、id 升序；任一要求无覆盖就明确失败，绝不「尽力解释」。

import { listTypes } from '../contract/registry.js';
import { validateDoc } from '../contract/validate.js';
import { covers, describeGaps, describeRequirements, mergeSupports, requirementsOf, PLATFORM, SCHEMA_VERSION } from '../contract/versions.js';
import { createV1Interpreter } from './v1.js';

const interpreters = new Map();

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function registerInterpreter(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') throw new Error('解析器必须是一个对象。');
  const { id, apiVersion, supports } = descriptor;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error('解析器 id 必须以小写字母开头，且只含小写字母、数字或短横线。');
  }
  if (!Number.isInteger(apiVersion) || apiVersion < 1) throw new Error('解析器 apiVersion 必须是正整数。');
  if (!supports || !Array.isArray(supports.schema)) throw new Error('解析器必须声明 supports.schema。');
  if (typeof descriptor.parse !== 'function') throw new Error('解析器必须实现 parse(doc, options)。');
  if (typeof descriptor.createSimulation !== 'function') throw new Error('解析器必须实现 createSimulation(model)。');
  if (interpreters.has(id)) throw new Error('解析器 ' + id + ' 已注册。');
  interpreters.set(id, descriptor);
  return descriptor;
}

export function unregisterInterpreter(id) {
  return interpreters.delete(id);
}

export function getInterpreter(id) {
  return interpreters.get(id) ?? null;
}

export function listInterpreters() {
  return [...interpreters.values()].sort((a, b) => {
    if (a.apiVersion !== b.apiVersion) return b.apiVersion - a.apiVersion;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 恢复默认注册表：平台只带 core-v1，新增版本 = 发布新平台。 */
export function resetInterpreters() {
  interpreters.clear();
  registerInterpreter(createV1Interpreter());
}

/** 平台的对外声明：有哪些解释器、整体支持哪些 schema / 类型 / 能力版本。 */
export function describePlatform() {
  const list = listInterpreters();
  return {
    platform: { name: PLATFORM.name, version: PLATFORM.version },
    schemaVersion: SCHEMA_VERSION,
    interpreters: list.map((interpreter) => ({
      id: interpreter.id,
      apiVersion: interpreter.apiVersion,
      supports: interpreter.supports,
    })),
    supports: mergeSupports(list),
    types: listTypes(),
  };
}

/** 选一个解释器：覆盖文档全部版本要求、且排序在前的那个。 */
export function resolveInterpreter(doc) {
  const requirements = requirementsOf(doc);
  const report = [];
  for (const interpreter of listInterpreters()) {
    const coverage = covers(interpreter.supports, requirements);
    if (coverage.ok) return { ok: true, interpreter, requirements, gaps: [] };
    report.push({ interpreter: interpreter.id, gaps: coverage.gaps });
  }
  return { ok: false, requirements, gaps: report };
}

function unsupported(result) {
  const detail = result.gaps.length === 0
    ? '平台没有注册任何解释器。'
    : result.gaps.map((item) => item.interpreter + '：' + describeGaps(item.gaps).join('；')).join(' / ');
  return {
    ok: false,
    code: 'UNSUPPORTED_VERSION',
    errors: [{
      code: 'UNSUPPORTED_VERSION',
      path: '',
      message: '没有解释器覆盖 ' + describeRequirements(result.requirements) + '。' + detail,
    }],
    requirements: result.requirements,
    gaps: result.gaps,
  };
}

/** 没有解释器能覆盖时，先看内容本身是否就坏了：内容错误比版本缺口更可行动。 */
function diagnose(input, mode, resolution) {
  const validation = validateDoc(input, { mode });
  if (!validation.ok) return { ...validation, requirements: resolution.requirements, gaps: resolution.gaps };
  return unsupported(resolution);
}

/** 解析 = 选解释器 + 四层校验 + 编译成模型；不运行。 */
export function parseLevel(input, options = {}) {
  const mode = options.mode === 'editable' ? 'editable' : 'playable';
  const resolution = resolveInterpreter(input);
  if (!resolution.ok) return diagnose(input, mode, resolution);
  const parsed = resolution.interpreter.parse(input, options);
  return {
    ...parsed,
    requirements: resolution.requirements,
    interpreter: { id: resolution.interpreter.id, apiVersion: resolution.interpreter.apiVersion },
  };
}

function errorFrom(result) {
  const error = new Error((result.errors ?? []).map((item) => item.message).join('\n') || '解析失败。');
  error.code = result.code;
  error.errors = result.errors ?? [];
  return error;
}

function runWith(doc, mode, action) {
  const resolution = resolveInterpreter(doc);
  if (!resolution.ok) throw errorFrom(diagnose(doc, mode, resolution));
  const parsed = resolution.interpreter.parse(doc, { mode });
  if (!parsed.ok) throw errorFrom(parsed);
  return action(resolution.interpreter, parsed.model);
}

/** 运行：解析后交给选中的解释器驱动。 */
export function createGame(doc) {
  return runWith(doc, 'playable', (interpreter, model) => interpreter.createSimulation(model));
}

/** 回放：同一解释器 + 同一模型重推。 */
export function replayLevel(doc, recording) {
  return runWith(doc, 'playable', (interpreter, model) => {
    if (typeof interpreter.replay !== 'function') {
      const error = new Error('解析器 ' + interpreter.id + ' 不支持回放。');
      error.code = 'UNSUPPORTED_VERSION';
      throw error;
    }
    return interpreter.replay(model, recording);
  });
}

resetInterpreters();
