// 声明槽：自走。我在 inState 状态下按 speed 在 between 之间来回移动。

export const moves = Object.freeze({
  id: 'moves',
  version: 1,
  stages: Object.freeze(['motion']),
  params: Object.freeze({ inState: null, speed: 0, between: Object.freeze([0, 0]) }),
});
