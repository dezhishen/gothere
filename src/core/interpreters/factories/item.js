// 内容工厂：物品。可携带、可点击、接触会伤人的那一族。
// 物品与机关之间的交互不靠工厂互相调用：物品只声明状态与事件，
// 由规则（数据）与内核相位（所有实体同表调度）去和机关发生关系。

import { LIMITS } from '../../contract/constants.js';
import { createFactory } from './factory.js';

const state = (id, label) => Object.freeze({ id, label });

export function createItemFactory() {
  return createFactory({
    category: 'item',
    version: 1,
    types: {
      axe: {
        version: 1,
        defaultWidth: 34,
        iconOffset: 96,
        states: [state('idle', '放在地上'), state('held', '已举起')],
        capabilities: {
          // 顺序有意义：先拿起，再判定伤害，否则拿起的同一 tick 就会被自己扎到。
          holdable: {},
          damageOnContact: { state: 'idle', reason: 'hurt', message: '地上的斧头可不认人。' },
        },
      },
      hammer: {
        version: 1,
        defaultWidth: 32,
        iconOffset: 96,
        states: [state('idle', '放在地上'), state('held', '握在手里')],
        capabilities: {
          holdable: {},
          clickable: {},
        },
      },
      key: {
        version: 1,
        defaultWidth: 20,
        iconOffset: 92,
        states: [state('idle', '落在地上'), state('held', '握在手里')],
        capabilities: { holdable: {} },
      },
    },
  });
}
