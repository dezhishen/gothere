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
      lift: {
        version: 1,
        defaultWidth: 70,
        iconOffset: 120,
        states: [state('lower', '停在楼下'), state('upper', '停在楼上')],
        // 楼层高度默认 440↔300，关卡可在实体上覆盖 capabilities.verticalRide。
        capabilities: { verticalRide: {} },
      },
      guard: {
        version: 1,
        defaultWidth: 34,
        iconOffset: 96,
        states: [state('patrolling', '巡逻中'), state('stopped', '暂时停下')],
        capabilities: {
          // 顺序有意义：先动，再判接触伤害；点击只是给规则一个事件。
          patrol: { minX: 300, maxX: 400, speed: 48, activeState: 'patrolling' },
          damageOnContact: { state: 'patrolling', reason: 'hurt', message: '巡逻的守卫撞上了他。' },
          clickable: {},
        },
      },
      crusher: {
        version: 1,
        defaultWidth: 44,
        iconOffset: 96,
        states: [state('active', '来回碾压'), state('parked', '停在一侧')],
        capabilities: {
          patrol: { minX: 300, maxX: 400, speed: 36, activeState: 'active' },
          blockPath: { state: 'active', reason: 'crusher', message: '碎石机来回碾压，过不去。' },
        },
      },
    },
  });
}
