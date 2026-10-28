import test from 'node:test';
import assert from 'node:assert/strict';

import { checkLayers, layerOf } from '../scripts/check-layers.mjs';

test('modules only depend downwards', async () => {
  const report = await checkLayers();
  assert.deepEqual(report.violations, [], JSON.stringify(report.violations, null, 2));
  assert.ok(report.modules > 10, '至少应该扫到契约 / 内核 / 解析器 / 应用各层');
});

test('layer classification follows the documented tree', () => {
  assert.equal(layerOf('core/contract/validate.js'), 'L0');
  assert.equal(layerOf('core/capabilities/holdable.js'), 'L0');
  assert.equal(layerOf('core/interpreters/factories/item.js'), 'L0');
  assert.equal(layerOf('core/kernel/engine.js'), 'L1-kernel');
  assert.equal(layerOf('core/interpreters/index.js'), 'L1-interpreter');
  assert.equal(layerOf('app/skills.js'), 'L1-app');
  assert.equal(layerOf('app/levelSource.js'), 'L1-app');
  assert.equal(layerOf('main.js'), 'L3-shell');
  assert.equal(layerOf('scene.js'), 'feature');
});
