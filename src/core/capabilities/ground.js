// 声明槽：提供地面。我在 inState 状态下把支撑范围延长到自身宽度。

export const ground = Object.freeze({
  id: 'ground',
  version: 1,
  stages: Object.freeze(['ground']),
  params: Object.freeze({ inState: null }),
});
