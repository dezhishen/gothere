// Skill = 一个 app 用例 + 一份元数据 + 一个稳定输出契约。
// 只覆盖创作侧：读写关卡文档、校验、自检。不含游戏运行与玩家侧行为。
// 内容通过 context.service（levelService）注入，因此 skill 自己不碰文件与网络。

import { CODES, domainError } from './errors.js';
import { describeTypes, platformInfo } from './levelService.js';

const DOC_INPUT = Object.freeze({
  type: 'object',
  properties: {
    id: '内置关卡 id',
    doc: '关卡对象（与 id 二选一）',
    mode: 'editable | playable',
  },
});

function metadata(skill) {
  const { run, ...rest } = skill;
  return rest;
}

function requireService(context) {
  const service = context && context.service;
  if (!service) {
    throw domainError(CODES.USAGE, '这个 skill 需要内容源：先用 levelSource 载入关卡，再创建 levelService。');
  }
  return service;
}

export const SKILLS = Object.freeze([
  {
    id: 'skills.list',
    summary: '列出可被 Agent 调用的能力，附带平台版本与解释器支持矩阵',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: {}, required: [] },
    output: { type: 'object', properties: { skills: 'array', platform: 'object' } },
    run: () => ({ ok: true, code: CODES.OK, data: { skills: listSkills(), platform: platformInfo().data } }),
  },
  {
    id: 'platform.describe',
    summary: '解释器清单与平台整体支持的 schema / 类型 / 能力版本',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: {}, required: [] },
    output: { type: 'object', properties: { interpreters: 'array', supports: 'object', types: 'array' } },
    run: () => platformInfo(),
  },
  {
    id: 'schema.describe',
    summary: '类型、能力、字段、状态与事件的机器可读元数据',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: { kind: '可选，单个类型 id' }, required: [] },
    output: { type: 'object', properties: { types: 'array', fields: 'array' } },
    run: (input) => describeTypes(input.kind),
  },
  {
    id: 'level.list',
    summary: '内置关卡清单（id / 名称 / 规模），来自内容清单 levels/manifest.json',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: {}, required: [] },
    output: { type: 'object', properties: { levels: 'array' } },
    run: (input, context) => ({ ok: true, code: CODES.OK, data: { levels: requireService(context).listLevels() } }),
  },
  {
    id: 'level.get',
    summary: '取一份关卡文档（内容制品，不是编译产物）',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: { id: '内置关卡 id' }, required: ['id'] },
    output: { type: 'object', properties: { level: 'object' } },
    run: (input, context) => ({ ok: true, code: CODES.OK, data: { level: requireService(context).getLevel(input.id) } }),
  },
  {
    id: 'level.validate',
    summary: '四层校验：版本 → 结构 → 类型 → 引用（playable 另加几何可达）',
    write: false,
    idempotent: true,
    input: DOC_INPUT,
    output: { type: 'object', properties: { valid: 'boolean', errors: 'array' } },
    run: (input, context) => requireService(context).validateInput(input),
  },
  {
    id: 'level.simulate',
    summary: '创作自检：给定输入序列，返回终态、事件与回放记录',
    write: false,
    idempotent: true,
    input: {
      type: 'object',
      properties: {
        id: '内置关卡 id',
        doc: '关卡对象（与 id 二选一）',
        inputs: '操作序列 [{tick,source}]',
        until: '模拟到第几 tick（默认 36000）',
      },
    },
    output: { type: 'object', properties: { status: 'won | lost | running', events: 'array', recording: 'object' } },
    run: (input, context) => requireService(context).simulateInput(input),
  },
  {
    id: 'level.replay',
    summary: '回放自检：用同一内核重推记录，终态不一致即失败',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: { id: '内置关卡 id', doc: '关卡对象', recording: '回放记录' }, required: ['recording'] },
    output: { type: 'object', properties: { status: 'string', tick: 'number' } },
    run: (input, context) => requireService(context).replayInput(input),
  },
  {
    id: 'level.diff',
    summary: '两份关卡文档的结构化差异（实体 / 规则 / 元数据）',
    write: false,
    idempotent: true,
    input: { type: 'object', properties: { before: '{id} 或 {doc}', after: '{id} 或 {doc}' }, required: ['before', 'after'] },
    output: { type: 'object', properties: { diff: 'object' } },
    run: (input, context) => requireService(context).diffInput(input),
  },
]);

export function listSkills() {
  return SKILLS.map(metadata);
}

export function findSkill(id) {
  return SKILLS.find((skill) => skill.id === id) ?? null;
}

/**
 * 调用 skill。所有 skill 都是只读的：写操作（level.apply 等）在实现之前不出现在清单里。
 * stdout 纯净由调用方保证，这里一律不打印。
 */
export function invoke(id, input = {}, context = {}) {
  const skill = findSkill(id);
  if (!skill) {
    return {
      ok: false,
      code: CODES.USAGE,
      errors: [{ code: CODES.USAGE, path: 'skill', message: '未知 skill：' + String(id) + '。可用：' + SKILLS.map((item) => item.id).join('、') + '。' }],
    };
  }
  try {
    const output = skill.run(input ?? {}, context);
    if (output && typeof output === 'object' && typeof output.ok === 'boolean') return output;
    return { ok: true, code: CODES.OK, data: output };
  } catch (error) {
    const code = error && typeof error.code === 'string' ? error.code : CODES.INTERNAL;
    return {
      ok: false,
      code,
      errors: error && Array.isArray(error.errors) ? error.errors : [{ code, path: error.path ?? '', message: error.message }],
    };
  }
}
