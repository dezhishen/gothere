// 版本与支持矩阵：纯函数，不认识任何上层。
// 能力支持来自「已注册的能力实现」，类型支持来自「数据里的预设 × 能力是否实现」，
// 文档解释器只声明它能读哪些 schemaVersion —— 三者相乘才是平台真正能跑的东西。

import { listSlots } from '../capabilities/index.ts';
import { createType, listTypeDescriptors } from '../interpreters/factories/index.ts';

import type { Interpreter } from './types.ts';

export const SCHEMA_VERSION = 1;

/** 一处版本缺口：哪一层、哪个名字、需要什么、平台支持什么。 */
export interface VersionGap {
  layer: string;
  name: string;
  required: number;
  supported: number[];
}

/** 文档要求的版本集合（导出时写进文档，不靠“默认最新”）。 */
export interface Requirements {
  schema: number;
  types: Record<string, number>;
  capabilities: Record<string, number>;
}

/** 平台支持集：解释器能读的 schema × 数据里的类型 × 已实现的能力。 */
export interface Supports {
  schema: number[];
  types: Record<string, number[]>;
  capabilities: Record<string, number[]>;
}

export const PLATFORM = Object.freeze({ name: 'gothere', version: '0.1.0' });

const positive = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback);

export function entityTypeVersion(entity: { kind?: string; typeVersion?: number } | null | undefined): number {
  const type = createType(entity && entity.kind);
  return positive(entity && entity.typeVersion, type ? type.version : 1);
}

/**
 * 从文档里抽出它要求的全部版本。
 * 声明式要求：导出时写进文档，不靠「默认最新」，否则无法复现。
 */
export function requirementsOf(doc: unknown): Requirements {
  const types = {};
  const capabilities = {};
  const source = (doc ?? {}) as { schemaVersion?: number; entities?: unknown[] };
  const schema = Number.isInteger(source.schemaVersion) ? source.schemaVersion! : 0;
  const entities: unknown[] = Array.isArray(source.entities) ? source.entities : [];
  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const record = entity as { kind?: string; typeVersion?: number } & Record<string, unknown>;
    if (typeof record.kind === 'string') {
      types[record.kind] = Math.max(types[record.kind] ?? 0, entityTypeVersion(record));
    }
    const implemented = listSlots();
    for (const slot of implemented) {
      const params = record[slot.id];
      if (params === undefined || params === false || params === null) continue;
      capabilities[slot.id] = Math.max(capabilities[slot.id] ?? 0, slot.version);
    }
  }
  return { schema, types, capabilities };
}

/** 已实现的声明槽 → 支持的版本。 */
export function capabilityVersions(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const slot of listSlots()) out[slot.id] = [slot.version];
  return out;
}

/** 能跑的类型 → 支持的版本：工厂产出的类型，且它用到的每个声明槽都有实现。 */
export function typeVersions(): Record<string, number[]> {
  const implemented = new Set(listSlots().map((slot) => slot.id));
  const out: Record<string, number[]> = {};
  for (const type of listTypeDescriptors()) {
    const missing = Object.keys(type.slots).filter((name) => !implemented.has(name));
    if (missing.length === 0) out[type.id] = [type.version];
  }
  return out;
}

/** 平台对外支持集：解释器声明能读的 schema × 数据里的类型 × 已实现的能力。 */
export function platformSupports(interpreters: ReadonlyArray<Interpreter>): Supports {
  const schema = new Set<number>();
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
export function covers(supports: Supports | null | undefined, requirements: Requirements): { ok: boolean; gaps: VersionGap[] } {
  const gaps: VersionGap[] = [];
  const schema = supports && Array.isArray(supports.schema) ? supports.schema : [];
  if (!schema.includes(requirements.schema)) {
    gaps.push({ layer: 'schema', name: 'schemaVersion', required: requirements.schema, supported: [...schema] });
  }
  collectGaps(gaps, 'type', supports && supports.types, requirements.types);
  collectGaps(gaps, 'capability', supports && supports.capabilities, requirements.capabilities);
  return { ok: gaps.length === 0, gaps };
}

function collectGaps(gaps: VersionGap[], layer: string, table: Record<string, number[]> | null | undefined, required: Record<string, number>): void {
  for (const [name, version] of Object.entries(required)) {
    const list = table && Array.isArray(table[name]) ? table[name] : [];
    if (!list.includes(version)) {
      gaps.push({ layer, name, required: version, supported: [...list] });
    }
  }
}

/** 人类可读的版本要求，用在错误文案里。 */
export function describeRequirements(requirements: Requirements): string {
  const parts = ['schemaVersion ' + requirements.schema];
  for (const [name, version] of Object.entries(requirements.types)) parts.push(name + '@' + version);
  for (const [name, version] of Object.entries(requirements.capabilities)) parts.push(name + '@' + version);
  return parts.join(' · ');
}

/** 缺口的可读描述，用于 UNSUPPORTED_VERSION 的 details。 */
export function describeGaps(gaps: ReadonlyArray<VersionGap>): string[] {
  return gaps.map((gap) => {
    const supported = gap.supported.length ? 'v' + gap.supported.join('/v') : '无';
    if (gap.layer === 'schema') return 'schemaVersion 需要 ' + gap.required + '（支持：' + supported + '）';
    return gap.layer + ' ' + gap.name + ' 需要 v' + gap.required + '（支持：' + supported + '）';
  });
}
