// 能力：在某个状态下挡住去路。门与风扇共用同一条语义，只是失败原因与文案不同。

export const blockPath = Object.freeze({
  id: 'blockPath',
  version: 1,
  events: Object.freeze([]),
  params: Object.freeze({ state: 'closed', reason: 'gate', message: '' }),
  traits: (params) => ({
    blocksInState: params.state,
    blockReason: params.reason,
    blockMessage: params.message,
  }),
  hooks: Object.freeze({
    onBlock(ctx, entity) {
      if (entity.state !== entity.traits.blocksInState) return;
      if (!ctx.overlaps(entity, 10)) return;
      ctx.lose(entity.traits.blockReason, entity.traits.blockMessage);
    },
  }),
});
