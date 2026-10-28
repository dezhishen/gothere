// 能力：可被点击。只是声明事件与一个 trait，具体反应由规则（数据）决定。

export const clickable = Object.freeze({
  id: 'clickable',
  version: 1,
  events: Object.freeze(['click']),
  params: Object.freeze({}),
  traits: () => ({ clickable: true }),
});
