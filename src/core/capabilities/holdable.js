// 能力：可持有。单槽：走到上面自动拿起，拿着时跟着走；被规则改回初始状态即视为放下。

export const holdable = Object.freeze({
  id: 'holdable',
  version: 1,
  events: Object.freeze([]),
  params: Object.freeze({ from: 'idle', to: 'held', offset: 46, dropOffset: -60 }),
  traits: (params) => ({
    holdFrom: params.from,
    holdTo: params.to,
    holdOffset: params.offset,
    holdDropOffset: params.dropOffset,
  }),
  hooks: Object.freeze({
    onContact(ctx, entity) {
      const traits = entity.traits;
      const holder = ctx.state.actor.holding;
      if (entity.state === traits.holdTo) {
        if (holder !== entity.id) return;
        const max = ctx.world.width - entity.width;
        entity.x = Math.max(0, Math.min(max, ctx.state.actor.x + traits.holdOffset));
        entity.y = ctx.state.actor.y;
        return;
      }
      if (entity.state !== traits.holdFrom) return;
      if (holder === entity.id) {
        // 被规则改回初始状态：放下，并挪到身后，而不是留在脚底。
        ctx.state.actor.holding = null;
        const max = ctx.world.width - entity.width;
        entity.x = Math.max(0, Math.min(max, ctx.state.actor.x + traits.holdDropOffset));
        ctx.emit('放下了' + entity.label);
        return;
      }
      if (holder && holder !== entity.id) return;
      if (!ctx.atFloor(entity)) return;
      if (!ctx.overlaps(entity, 10)) return;
      const limit = ctx.world.width - entity.width;
      entity.state = traits.holdTo;
      entity.x = Math.max(0, Math.min(limit, ctx.state.actor.x + traits.holdOffset));
      entity.y = ctx.state.actor.y;
      ctx.state.actor.holding = entity.id;
      ctx.emit('拿起了' + entity.label);
    },
  }),
});
