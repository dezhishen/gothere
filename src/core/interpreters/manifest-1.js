// 解释器：内容清单 levels@1（关卡目录）。处理的是「有哪些关卡」这一类数据。

export const MANIFEST_SCHEMA = 'levels@1';
export const MANIFEST_VERSION = 1;

const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const FILE_PATTERN = /^[a-z][a-z0-9-]*\.level\.json$/;
const MAX_LEVELS = 64;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 清单本身是一份内容制品：先校验它，再按顺序读关卡。 */
export function parseManifestText(text) {
  const fail = (code, path, message) => ({ ok: false, code, errors: [{ code, path, message }], entries: [] });
  if (typeof text !== 'string') return fail('SCHEMA_INVALID', '', '内容清单必须是 JSON 文本。');
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    return fail('SCHEMA_INVALID', '', '内容清单不是合法 JSON：' + error.message + '。');
  }
  if (!isObject(manifest)) return fail('SCHEMA_INVALID', '', '内容清单必须是一个 JSON 对象。');
  if (manifest.schema !== MANIFEST_SCHEMA) {
    return fail('UNSUPPORTED_VERSION', 'schema',
      '内容清单只支持 ' + MANIFEST_SCHEMA + '，收到 ' + JSON.stringify(manifest.schema) + '。');
  }
  if (!Array.isArray(manifest.levels) || manifest.levels.length === 0 || manifest.levels.length > MAX_LEVELS) {
    return fail('SCHEMA_INVALID', 'levels', 'levels 必须是 1～' + MAX_LEVELS + ' 项的数组。');
  }
  const entries = [];
  const seen = new Set();
  manifest.levels.forEach((entry, index) => {
    const path = 'levels[' + index + ']';
    if (!isObject(entry) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      entries.push({ error: { code: 'SCHEMA_INVALID', path: path + '.id', message: '关卡清单项的 id 无效。' } });
      return;
    }
    if (typeof entry.file !== 'string' || !FILE_PATTERN.test(entry.file)) {
      entries.push({ error: { code: 'SCHEMA_INVALID', path: path + '.file', message: '关卡文件名必须是 <id>.level.json 的形式：' + entry.id } });
      return;
    }
    if (seen.has(entry.id)) {
      entries.push({ error: { code: 'REFERENCE_INVALID', path: path + '.id', message: '关卡 id 重复：' + entry.id } });
      return;
    }
    seen.add(entry.id);
    entries.push({ id: entry.id, file: entry.file });
  });
  const errors = entries.filter((entry) => entry.error).map((entry) => entry.error);
  if (errors.length) {
    return { ok: false, code: 'VALIDATION_FAILED', errors, entries: entries.filter((entry) => !entry.error) };
  }
  return { ok: true, code: 'OK', errors: [], entries };
}

export function createManifestInterpreter() {
  return Object.freeze({
    kind: 'manifest',
    id: 'levels-manifest-1',
    version: MANIFEST_VERSION,
    supports: Object.freeze({ schema: Object.freeze([MANIFEST_VERSION]) }),
    parse(text) {
      return parseManifestText(text);
    },
  });
}
