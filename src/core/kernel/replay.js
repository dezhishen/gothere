// 回放：记录输入 {inputs[{tick,source}], untilTick, status} 并用同一内核重推，不是逐帧录制。

import { LIMITS } from '../contract/constants.js';
import { createSimulation } from './engine.js';

const STATUSES = ['ready', 'running', 'paused', 'lost', 'won'];

export function replayRecording(model, recording) {
  if (!recording || recording.schemaVersion !== model.schemaVersion || recording.levelId !== model.id ||
    !Number.isInteger(recording.untilTick) || recording.untilTick < 0 || recording.untilTick > LIMITS.maxTicks ||
    !Array.isArray(recording.inputs) || recording.inputs.length > LIMITS.maxTicks ||
    !STATUSES.includes(recording.status)) {
    throw new Error('回放格式或关卡不匹配。');
  }
  let previous = 0;
  for (const input of recording.inputs) {
    if (!input || !Number.isInteger(input.tick) || input.tick < 1 || input.tick < previous ||
      input.tick > recording.untilTick || typeof input.source !== 'string') {
      throw new Error('回放操作序列不合法。');
    }
    previous = input.tick;
  }
  const game = createSimulation(model);
  game.start();
  let index = 0;
  for (let tick = 1; tick <= recording.untilTick; tick += 1) {
    while (recording.inputs[index] && recording.inputs[index].tick === tick) {
      if (!game.click(recording.inputs[index].source)) throw new Error('回放包含不可执行的机关操作。');
      index += 1;
    }
    game.step();
    if ((game.snapshot().status === 'won' || game.snapshot().status === 'lost') && tick < recording.untilTick) {
      throw new Error('回放在结束后仍包含时间或操作。');
    }
  }
  if (recording.status === 'paused') game.pause();
  if (recording.status === 'ready' && recording.untilTick === 0) game.reset();
  if (game.snapshot().status !== recording.status) throw new Error('回放结果与记录不一致。');
  return game;
}
