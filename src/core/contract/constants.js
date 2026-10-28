// 世界常量与执行上限：唯一来源，禁止在其他模块散落 1200/640/440 之类的魔数。

export const WORLD = Object.freeze({
  width: 1200,
  height: 640,
  groundY: 440,
});

export const TICKS_PER_SECOND = 60;

export const LIMITS = Object.freeze({
  maxTicks: 36000,
  actionsPerTick: 1024,
  maxTimers: 256,
  maxClicksPerTick: 32,
  maxActionsPerLevel: 512,
  maxRules: 128,
  maxEntities: 64,
  maxPlatforms: 64,
  maxConditions: 16,
  maxActionsPerRule: 32,
  maxActionDepth: 4,
  maxDelayTicks: 3600,
  recentEvents: 24,
  minFloorY: 200,
  maxFloorY: 440,
  stepTolerance: 12,
  floorTolerance: 10,
  actorMinX: 20,
  actorMaxX: 1150,
  minSpeed: 15,
  maxSpeed: 180,
  goalMinX: 40,
  goalMaxX: 1180,
  entityMinX: 25,
  entityMaxX: 1175,
  minWidth: 8,
  maxWidth: 600,
  defaultWidth: 28,
  idMax: 48,
  nameMax: 60,
  descriptionMax: 300,
  hintMax: 500,
  labelMax: 30,
  fileBytes: 131072,
});

// 内核文案：属于模拟结果的一部分，集中放在这里，错误码另见 src/app/errors.js。
export const MESSAGES = Object.freeze({
  fall: '脚下的路临时请假了。试试先把桥放下来。',
  timeout: '这段路走成了长征。歇一下，重新出发吧。',
  limit: '机关规则太忙了。请减少重复触发或延迟动作，再重新出发。',
  won: '到了！就说一定能到这里。',
});
