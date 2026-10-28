// 能力：接触伤害。只在指定状态下伤人；被拿在手里时自动不伤人（同一把斧头两种配置）。

export const damageOnContact = Object.freeze({
  id: 'damageOnContact',
  version: 1,
  events: Object.freeze([]),
  params: Object.freeze({ state: 'idle', reason: 'hurt', message: '' }),
  traits: (params) => ({
    harmsInState: params.state,
    harmReason: params.reason,
    harmMessage: params.message,
  }),
  hooks: Object.freeze({
    onContact(ctx, entity) {
      if (entity.state !== entity.traits.harmsInState) return;
      if (ctx.state.actor.holding === entity.id) return;
      if (!ctx.overlaps(entity, 10)) return;
      ctx.lose(entity.traits.harmReason, entity.traits.harmMessage);
    },
  }),
});
