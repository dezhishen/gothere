// 结构化差异：dry-run 预览、Agent 与测试共用同一份实现。

interface Identified { id?: string }

export interface ListDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export interface DocDiff {
  entities: ListDiff;
  rules: ListDiff;
  areas: string[];
  changed: number;
  identical: boolean;
}

const byId = <T extends Identified>(list: ReadonlyArray<T> | undefined): Map<string, T> => {
  const map = new Map<string, T>();
  for (const item of list ?? []) {
    if (item && typeof item.id === 'string') map.set(item.id, item);
  }
  return map;
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function diffList<T extends Identified>(before: ReadonlyArray<T> | undefined, after: ReadonlyArray<T> | undefined): ListDiff {
  const left = byId(before);
  const right = byId(after);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [id, item] of right) {
    if (!left.has(id)) added.push(id);
    else if (!same(left.get(id), item)) changed.push(id);
  }
  for (const id of left.keys()) {
    if (!right.has(id)) removed.push(id);
  }
  return { added, removed, changed };
}

export function diffDocs(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): DocDiff {
  const a = before ?? {};
  const b = after ?? {};
  const entities = diffList(a.entities as Identified[] | undefined, b.entities as Identified[] | undefined);
  const rules = diffList(a.rules as Identified[] | undefined, b.rules as Identified[] | undefined);
  const areas: string[] = [];
  if (!same(a.actor, b.actor)) areas.push('actor');
  if (!same(a.goal, b.goal)) areas.push('goal');
  if (!same(a.platforms, b.platforms)) areas.push('platforms');
  if (a.name !== b.name || a.description !== b.description || a.hint !== b.hint) areas.push('meta');
  const changed = entities.added.length + entities.removed.length + entities.changed.length +
    rules.added.length + rules.removed.length + rules.changed.length + areas.length;
  return { entities, rules, areas, changed, identical: changed === 0 };
}
