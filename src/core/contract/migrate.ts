// 迁移表：表驱动、纯函数。当前只有 schemaVersion 1，因此「同版本直通、更高版本明确拒绝」。
// 在第一次破坏性变更之前必须先有表，否则版本号只是装饰。

import { SCHEMA_VERSION } from './versions.ts';

import type { ValidationIssue } from './types.ts';

/** 一步迁移：从 from 版本到 to 版本。运行时从不隐式迁移。 */
export interface Migration {
  from: number;
  to: number;
  apply(doc: Record<string, unknown>): Record<string, unknown>;
}

export const MIGRATIONS: ReadonlyArray<Migration> = Object.freeze([]);

export type MigrateResult =
  | { ok: true; code: string; doc: Record<string, unknown>; applied: string[] }
  | { ok: false; code: string; errors: ValidationIssue[] };

const failure = (code: string, path: string, message: string): MigrateResult => ({ ok: false, code, errors: [{ code, path, message }] });

export function migrate(doc: unknown, options: { target?: number } = {}): MigrateResult {
  const target = Number.isInteger(options.target) ? options.target! : SCHEMA_VERSION;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return failure('SCHEMA_INVALID', '', '关卡必须是一个 JSON 对象。');
  }
  const source = doc as Record<string, unknown>;
  const from = source.schemaVersion as number | undefined;
  if (from === target) return { ok: true, code: 'OK', doc: source, applied: [] };
  if (Number.isInteger(from) && from! > target) {
    return failure('UNSUPPORTED_VERSION', 'schemaVersion',
      '文档版本 ' + from + ' 高于平台支持的目标版本 ' + target + '，不做降级解析。');
  }
  const path = findPath(from, target);
  if (!path) {
    return failure('UNSUPPORTED_VERSION', 'schemaVersion',
      '没有从 schemaVersion ' + from + ' 到 ' + target + ' 的迁移器。');
  }
  let current = source;
  const applied: string[] = [];
  for (const step of path) {
    current = step.apply(current);
    applied.push(step.from + '→' + step.to);
  }
  return { ok: true, code: 'OK', doc: current, applied };
}

function findPath(from: number | undefined, to: number): Migration[] | null {
  const queue: Array<[number | undefined, Migration[]]> = [[from, []]];
  const seen = new Set<number | undefined>([from]);
  while (queue.length > 0) {
    const [version, steps] = queue.shift()!;
    if (version === to) return steps;
    for (const migration of MIGRATIONS) {
      if (migration.from !== version || seen.has(migration.to)) continue;
      seen.add(migration.to);
      queue.push([migration.to, [...steps, migration]]);
    }
  }
  return null;
}
