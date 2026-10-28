// 内容工厂：地图。负责 world / actor / goal / platforms 这一段数据，
// 以及「角色或终点是否站在地面上」这类几何查询。地图不产出实体。

import { LIMITS, WORLD } from '../../contract/constants.js';
import { createFactory } from './factory.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const inRange = (value, min, max) => isNumber(value) && value >= min && value <= max;

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
    !inRange(actor.speed, LIMITS.minSpeed, LIMITS.maxSpeed)) {
    fail('SCHEMA_INVALID', 'actor',
      'actor 需要合法的 x（' + LIMITS.actorMinX + '～' + LIMITS.actorMaxX + '）和 speed（' + LIMITS.minSpeed + '～' + LIMITS.maxSpeed + '，单位/秒）。');
  }

  const goal = section.goal;
  if (!isObject(goal) || !inRange(goal.x, LIMITS.goalMinX, LIMITS.goalMaxX) ||
    !isNumber(actor && actor.x) || !(goal.x > actor.x)) {
    fail('SCHEMA_INVALID', 'goal', 'goal.x 必须在角色起点右侧且不超过 ' + LIMITS.goalMaxX + '。');
  }

  const platforms = Array.isArray(section.platforms) ? section.platforms : [];
  if (!Array.isArray(section.platforms) || platforms.length === 0 || platforms.length > LIMITS.maxPlatforms) {
    fail('SCHEMA_INVALID', 'platforms', 'platforms 必须包含 1～' + LIMITS.maxPlatforms + ' 段地面。');
  }
  platforms.forEach((platform, index) => {
    if (!isObject(platform) || !inRange(platform.x, 0, WORLD.width) ||
      !inRange(platform.width, 1, WORLD.width) || platform.x + platform.width > WORLD.width) {
      fail('SCHEMA_INVALID', 'platforms[' + index + ']', 'platforms[' + index + '] 的范围不合法。');
    }
  });

  return {
    ok: errors.length === 0,
    code: errors.length === 0 ? 'OK' : 'VALIDATION_FAILED',
    errors,
    map: { world, actor, goal, platforms },
  };
}

function mapTerrain(input) {
  const platforms = isObject(input) && Array.isArray(input.platforms) ? input.platforms.filter(isObject) : [];
  const spans = platforms.map((platform) => [platform.x, platform.x + platform.width]);
  return Object.freeze({
    spans,
    supports: (x) => spans.some(([left, right]) => x >= left && x <= right),
  });
}

export function createMapFactory() {
  return createFactory({
    category: 'map',
    version: 1,
    parseSection: parseMapSection,
    terrain: mapTerrain,
  });
}
