// 内容工厂：机关。工厂只定义这一**类**东西能说什么（schema 里的声明槽），
// 具体有哪些机关、各自什么状态与声明，全部是数据：
//   types/mechanism/<kind>.type.json  →  pnpm types  →  generated-types.js
// 新增一种机关不需要改这个文件。

import { CONTENT_TYPES } from './generated-types.js';
import { createFactory } from './factory.js';

export function createMechanismFactory(types = CONTENT_TYPES.mechanism) {
  return createFactory({
    category: 'mechanism',
    version: 1,
    schema: {
      label: '机关',
      slots: ['reacts', 'blocks', 'harms', 'moves', 'ground', 'lifts'],
    },
    types,
  });
}
