// 内容工厂：物品。物品只说自己是什么：叫什么、带什么标签、能不能被拿、拿在手里会不会伤人。
// 它不知道任何机关的存在——「谁需要这把钥匙」由机关声明、由角色视图回答。

import { control, entityFields } from './editor.js';
import { createFactory } from './factory.js';

const state = (id, label) => Object.freeze({ id, label });
const become = (target) => Object.freeze({ type: 'become', state: target });

export function createItemFactory() {
  return createFactory({
    category: 'item',
    version: 1,
    schema: {
      label: '物品',
      slots: ['tags', 'reacts', 'harms', 'carryable'],
    },
    editor: {
      label: '物品',
      accent: '#ad9867',
      labels: { axe: '斧头', hammer: '锤子', key: '钥匙' },
      hints: { axe: '拿在手里才不伤人', hammer: '拿着时可以点它', key: '带着就能开需要的门' },
      accents: { key: '#c9a227', axe: '#8a7a5c' },
      // 物品自己只说「我有什么标签」；谁需要它，由机关去声明。
      fields: ({ type, entity }) => entityFields(type, entity, [
        control('tags', '标签', { control: 'tags', value: (entity.tags ?? type.tags).join(' '), hint: '空格分隔，如 key yellow' }),
      ]),
    },
    types: {
      axe: {
        version: 1,
        defaultWidth: 34,
        iconOffset: 96,
        states: [state('idle', '放在地上'), state('held', '已举起')],
        slots: {
          carryable: {},
          harms: { inState: 'idle', unlessHeld: true, reason: 'hurt', message: '地上的斧头可不认人。' },
          reacts: { on: 'input', from: 'held', actions: [become('idle')] },
        },
      },
      hammer: {
        version: 1,
        defaultWidth: 32,
        iconOffset: 96,
        states: [state('idle', '放在地上'), state('held', '握在手里')],
        slots: {
          carryable: {},
          // 拿着时可以被点：点它不改变自己，只是让关卡接线收到一次点击。
          reacts: { on: 'input', from: 'held', actions: [] },
        },
      },
      key: {
        version: 1,
        defaultWidth: 20,
        iconOffset: 92,
        states: [state('idle', '落在地上'), state('held', '握在手里'), state('used', '用掉了')],
        tags: ['key', 'yellow'],
        consumedState: 'used',
        hiddenStates: ['used'],
        slots: { carryable: {} },
      },
    },
  });
}
