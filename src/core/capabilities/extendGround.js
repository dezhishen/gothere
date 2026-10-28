// 能力：在某个状态下把支撑范围延长到自身宽度（木桥、绳桥、伸缩甲板都复用这一条）。

export const extendGround = Object.freeze({
  id: 'extendGround',
  version: 1,
  events: Object.freeze([]),
  params: Object.freeze({ state: 'extended' }),
  traits: (params) => ({ groundInState: params.state }),
});
