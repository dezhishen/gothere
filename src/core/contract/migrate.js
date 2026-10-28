// 迁移表：表驱动、纯函数。当前只有 schemaVersion 1，因此「同版本直通、更高版本明确拒绝」。
// 在第一次破坏性变更之前必须先有表，否则版本号只是装饰。

import { SCHEMA_VERSION } from './versions.js';

/** 每条形如 { from, to, apply(doc) → doc }；运行时从不隐式迁移。 */
export const MIGRATIONS = Object.freeze([]);

export function migrate(doc, options = {}) {
  const target = Number.isInteger(options.target) ? options.target : SCHEMA_VERSION;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, code: 'SCHEMA_INVALID', errors: [{ code: 'SCHEMA_INVALID', path: '', message: '关卡必须是一个 JSON 对象。' }] };
  }
  const from = doc.schemaVersion;
  if (from === target) return { ok: true, code: 'OK', doc, applied: [] };
  if (Number.isInteger(from) && from > target) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VERSION',
      errors: [{ code: 'UNSUPPORTED_VERSION', path: 'schemaVersion', message: '文档版本 ' + from + ' 高于平台支持的目标版本 ' + target + '，不做降级解析。' }],
    };
  }
  const path = findPath(from, target);
  if (!path) {
    return {
      ok: false,
      code: 'UNSUPPORTED_VERSION',
      errors: [{ code: 'UNSUPPORTED_VERSION', path: 'schemaVersion', message: '没有从 schemaVersion ' + from + ' 到 ' + target + ' 的迁移器。' }],
    };
  }
  let current = doc;
  const applied = [];
  for (const step of path) {
    current = step.apply(current);
    applied.push(step.from + '→' + step.to);
  }
  return { ok: true, code: 'OK', doc: current, applied };
}

function findPath(from, to) {
  const queue = [[from, []]];
  const seen = new Set([from]);
  while (queue.length) {
    const [version, steps] = queue.shift();
    if (version === to) return steps;
    for (const migration of MIGRATIONS) {
      if (migration.from !== version || seen.has(migration.to)) continue;
      seen.add(migration.to);
      queue.push([migration.to, [...steps, migration]]);
    }
  }
  return null;
}
