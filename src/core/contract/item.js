// 物品卡：机关看物品的唯一入口。物品自己只声明 tags/状态，这里把它读成一张只读卡片。
// 判断「够不够」也在这里：需求是数据（{ kind, tags }），不是表达式。

/** 实体 → 一张只读物品卡。 */
export function itemCard(entity) {
  return Object.freeze({
    id: entity.id,
    kind: entity.kind,
    label: entity.label,
    tags: Object.freeze([...(entity.tags ?? [])]),
    state: entity.state,
  });
}

/** 这张卡是否满足一条需求：need 为空即永远满足；kind 与 tags 全部命中才算满足。 */
export function matchesNeed(card, need) {
  if (!card) return false;
  if (!need) return true;
  if (typeof need.kind === 'string' && card.kind !== need.kind) return false;
  for (const tag of need.tags ?? []) {
    if (!card.tags.includes(tag)) return false;
  }
  return true;
}

/** 缺了哪些标签：只用于给人看的提示与校验，不参与判定。 */
export function missingTags(card, need) {
  const tags = need && Array.isArray(need.tags) ? need.tags : [];
  const have = card ? card.tags : [];
  return tags.filter((tag) => !have.includes(tag));
}
