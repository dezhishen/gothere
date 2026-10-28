// 结构化差异：dry-run 预览、Agent 与测试共用同一份实现。

const byId = (list) => {
  const map = new Map();
  for (const item of list ?? []) {
    if (item && typeof item.id === 'string') map.set(item.id, item);
  }
  return map;
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function diffList(before, after) {
  const left = byId(before);
  const right = byId(after);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, item] of right) {
    if (!left.has(id)) added.push(id);
    else if (!same(left.get(id), item)) changed.push(id);
  }
  for (const id of left.keys()) {
    if (!right.has(id)) removed.push(id);
  }
  return { added, removed, changed };
}

export function diffDocs(before, after) {
  const a = before ?? {};
  const b = after ?? {};
  const entities = diffList(a.entities, b.entities);
  const rules = diffList(a.rules, b.rules);
  const areas = [];
  if (!same(a.actor, b.actor)) areas.push('actor');
  if (!same(a.goal, b.goal)) areas.push('goal');
  if (!same(a.platforms, b.platforms)) areas.push('platforms');
  if (a.name !== b.name || a.description !== b.description || a.hint !== b.hint) areas.push('meta');
  const changed = entities.added.length + entities.removed.length + entities.changed.length +
    rules.added.length + rules.removed.length + rules.changed.length + areas.length;
  return { entities, rules, areas, changed, identical: changed === 0 };
}
