// 测试用的内容装载：走与 CLI 相同的文本源端口，读 levels/*.level.json 制品。

import { readFile } from 'node:fs/promises';

import { createLevelService } from '../src/app/levelService.js';
import { createTextSource } from '../src/app/levelSource.js';

const root = new URL('../', import.meta.url);

const source = createTextSource({ readText: (path) => readFile(new URL(path, root), 'utf8') });

export const levels = await source.all();
export const service = createLevelService(structuredClone(levels));
