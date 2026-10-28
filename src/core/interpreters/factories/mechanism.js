// 内容工厂：机关。工厂只定义这一**类**东西能说什么（schema 里的声明槽），
// 具体有哪些机关、各自什么状态与声明，全部是数据：
//   types/mechanism/<kind>.type.json（纯 JSON，由宿主读入后传进来）
// 新增一种机关不需要改这个文件。

import { createFactory } from './factory.js';

export function createMechanismFactory(types = {}) {
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
