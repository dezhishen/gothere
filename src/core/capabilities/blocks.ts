// 声明槽：阻挡。我在哪个状态下挡住去路，以及被挡住时给什么理由。

export const blocks = Object.freeze({
  id: 'blocks',
  version: 1,
  stages: Object.freeze(['block']),
  params: Object.freeze({ inState: null, reason: 'gate', message: '' }),
});
