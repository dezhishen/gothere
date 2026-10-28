// 内容源：关卡清单与关卡文本的读取端口，由 shell 注入实现。
// dev 走 HTTP、CLI 走文件、单文件产物走内联 JSON 块——用例层不认识任何一种。
// 清单与关卡的「怎么算合法」属于解释器（core/interpreters），这里只管把字节读进来。

import { CODES, domainError } from './errors.ts';
import { parseManifest } from '../core/interpreters/index.ts';

export const MANIFEST_PATH = 'levels/manifest.json';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

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
