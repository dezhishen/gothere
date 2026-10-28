// 版本与解释器支持矩阵：平台声明能解释哪些 schema / 类型 / 能力的哪些版本。
// 纯函数，不认识任何上层；解释器的注册与选择在 core/interpreter/registry.js。

import { CAPABILITIES, TYPES } from './registry.js';

export const SCHEMA_VERSION = 1;

export const PLATFORM = Object.freeze({ name: 'gothere', version: '0.2.0' });

const positive = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback);

export function entityTypeVersion(entity) {
  const type = entity && TYPES[entity.kind];
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
      for (const name of Object.keys(declared)) {
        const version = CAPABILITIES[name] ? CAPABILITIES[name].version : 1;
        capabilities[name] = Math.max(capabilities[name] ?? 0, version);
      }
    }
  }
  return { schema, types, capabilities };
}

/** 一个解释器能否覆盖文档的全部版本要求；不覆盖时回报具体缺口。 */
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

/** 平台整体支持集：多个解释器声明取并集。主线程用它对外暴露。 */
export function mergeSupports(interpreters) {
  const schema = new Set();
  const types = new Map();
  const capabilities = new Map();
  for (const interpreter of interpreters) {
    const supports = interpreter && interpreter.supports;
    if (!supports) continue;
    for (const version of supports.schema ?? []) schema.add(version);
    addVersions(types, supports.types);
    addVersions(capabilities, supports.capabilities);
  }
  return {
    schema: [...schema].sort((a, b) => a - b),
    types: tableToObject(types),
    capabilities: tableToObject(capabilities),
  };
}

function addVersions(table, source) {
  if (!source) return;
  for (const [name, versions] of Object.entries(source)) {
    if (!table.has(name)) table.set(name, new Set());
    for (const version of versions) table.get(name).add(version);
  }
}

function tableToObject(table) {
  const out = {};
  for (const name of [...table.keys()].sort()) {
    out[name] = [...table.get(name)].sort((a, b) => a - b);
  }
  return out;
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
