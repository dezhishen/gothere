# 架构 · 一定要到达那里

| 项 | 内容 |
|---|---|
| 版本 | v1.0 |
| 日期 | 2026-10-28 |
| 依据 | [设计稿 v1.0](design.md)：所有「为什么」在那边，「放哪儿、怎么连、按什么顺序做」在这边 |
| 用途 | 指导开发：分层、模块、冻结接口、目录落点、里程碑与门禁 |
| 范围 | 不含产品决策与设计取舍；也不含具体算法实现 |

## 0. 怎么用这份文档

改动落点用三问判定：

1. **属于哪一层？**（§1）跨层改动一律先改接口，再加实现。
2. **要不要新增端口？**（§2.3）需要接触文件/网络/时钟/随机/渲染器的地方，只能加端口，不能直接 import 平台。
3. **是否只改数据？** 若只是新增类型、能力、字段、令牌，只改注册表与内容包，代码应零改动。

每个里程碑（§7）可独立合并，退出条件即验收口径。架构与设计冲突时以 [design.md](design.md) 为准；本文只负责结构与顺序。

## 1. 分层

<a id="layers"></a>

```text
L3 shell        浏览器入口 / Electron 容器 / CLI 入口 / 静态服务 / 构建脚本
   │            唯一允许全量依赖的层；只做组装、IO 与生命周期
L2 features     editor（编辑 UI） · render（渲染策略） · dsl（文本语法） · gen（生成器） · game（试玩会话）
   │            只依赖 L2 app 与 L0 contract；gen 额外可用 kernel 自检
L1 app          用例层：load / validate / applyOps / simulate / diff / export / share / seed / skills
   │            唯一写入路径；无 DOM、无 node:*、无网络
L1 kernel       确定性模拟：60 tick、固定阶段解释元素声明、预算、快照、回放
   │            只依赖 contract
L0 contract     IR 类型 · 注册表 · 版本与支持矩阵 · 四层校验 · 迁移表 · PRNG · 常量 · diff
                纯数据与纯函数，不认识任何上层
```

| 层 | 职责 | 允许依赖 | 硬性禁止 |
|---|---|---|---|
| L0 contract | 定义「什么合法」 | 无 | DOM、`node:*`、IO、UI 状态 |
| L1 kernel | 定义「怎么推进」 | contract | 渲染器、文件、编辑器、墙钟 |
| L1 app | 定义「怎么改、怎么查、怎么导出」 | contract、kernel | DOM、网络、编辑器、直接写文件 |
| L2 features | 定义「怎么呈现、怎么输入、怎么生成文本」 | app、contract（gen 另可用 kernel） | 绕过 app 直接改 IR（editor）、写内核状态（render） |
| L3 shell | 组装与平台适配 | 全部 | 业务规则、校验、迁移 |

依赖只向下。`contract` 不认识任何上层；`app` 不知道有 UI；`kernel` 不知道有文件。

## 2. 模块清单与冻结接口

<a id="modules"></a>

标注 **冻结** 的导出是跨模块契约：改名或改签名必须同步全部调用方与测试；其余为实现细节。

### 2.1 L0 contract（`src/core/contract/`）

<a id="m-contract"></a>

