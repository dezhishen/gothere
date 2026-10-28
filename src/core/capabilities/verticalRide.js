// 能力：垂直运输（电梯轿厢）。轿厢楼层由自己的状态决定；
// 只有轿厢停在角色这一层才上得去，上去之后脚底高度就跟着轿厢走。

export const verticalRide = Object.freeze({
  id: 'verticalRide',
  version: 1,
  events: Object.freeze([]),
  params: Object.freeze({ lowerY: 440, upperY: 300, upperState: 'upper', tolerance: 10 }),
  traits: (params) => ({
    rideLowerY: params.lowerY,
    rideUpperY: params.upperY,
    rideUpperState: params.upperState,
    rideTolerance: params.tolerance,
  }),
  hooks: Object.freeze({
    onContact(ctx, entity) {
      const traits = entity.traits;
      const wasRiding = ctx.state.actor.riding === entity.id;
      if (!ctx.overlaps(entity)) {
        if (wasRiding) ctx.state.actor.riding = null;
        return;
      }
      const carY = entity.state === traits.rideUpperState ? traits.rideUpperY : traits.rideLowerY;
      const sameFloor = Math.abs(ctx.state.actor.y - carY) <= traits.rideTolerance;
      if (!sameFloor && !wasRiding) return;
      ctx.state.actor.riding = entity.id;
      if (!wasRiding && sameFloor) ctx.emit('乘上了' + entity.label);
      ctx.state.actor.y = carY;
    },
  }),
});
