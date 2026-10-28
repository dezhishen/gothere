import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { describeEditor, editorPalette } from '../src/core/interpreters/index.js';
import { CONTROL_KINDS } from '../src/core/interpreters/factories/editor.js';
import { createFactory } from '../src/core/interpreters/factories/factory.js';
import { registerFactory, resetFactories, unregisterFactory } from '../src/core/interpreters/factories/index.js';
import { validateLevel } from '../src/core/contract/validate.js';
import {
  addEntity, addPlatform, addRule, blankLevel, createHistory, issues, moveEntity,
  patchEntity, patchLevel, removeEntity, removePlatform, removeRule, widthOf,
} from '../src/features/editor/model.js';

afterEach(() => resetFactories());

const flatten = (editor) => [
  ...editor.level,
  ...editor.platforms.flatMap((segment) => segment.fields),
  ...editor.entities.flatMap((entity) => [
    ...entity.fields,
    ...entity.declarations.flatMap((declaration) => declaration.fields),
  ]),
];

test('空白草稿通过校验，并且只含一个起点、一个终点、一段地面', () => {
  const doc = blankLevel();
  assert.equal(doc.entities.length, 0);
  assert.equal(doc.platforms.length, 1);
  assert.ok(validateLevel(doc).valid, JSON.stringify(validateLevel(doc).messages));
});

test('放置实体：同类型 id 自增、状态取类型默认值、位置被夹在场景内', () => {
  let doc = blankLevel();
  doc = addEntity(doc, { kind: 'switch', x: 300 });
  doc = addEntity(doc, { kind: 'switch', x: 5000 });
  doc = addEntity(doc, { kind: 'gate', x: 700 });
  assert.deepEqual(doc.entities.map((entity) => entity.id), ['switch-1', 'switch-2', 'gate-1']);
  assert.equal(doc.entities[0].state, 'off');
  assert.equal(doc.entities[2].state, 'closed');
  assert.ok(doc.entities[1].x + widthOf(doc.entities[1]) <= 1200);
  assert.ok(validateLevel(doc).valid);
});

test('移动与删除之后仍然通过校验，x 始终在场景内', () => {
  let doc = addEntity(blankLevel(), { kind: 'bridge', x: 400 });
  const id = doc.entities[0].id;
  doc = moveEntity(doc, id, -500);
  assert.equal(doc.entities[0].x, 25);
  doc = moveEntity(doc, id, 99999);
  assert.ok(doc.entities[0].x + widthOf(doc.entities[0]) <= 1200);
  doc = removeEntity(doc, id);
  assert.equal(doc.entities.length, 0);
  assert.ok(validateLevel(doc).valid);
});

test('字段白名单：别的类别的槽写不进去，本类别的点路径可以', () => {
  const doc = addEntity(blankLevel(), { kind: 'switch', x: 300 });
  const id = doc.entities[0].id;
  // carryable 是「物品」的槽：机关实体写不进去。
  const changed = patchEntity(doc, id, { carryable: {}, tags: ['x'], 'reacts.need': { tags: ['key', 'yellow'] } });
  assert.equal(changed.entities[0].carryable, undefined);
  assert.equal(changed.entities[0].tags, undefined);
  assert.deepEqual(changed.entities[0].reacts.need, { tags: ['key', 'yellow'] });
  assert.equal(changed.entities[0].reacts.from, 'off', '深层写入不应丢掉兄弟字段');
});

test('删掉被连线的元素时，指向它的连线一起清掉', () => {
  let doc = addEntity(addEntity(blankLevel(), { kind: 'switch', x: 300 }), { kind: 'gate', x: 600 });
  const [switchId, gateId] = doc.entities.map((entity) => entity.id);
  doc = addRule(doc, { on: { type: 'input', source: switchId }, actions: [{ type: 'set', target: gateId, state: 'open' }] });
  doc = addRule(doc, { on: { type: 'input', source: switchId }, actions: [{ type: 'after', ticks: 30, actions: [{ type: 'set', target: gateId, state: 'open' }] }] });
  assert.equal(doc.rules.length, 2);
  doc = removeEntity(doc, gateId);
  assert.equal(doc.rules.length, 0);
  doc = removeRule(doc, 0);
  assert.equal(doc.rules.length, 0);
  assert.ok(validateLevel(doc).valid);
});

test('关卡级字段支持点路径，地面段可以增删但不会删空', () => {
  let doc = patchLevel(blankLevel(), { 'actor.x': 120, 'actor.speed': 80, 'goal.x': 900 });
  assert.equal(doc.actor.x, 120);
  assert.equal(doc.actor.speed, 80);
  assert.equal(doc.goal.x, 900);
  doc = addPlatform(doc, { x: 600, width: 200 });
  assert.equal(doc.platforms.length, 2);
  doc = removePlatform(doc, 1);
  assert.equal(doc.platforms.length, 1);
  assert.throws(() => removePlatform(doc, 0), /至少要保留一段地面/);
});

