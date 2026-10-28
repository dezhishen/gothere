// 文档解释器注册表：一个解释器只负责一种「文档骨架 + 动作词汇 + tick 顺序」。
// 它不拥有类型：类型是数据（contract/registry），类型能不能跑由能力实现（core/capabilities）决定。
// 选择是确定的：schema 命中后按 apiVersion 降序、id 升序；任一要求无覆盖就明确失败。

import { listTypes } from '../contract/registry.js';
import { validateDoc } from '../contract/validate.js';
import { covers, describeGaps, describeRequirements, platformSupports, requirementsOf, PLATFORM, SCHEMA_VERSION } from '../contract/versions.js';
import { createLevelInterpreter } from './level-1.js';

const interpreters = new Map();

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** 解释器只需要声明它能读哪些 schemaVersion；类型与能力由平台聚合。 */
export function registerInterpreter(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') throw new Error('解析器必须是一个对象。');
  const { id, apiVersion, supports } = descriptor;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error('解析器 id 必须以小写字母开头，且只含小写字母、数字或短横线。');
  }
  if (!Number.isInteger(apiVersion) || apiVersion < 1) throw new Error('解析器 apiVersion 必须是正整数。');
  if (!supports || !Array.isArray(supports.schema) || supports.schema.length === 0) {
    throw new Error('解析器必须声明 supports.schema。');
  }
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

/** 恢复默认注册表：平台只带 level-1，新增文档格式 = 发布新平台。 */
export function resetInterpreters() {
  interpreters.clear();
  registerInterpreter(createLevelInterpreter());
}

/** 平台的对外声明：文档解释器 × 数据里的类型 × 已实现的能力。 */
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
    supports: platformSupports(list),
    types: listTypes(),
  };
}

/**
 * 两级解析：
 * 1. 先选中能读这份文档骨架（schemaVersion）的解释器；
 * 2. 再要求平台实现覆盖文档用到的每个「类型@版本」与「能力@版本」。
 */
export function resolveInterpreter(doc) {
  const requirements = requirementsOf(doc);
  const list = listInterpreters();
  const supports = platformSupports(list);
  const interpreter = list.find((item) => item.supports.schema.includes(requirements.schema));
  if (!interpreter) {
    return {
      ok: false,
      requirements,
      gaps: [{
        interpreter: 'platform',
        gaps: [{ layer: 'schema', name: 'schemaVersion', required: requirements.schema, supported: supports.schema }],
      }],
    };
  }
  const coverage = covers(supports, requirements);
  if (!coverage.ok) return { ok: false, requirements, gaps: [{ interpreter: interpreter.id, gaps: coverage.gaps }] };
  return { ok: true, interpreter, requirements, gaps: [] };
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
      message: '没有实现覆盖 ' + describeRequirements(result.requirements) + '。' + detail,
    }],
    requirements: result.requirements,
    gaps: result.gaps,
  };
}

/** 没有实现能覆盖时，先看内容本身是否就坏了：内容错误比缺口更可行动。 */
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
      const error = new Error('解释器 ' + interpreter.id + ' 不支持回放。');
      error.code = 'UNSUPPORTED_VERSION';
      throw error;
    }
    return interpreter.replay(model, recording);
  });
}

resetInterpreters();
