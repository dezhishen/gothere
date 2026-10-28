// 解释器：level@1 文档骨架。负责 schemaVersion 1 怎么读、动作怎么解释、tick 怎么推进。
// 类型与能力**不在**它的支持声明里——它们是数据与能力实现，由 platformSupports 聚合。

import { compileModel } from '../contract/compile.js';
import { validateDoc } from '../contract/validate.js';
import { createSimulation } from '../kernel/engine.js';

const SUPPORTS = Object.freeze({ schema: Object.freeze([1]) });

export function createLevelInterpreter() {
  return Object.freeze({
    kind: 'level',
    id: 'level-1',
    version: 1,
    supports: SUPPORTS,
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
  });
}
