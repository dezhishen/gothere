// 文档 → 内核模型。解析器在完成四层校验后调用它：此后内核只读模型，不再看 kind 字符串。
// 实体上的声明槽在这里合并好（类型预设 + 实体覆盖），内核只读合并结果，不查表。

import { WORLD } from './constants.js';
import { consumedStateOf, hiddenStatesOf, slotsOfEntity, tagsOfEntity, typeDescriptor } from './registry.js';
import { getFactory } from '../interpreters/factories/index.js';

const floorOf = (value) => (value === undefined ? WORLD.groundY : value);

export function compileModel(doc) {
  const platforms = doc.platforms.map((platform) => Object.freeze({
    x: platform.x,
    width: platform.width,
    y: floorOf(platform.y),
  }));
  const entities = doc.entities.map((entity) => {
    const type = typeDescriptor(entity.kind);
    return Object.freeze({
      id: entity.id,
      kind: entity.kind,
      typeVersion: Number.isInteger(entity.typeVersion) ? entity.typeVersion : type.version,
      label: entity.label,
      x: entity.x,
      y: floorOf(entity.y),
      width: entity.width === undefined ? type.defaultWidth : entity.width,
      state: entity.state,
      tags: Object.freeze(tagsOfEntity(entity)),
      hiddenStates: Object.freeze(hiddenStatesOf(entity)),
      consumedState: consumedStateOf(entity),
      ...slotsOfEntity(entity),
    });
  });
  return Object.freeze({
    compiled: true,
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    name: doc.name,
    description: doc.description,
    hint: doc.hint,
    world: Object.freeze({ width: doc.world.width, height: doc.world.height, groundY: doc.world.groundY }),
    actor: Object.freeze({ x: doc.actor.x, y: floorOf(doc.actor.y), speed: doc.actor.speed }),
    goal: Object.freeze({ x: doc.goal.x, y: floorOf(doc.goal.y) }),
    platforms: Object.freeze(platforms),
    stairs: Object.freeze((doc.stairs ?? []).map((stair) => Object.freeze({
      x: stair.x,
      width: stair.width,
      fromY: stair.fromY,
      toY: stair.toY,
    }))),
    terrain: getFactory('map').terrain({ platforms: doc.platforms, stairs: doc.stairs }),
    entities: Object.freeze(entities),
    rules: structuredClone(doc.rules ?? []),
    meta: doc.meta === undefined ? undefined : structuredClone(doc.meta),
  });
}
