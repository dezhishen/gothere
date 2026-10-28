// 能力：区域。走进范围时迁移自身状态并发事件（压力板、地面机关、触发器）。

export const region = Object.freeze({
  id: 'region',
  version: 1,
  events: Object.freeze(['enter']),
  params: Object.freeze({ from: 'idle', to: 'pressed', event: 'enter', message: '' }),
  traits: (params) => ({
    enterFrom: params.from,
    enterTo: params.to,
    enterEvent: params.event,
    enterMessage: params.message,
  }),
  hooks: Object.freeze({
    onContact(ctx, entity) {
      if (entity.state !== entity.traits.enterFrom) return;
      if (!ctx.atFloor(entity)) return;
      if (!ctx.overlaps(entity)) return;
      entity.state = entity.traits.enterTo;
      ctx.emit(entity.traits.enterMessage + entity.label);
      ctx.trigger(entity.traits.enterEvent, entity.id);
    },
  }),
});
