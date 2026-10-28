// 用例层：无 DOM、无 node:*、无网络。内容由 levelSource 注入，编辑器、CLI 与 Agent 走同一份实现。

import { LIMITS } from '../core/contract/constants.js';
import { diffDocs } from '../core/contract/diff.js';
import { describe } from '../core/contract/registry.js';
import { createGame, describePlatform, parseLevel, replayLevel } from '../core/interpreter/registry.js';
import { CODES, domainError, errorItem, toCode } from './errors.js';
import { summarize } from './levelSource.js';

export function platformInfo() {
  return { ok: true, code: CODES.OK, data: describePlatform() };
}

export function describeTypes(kind) {
  if (kind === undefined || kind === null) return { ok: true, code: CODES.OK, data: describe() };
  const described = describe(kind);
  if (!described) throw domainError(CODES.NOT_FOUND, '没有这种类型：' + String(kind) + '。');
  return { ok: true, code: CODES.OK, data: described };
}

function normalizeMode(mode) {
  return mode === 'editable' ? 'editable' : 'playable';
}

function normalizeInputs(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw domainError(CODES.USAGE, 'inputs 必须是 [{tick,source}] 数组。');
  let previous = 0;
  return value.map((item, index) => {
    if (!item || !Number.isInteger(item.tick) || item.tick < 1 || typeof item.source !== 'string') {
      throw domainError(CODES.USAGE, 'inputs[' + index + '] 需要 tick（≥1 的整数）与 source（字符串）。');
    }
    if (item.tick < previous) throw domainError(CODES.USAGE, 'inputs 必须按 tick 非递减排列。');
    previous = item.tick;
    return { tick: item.tick, source: item.source };
  });
}

/** 只吃文档的纯用例：CLI、测试与编辑器都能直接调用。 */
export function validateDocInput(doc, mode) {
  const resolvedMode = normalizeMode(mode);
  const result = parseLevel(doc, { mode: resolvedMode });
  return {
    ok: result.ok,
    code: result.ok ? CODES.OK : result.code,
    errors: result.errors ?? [],
    data: {
      valid: result.ok,
      mode: resolvedMode,
      id: doc.id,
      requirements: result.requirements,
      interpreter: result.interpreter ?? null,
      gaps: result.gaps ?? [],
    },
  };
}

export function simulateDocInput(doc, options = {}) {
  const until = options.until === undefined ? LIMITS.maxTicks : options.until;
  if (!Number.isInteger(until) || until < 0 || until > LIMITS.maxTicks) {
    throw domainError(CODES.USAGE, 'until 必须是 0～' + LIMITS.maxTicks + ' 的整数。');
  }
  const parsed = parseLevel(doc, { mode: 'playable' });
  if (!parsed.ok) return { ok: false, code: parsed.code, errors: parsed.errors, data: { valid: false, id: doc.id } };
  const inputs = normalizeInputs(options.inputs);
  const game = createGame(doc);
  game.start();
  let index = 0;
  let tick = 0;
  for (tick = 1; tick <= until && game.snapshot().status === 'running'; tick += 1) {
    while (index < inputs.length && inputs[index].tick === tick) {
      if (!game.click(inputs[index].source)) {
        return {
          ok: false,
          code: CODES.SIM_FAILED,
          errors: [errorItem(CODES.SIM_FAILED, 'inputs[' + index + ']', '第 ' + tick + ' tick 无法操作 ' + inputs[index].source + '。')],
          data: { tick: game.snapshot().tick },
        };
      }
      index += 1;
    }
    game.step();
  }
  const state = game.snapshot();
  return {
    ok: true,
    code: CODES.OK,
    data: {
      id: doc.id,
      status: state.status,
      reason: state.reason,
      terminalCode: state.status === 'lost' ? toCode(state.reason) : null,
      tick: state.tick,
      clicks: state.clicks,
      actor: state.actor,
      entities: state.entities,
      events: state.events,
      recording: game.recording(),
      interpreter: parsed.interpreter,
    },
  };
}

export function replayDocInput(doc, recording) {
  if (!recording || typeof recording !== 'object') {
    throw domainError(CODES.USAGE, 'replay 需要 recording（game.recording() 的输出）。');
  }
  try {
    const state = replayLevel(doc, recording).snapshot();
    return { ok: true, code: CODES.OK, data: { id: doc.id, status: state.status, tick: state.tick, clicks: state.clicks } };
  } catch (error) {
    const code = typeof error.code === 'string' ? error.code : CODES.SIM_FAILED;
    return { ok: false, code, errors: error.errors ?? [errorItem(code, 'recording', error.message)] };
  }
}

export function diffDocInput(before, after) {
  return { ok: true, code: CODES.OK, data: { before: before.id, after: after.id, diff: diffDocs(before, after) } };
}

/**
 * 内容清单注入后的用例集：id → 文档的解析在 app 层完成，shell 只负责把内容读进来。
 * 唯一写入路径（applyOps）尚未实现，因此这里全是只读用例。
 */
export function createLevelService(docs) {
  if (!Array.isArray(docs) || docs.length === 0) throw new Error('createLevelService 需要非空的关卡数组。');
  const catalog = new Map();
  for (const doc of docs) catalog.set(doc.id, doc);
  const available = () => [...catalog.keys()].join('、');

  const resolve = (input) => {
    const source = input ?? {};
    if (source.doc && typeof source.doc === 'object') return source.doc;
    if (typeof source.id === 'string') {
      const doc = catalog.get(source.id);
      if (!doc) throw domainError(CODES.NOT_FOUND, '没有这张关卡：' + source.id + '。可用：' + available() + '。');
      return structuredClone(doc);
    }
    throw domainError(CODES.USAGE, '需要 id（内置关卡）或 doc（关卡对象）。');
  };

  return Object.freeze({
    resolve,
    listLevels: () => [...catalog.values()].map(summarize),
    getLevel: (id) => resolve({ id }),
    validateInput: (input) => validateDocInput(resolve(input), input && input.mode),
    simulateInput: (input) => simulateDocInput(resolve(input), input ?? {}),
    replayInput: (input) => replayDocInput(resolve(input), input && input.recording),
    diffInput: (input) => {
      if (!input || !input.before || !input.after) throw domainError(CODES.USAGE, 'diff 需要 before 与 after（各为 {id} 或 {doc}）。');
      return diffDocInput(resolve(input.before), resolve(input.after));
    },
  });
}
