// 解释器：单文件产物里内联的关卡包 bundle@1。
// 处理的是「一个自包含的关卡集合」这一类数据：schema 与 levels 都是内联 JSON，不发起请求。

export const BUNDLE_SCHEMA = 'levels@1';
export const BUNDLE_VERSION = 1;

const MAX_LEVELS = 64;
const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseBundle(payload) {
  const fail = (code, path, message) => ({ ok: false, code, errors: [{ code, path, message }], levels: [] });
  let bundle = payload;
  if (typeof payload === 'string') {
    try {
      bundle = JSON.parse(payload);
    } catch (error) {
      return fail('SCHEMA_INVALID', '', '内联关卡包不是合法 JSON：' + error.message + '。');
    }
  }
  if (!isObject(bundle)) return fail('SCHEMA_INVALID', '', '内联关卡包必须是一个 JSON 对象。');
  if (bundle.schema !== BUNDLE_SCHEMA) {
    return fail('UNSUPPORTED_VERSION', 'schema',
      '内联关卡包只支持 ' + BUNDLE_SCHEMA + '，收到 ' + JSON.stringify(bundle.schema) + '。');
  }
  if (!Array.isArray(bundle.levels) || bundle.levels.length === 0 || bundle.levels.length > MAX_LEVELS) {
    return fail('SCHEMA_INVALID', 'levels', 'levels 必须是 1～' + MAX_LEVELS + ' 项的数组。');
  }
  const errors = [];
  const seen = new Set();
  bundle.levels.forEach((level, index) => {
    const path = 'levels[' + index + ']';
    if (!isObject(level) || typeof level.id !== 'string' || !ID_PATTERN.test(level.id)) {
      errors.push({ code: 'SCHEMA_INVALID', path, message: path + ' 必须是带合法 id 的关卡对象。' });
      return;
    }
    if (seen.has(level.id)) errors.push({ code: 'REFERENCE_INVALID', path: path + '.id', message: '关卡 id 重复：' + level.id });
    seen.add(level.id);
  });
  if (errors.length) return { ok: false, code: 'VALIDATION_FAILED', errors, levels: [] };
  return { ok: true, code: 'OK', errors: [], levels: bundle.levels };
}

export function createBundleInterpreter() {
  return Object.freeze({
    kind: 'bundle',
    id: 'bundle-1',
    version: BUNDLE_VERSION,
    supports: Object.freeze({ schema: Object.freeze([BUNDLE_VERSION]) }),
    parse(payload) {
      return parseBundle(payload);
    },
  });
}
