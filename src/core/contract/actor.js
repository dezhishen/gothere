// 角色视图：元素能读到的「人身上有什么」。
// 只读 + 一个消耗动作；读的是内核状态，写也只写内核允许的那一处（take）。
// 元素拿不到实体引用，因此改不了别人的状态。

import { itemCard, matchesNeed, missingTags } from './item.js';

/**
 * 造一份角色视图。state 是内核的状态对象：
 * { actor: { x, y, holding, riding }, entities: {...} }
 */
export function createActorView(state) {
  const heldEntity = state.actor.holding ? state.entities[state.actor.holding] : null;
  const card = heldEntity ? itemCard(heldEntity) : null;
  return Object.freeze({
    x: state.actor.x,
    y: state.actor.y,
    floor: state.actor.y,
    riding: state.actor.riding,
    holding: state.actor.holding,
    held: card,
    inventory: Object.freeze(card ? [card] : []),
    tags: Object.freeze(card ? [...card.tags] : []),
    /** 我身上有没有满足这条需求的东西。 */
    can(need) {
      const ok = matchesNeed(card, need);
      return { ok, missing: ok ? [] : missingTags(card, need), card };
    },
    /**
     * 消耗掉满足需求的那件东西：物品变成它自己声明的 consumedState（没有就退回 from）。
     * 返回被消耗的卡片，没有可消耗的东西则返回 null。
     */
    take(need) {
      if (!matchesNeed(card, need) || !heldEntity) return null;
      const target = heldEntity.consumedState ?? (heldEntity.carryable ? heldEntity.carryable.from : heldEntity.state);
      heldEntity.state = target;
      state.actor.holding = null;
      return card;
    },
  });
}
