// 内容工厂：物品。物品只说自己是什么：叫什么、带什么标签、能不能被拿、拿在手里
// 会不会伤人。它不知道任何机关的存在——「谁需要这把钥匙」由机关声明、由角色视图回答。
// 具体有哪些物品是数据：types/item/<kind>.type.json（由宿主读入后传进来）。

import { createFactory } from './factory.ts';

export function createItemFactory(types = {}) {
  return createFactory({
    category: 'item',
    version: 1,
    schema: {
      label: '物品',
      slots: ['tags', 'reacts', 'harms', 'carryable'],
    },
    types,
  });
}
