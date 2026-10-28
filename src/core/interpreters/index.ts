// 解释器注册表：一种数据类型一组解释器。
//   level     关卡文档     —— 解析（四层校验 + 编译）并驱动内核
//   bundle    单文件内联包 —— 校验自包含的关卡集合
//   manifest  内容清单     —— 校验关卡目录并给出读取顺序
//   recording 回放记录     —— 校验操作序列并重推
// 每条声明的 supports 是它覆盖的版本；没有覆盖就明确失败，绝不「尽力解释」。
// 新增一种数据类型 = 加一份文件 + 在 resetInterpreters 里登记一行。

import { COMMON_FIELDS, listTypes } from '../contract/registry.ts';

import type { ValidationIssue, ValidationMode } from '../contract/types.ts';
import { validateDoc } from '../contract/validate.ts';
import { covers, describeGaps, describeRequirements, platformSupports, requirementsOf, PLATFORM, SCHEMA_VERSION } from '../contract/versions.ts';
import { listFactories } from './factories/index.ts';
import { createBundleInterpreter } from './bundle-1.ts';
import { createLevelInterpreter } from './level-1.ts';
import { createManifestInterpreter } from './manifest-1.ts';
import { createRecordingInterpreter } from './recording-1.ts';

export const KINDS = Object.freeze(['level', 'bundle', 'manifest', 'recording']);

const REQUIRED = Object.freeze({
  level: Object.freeze(['parse', 'createSimulation']),
  bundle: Object.freeze(['parse']),
  manifest: Object.freeze(['parse']),
  recording: Object.freeze(['parse', 'replay']),
});

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const interpreters = new Map();

export function registerInterpreter(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') throw new Error('解释器必须是一个对象。');
  const { kind, id, version, supports } = descriptor;
  if (!KINDS.includes(kind)) throw new Error('解释器的 kind 必须是 ' + KINDS.join(' / ') + '，收到 ' + String(kind) + '。');
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error('解释器 id 必须以小写字母开头，且只含小写字母、数字或短横线。');
  }
  if (!Number.isInteger(version) || version < 1) throw new Error('解释器 version 必须是正整数。');
  if (!supports || !Array.isArray(supports.schema) || supports.schema.length === 0) {
    throw new Error('解释器必须声明 supports.schema。');
  }
  for (const method of REQUIRED[kind]) {
    if (typeof descriptor[method] !== 'function') throw new Error(kind + ' 解释器必须实现 ' + method + '()。');
  }
  if (interpreters.has(id)) throw new Error('解释器 ' + id + ' 已注册。');
  interpreters.set(id, descriptor);
  return descriptor;
}

export function unregisterInterpreter(id) {
  return interpreters.delete(id);
}

export function getInterpreter(id) {
  return interpreters.get(id) ?? null;
}

/** 按 kind 过滤；同一 kind 内按 version 降序、id 升序，选择才是确定的。 */
export function listInterpreters(kind) {
  const all = [...interpreters.values()].filter((interpreter) => kind === undefined || interpreter.kind === kind);
  return all.sort((a, b) => {
    const order = KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind);
    if (order !== 0) return order;
    if (a.version !== b.version) return b.version - a.version;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 平台编译进哪些解释器，就由这份清单决定。 */
export function resetInterpreters() {
  interpreters.clear();
  registerInterpreter(createLevelInterpreter());
  registerInterpreter(createBundleInterpreter());
  registerInterpreter(createManifestInterpreter());
  registerInterpreter(createRecordingInterpreter());
}

/** 平台对外声明：三种数据类型的解释器，加上关卡类型与能力的支持集。 */
export function describePlatform() {
  const list = listInterpreters();
  return {
    platform: { name: PLATFORM.name, version: PLATFORM.version },
    schemaVersion: SCHEMA_VERSION,
    kinds: [...KINDS],
    interpreters: list.map((interpreter) => ({
      kind: interpreter.kind,
      id: interpreter.id,
      version: interpreter.version,
      supports: interpreter.supports,
    })),
    supports: platformSupports(listInterpreters('level')),
    types: listTypes(),
    factories: listFactories().map((factory) => ({
      category: factory.category,
      version: factory.version,
      label: factory.schema.label,
      kinds: [...factory.kinds],
      slots: [...factory.schema.slots],
      fields: Object.freeze([...COMMON_FIELDS, ...factory.schema.slots]),
    })),
  };
}

/**
 * 两级解析：
 * 1. 选中能读这份关卡骨架（schemaVersion）的解释器；
 * 2. 要求平台实现覆盖文档用到的每个「类型@版本」与「能力@版本」。
 */
export function resolveInterpreter(doc) {
  const requirements = requirementsOf(doc);
  const list = listInterpreters('level');
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
export function parseLevel(input: unknown, options: { mode?: ValidationMode } = {}) {
  const mode = options.mode === 'editable' ? 'editable' : 'playable';
  const resolution = resolveInterpreter(input);
  if (!resolution.ok) return diagnose(input, mode, resolution);
  const parsed = resolution.interpreter.parse(input, options);
  return {
    ...parsed,
    requirements: resolution.requirements,
    interpreter: { kind: resolution.interpreter.kind, id: resolution.interpreter.id, version: resolution.interpreter.version },
  };
}

/** 带稳定错误码的异常：CLI 与上层都靠它判断，不解析 message。 */
export interface CodedError extends Error { code?: string; errors?: ValidationIssue[] }

function errorFrom(result: { code?: string; errors?: ValidationIssue[] }): CodedError {
  const error = new Error((result.errors ?? []).map((item) => item.message).join('\n') || '解析失败。') as CodedError;
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

/** 运行：解析后交给选中的关卡解释器驱动。 */
export function createGame(doc) {
  return runWith(doc, 'playable', (interpreter, model) => interpreter.createSimulation(model));
}

/** 回放：关卡解释器编译 + 回放记录解释器校验与重推。 */
export function replayLevel(doc, recording) {
  return runWith(doc, 'playable', (interpreter, model) => {
    const recorder = listInterpreters('recording')[0];
    if (!recorder) {
      throw errorFrom({
        code: 'UNSUPPORTED_VERSION',
        errors: [{ code: 'UNSUPPORTED_VERSION', path: '', message: '平台没有注册回放记录解释器。' }],
      });
    }
    const parsed = recorder.parse(recording);
    if (!parsed.ok) throw errorFrom(parsed);
    return recorder.replay(model, parsed.recording);
  });
}

/** 内容清单：交给清单解释器校验，返回可读的关卡顺序。 */
export function parseManifest(text) {
  const impl = listInterpreters('manifest')[0];
  if (!impl) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VERSION',
      errors: [{ code: 'UNSUPPORTED_VERSION', path: '', message: '平台没有注册内容清单解释器。' }],
      entries: [],
    };
  }
  return impl.parse(text);
}

/** 单文件产物：校验内联关卡包，返回其中的关卡文档。 */
export function parseBundle(payload) {
  const impl = listInterpreters('bundle')[0];
  if (!impl) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VERSION',
      errors: [{ code: 'UNSUPPORTED_VERSION', path: '', message: '平台没有注册内联包解释器。' }],
      levels: [],
    };
  }
  return impl.parse(payload);
}

resetInterpreters();
