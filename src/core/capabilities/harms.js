// 声明槽：接触伤害。我在哪个状态下伤人；被人拿着时不伤人（unlessHeld）。

export const harms = Object.freeze({
  id: 'harms',
  version: 1,
  stages: Object.freeze(['contact']),
  params: Object.freeze({ inState: null, unlessHeld: true, reason: 'hurt', message: '' }),
});
