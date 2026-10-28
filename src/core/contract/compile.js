// 文档 → 内核模型。解析器在完成四层校验后调用它：此后内核只读模型，不再看 kind 字符串。

import { traitsOfEntity, typeDescriptor } from './registry.js';

export function compileModel(doc) {
  const platforms = doc.platforms.map((platform) => Object.freeze({
    x: platform.x,
    width: platform.width,
  }));
  const entities = doc.entities.map((entity) => {
    const type = typeDescriptor(entity.kind);
    return Object.freeze({
      id: entity.id,
      kind: entity.kind,
      typeVersion: Number.isInteger(entity.typeVersion) ? entity.typeVersion : type.version,
      label: entity.label,
      x: entity.x,
      width: entity.width === undefined ? type.defaultWidth : entity.width,
      state: entity.state,
      traits: traitsOfEntity(entity),
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
    actor: Object.freeze({ x: doc.actor.x, speed: doc.actor.speed }),
    goal: Object.freeze({ x: doc.goal.x }),
    platforms: Object.freeze(platforms),
    entities: Object.freeze(entities),
    rules: structuredClone(doc.rules),
    meta: doc.meta === undefined ? undefined : structuredClone(doc.meta),
  });
}
