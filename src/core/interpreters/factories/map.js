// 内容工厂：地图。地图是**多层地形**：地面段（platforms）+ 楼梯段（stairs）。
// 角色脚底高度由地形决定，所以「一层」= 一组同高的地面段；楼梯是高度随 x 线性变化的斜段。
// 地图不产出实体：电梯这种「带状态、可被规则驱动」的东西属于机关。

import { LIMITS, WORLD } from '../../contract/constants.js';
import { createFactory } from './factory.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const inRange = (value, min, max) => isNumber(value) && value >= min && value <= max;
const floorY = (value) => (value === undefined ? WORLD.groundY : value);
const quantize = (value) => Math.round(value * 1e6) / 1e6;

export const MAX_STAIRS = 32;

function parseMapSection(input) {
  const errors = [];
  const fail = (code, path, message) => errors.push({ code, path, message });
  const section = isObject(input) ? input : {};

  const world = section.world;
  if (!isObject(world) || world.width !== WORLD.width || world.height !== WORLD.height || world.groundY !== WORLD.groundY) {
    fail('SCHEMA_INVALID', 'world',
      '当前版本 world 必须为 {width:' + WORLD.width + ',height:' + WORLD.height + ',groundY:' + WORLD.groundY + '}。');
  }

  const actor = section.actor;
  if (!isObject(actor) || !inRange(actor.x, LIMITS.actorMinX, LIMITS.actorMaxX) ||
    !inRange(actor.speed, LIMITS.minSpeed, LIMITS.maxSpeed) ||
    !inRange(floorY(actor && actor.y), LIMITS.minFloorY, LIMITS.maxFloorY)) {
    fail('SCHEMA_INVALID', 'actor',
      'actor 需要合法的 x（' + LIMITS.actorMinX + '～' + LIMITS.actorMaxX + '）、speed（' + LIMITS.minSpeed + '～' + LIMITS.maxSpeed + '，单位/秒）与可选的 y（' + LIMITS.minFloorY + '～' + LIMITS.maxFloorY + '）。');
  }

  const goal = section.goal;
  if (!isObject(goal) || !inRange(goal.x, LIMITS.goalMinX, LIMITS.goalMaxX) ||
    !isNumber(actor && actor.x) || !(goal.x > actor.x) ||
    !inRange(floorY(goal && goal.y), LIMITS.minFloorY, LIMITS.maxFloorY)) {
    fail('SCHEMA_INVALID', 'goal', 'goal.x 必须在角色起点右侧且不超过 ' + LIMITS.goalMaxX + '，y 可省略（默认地面）。');
  }

  const platforms = Array.isArray(section.platforms) ? section.platforms : [];
  if (!Array.isArray(section.platforms) || platforms.length === 0 || platforms.length > LIMITS.maxPlatforms) {
    fail('SCHEMA_INVALID', 'platforms', 'platforms 必须包含 1～' + LIMITS.maxPlatforms + ' 段地面。');
  }
  platforms.forEach((platform, index) => {
    if (!isObject(platform) || !inRange(platform.x, 0, WORLD.width) ||
      !inRange(platform.width, 1, WORLD.width) || platform.x + platform.width > WORLD.width ||
      !inRange(floorY(platform.y), LIMITS.minFloorY, LIMITS.maxFloorY)) {
      fail('SCHEMA_INVALID', 'platforms[' + index + ']', 'platforms[' + index + '] 的范围或高度（y）不合法。');
    }
  });

  const stairs = Array.isArray(section.stairs) ? section.stairs : [];
  if (section.stairs !== undefined && (!Array.isArray(section.stairs) || stairs.length > MAX_STAIRS)) {
    fail('SCHEMA_INVALID', 'stairs', 'stairs 必须是最多 ' + MAX_STAIRS + ' 项的数组。');
  }
  stairs.forEach((stair, index) => {
    const ok = isObject(stair) && inRange(stair.x, 0, WORLD.width) && inRange(stair.width, 1, WORLD.width) &&
      stair.x + stair.width <= WORLD.width &&
      inRange(stair.fromY, LIMITS.minFloorY, LIMITS.maxFloorY) &&
      inRange(stair.toY, LIMITS.minFloorY, LIMITS.maxFloorY);
    if (!ok) fail('SCHEMA_INVALID', 'stairs[' + index + ']', 'stairs[' + index + '] 需要 x / width / fromY / toY。');
  });

  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? 'OK' : 'VALIDATION_FAILED',
    errors,
    map: {
      world,
      actor: isObject(actor) ? { ...actor, y: floorY(actor.y) } : actor,
      goal: isObject(goal) ? { ...goal, y: floorY(goal.y) } : goal,
      platforms: platforms.map((platform) => (isObject(platform) ? { ...platform, y: floorY(platform.y) } : platform)),
      stairs: stairs.map((stair) => (isObject(stair) ? { ...stair } : stair)),
    },
  };
}

/** 地形查询：任意 x 处的所有可用表面（地面段是常数，楼梯是线性插值）。 */
function mapTerrain(input) {
  const section = isObject(input) ? input : {};
  const platforms = Array.isArray(section.platforms) ? section.platforms.filter(isObject) : [];
  const stairs = Array.isArray(section.stairs) ? section.stairs.filter(isObject) : [];

  const at = (x) => {
    const surfaces = [];
    for (const platform of platforms) {
      if (x >= platform.x && x <= platform.x + platform.width) surfaces.push({ y: quantize(floorY(platform.y)), kind: 'platform' });
    }
    for (const stair of stairs) {
      if (x < stair.x || x > stair.x + stair.width) continue;
      const t = stair.width === 0 ? 0 : (x - stair.x) / stair.width;
      surfaces.push({ y: quantize(stair.fromY + (stair.toY - stair.fromY) * t), kind: 'stairs' });
    }
    return surfaces;
  };

  return Object.freeze({
    at,
    /** 取离上一 tick 脚底最近、且在容差内的表面；没有就是踩空。 */
    resolve(x, previousY, tolerance = LIMITS.stepTolerance) {
      let best = null;
      for (const surface of at(x)) {
        const distance = Math.abs(surface.y - previousY);
        if (distance > tolerance) continue;
        if (best === null || distance < Math.abs(best - previousY)) best = surface.y;
      }
      return best;
    },
    /** 任一表面包含 x（不看高度），用于语义层「终点在地面上」这类检查。 */
    supports(x) {
      return at(x).length > 0;
    },
  });
}

export function createMapFactory() {
  return createFactory({
    category: 'map',
    version: 1,
    schema: {
      label: '地图',
      // 地图不产出实体：这些是关卡文档里地图自己那一段的字段。
      slots: [],
      sections: ['world', 'actor', 'goal', 'platforms', 'stairs'],
    },
    parseSection: parseMapSection,
    terrain: mapTerrain,
  });
}
