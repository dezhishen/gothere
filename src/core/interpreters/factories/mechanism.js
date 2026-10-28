// 内容工厂：机关。开关、木桥、门、风扇、压力板——它们靠能力组合出行为。
// 顺序即语义：capabilities 的声明顺序决定同一 tick 内 hook 的执行顺序。

import { LIMITS } from '../../contract/constants.js';
import { createFactory } from './factory.js';

const state = (id, label) => Object.freeze({ id, label });

export function createMechanismFactory() {
  return createFactory({
    category: 'mechanism',
    version: 1,
    types: {
      switch: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('off', '待触发'), state('on', '已触发')],
        capabilities: { clickable: {} },
      },
      bridge: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('folded', '收起'), state('extended', '已铺好')],
        capabilities: { extendGround: { state: 'extended' } },
      },
      gate: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('closed', '关闭'), state('open', '开启')],
        capabilities: {
          blockPath: { state: 'closed', reason: 'gate', message: '门：此路暂时不通。先找个办法打开它。' },
        },
      },
      hazard: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 135,
        states: [state('running', '转动中'), state('stopped', '已停下')],
        capabilities: {
          clickable: {},
          blockPath: { state: 'running', reason: 'hazard', message: '风太大，被吹了个措手不及。经过之前先关风扇。' },
        },
      },
      plate: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('idle', '等待踩下'), state('pressed', '已踩下')],
        capabilities: {
          region: { from: 'idle', to: 'pressed', event: 'enter', message: '踩下了' },
        },
      },
    },
  });
}