test('撤销/重做按步回放，新动作会截断重做分支', () => {
  const history = createHistory(blankLevel());
  const first = addEntity(history.current(), { kind: 'switch', x: 300 });
  history.push(first);
  const second = addEntity(history.current(), { kind: 'gate', x: 600 });
  history.push(second);
  assert.equal(history.current().entities.length, 2);
  assert.equal(history.undo().entities.length, 1);
  assert.equal(history.undo().entities.length, 0);
  assert.equal(history.canUndo(), false);
  assert.equal(history.redo().entities.length, 1);
  const branch = addEntity(history.current(), { kind: 'bridge', x: 800 });
  history.push(branch);
  assert.equal(history.canRedo(), false);
  assert.deepEqual(history.current().entities.map((entity) => entity.kind), ['switch', 'bridge']);
});

test('草稿 JSON 往返等价，错误按实体归位方便高亮', () => {
  let doc = addEntity(blankLevel(), { kind: 'gate', x: 600 });
  doc = patchEntity(doc, doc.entities[0].id, { label: '' });
  const roundTrip = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTrip, doc);
  const report = issues(doc);
  assert.equal(report.ok, false);
  assert.ok(report.byEntity.has(doc.entities[0].id), '实体的错误要能挂到它的 id 上');
});

test('调色板与面板全部来自工厂回调：中文名、颜色、字段控件', () => {
  const palette = editorPalette();
  assert.deepEqual(palette.map((group) => group.category), ['mechanism', 'item']);
  const mechanism = palette.find((group) => group.category === 'mechanism');
  assert.equal(mechanism.label, '机关');
  const gate = mechanism.kinds.find((kind) => kind.kind === 'gate');
  assert.equal(gate.label, '门');
  assert.match(gate.accent, /^#[0-9a-f]{6}$/i);

  const doc = addEntity(blankLevel(), { kind: 'key', x: 300 });
  const editor = describeEditor(doc);
  const key = editor.entities[0];
  assert.equal(key.label, '钥匙');
  assert.ok(key.fields.some((field) => field.key === 'state' && field.control === 'select'));
  assert.ok(key.fields.some((field) => field.key === 'tags' && field.control === 'tags'));
  assert.ok(key.declarations.some((declaration) => declaration.slot === 'carryable'));
  for (const field of flatten(editor)) {
    assert.ok(CONTROL_KINDS.includes(field.control), '未知控件：' + field.control);
    assert.equal(typeof field.key, 'string');
    assert.equal(typeof field.label, 'string');
  }
});

test('新增一个机制类型：只写工厂，编辑器自动认识它（无需改 UI）', () => {
  const base = { schema: { label: '机关', slots: ['reacts'] } };
  const factory = createFactory({
    ...base,
    category: 'mechanism',
    version: 1,
    editor: { label: '机关', labels: { trapdoor: '翻板' }, accent: '#556677' },
    types: {
      trapdoor: {
        version: 1,
        defaultWidth: 40,
        iconOffset: 96,
        states: [{ id: 'shut', label: '关着' }, { id: 'open', label: '开着' }],
        slots: { reacts: { on: 'input', from: 'shut', actions: [{ type: 'become', state: 'open' }] } },
      },
    },
  });
  unregisterFactory('mechanism');
  registerFactory(factory);

  const palette = editorPalette();
  const group = palette.find((item) => item.category === 'mechanism');
  assert.deepEqual(group.kinds.map((kind) => kind.kind), ['trapdoor']);
  assert.equal(group.kinds[0].label, '翻板');
  assert.equal(group.kinds[0].accent, '#556677');

  const doc = addEntity(blankLevel(), { kind: 'trapdoor', x: 420 });
  assert.equal(doc.entities[0].id, 'trapdoor-1');
  assert.equal(doc.entities[0].state, 'shut');
  const editor = describeEditor(doc);
  assert.equal(editor.entities[0].label, '翻板');
  assert.deepEqual(editor.entities[0].fields.map((field) => field.key), ['id', 'label', 'x', 'width', 'state']);
  assert.equal(editor.entities[0].fields.at(-1).options.at(-1).value, 'open');
  assert.equal(editor.entities[0].declarations[0].slot, 'reacts');
  assert.ok(validateLevel(doc).valid, JSON.stringify(validateLevel(doc).messages));
});

test('工厂不写 editor 也能用：字段照样从类型的 schema 推出来', () => {
  const factory = createFactory({
    category: 'item',
    version: 1,
    schema: { label: '物品', slots: ['tags', 'carryable'] },
    types: {
      lantern: {
        version: 1, defaultWidth: 24, iconOffset: 92,
        states: [{ id: 'out', label: '熄着' }, { id: 'lit', label: '亮着' }],
        slots: { carryable: {} },
      },
    },
  });
  unregisterFactory('item');
  registerFactory(factory);
  const doc = addEntity(blankLevel(), { kind: 'lantern', x: 200 });
  const editor = describeEditor(doc);
  assert.equal(editor.entities[0].label, 'lantern');
  assert.deepEqual(editor.entities[0].fields.map((field) => field.key), ['id', 'label', 'x', 'width', 'state']);
  assert.equal(editor.entities[0].declarations[0].slot, 'carryable');
  assert.ok(editor.palette.some((group) => group.category === 'item'));
});
