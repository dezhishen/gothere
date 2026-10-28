// schemaVersion 1 的解释器：完成解析（四层校验 + 编译成模型）并驱动内核。
// 解释器编译在平台里，内容不能携带代码，也不能提供解释器。

import { compileModel } from '../contract/compile.js';
import { CAPABILITIES, TYPES } from '../contract/registry.js';
import { validateDoc } from '../contract/validate.js';
import { createSimulation } from '../kernel/engine.js';
import { replayRecording } from '../kernel/replay.js';

const schemaVersions = Object.freeze([1]);

const typeVersions = Object.freeze(Object.fromEntries(
  Object.keys(TYPES).map((kind) => [kind, Object.freeze([TYPES[kind].version])]),
));

const capabilityVersions = Object.freeze(Object.fromEntries(
  Object.keys(CAPABILITIES).map((name) => [name, Object.freeze([CAPABILITIES[name].version])]),
));

export const V1_SUPPORTS = Object.freeze({
  schema: schemaVersions,
  types: typeVersions,
  capabilities: capabilityVersions,
});

export function createV1Interpreter() {
  return Object.freeze({
    id: 'core-v1',
    apiVersion: 1,
    supports: V1_SUPPORTS,
    parse(input, options = {}) {
      const validation = validateDoc(input, { mode: options.mode ?? 'playable' });
      if (!validation.ok) {
        return { ok: false, code: validation.code, errors: validation.errors };
      }
      return { ok: true, code: 'OK', errors: [], doc: input, model: compileModel(input) };
    },
    createSimulation(model) {
      return createSimulation(model);
    },
    replay(model, recording) {
      return replayRecording(model, recording);
    },
  });
}