| 模块 | 职责 | 冻结导出 | 说明 |
|---|---|---|---|
| `registry.js` | 按类别聚合 schema、合并实体的声明槽 | `SLOTS`、`slotsOfEntity(e)`、`fieldsOfCategory(c)`、`describe(kind)` | 类别 schema 由工厂拥有，这里只做聚合（设计 [C6](design.md#c6)） |
| `versions.js` | 版本与支持矩阵 | `SUPPORTED`、`INTERPRETERS`、`resolveInterpreter(doc)` | 一个解释器覆盖某些类型的某些版本（[C12](design.md#c12)） |
| `validate.js` | 四层校验 | `validateDoc(doc, { mode })` → `{ ok, errors[] }` | `mode: 'editable' \| 'playable'`（[C3](design.md#c3)） |
| `migrate.js` | 迁移表 | `migrate(doc, { target })` → `{ doc, applied[] }` | 表驱动；无表则直通或明确拒绝 |
| `prng.js` | 可复现随机 | `createRng(seed)` → `{ next(), int(n), pick(list) }` | 禁 `Math.random` / `Date` |
| `constants.js` | 世界与上限 | `WORLD`、`LIMITS` | 消除散落的 `1200/640/440` 魔数 |
| `diff.js` | 结构化差异 | `diffDocs(a, b)` → `{ entities, rules, layout, meta }` | 供 dry-run、Agent、测试 |

### 2.2 L1 kernel（`src/core/kernel/`）

<a id="m-kernel"></a>

| 模块 | 职责 | 冻结导出 |
|---|---|---|
| `engine.js` | 固定步长推进、按阶段解释元素声明、预算、失败归因 | `createSimulation(doc)`、`STAGES`、`TICKS_PER_SECOND` |
| `replay.js` | 用输入序列重推 | `replay(doc, recording)` → `{ state, ok, code? }` |
| `actor.js` / `item.js` | 角色视图与物品卡：元素能读到的唯一「人身上有什么」 | `createActorView(state)`、`itemCard(e)`、`matchesNeed(card, need)` |

约束：`engine` 只读 contract 的注册表与常量；`snapshot()` 必须深拷贝；失败返回稳定 `reason`，对外错误码由 `app/errors.js` 映射。

### 2.3 L1 app（`src/app/`）

<a id="m-app"></a>

| 模块 | 职责 | 冻结导出 |
|---|---|---|
| `ports.js` | 端口接口与默认实现 | `createPorts(env)` → `{ readText, readBytes, listPacks, storage, clock, rand, renderers }` |
| `levelService.js` | 用例编排（唯一写入路径） | `load(text)`、`validate(doc, mode)`、`applyOps(doc, ops, opts)`、`simulate(doc, inputs, until)`、`exportJson(doc)` |
| `presets.js` | 预设展开与列举 | `expand(preset, overrides)`、`listPresets()` |
| `assets.js` | 内容包与资源解析 | `parseManifest(text)`、`verifySha256(bytes, hex)`、`resolveAsset(id)` |
| `share.js` | 分享码 | `encode({ level, packs })`、`decode(code)` |
| `seed.js` | 种子 | `encode(origin)`、`restore(origin)` |
| `skills.js` | Skill 清单与调用 | `listSkills()`、`invoke(id, input, { dryRun })` |
| `errors.js` | 错误码单一来源 | `CODES`、`toCode(reason)`、`exitCode(code)` |

`applyOps` 是唯一写入路径：接收领域操作数组，返回 `{ doc, diff, revision }`；编辑器、Agent、生成器落盘都必须经过它（设计 [C5](design.md#c5)）。

### 2.4 L2 features

<a id="m-features"></a>

| 模块 | 职责 | 冻结导出 | 只允许依赖 |
|---|---|---|---|
| `src/editor/ui.js` | 面板、仓库、连线交互 | `createEditorUI(deps)` | app、contract |
| `src/editor/model.js` | 草稿槽、撤销历史、投影缓存 | `createEditorStore(text)` | app、contract |
| `src/editor/routing.js` | 直角折线与转接点 | `route(points)`、`hitTestWire(...)` | contract（纯几何） |
| `src/editor/catalog.js` | 仓库条目视图模型 | `catalogItems(query, group)` | contract（由注册表派生） |
| `src/render/registry.js` | 渲染策略注册与回退 | `createRenderers()`、`resolveRenderer(strategy)` | contract |
| `src/render/placeholder.js` | 占位渲染器 | `create(ctx)` → `{ mount, update, dispose, hitTest }` | contract 类型 |
| `src/game/session.js` | 试玩会话：rAF 累加器、输入队列、HUD 数据 | `createSession({ doc, renderer })` | app、kernel（经 app）、render |
| `src/dsl/parse.js` · `serialize.js` | 文本 ↔ IR | `parse(text, { registry })`、`serialize(doc)` | contract |
| `src/gen/index.js` | 因果结构 → 时空布置 → IR | `generate({ seed, params, generatorVersion })` | contract、app.validate、kernel（自检） |

### 2.5 L3 shell

<a id="m-shell"></a>

| 入口 | 职责 | 说明 |
|---|---|---|
| `src/shell/browser.js` | 浏览器启动：注入端口、挂载 editor 与 game | 取代现在的 `src/main.js` 顶部胶水 |
| `src/shell/electron.js` | Electron bridge：存档路径、全屏、禁网 | 与 `desktop/main.cjs` 配合 |
| `src/app/cli.js` | CLI 产品逻辑：子命令 → `app.skills.invoke`，只用注入端口（不碰 process / fs），因此可打包 | 输出与退出码遵循 [C15](design.md#c15) |
| `bin/gothere.mjs` | 源码树 shell：把 process 与文件系统接给 `app/cli.js` | 交付物是独立制品 `dist/gothere-cli.mjs`（单文件、只依赖 node 内置模块，内置关卡内联） |
| `server.mjs` | 静态托管（GET/HEAD + CSP） | 不变 |
| `scripts/*.mjs` | 构建、分享、桌面打包、验收 | `build.mjs` 增加内联 JSON 数据块 |

### 2.6 扩展点：新增一类东西要动多少文件

| 想加的东西 | 要改的文件 | 不用改 |
|---|---|---|
| 一种新机关/物品 | `types/<category>/<kind>.type.json`（数据文件，不需要改 manifest）；`pnpm types` 重新生成 `generated-types.js`，`pnpm skill` 刷新 SKILL.md | 工厂、校验、内核、渲染（`art` 复用时）、CLI、测试——**一行代码都不用改** |
| 一种新机关/物品（运行时注册） | 一个 `createFactory({...})` 文件 + `registerFactory()` | 其它一切 |
| 一个新类别工厂 | 新工厂文件 + `factories/index.js` 的 `resetFactories()` 一行 | 校验、内核、渲染、CLI、SKILL 模板 |
| 一张新关卡 | `levels/<id>.level.json`；跑 `pnpm skill` 刷新生成物 | 代码与测试（数量断言已改成跟随内容清单） |
| 一种新声明槽（如 `heals`） | 能力文件 + `capabilities/index.js` 注册 + 工厂 `schema.slots` + 该槽在内核的**阶段实现** | 校验器、CLI、SKILL 模板、渲染 |
| 一种新数据制品（`level`/`bundle` 之外的 kind） | `interpreters/index.js` 的 `KINDS` 与 `REQUIRED` + 版本矩阵 | 内容工厂与内核 |

类型的数据流：`types/**/*.type.json` →（`scripts/build-types.mjs`）→
`src/core/interpreters/factories/generated-types.js` → 工厂 `createFactory({ types })`
→ 契约与内核。生成物入库，`pnpm check:types` 在 CI 里校验它与数据一致。

守卫测试：`tests/types.test.mjs`（数据 ⇔ 生成物 ⇔ 平台类型表，含坏数据拒绝）、
`tests/extension.test.mjs`（新增类型/工厂后仍需改别处时会失败）。两者都只断言关系，
不写死数量与清单。

## 3. 数据流

<a id="flows"></a>

### 3.1 加载与试玩

1. `ports.readText('levels/x.level.json')` 读取制品；
2. `app.load` → `contract.validate({ mode: 'editable' })`；
3. `contract.resolveInterpreter(doc)` 选中解释器；无覆盖 → `UNSUPPORTED_VERSION`；
4. `app.simulate(doc)` 生成初始状态 → `game.session` 绑定输入；
5. `render.registry.resolveRenderer(strategy)` 构建节点表；缺失/异常 → 占位 + 告警。

### 3.2 一次编辑提交

1. `editor.ui` 产生**领域操作**（`{ type: 'entity.add', … }`）；
2. `app.applyOps(doc, ops, { expectRevision })`：校验 → diff → 新文档 → revision+1；
3. `editor.model` 记录撤销快照；`editor.routing` 从 `rules` 重新投影连线；
4. 失败只返回 `{ ok: false, code, errors }`，不改变文档。

### 3.3 生成与还原

1. `gen.generate({ seed, params, generatorVersion })` 只产出 IR；
2. `app.validate(doc, 'playable')` + `app.simulate` 自检可解；
3. 落盘时写入 `meta.origin`；`app.seed.restore(origin)` 用同版本重跑。

### 3.4 Agent 调用

1. `gothere skills --json` → `app.skills.listSkills()`；
2. `gothere level apply … --dry-run --json` → `app.skills.invoke('level.apply', input, { dryRun: true })`；
3. 写操作走 `applyOps`；输出单对象 JSON，日志走 stderr。

## 4. 跨模块规则（可检查）

<a id="rules"></a>

| 规则 | 检查方式 | 失败后果 |
|---|---|---|
| 依赖只向下（§1） | `scripts/check-layers.mjs` 解析 import 图，白名单外即失败 | CI 阻断 |
| `editor` 不直接写 IR 字段 | 同上 + 约定：只允许 `applyOps` | 出现两份写入逻辑 |
| `render` 不写内核状态 | 只接受 `snapshot()` 与只读帧 | 模拟被打断 |
| `core/*` 不 import DOM / `node:*` | `check-layers.mjs` | 内核无法在 Node 测试与浏览器共用 |
| 布局不影响模拟 | 同一文档两套 `layout`，快照逐 tick 相等 | 回放不可复现 |
| 新增能力不改内核/面板/DSL | 注册 `testOnly` 能力，断言校验/面板/DSL 均识别 | 解耦失效 |
| Skill 与用例一一对应 | `tests/skills.test.mjs` 比对 `listSkills()` 与 `app` 导出 | Agent 依赖不一致逻辑 |
| 错误码单一来源 | 只允许 `app/errors.js` 定义字面量 | 码值漂移 |
| 版本单一来源 | 只允许 `contract/versions.js` 与 `registry` 声明版本 | 支持矩阵失真 |

## 5. 目标目录树

<a id="tree"></a>

```text
desktop/main.cjs                 Electron 主进程（窗口 / 菜单 / 外链与权限策略）
skills/gothere-levels/SKILL.md  Agent 技能说明书（由 schema 生成，入库）
bin/gothere.mjs                  CLI shell（源码树调试用）
dist/gothere-cli.mjs             交付的 CLI 独立制品（单文件，内置关卡内联）
src/app/cli.js                   CLI 产品逻辑（端口注入，可打包）
dist/gothere-agent-*.tar.gz      Agent 技能包（SKILL.md + 单二进制）
dist/gothere-desktop-*.tar.gz    Electron 客户端（绿色版）
src/
  core/
    contract/  registry.js versions.js validate.js migrate.js prng.js constants.js diff.js
    kernel/    engine.js replay.js hooks.js
  app/         ports.js levelService.js presets.js assets.js share.js seed.js skills.js errors.js
  editor/      ui.js model.js routing.js catalog.js
  render/      registry.js placeholder.js
  game/        session.js
  dsl/         parse.js serialize.js
  gen/         index.js causal.js layout.js
  shell/       browser.js electron.js
levels/*.level.json              10 张时序关卡（内容制品）
examples/*.level.json            3 张示例（内容制品）
packs/core/                      manifest.json + objects/*.json + assets/*.png
packs/theme-paper-green/         manifest.json + tokens.json
src/styles/app.css               Tailwind 入口（唯一手写样式）
src/style.css                    生成物（gitignore）
desktop/main.cjs                 Electron 容器
server.mjs                       静态托管
scripts/                         dev / css / build / share / package-windows / check-layers / *-check
tests/                           node:test（contract / kernel / app / dsl / skills / build）
docs/design.md docs/architecture.md docs/content-model.md
```

## 6. 现有文件 → 目标文件

<a id="mapping"></a>

| 现在 | 目标 | 动作 |
|---|---|---|
| `src/core/schema.js` | `core/contract/{registry,validate,constants}.js` | 拆分：声明进 registry，校验进 validate，魔数进 constants |
| `src/core/engine.js` | `core/kernel/engine.js` + `core/kernel/replay.js` | 拆分回放，钩子按能力顺序调度 |
| — | `core/contract/{versions,migrate,prng,diff}.js` | 新增 |
| `src/editor/model.js` | `app/levelService.js` + `app/presets.js` + `editor/model.js` | 用例与预设外移，编辑器只留视图状态 |
| `src/editor/catalog.js` | `editor/catalog.js` | 改为从 `registry.describe` 派生 |
| `src/editor/ui.js` | `editor/ui.js` | 改为面板由 `fields` 元数据生成；写操作走 `applyOps` |
| `src/scene.js` | `render/registry.js` + `render/placeholder.js` | 拆成策略与占位实现 |
| `src/main.js` | `shell/browser.js` + `game/session.js` | 启动胶水与试玩会话分离 |
| `src/levels.js`、`src/examples.js` | `levels/*.level.json`、`examples/*.level.json` | 内容转为 JSON 制品 |
| `scripts/build.mjs` | 同名 | 增加 `<script type="application/json">` 内联关卡与包 |
| — | `bin/gothere.mjs`、`src/app/skills.js` | 新增（Agent 创作侧） |
| — | `scripts/check-layers.mjs` | 新增（分层门禁） |

## 7. 里程碑

<a id="milestones"></a>

每个里程碑独立可合并、可回滚；括号内为设计依据。

### M0 工程底座

- 范围：pnpm 与锁文件、Tailwind 三层入口与 `pnpm css`、`prebuild`/`pretest` 钩子、`scripts/check-layers.mjs` 骨架、CI 改 pnpm。
- 退出：`pnpm install --frozen-lockfile && pnpm test && pnpm build` 通过；`check-layers` 在现存违规处**报红并列入豁免清单**。
- 依据：[C13](design.md#c13)。

### M1 契约层

- 范围：`registry`（类型/能力/字段/事件/令牌）、`constants`、`versions`（支持矩阵）、四层 `validate`、`migrate` 直通骨架、`diff`。
- 退出：13 张关卡经新契约校验全部通过；`validate('editable')` 能加载半成品；`describe('lift')` 输出与注册表一致。
- 依据：[C3](design.md#c3)、[C6](design.md#c6)、[B1](design.md#b1-design)。

### M2 内核适配

- 范围：按 `traits` 替代 `kind` 字符串分支；回放抽到 `replay.js`；hook 顺序固定成表。
- 退出：13 张关卡解法回归全绿；同输入回放逐 tick 一致（golden）；预算失败仍返回 `limit`。
- 依据：[C2](design.md#c2)、[C11](design.md#c11)。

### M3 用例层

- 范围：`ports`、`levelService`（load/validate/applyOps/simulate/export）、`errors` 码表；编辑器全部写操作改走 `applyOps`。
- 退出：`editor` 中不存在直接改 IR 的赋值；`applyOps` 的 dry-run diff 与落盘 diff 一致；错误码覆盖现有全部失败原因。
- 依据：[C5](design.md#c5)、[C7a](design.md#c7)。

### M4 内容制品与渲染回退

- 范围：内置关卡转 `levels/*.level.json` 与 `examples/*.level.json`，构建期内联 JSON 块；`render/registry` + `placeholder`；位图走 `assetId`。
- 退出：删掉某个类型的渲染实现后，关卡仍能校验、模拟、回放（画面占位）；单文件产物仍零外部请求。
- 依据：[C4](design.md#c4)、[C12](design.md#c12)、[B8](design.md#b8-design)。

### M5 内容包、主题与分享

- 范围：`assets`（manifest + sha256 + 资源端口）、物件包与主题包、`theme@1` 校验链、`share`（关卡 + 依赖包）、`seed`。
- 退出：主题包增删不重新构建；改错 sha256 报 `PACK_CORRUPT`；分享码在空环境可还原；同 seed 逐字节还原。
- 依据：[C14](design.md#c14)、[B8](design.md#b8-design)、[C11](design.md#c11)。

### M6 DSL 与生成器

- 范围：`dsl/parse`、`dsl/serialize`、round-trip 门禁；`gen`（因果 → 布局 → IR）与种子契约。
- 退出：`parse(serialize(doc))` 深度相等；生成产物 100% 通过 `playable` 校验与回放自检。
- 依据：[G1](design.md#g1)、[G2](design.md#g2)、[G3](design.md#g3)。

### M7 CLI 与 Skill

- 范围：`bin/gothere.mjs`、`app/skills.js`、`skills --json`、`level.*` 子命令、stdout 纯净、退出码。
- 退出：[C15](design.md#c15) 的 6 条验收全部通过；清单中无 `game.*` / `save.*` / `player.*`。
- 依据：[C15](design.md#c15)、[C7](design.md#c7)。

依赖关系：M0 独立；M1 → M2 → M3 → {M4, M5} 并行；M4 → M6；M3 → M7。M7 不阻塞 M4/M5/M6。

## 8. 编码与工程约束

<a id="constraints"></a>

| 约束 | 说明 |
|---|---|
| ESM 命名导入 | `import { x } from './y.js'`；禁默认导入、禁 `export *`（打包器只识别命名导入 + 本地相对路径） |
| 无 TypeScript | 类型用 JSDoc；需要检查时跑 `pnpm exec tsc --checkJs`（仅开发期，不进产物） |
| 无 `node:*` 于 core | 需要环境能力时加端口 |
| 测试命名 | `tests/<layer>-<topic>.test.mjs`；浏览器/桌面验收仍用 `scripts/*-check.mjs` |
| 覆盖率 | `src/core/*` 行/函数/分支 ≥80%；其余按验收点覆盖 |
| 脚本跨平台 | 禁 `&`、`rm -rf`、`cp -r`；并行用 `child_process.spawn` |
| 生成物 | `src/style.css` 不入库；产物与缓存不进站点 |

## 9. 风险与回退

<a id="risks"></a>

| 风险 | 影响 | 回退/缓解 |
|---|---|---|
| 拆分 `schema.js` 引入语义漂移 | 关卡解法回归失败 | M1 完成后先跑 golden 快照对比，再改内核 |
| `applyOps` 迁移不全 | 出现两套写入路径 | `check-layers` 扫描 `editor` 直接赋值；迁移期内网开一面但记入豁免清单，M3 末清空 |
| 内置关卡转 JSON 破坏离线包 | 单文件打不开 | 构建后断言 `<script type="application/json">` 存在且 JSON 可解析 |
| 固定阶段顺序变化 | 回放不一致 | `STAGES` 冻结 + golden 回放 |
| 主题覆盖污染默认样式 | 视觉回归漂移 | 只允许令牌值 + 视觉回归 0 差异 |
| CLI 输出混入日志 | Agent 解析失败 | `tests/cli.test.mjs` 断言 stdout 纯 JSON |
| 里程碑过大 | 无法独立回滚 | 每个 M 单独 PR，退出条件不满足不合入 |

## 10. 术语对齐

平台的「解释器」「支持矩阵」「内容包」「主题包」「Skill」定义见 [设计稿 §9](design.md#s-glossary)。本文只使用这些术语，不重新定义；出现歧义时以设计稿为准。
