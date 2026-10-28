// 声明槽：反应。我在什么输入/接触下、满足什么需求时，变成什么、发布什么事件。
// 纯声明：没有函数。什么时候检查、按什么顺序应用，由内核的固定流程决定。

export const reacts = Object.freeze({
  id: 'reacts',
  version: 1,
  stages: Object.freeze(['input', 'contact']),
  params: Object.freeze({
    on: 'contact',
    from: null,
    need: null,
    consume: false,
    actions: Object.freeze([]),
    unmet: Object.freeze({ reason: 'locked', message: '' }),
  }),
});
