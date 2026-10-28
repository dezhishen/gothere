// 可视化编辑器：同一个 canvas，两副面孔。
// 关键约定：**这里不认识任何具体类型**。调色板、字段、下拉选项、声明槽
// 全部来自 describeEditor(草稿)——也就是各个已注册工厂的 editor 回调。
// 所以新增一种机关/物品，只要在它的工厂里声明 editor，编辑器自动就有它。

import { WORLD } from '../../core/contract/constants.js';
import { acceptsInput, eventsOfEntity, typeDescriptor } from '../../core/contract/registry.js';
import { describeEditor } from '../../core/interpreters/index.js';
import { addEntity, addPlatform, addRule, blankLevel, createHistory, issues, moveEntity, patchEntity, patchLevel, patchPlatform, removeEntity, removePlatform, removeRule, widthOf } from './model.js';

const DRAFT_KEY = 'gothere.draft.v1';
const GROUND = WORLD.groundY;
const TICKS_PER_SECOND = 60;

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** 编辑模式下给渲染器的「假快照」：只有几何与状态，没有任何模拟进度。 */
export function editSnapshot(doc) {
  const entities = {};
  for (const entity of doc.entities) {
    entities[entity.id] = { ...entity, width: widthOf(entity), y: entity.y ?? GROUND };
  }
  return {
    tick: 0, status: 'ready', reason: null, clicks: 0, events: [], timers: [],
    actor: { x: doc.actor.x, y: doc.actor.y ?? GROUND, holding: null, riding: null },
    entities,
  };
}

/** 把控件里的原始字符串还原成文档里的值；非法 JSON 抛错给调用方提示。 */
function readControl(field, raw) {
  if (field.control === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : field.value;
  }
  if (field.control === 'tags') return String(raw).split(/[\s,]+/).filter(Boolean);
  if (field.control === 'json') return JSON.parse(raw);
  if (field.control === 'select' && typeof field.value === 'boolean') return raw === 'true';
  return raw;
}

/**
 * 造一个编辑器。
 * - draw(doc)     把草稿画到 canvas（复用游戏渲染器）
 * - onPlay(doc)   把草稿交给试玩
 * - onExit()      退出编辑模式
 * - onChange(doc) 文档变化（用于存草稿）
 */
