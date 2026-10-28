// 测试用的内容装载：走与 CLI 相同的文本源端口，读 levels/*.level.json 制品。
// 关卡校验依赖类型（types/*.type.json），所以先装类型再读关卡。

import { readFile } from 'node:fs/promises';

import './types-fixture.mjs';

import { createLevelService } from '../src/app/levelService.ts';
import { createTextSource } from '../src/app/levelSource.ts';

const root = new URL('../', import.meta.url);

const source = createTextSource({ readText: (path) => readFile(new URL(path, root), 'utf8') });

export const levels = await source.all();
export const service = createLevelService(structuredClone(levels));
