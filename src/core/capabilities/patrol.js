// 能力：巡逻。在 [minX, maxX] 之间来回移动；只有处于 activeState 时才动，
// 被拿在手里时不动（设计稿「持有暂停巡逻」）。移动发生在角色行走之前的 onMotion 相位。

export const patrol = Object.freeze({
  id: 'patrol',
  version: 1,
  events: Object.freeze([]),
  params: Object.freeze({ minX: 300, maxX: 400, speed: 48, activeState: 'patrolling' }),
  traits: (params) => ({
    patrolMin: params.minX,
    patrolMax: params.maxX,
    patrolSpeed: params.speed,
    patrolActiveState: params.activeState,
  }),
  hooks: Object.freeze({
    onMotion(ctx, entity) {
      if (entity.state !== entity.traits.patrolActiveState) return;
      if (ctx.state.actor.holding === entity.id) return;
      const step = entity.traits.patrolSpeed / ctx.tickRate;
      let direction = entity.patrolDirection === -1 ? -1 : 1;
      let next = entity.x + direction * step;
      if (next >= entity.traits.patrolMax) {
        next = entity.traits.patrolMax;
        direction = -1;
      } else if (next <= entity.traits.patrolMin) {
        next = entity.traits.patrolMin;
        direction = 1;
      }
      entity.x = Math.round(next * 1e6) / 1e6;
      entity.patrolDirection = direction;
    },
  }),
});