export function createEditor({ canvas, draw, onPlay, onExit, onChange }) {
  const dom = {
    bar: document.getElementById('editor-bar'),
    palette: document.getElementById('editor-palette'),
    inspector: document.getElementById('editor-inspector'),
    layer: document.getElementById('edit-layer'),
    status: document.getElementById('editor-status'),
    hotspotLayer: document.getElementById('hotspots'),
    controls: document.getElementById('game-controls'),
  };

  const history = createHistory(blankLevel());
  let selectedId = null;
  let editing = false;
  let drag = null;
  let live = null; // 拖动中的预览文档：松手才写进历史，撤销才不会一格一格跳

  const doc = () => live ?? history.current();
  const selected = () => doc().entities.find((entity) => entity.id === selectedId) ?? null;
  const described = () => describeEditor(doc());
  const commit = (next) => { history.push(next); refresh(); onChange?.(doc()); };

  function setStatus(text, tone = '') {
    if (!dom.status) return;
    dom.status.textContent = text;
    dom.status.dataset.tone = tone;
  }

  // ---- 控件：只认几种 control，其余交给工厂 ----

  function fieldControl(field, onValue) {
    const apply = (raw) => {
      try {
        onValue(readControl(field, raw));
      } catch (error) {
        setStatus(field.label + '：' + error.message, 'bad');
      }
    };
    if (field.control === 'select') {
      const select = element('select', 'edit-input');
      for (const option of field.options) {
        const node = element('option', '', option.label);
        node.value = option.value;
        select.append(node);
      }
      select.value = String(field.value);
      select.addEventListener('change', () => apply(select.value));
      return select;
    }
    if (field.control === 'json') {
      const area = element('textarea', 'edit-textarea');
      area.value = JSON.stringify(field.value, null, 2);
      area.spellcheck = false;
      area.addEventListener('change', () => apply(area.value));
      return area;
    }
    const input = element('input', 'edit-input');
    input.type = field.control === 'number' ? 'number' : 'text';
    input.value = Array.isArray(field.value) ? field.value.join(' ') : String(field.value ?? '');
    if (field.min !== undefined) input.min = String(field.min);
    if (field.max !== undefined) input.max = String(field.max);
    if (field.step !== undefined) input.step = String(field.step);
    input.addEventListener('change', () => apply(input.value));
    return input;
  }

  function fieldRow(field, onValue) {
    const wrap = element('label', 'edit-field');
    wrap.append(element('span', 'edit-field-label', field.label));
    wrap.append(fieldControl(field, onValue));
    if (field.hint) wrap.append(element('span', 'edit-field-hint', field.hint));
    return wrap;
  }

  function card(title) {
    const box = element('div', 'edit-card');
    const head = element('div', 'edit-card-head');
    head.append(element('h3', 'edit-card-title', title));
    box.append(head);
    return { box, head };
  }

  // ---- 画布渲染 ------------------------------------------------------------

  function renderSelection() {
    if (!dom.layer) return;
    dom.layer.replaceChildren();
    const current = doc();
    const model = described();
    const bad = issues(current).byEntity;
    const box = (left, width, top, cls, label, accent) => {
      const node = element('div', cls);
      node.style.left = (left / WORLD.width * 100) + '%';
      node.style.width = (width / WORLD.width * 100) + '%';
      node.style.top = (top / WORLD.height * 100) + '%';
      if (accent) node.style.borderColor = accent;
      if (label) node.append(element('span', 'edit-tag', label));
      return node;
    };
    dom.layer.append(box(current.actor.x - 18, 36, GROUND - 62, 'edit-box edit-actor', '起点'));
    dom.layer.append(box(current.goal.x - 22, 44, GROUND - 96, 'edit-box edit-goal', '终点'));
    current.platforms.forEach((platform, index) => {
      dom.layer.append(box(platform.x, platform.width, GROUND + 2, 'edit-box edit-platform', '地面 ' + (index + 1)));
    });
    for (const entity of current.entities) {
      const info = model.entities.find((item) => item.id === entity.id);
      const node = box(entity.x, widthOf(entity), (entity.y ?? GROUND) - 72, 'edit-box edit-entity',
        info ? info.label : entity.kind, info ? info.accent : null);
      if (entity.id === selectedId) node.classList.add('selected');
      if (bad.has(entity.id) || (info && !info.known)) node.classList.add('invalid');
      node.dataset.entity = entity.id;
      node.title = entity.label + '（' + entity.id + '）' + (info ? ' · ' + info.label : '');
      dom.layer.append(node);
    }
  }

  function renderPalette(model) {
    if (!dom.palette) return;
    dom.palette.replaceChildren();
    for (const group of model.palette) {
      const wrap = element('div', 'palette-group');
      wrap.append(element('span', 'palette-label', group.label));
      for (const kind of group.kinds) {
        const button = element('button', 'palette-item', kind.label);
        button.type = 'button';
        button.dataset.kind = kind.kind;
        button.style.borderColor = kind.accent + '55';
        button.title = kind.kind + (kind.hint ? ' · ' + kind.hint : '');
        button.addEventListener('click', () => {
          const anchor = selected();
          const x = anchor ? anchor.x + widthOf(anchor) + 60 : Math.round(WORLD.width / 2);
          commit(addEntity(doc(), { kind: kind.kind, x }));
          selectedId = doc().entities.at(-1)?.id ?? null;
          refresh();
        });
        wrap.append(button);
      }
      dom.palette.append(wrap);
    }
  }

  // ---- 面板 ---------------------------------------------------------------

  function renderInspector(model) {
    if (!dom.inspector) return;
    dom.inspector.replaceChildren();
    const current = doc();

    // 关卡：字段由地图工厂给
    const level = card('关卡');
    for (const field of model.level) {
      level.box.append(fieldRow(field, (value) => commit(patchLevel(doc(), { [field.key]: value }))));
    }
    dom.inspector.append(level.box);

    // 地面：同样归地图工厂
    const ground = card('地面');
    const addButton = element('button', 'text-button', '+ 加一段');
    addButton.type = 'button';
    addButton.addEventListener('click', () => commit(addPlatform(doc(), { x: 0, width: 240 })));
    ground.head.append(addButton);
    for (const segment of model.platforms) {
      const row = element('div', 'edit-row');
      for (const field of segment.fields) {
        row.append(fieldRow(field, (value) => commit(patchPlatform(doc(), segment.index, { [field.key]: value }))));
      }
      const remove = element('button', 'text-button danger', '删除');
      remove.type = 'button';
      remove.disabled = current.platforms.length <= 1;
      remove.addEventListener('click', () => commit(removePlatform(doc(), segment.index)));
      row.append(remove);
      ground.box.append(row);
    }
    dom.inspector.append(ground.box);

    // 选中的元素：字段与声明槽都来自它的工厂
    const info = model.entities.find((item) => item.id === selectedId) ?? null;
    const entityBox = card(info ? info.label + ' · ' + info.kind : '选中一个元素');
    if (!info) {
      entityBox.box.append(element('p', 'edit-empty', '点画布上的方块选中，或从上面的调色板放一个。选中后可以直接拖动。'));
    } else {
      if (info.hint) entityBox.box.append(element('p', 'edit-empty', info.hint));
      for (const field of info.fields) {
        entityBox.box.append(fieldRow(field, (value) => commit(patchEntity(doc(), info.id, { [field.key]: value }))));
      }
      if (info.declarations.length > 0) {
        entityBox.box.append(element('span', 'edit-field-label', '声明'));
      }
      for (const declaration of info.declarations) {
        const group = element('div', 'edit-declaration');
        group.append(element('span', 'edit-declaration-title', declaration.label));
        for (const field of declaration.fields) {
          group.append(fieldRow(field, (value) => commit(patchEntity(doc(), info.id, { [field.key]: value }))));
        }
        entityBox.box.append(group);
      }
      const remove = element('button', 'button secondary danger', '删除这个元素');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        commit(removeEntity(doc(), info.id));
        selectedId = null;
        refresh();
      });
      entityBox.box.append(remove);
      for (const message of issues(current).byEntity.get(info.id) ?? []) {
        entityBox.box.append(element('p', 'edit-error', message));
      }
    }
    dom.inspector.append(entityBox.box);

    // 连线：内核流程，不属于任何类型；选项由「谁能被点」与各类型的状态算出
    const rules = card('连线（点它 → 目标换状态）');
    const sources = current.entities.filter((entity) => acceptsInput(entity));
    const stateful = current.entities.filter((entity) => (typeDescriptor(entity.kind)?.states ?? []).length > 0);
    if (sources.length === 0 || stateful.length === 0) {
      rules.box.append(element('p', 'edit-empty', '先放一个可点的机关（比如开关）和一个有状态的机关，才能连线。'));
    }
    (current.rules ?? []).forEach((rule, index) => {
      const row = element('div', 'edit-rule');
      const delayed = (rule.actions ?? [])[0]?.type === 'after';
      const inner = delayed ? (rule.actions[0].actions ?? [])[0] ?? {} : (rule.actions ?? [])[0] ?? {};
      const sourceSelect = element('select', 'edit-input');
      for (const entity of sources) {
        const option = element('option', '', entity.label + '（' + entity.id + '）');
        option.value = entity.id;
        sourceSelect.append(option);
      }
      sourceSelect.value = rule.on?.source ?? sources[0]?.id ?? '';
      const targetSelect = element('select', 'edit-input');
      for (const entity of stateful) {
        const option = element('option', '', entity.label + '（' + entity.id + '）');
        option.value = entity.id;
        targetSelect.append(option);
      }
      targetSelect.value = inner.target ?? stateful[0]?.id ?? '';
      const stateSelect = element('select', 'edit-input');
      const rebuildStates = () => {
        const target = stateful.find((entity) => entity.id === targetSelect.value);
        stateSelect.replaceChildren();
        for (const state of typeDescriptor(target?.kind)?.states ?? []) {
          const option = element('option', '', state.id + ' · ' + state.label);
          option.value = state.id;
          stateSelect.append(option);
        }
        stateSelect.value = inner.state ?? stateSelect.options[0]?.value ?? '';
      };
      rebuildStates();
      const delay = element('input', 'edit-input');
      delay.type = 'number'; delay.min = '0'; delay.step = '0.1';
      delay.value = delayed ? String(Math.round(rule.actions[0].ticks / TICKS_PER_SECOND * 10) / 10) : '0';
      const write = () => {
        const seconds = Number(delay.value) || 0;
        const setAction = { type: 'set', target: targetSelect.value, state: stateSelect.value };
        const source = sources.find((entity) => entity.id === sourceSelect.value);
        // 事件名来自这个实体自己声明的反应（click / publish 的事件名），不是写死的。
        const eventType = eventsOfEntity(source ?? {})[0] ?? 'click';
        const next = {
          on: { type: eventType, source: sourceSelect.value },
          actions: seconds > 0
            ? [{ type: 'after', ticks: Math.round(seconds * TICKS_PER_SECOND), actions: [setAction] }]
            : [setAction],
        };
        commit(patchRuleAt(doc(), index, next));
      };
      sourceSelect.addEventListener('change', write);
      targetSelect.addEventListener('change', () => { rebuildStates(); write(); });
      stateSelect.addEventListener('change', write);
      delay.addEventListener('change', write);
      row.append(fieldRow({ key: 'on', label: '点它', value: '' }, () => {}) ?? element('span'));
      // 上面那行只是占位标签，真正的控件按顺序塞进去
      row.replaceChildren();
      const cell = (label, node) => {
        const wrap = element('label', 'edit-field');
        wrap.append(element('span', 'edit-field-label', label));
        wrap.append(node);
        return wrap;
      };
      row.append(cell('点它', sourceSelect), cell('目标', targetSelect), cell('变成', stateSelect), cell('延迟(秒)', delay));
      const remove = element('button', 'text-button danger', '删除');
      remove.type = 'button';
      remove.addEventListener('click', () => commit(removeRule(doc(), index)));
      row.append(remove);
      rules.box.append(row);
    });
    const addRuleButton = element('button', 'text-button', '+ 加一条连线');
    addRuleButton.type = 'button';
    addRuleButton.disabled = sources.length === 0 || stateful.length === 0;
    addRuleButton.addEventListener('click', () => {
      const source = sources[0];
      const target = stateful[0];
      const state = typeDescriptor(target.kind)?.states?.[1]?.id ?? typeDescriptor(target.kind)?.states?.[0]?.id;
      const eventType = eventsOfEntity(source)[0] ?? 'click';
      commit(addRule(doc(), { on: { type: eventType, source: source.id }, actions: [{ type: 'set', target: target.id, state }] }));
    });
    rules.box.append(addRuleButton);
    dom.inspector.append(rules.box);

    // 校验
    const problems = issues(current);
    const check = card(problems.ok ? '校验通过' : '还有 ' + problems.errors.length + ' 个问题');
    if (!problems.ok) {
      const list = element('ul', 'edit-error-list');
      for (const error of problems.errors.slice(0, 8)) {
        list.append(element('li', '', (error.path ? error.path + '：' : '') + error.message));
      }
      check.box.append(list);
    }
    dom.inspector.append(check.box);
  }

  function patchRuleAt(target, index, rule) {
    return { ...target, rules: (target.rules ?? []).map((item, position) => (position === index ? rule : item)) };
  }

  function refresh() {
    if (!editing) return;
    const model = described();
    renderSelection();
    renderPalette(model);
    renderInspector(model);
    draw(doc());
    updateButtons();
  }

  function updateButtons() {
    const undo = document.getElementById('editor-undo');
    const redo = document.getElementById('editor-redo');
    if (undo) undo.disabled = !history.canUndo();
    if (redo) redo.disabled = !history.canRedo();
  }

  // ---- 画布交互 -----------------------------------------------------------

  const toWorldX = (event) => {
    const rect = canvas.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width * WORLD.width;
  };

  function onPointerDown(event) {
    if (!editing) return;
    const target = event.target.closest('[data-entity]');
    if (!target) { selectedId = null; refresh(); return; }
    const entity = doc().entities.find((item) => item.id === target.dataset.entity);
    if (!entity) return;
    selectedId = entity.id;
    live = history.current();
    drag = { id: entity.id, grab: toWorldX(event) - entity.x };
    target.setPointerCapture?.(event.pointerId);
    refresh();
  }

  function onPointerMove(event) {
    if (!editing || !drag) return;
    live = moveEntity(live, drag.id, toWorldX(event) - drag.grab);
    draw(live);
    renderSelection();
  }

  function onPointerUp() {
    if (!editing || !drag) return;
    const next = live;
    drag = null;
    live = null;
    if (next && JSON.stringify(next) !== JSON.stringify(history.current())) commit(next);
    else refresh();
  }

  function onKeyDown(event) {
    if (!editing) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const next = event.shiftKey ? history.redo() : history.undo();
      selectedId = next.entities.some((item) => item.id === selectedId) ? selectedId : null;
      refresh();
      return;
    }
    if (!typing && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      event.preventDefault();
      commit(removeEntity(doc(), selectedId));
      selectedId = null;
      refresh();
    }
  }

  // ---- 进入 / 退出 --------------------------------------------------------

  function setVisible(visible) {
    editing = visible;
    for (const node of [dom.bar, dom.palette, dom.inspector, dom.layer]) if (node) node.hidden = !visible;
    if (dom.hotspotLayer) dom.hotspotLayer.hidden = visible;
    if (dom.controls) dom.controls.hidden = visible;
    document.body.classList.toggle('editing', visible);
  }

  function open() {
    setVisible(true);
    refresh();
    setStatus('编辑草稿 · 拖动方块定位，点调色板放置');
  }

  /** 只收起界面，草稿与历史都留着：试玩草稿时用这个。 */
  function hide() {
    setVisible(false);
    drag = null;
    live = null;
  }

  function close() {
    hide();
    selectedId = null;
    onExit?.();
  }

  const buttons = {
    play: document.getElementById('editor-play'),
    undo: document.getElementById('editor-undo'),
    redo: document.getElementById('editor-redo'),
    exportJson: document.getElementById('editor-export'),
    importJson: document.getElementById('editor-import'),
    save: document.getElementById('editor-save'),
    load: document.getElementById('editor-load'),
    fresh: document.getElementById('editor-fresh'),
    exit: document.getElementById('editor-exit'),
    file: document.getElementById('editor-file'),
  };

  buttons.play?.addEventListener('click', () => {
    const result = issues(doc());
    if (!result.ok) { setStatus('先修好 ' + result.errors.length + ' 个问题再试玩', 'bad'); return; }
    saveDraft();
    onPlay?.(doc());
  });
  buttons.undo?.addEventListener('click', () => { history.undo(); refresh(); });
  buttons.redo?.addEventListener('click', () => { history.redo(); refresh(); });
  buttons.exit?.addEventListener('click', () => { saveDraft(); close(); });
  buttons.exportJson?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(doc(), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = (doc().id || 'level') + '.level.json';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('已导出 ' + link.download, 'good');
  });
  buttons.importJson?.addEventListener('click', () => buttons.file?.click());
  buttons.file?.addEventListener('change', async () => {
    const file = buttons.file.files?.[0];
    if (!file) return;
    try {
      history.reset(JSON.parse(await file.text()));
      selectedId = null;
      refresh();
      setStatus('已导入 ' + file.name, 'good');
    } catch (error) {
      setStatus('导入失败：' + error.message, 'bad');
    }
    buttons.file.value = '';
  });
  buttons.save?.addEventListener('click', () => { saveDraft(); setStatus('草稿已存到浏览器', 'good'); });
  buttons.load?.addEventListener('click', () => {
    setStatus(loadDraft() ? '已恢复草稿' : '还没有存过草稿', loadDraft() ? 'good' : 'bad');
  });
  buttons.fresh?.addEventListener('click', () => {
    history.reset(blankLevel());
    selectedId = null;
    refresh();
    setStatus('已换成空白草稿');
  });

  // 选框是画布上方的独立层（.edit-layer），指针事件必须挂在共同的父元素上，
  // 否则点在选框上根本到不了 canvas。
  const surface = canvas.parentElement ?? canvas;
  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('pointerup', onPointerUp);
  surface.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(doc())); } catch { /* 隐私模式下写不进去 */ }
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      history.reset(JSON.parse(raw));
      selectedId = null;
      refresh();
      return true;
    } catch { return false; }
  }
  function restoreDraftIfAny() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) history.reset(JSON.parse(raw));
    } catch { /* 坏草稿就当没有 */ }
  }

  restoreDraftIfAny();

  return {
    open,
    hide,
    close,
    doc,
    setDoc(next) { history.reset(next); selectedId = null; refresh(); },
    isEditing: () => editing,
    issues: () => issues(doc()),
    describe: () => describeEditor(doc()),
    refresh,
    saveDraft,
  };
}
