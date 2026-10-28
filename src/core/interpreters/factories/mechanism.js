// 内容工厂：机关。它的 schema 就是「机关能说的话」：状态、反应（reacts）、阻挡、伤害、
// 自走、提供地面、载人。类型只挑槽并填参数，一句代码都没有。

import { LIMITS } from '../../contract/constants.js';
import { entityFields } from './editor.js';
import { createFactory } from './factory.js';

const state = (id, label) => Object.freeze({ id, label });
const become = (target) => Object.freeze({ type: 'become', state: target });
const publish = (event) => Object.freeze({ type: 'publish', event });

export function createMechanismFactory() {
  return createFactory({
    category: 'mechanism',
    version: 1,
    schema: {
      label: '机关',
      slots: ['reacts', 'blocks', 'harms', 'moves', 'ground', 'lifts'],
    },
    // 编辑器只说「我叫什么、我多宽、我有哪几个状态、我要哪些声明」；
    // 面板由这些回调现算，UI 里没有一行 switch (kind)。
    editor: {
      label: '机关',
      accent: '#7c8f5a',
      labels: { switch: '开关', bridge: '桥', gate: '门', hazard: '风扇', plate: '压力板', lift: '电梯', guard: '守卫', crusher: '碎石机' },
      hints: { switch: '点一下就变状态', bridge: '点一下铺好，可以走', gate: '关着的时候挡路', plate: '角色踩上去自动触发' },
      accents: { hazard: '#b06a4e', gate: '#8a7a5c', guard: '#9a5f6b', crusher: '#8a7a5c' },
      fields: ({ type, entity }) => entityFields(type, entity),
    },
    types: {
      switch: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('off', '待触发'), state('on', '已触发')],
        slots: { reacts: { on: 'input', from: 'off', actions: [become('on')] } },
      },
      bridge: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('folded', '收起'), state('extended', '已铺好')],
        slots: { ground: { inState: 'extended' } },
      },
      gate: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('closed', '关闭'), state('open', '开启')],
        slots: { blocks: { inState: 'closed', reason: 'gate', message: '门：此路暂时不通。先找个办法打开它。' } },
      },
      hazard: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 135,
        states: [state('running', '转动中'), state('stopped', '已停下')],
        slots: {
          reacts: { on: 'input', from: 'running', actions: [become('stopped')] },
          blocks: { inState: 'running', reason: 'hazard', message: '风太大，被吹了个措手不及。经过之前先关风扇。' },
        },
      },
      plate: {
        version: 1,
        defaultWidth: LIMITS.defaultWidth,
        iconOffset: 91,
        states: [state('idle', '等待踩下'), state('pressed', '已踩下')],
        slots: {
          reacts: { on: 'contact', from: 'idle', actions: [become('pressed'), publish('enter')] },
        },
      },
      lift: {
        version: 1,
        defaultWidth: 70,
        iconOffset: 120,
        states: [state('lower', '停在楼下'), state('upper', '停在楼上')],
        // 楼层高度默认 440↔300，关卡可在实体上覆盖 lifts.lowerY / lifts.upperY。
        slots: { lifts: {} },
      },
      guard: {
        version: 1,
        defaultWidth: 34,
        iconOffset: 96,
        states: [state('patrolling', '巡逻中'), state('stopped', '暂时停下')],
        slots: {
          moves: { inState: 'patrolling', speed: 48, between: [300, 400] },
          harms: { inState: 'patrolling', reason: 'hurt', message: '巡逻的守卫撞上了他。' },
          reacts: { on: 'input', from: 'patrolling', actions: [become('stopped')] },
        },
      },
      crusher: {
        version: 1,
        defaultWidth: 44,
        iconOffset: 96,
        states: [state('active', '来回碾压'), state('parked', '停在一侧')],
        slots: {
          moves: { inState: 'active', speed: 36, between: [300, 400] },
          blocks: { inState: 'active', reason: 'crusher', message: '碎石机来回碾压，过不去。' },
        },
      },
    },
  });
}
