// 版本与支持矩阵：纯函数，不认识任何上层。
// 能力支持来自「已注册的能力实现」，类型支持来自「数据里的预设 × 能力是否实现」，
// 文档解释器只声明它能读哪些 schemaVersion —— 三者相乘才是平台真正能跑的东西。

import { listCapabilities } from '../capabilities/index.js';
import { createType, listTypeDescriptors } from '../interpreters/factories/index.js';

export const SCHEMA_VERSION = 1;

export const PLATFORM = Object.freeze({ name: 'gothere', version: '0.2.0' });

const positive = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback);

export function entityTypeVersion(entity) {
  const type = createType(entity && entity.kind);
  return positive(entity && entity.typeVersion, type ? type.version : 1);
}

/**
 * 从文档里抽出它要求的全部版本。
 * 声明式要求：导出时写进文档，不靠「默认最新」，否则无法复现。
 */
export function requirementsOf(doc) {
  const types = {};
  const capabilities = {};
  const schema = doc && Number.isInteger(doc.schemaVersion) ? doc.schemaVersion : 0;
  const entities = doc && Array.isArray(doc.entities) ? doc.entities : [];
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    if (typeof entity.kind === 'string') {
      types[entity.kind] = Math.max(types[entity.kind] ?? 0, entityTypeVersion(entity));
    }
    const declared = entity.capabilities;
    if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
      for (const [name, params] of Object.entries(declared)) {
        if (params === false || params === null) continue;
        const capability = listCapabilities().find((item) => item.id === name);
        capabilities[name] = Math.max(capabilities[name] ?? 0, capability ? capability.version : 1);
      }
    }
  }
  return { schema, types, capabilities };
}

/** 已实现的能力 → 支持的版本。 */
export function capabilityVersions() {
  const out = {};
  for (const capability of listCapabilities()) out[capability.id] = [capability.version];
  return out;
}

/** 能跑的类型 → 支持的版本：工厂产出的类型，且它的每条能力都有实现。 */
export function typeVersions() {
  const implemented = new Set(listCapabilities().map((capability) => capability.id));
  const out = {};
  for (const type of listTypeDescriptors()) {
    const missing = Object.keys(type.capabilities).filter((name) => !implemented.has(name));
    if (missing.length === 0) out[type.id] = [type.version];
  }
  return out;
}

/** 平台对外支持集：解释器声明能读的 schema × 数据里的类型 × 已实现的能力。 */
export function platformSupports(interpreters) {
  const schema = new Set();
  for (const interpreter of interpreters) {
    for (const version of interpreter.supports?.schema ?? []) schema.add(version);
  }
  return {
    schema: [...schema].sort((a, b) => a - b),
    types: typeVersions(),
    capabilities: capabilityVersions(),
  };
}

/** 一组支持声明能否覆盖文档的全部版本要求；不覆盖时回报具体缺口。 */
export function covers(supports, requirements) {
  const gaps = [];
  const schema = supports && Array.isArray(supports.schema) ? supports.schema : [];
  if (!schema.includes(requirements.schema)) {
    gaps.push({ layer: 'schema', name: 'schemaVersion', required: requirements.schema, supported: [...schema] });
  }
  collectGaps(gaps, 'type', supports && supports.types, requirements.types);
  collectGaps(gaps, 'capability', supports && supports.capabilities, requirements.capabilities);
  return { ok: gaps.length === 0, gaps };
}

function collectGaps(gaps, layer, table, required) {
  for (const [name, version] of Object.entries(required)) {
    const list = table && Array.isArray(table[name]) ? table[name] : [];
    if (!list.includes(version)) {
      gaps.push({ layer, name, required: version, supported: [...list] });
    }
  }
}

/** 人类可读的版本要求，用在错误文案里。 */
export function describeRequirements(requirements) {
  const parts = ['schemaVersion ' + requirements.schema];
  for (const [name, version] of Object.entries(requirements.types)) parts.push(name + '@' + version);
  for (const [name, version] of Object.entries(requirements.capabilities)) parts.push(name + '@' + version);
  return parts.join(' · ');
}

/** 缺口的可读描述，用于 UNSUPPORTED_VERSION 的 details。 */
export function describeGaps(gaps) {
  return gaps.map((gap) => {
    const supported = gap.supported.length ? 'v' + gap.supported.join('/v') : '无';
    if (gap.layer === 'schema') return 'schemaVersion 需要 ' + gap.required + '（支持：' + supported + '）';
    return gap.layer + ' ' + gap.name + ' 需要 v' + gap.required + '（支持：' + supported + '）';
  });
}
