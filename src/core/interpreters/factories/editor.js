// 编辑器的**声明侧**：每个工厂在这里回答「我这类东西应该怎么被编辑」。
// 这里只有纯数据与回调，没有 DOM——所以 core 依然可以在 Node 里跑，
// 同一份描述既喂给网页编辑器，也能喂给将来的 CLI/TUI 编辑器。
//
// 一个字段描述（control）形如：
//   { key, label, control: 'text'|'number'|'select'|'tags'|'json', value,
//     min?, max?, step?, options?, hint?, scope? }
// UI 只认这几种 control，新增类型不用改 UI。

export const CONTROL_KINDS = Object.freeze(['text', 'number', 'select', 'tags', 'json']);

/** 声明参数的中文名：键名是契约，标签是给人看的。 */
export const PARAM_LABELS = Object.freeze({
  on: '触发方式', from: '起始状态', need: '需要的物品', consume: '消耗物品',
  actions: '动作', unmet: '未满足时', inState: '生效状态', reason: '原因码',
  message: '提示文案', speed: '速度', between: '往返范围', block: '阻挡原因',
  unlessHeld: '除非手里拿着', offset: '抬起偏移', drop: '放下偏移',
  lowerState: '楼下状态', upperState: '楼上状态', lowerY: '楼下高度',
  upperY: '楼上高度', tolerance: '判定容差', tags: '标签',
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** 造一个字段描述；control 不认识就报错，免得 UI 静默画错控件。 */
export function control(key, label, spec = {}) {
  const kind = spec.control ?? 'text';
  if (!CONTROL_KINDS.includes(kind)) {
    throw new Error('字段 ' + key + ' 的 control 必须是 ' + CONTROL_KINDS.join(' / ') + '。');
  }
  const field = { key, label, control: kind };
  for (const name of ['value', 'min', 'max', 'step', 'hint', 'scope']) {
    if (spec[name] !== undefined) field[name] = spec[name];
  }
  if (kind === 'select') {
    if (!Array.isArray(spec.options) || spec.options.length === 0) {
      throw new Error('select 字段 ' + key + ' 必须给出 options。');
    }
    field.options = spec.options.map((option) => ({ value: option.value, label: option.label ?? String(option.value) }));
  }
  return Object.freeze(field);
}

/** 从声明参数的**默认值**反推控件：类型自己不用再写一遍面板。 */
export function controlFromValue(key, value, labels = PARAM_LABELS) {
  const label = labels[key] ?? key;
  if (typeof value === 'number') return control(key, label, { control: 'number', value });
  if (typeof value === 'boolean') {
    return control(key, label, {
      control: 'select', value: String(value),
      options: [{ value: 'true', label: '是' }, { value: 'false', label: '否' }],
    });
  }
  if (typeof value === 'string') return control(key, label, { control: 'text', value });
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return control(key, label, { control: 'tags', value: value.join(' ') });
  }
  return control(key, label, { control: 'json', value });
}

const stateOptions = (states) => states.map((state) => ({ value: state.id, label: state.id + ' · ' + state.label }));

/**
 * 实体面板的公共字段：所有类别都有的那几项，加上类型自己补的。
 * extra 里的字段会插在「初始状态」之后，方便类型把 tags 之类塞进来。
 */
export function entityFields(type, entity, extra = []) {
  return [
    control('id', 'id', { value: entity.id, hint: '小写字母开头，可含数字与短横线' }),
    control('label', '名称', { value: entity.label }),
    control('x', '水平位置', { control: 'number', value: entity.x, min: 0, max: 1200, step: 1 }),
    control('width', '宽度', { control: 'number', value: entity.width ?? type.defaultWidth, min: 8, max: 600, step: 1 }),
    control('state', '初始状态', { control: 'select', value: entity.state, options: stateOptions(type.states) }),
    ...extra,
  ];
}

/** 声明槽自己的中文名；没登记就退回槽名。 */
export const SLOT_LABELS = Object.freeze({
  reacts: '反应（被触发时做什么）', blocks: '阻挡（什么状态下挡路）',
  harms: '伤害（什么状态下伤人）', moves: '自走（来回移动）',
  ground: '地面（什么状态下可以站）', lifts: '升降（楼层与位置）',
  carryable: '可携带（拿起来/放下）', tags: '标签',
});

/** 一个声明槽的面板：槽名 + 它的参数（按默认值的类型出控件）。 */
export function declarationEditor(slot, params) {
  const fields = Object.entries(params ?? {})
    .filter(([key]) => key !== 'actions')
    .map(([key, value]) => {
      const field = controlFromValue(key, value, PARAM_LABELS);
      // 键写进文档要带槽名前缀（blocks.inState），标签只显示参数本身的中文名。
      return { ...field, key: slot + '.' + key };
    });
  return {
    slot,
    label: SLOT_LABELS[slot] ?? slot,
    fields,
  };
}

/** 注册时的形状检查：编辑器描述可以省略，但不能是半成品。 */
export function assertEditor(editor, category) {
  if (editor === undefined || editor === null) return null;
  if (!isObject(editor)) throw new Error(category + ' 工厂的 editor 必须是对象。');
  for (const name of ['fields', 'level', 'platform']) {
    if (editor[name] !== undefined && typeof editor[name] !== 'function') {
      throw new Error(category + ' 工厂的 editor.' + name + ' 必须是函数。');
    }
  }
  if (editor.labels !== undefined && !isObject(editor.labels)) {
    throw new Error(category + ' 工厂的 editor.labels 必须是对象。');
  }
  return editor;
}

/** 把工厂给的回调安全地转成字段数组：回调出错不该让整个编辑器白屏。 */
export function safeFields(build, fallback = []) {
  if (typeof build !== 'function') return fallback;
  try {
    const fields = build();
    return Array.isArray(fields) ? fields : fallback;
  } catch {
    return fallback;
  }
}
