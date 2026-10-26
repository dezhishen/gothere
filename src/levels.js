const world = { width: 1200, height: 640, groundY: 440 };
const set = (target, state) => ({ type: 'set', target, state });
const after = (ticks, ...actions) => ({ type: 'after', ticks, actions });
const click = (source, actions, conditions) => ({
  on: { type: 'click', source }, ...(conditions ? { if: conditions } : {}), actions,
});
const entity = (id, kind, x, width, state, label) => ({ id, kind, x, width, state, label });

export const levels = [
  {
    schemaVersion: 1, id: 'first-bridge', name: '桥呢？桥呢！',
    description: '他已经准备出发了。桥还没有。你知道该帮谁一下。',
    hint: '出发后，点击桥边的圆形开关。让木桥在他走到缺口之前放下。',
    world, actor: { x: 95, speed: 68 }, goal: { x: 1100 },
    platforms: [{ x: 0, width: 440 }, { x: 620, width: 580 }],
    entities: [
      entity('bridge', 'bridge', 440, 180, 'folded', '伸缩木桥'),
      entity('lever', 'switch', 340, 28, 'off', '木桥开关'),
    ],
    rules: [click('lever', [set('lever', 'on'), set('bridge', 'extended')])],
  },
  {
    schemaVersion: 1, id: 'quiet-corner', name: '借过一下',
    description: '这台风扇有自己的想法。借它停机的四秒，赶紧通过。',
    hint: '风扇只会安静 4 秒。让他靠近风扇时再点击，经过后就安全了。踩下压力板会自动开门。',
    world, actor: { x: 95, speed: 68 }, goal: { x: 1100 },
    platforms: [{ x: 0, width: 1200 }],
    entities: [
      entity('fan', 'hazard', 585, 58, 'running', '旧风扇'),
      entity('plate', 'plate', 785, 50, 'idle', '门前压力板'),
      entity('gate', 'gate', 955, 24, 'closed', '花园小门'),
    ],
    rules: [
      click('fan', [set('fan', 'stopped'), after(240, set('fan', 'running'))], [{ entity: 'fan', state: 'running' }]),
      { on: { type: 'enter', source: 'plate' }, actions: [set('gate', 'open')] },
    ],
  },
  {
    schemaVersion: 1, id: 'just-in-time', name: '赶个巧',
    description: '桥有时限，风也不客气。别急着全点，轮到谁再安排谁。',
    hint: '木桥会在 5 秒后收起：在他接近缺口时再拨开关。过桥后，靠近风扇再让它停下。压力板会打开最后的门。',
    world, actor: { x: 95, speed: 68 }, goal: { x: 1100 },
    platforms: [{ x: 0, width: 390 }, { x: 560, width: 640 }],
    entities: [
      entity('bridge', 'bridge', 390, 170, 'folded', '限时木桥'),
      entity('lever', 'switch', 290, 28, 'off', '限时桥开关'),
      entity('fan', 'hazard', 755, 58, 'running', '旧风扇'),
      entity('plate', 'plate', 895, 44, 'idle', '门前压力板'),
      entity('gate', 'gate', 1000, 24, 'closed', '花园小门'),
    ],
    rules: [
      click('lever', [set('lever', 'on'), set('bridge', 'extended'),
        after(300, set('bridge', 'folded'), set('lever', 'off'))], [{ entity: 'lever', state: 'off' }]),
      click('fan', [set('fan', 'stopped'), after(240, set('fan', 'running'))], [{ entity: 'fan', state: 'running' }]),
      { on: { type: 'enter', source: 'plate' }, actions: [set('gate', 'open')] },
    ],
  },
];
