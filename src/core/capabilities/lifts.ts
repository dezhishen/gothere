// 声明槽：垂直运输。轿厢楼层由状态决定；只有停在角色这一层才上得去。

export const lifts = Object.freeze({
  id: 'lifts',
  version: 1,
  stages: Object.freeze(['contact', 'ground']),
  params: Object.freeze({ lowerState: 'lower', upperState: 'upper', lowerY: 440, upperY: 300, tolerance: 10 }),
});
