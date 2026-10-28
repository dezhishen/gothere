// 解释器：回放记录 recording@1。处理的是「一次操作序列」这一类数据，不碰关卡内容。

import { LIMITS } from '../contract/constants.js';
import { replayRecording } from '../kernel/replay.js';

export const RECORDING_VERSION = 1;

const STATUSES = Object.freeze(['ready', 'running', 'paused', 'lost', 'won']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseRecording(recording) {
  const fail = (code, path, message) => ({ ok: false, code, errors: [{ code, path, message }] });
  if (!isObject(recording)) return fail('SCHEMA_INVALID', '', '回放记录必须是一个 JSON 对象。');
  if (recording.schemaVersion !== RECORDING_VERSION) {
    return fail('UNSUPPORTED_VERSION', 'schemaVersion',
      '只支持回放记录 schemaVersion ' + RECORDING_VERSION + '，收到 ' + JSON.stringify(recording.schemaVersion) + '。');
  }
  if (typeof recording.levelId !== 'string' || recording.levelId.length === 0) {
    return fail('SCHEMA_INVALID', 'levelId', '回放记录需要 levelId。');
  }
  if (!Number.isInteger(recording.untilTick) || recording.untilTick < 0 || recording.untilTick > LIMITS.maxTicks) {
    return fail('SCHEMA_INVALID', 'untilTick', 'untilTick 必须是 0～' + LIMITS.maxTicks + ' 的整数。');
  }
  if (!STATUSES.includes(recording.status)) {
    return fail('SCHEMA_INVALID', 'status', '回放记录的 status 无效：' + JSON.stringify(recording.status) + '。');
  }
  if (!Array.isArray(recording.inputs) || recording.inputs.length > LIMITS.maxTicks) {
    return fail('SCHEMA_INVALID', 'inputs', 'inputs 必须是不超过 ' + LIMITS.maxTicks + ' 项的数组。');
  }
  const errors = [];
  let previous = 0;
  recording.inputs.forEach((input, index) => {
    const path = 'inputs[' + index + ']';
    if (!isObject(input) || !Number.isInteger(input.tick) || typeof input.source !== 'string') {
      errors.push({ code: 'SCHEMA_INVALID', path, message: path + ' 需要 tick（整数）与 source（字符串）。' });
      return;
    }
    if (input.tick < 1 || input.tick < previous || input.tick > recording.untilTick) {
      errors.push({ code: 'VALIDATION_FAILED', path: path + '.tick', message: path + '.tick 必须非递减、≥1 且不超过 untilTick。' });
    }
    previous = Math.max(previous, input.tick);
  });
  if (errors.length) return { ok: false, code: 'VALIDATION_FAILED', errors };
  return { ok: true, code: 'OK', errors: [], recording };
}

export function createRecordingInterpreter() {
  return Object.freeze({
    kind: 'recording',
    id: 'recording-1',
    version: RECORDING_VERSION,
    supports: Object.freeze({ schema: Object.freeze([RECORDING_VERSION]) }),
    parse(recording) {
      return parseRecording(recording);
    },
    replay(model, recording) {
      return replayRecording(model, recording);
    },
  });
}
