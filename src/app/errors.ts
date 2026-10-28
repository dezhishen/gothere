// 错误码单一来源：码值稳定、文案可改；退出码约定见 exitCode。

export const CODES = Object.freeze({
  OK: 'OK',
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  SIM_BUDGET_EXCEEDED: 'SIM_BUDGET_EXCEEDED',
  SIM_FAILED: 'SIM_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  USAGE: 'USAGE',
  INTERNAL: 'INTERNAL',
});

/** 内核的失败原因（limit/hurt/fall/gate/boundary/timeout）→ 对外错误码。 */
export function toCode(reason) {
  return reason === 'limit' ? CODES.SIM_BUDGET_EXCEEDED : CODES.SIM_FAILED;
}

/** 0 成功 / 2 用法错误 / 3 校验失败 / 4 模拟失败 / 5 内部错误。 */
export function exitCode(code) {
  if (!code || code === CODES.OK) return 0;
  if (code === CODES.USAGE || code === CODES.NOT_FOUND) return 2;
  if (code === CODES.SIM_FAILED || code === CODES.SIM_BUDGET_EXCEEDED) return 4;
  if (code === CODES.INTERNAL) return 5;
  return 3;
}

export function domainError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function errorItem(code, path, message) {
  return { code, path, message };
}
