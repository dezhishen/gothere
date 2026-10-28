// 内容源：关卡清单与关卡文本的读取端口，由 shell 注入实现。
// dev 走 HTTP、CLI 走文件、单文件产物走内联 JSON 块——用例层不认识任何一种。
// 关卡是内容制品（JSON），不参与编译；只有解释器编译在平台里。

import { CODES, domainError } from './errors.js';

export const MANIFEST_PATH = 'levels/manifest.json';
export const MANIFEST_SCHEMA = 'levels@1';

const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const FILE_PATTERN = /^[a-z][a-z0-9-]*\.level\.json$/;
const MAX_LEVELS = 64;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** 清单本身是一份内容制品：先校验它，再读关卡。 */
export function parseManifest(text) {
  const fail = (code, path, message) => ({ ok: false, code, errors: [{ code, path, message }], entries: [] });
  if (typeof text !== 'string') return fail(CODES.SCHEMA_INVALID, '', '内容清单必须是 JSON 文本。');
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    return fail(CODES.SCHEMA_INVALID, '', '内容清单不是合法 JSON：' + error.message + '。');
  }
  if (!isObject(manifest)) return fail(CODES.SCHEMA_INVALID, '', '内容清单必须是一个 JSON 对象。');
  if (manifest.schema !== MANIFEST_SCHEMA) {
    return fail(CODES.UNSUPPORTED_VERSION, 'schema',
      '内容清单只支持 ' + MANIFEST_SCHEMA + '，收到 ' + JSON.stringify(manifest.schema) + '。');
  }
  if (!Array.isArray(manifest.levels) || manifest.levels.length === 0 || manifest.levels.length > MAX_LEVELS) {
    return fail(CODES.SCHEMA_INVALID, 'levels', 'levels 必须是 1～' + MAX_LEVELS + ' 项的数组。');
  }
  const entries = [];
  const seen = new Set();
  manifest.levels.forEach((entry, index) => {
    const path = 'levels[' + index + ']';
    if (!isObject(entry) || typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) {
      entries.push({ error: { code: CODES.SCHEMA_INVALID, path: path + '.id', message: '关卡清单项的 id 无效。' } });
      return;
    }
    if (typeof entry.file !== 'string' || !FILE_PATTERN.test(entry.file)) {
      entries.push({ error: { code: CODES.SCHEMA_INVALID, path: path + '.file', message: '关卡文件名必须是 <id>.level.json 的形式：' + entry.id } });
      return;
    }
    if (seen.has(entry.id)) {
      entries.push({ error: { code: CODES.REFERENCE_INVALID, path: path + '.id', message: '关卡 id 重复：' + entry.id } });
      return;
    }
    seen.add(entry.id);
    entries.push({ id: entry.id, file: entry.file });
  });
  const errors = entries.filter((entry) => entry.error).map((entry) => entry.error);
  if (errors.length) return { ok: false, code: CODES.VALIDATION_FAILED, errors, entries: entries.filter((entry) => !entry.error) };
  return { ok: true, code: CODES.OK, errors: [], entries };
}

export function summarize(doc) {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    schemaVersion: doc.schemaVersion,
    entities: Array.isArray(doc.entities) ? doc.entities.length : 0,
    rules: Array.isArray(doc.rules) ? doc.rules.length : 0,
  };
}

function sourceOf(loader) {
  const list = async () => (await loader()).map(summarize);
  const all = async () => (await loader()).map((doc) => structuredClone(doc));
  const ids = async () => (await loader()).map((doc) => doc.id);
  const get = async (id) => {
    const docs = await loader();
    const doc = docs.find((item) => item.id === id);
    if (!doc) {
      const available = docs.map((item) => item.id).join('、');
      throw domainError(CODES.NOT_FOUND, '没有这张关卡：' + String(id) + '。可用：' + available + '。');
    }
    return structuredClone(doc);
  };
  return Object.freeze({ list, all, ids, get });
}

/** 文本源：清单 + 每张关卡都通过 readText(path) 读取（路径相对仓库根）。 */
export function createTextSource({ readText }) {
  if (typeof readText !== 'function') throw new Error('createTextSource 需要一个 readText(path) 端口。');
  let cache = null;
  const load = async () => {
    if (cache) return cache;
    let manifestText;
    try {
      manifestText = await readText(MANIFEST_PATH);
    } catch (error) {
      throw domainError(CODES.NOT_FOUND, '读不到内容清单 ' + MANIFEST_PATH + '（' + (error.code ?? error.message) + '）。');
    }
    const manifest = parseManifest(manifestText);
    if (!manifest.ok) {
      throw domainError(manifest.code, manifest.errors[0].message, { errors: manifest.errors });
    }
    const docs = [];
    for (const entry of manifest.entries) {
      const path = 'levels/' + entry.file;
      let text;
      try {
        text = await readText(path);
      } catch (error) {
        throw domainError(CODES.NOT_FOUND, '读不到关卡文件 ' + path + '（' + (error.code ?? error.message) + '）。');
      }
      let doc;
      try {
        doc = JSON.parse(text);
      } catch (error) {
        throw domainError(CODES.SCHEMA_INVALID, '关卡文件不是合法 JSON：' + path + '（' + error.message + '）。');
      }
      if (!isObject(doc) || doc.id !== entry.id) {
        throw domainError(CODES.VALIDATION_FAILED, '关卡文件 ' + path + ' 的 id 与清单不一致（清单写的是 ' + entry.id + '）。');
      }
      docs.push(doc);
    }
    cache = docs;
    return docs;
  };
  return sourceOf(load);
}

/** 文档源：单文件产物把关卡内联成 JSON 块，直接从内存读，零外部请求。 */
export function createDocSource(docs) {
  if (!Array.isArray(docs) || docs.length === 0) throw new Error('createDocSource 需要非空的关卡数组。');
  const copy = docs.map((doc) => structuredClone(doc));
  return sourceOf(async () => copy);
}
