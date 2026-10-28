// 声明槽：可携带。我在 from 状态下能被拿起，拿起后是 to 状态，跟随与放下由内核做。

export const carryable = Object.freeze({
  id: 'carryable',
  version: 1,
  stages: Object.freeze(['carry']),
  params: Object.freeze({ from: 'idle', to: 'held', offset: 46, drop: -60 }),
});
