# 设计稿 · 一定要到达那里

| 项 | 内容 |
|---|---|
| 版本 | v1.0（首版） |
| 日期 | 2026-10-28 |
| 定位 | 平台与内容的设计稿：制品形态、契约与版本、模块边界、阶段与验收 |
| 组织方式 | 每条目的给出「目的 → 机制 → 判定标准 → 现状」；不含变更记录 |
| 实现结构 | 分层、模块、冻结接口、目录落点与里程碑见 [architecture.md](architecture.md) |
| 独立性 | 自包含，不依赖其他说明文档。事实来自仓库内 `package.json`、`src/`、`server.mjs`、`scripts/`、`tests/`、`desktop/`、`.github/workflows/` |

## 0. 总览

<a id="s0"></a>

47 条目的判定分布：**21 达成 · 10 部分 · 13 目标 · 3 未验**。边界 8 条全部成立（E6 为事实陈述）。

| 组 | 条数 | 达成 | 部分 | 目标 | 未验 |
|---|---|---|---|---|---|
| A 产品 | 4 | 2 | 2 | — | — |
| B 设计 | 8 | 6 | 2 | — | — |
| C 架构 | 15 | 4 | 5 | 6 | — |
| D 阶段 | 9 | 1 | — | 5 | 3 |
| E 边界 | 8 | 8（成立） | — | — | — |
| G 深层目标 | 3 | — | 1 | 2 | — |

三处最大的落差都指向同一个根因：类型知识与编排逻辑散落在 UI 与内核的多处。**C4** 没有渲染器 manifest / 工厂 / 回退链，**C5** 没有用例层（编辑器直连内核），**C3** 只有版本号没有迁移与发现。补齐它们需要的是一张注册表加一层薄用例层，方案见 [C11](#c11) 与 [C12](#c12)。

### 0.1 平台与内容的分界

<a id="s0-boundary"></a>

一句话：**平台是编译的；内容是制品**——JSON 加位图等二进制，打包为内容包。解释器（schema + version 的处理模块）随平台编译，`schemaVersion` 与类型版本共同决定用哪个解释器。详见 [C12](#c12)。

这条分界约束所有模块：DSL、生成器、分享码只能产出数据，不能产出代码；解释器、支持矩阵、迁移表、校验规则、渲染策略只能存在于平台内。

内容本身再分两层：**内容包**与**关卡**（只引用物件与资源，不复制它们）。内容包又分两类：**物件包**（物件/预设定义 + 位图）与**主题包**（设计令牌 + 可选位图），两者共用 manifest、校验和与版本机制，见 [C12](#c12)、[B8](#b8-design) 与 [C14](#c14)。

### 0.2 阅读路径

探索平台与制品 → [C12](#c12) → [C11](#c11) → [B8](#b8-design)。评审内容模型 → [§2](#sB)。评审确定性与回放 → [C2](#c2)。评审工程与门禁 → [§6](#s-accept) → [§7](#s-conflicts)。

## 1. A 产品目的

<a id="sA"></a>

| # | 目的 | 现状 | 设计决策 | 判定 |
|---|---|---|---|---|
| <a id="a1"></a>A1 | 原创 2D 环境解谜，Steam 发行 | 可玩原型 + 10 关 + 工坊；未发行、未签名 | 三条保证：产物零外部请求、存档路径可配置、外壳可替换（[E4](#e4)）。签名与 Steamworks 属发行动作，不进设计 | 部分 |
| <a id="a2"></a>A2 | 玩家改环境与时机，帮主角到达 | 达成 | 见 [B5](#b5)[B6](#b6)[B7](#b7) 与内核确定性（[C2](#c2)） | 达成 |
| <a id="a3"></a>A3 | 提供创作工具，可创作与分享 | 创作达成；分享只有 JSON 导出与临时隧道 | 全部交付物见 [C12 产物清单](#c12-artifacts)。分享的最小形态是「一个自包含文件」；「分享码」携带关卡与其依赖包，因此同一约束下可行。在线工坊需要服务器，与 [C7b](#c7) 同期 | 部分 |
| <a id="a4"></a>A4 | 正式美术/动画/移动端后置 | 占位画面，无动画依赖 | 表现层通过 [C4](#c4) 的策略注册隔离，后置美术不改契约与内核 | 达成 |

## 2. B 设计目的（内容模型）

<a id="sB"></a>

| # | 目的 | 现状 | 判定 |
|---|---|---|---|
| <a id="b1"></a>B1 | 物体、能力、表现分离 | 外观 `appearance` 不决定玩法 ✅；能力尚未独立表达：通行设施是独立 `kind`，持有靠动作 `hold` + `actor.holding`，同一贴图不同交互必须新增 `kind` | 部分 |
| <a id="b2"></a>B2 | 多个命名行为，有限动作 + 延迟 + 嵌套 | `behaviors[{id,label,actions}]`，`after` 延迟、`invoke` 嵌套，深度与动作数有预算 | 达成 |
| <a id="b3"></a>B3 | 事件连线：一对多 / 多对一 / 自连 / 完成串联 | 规则 `on{type,source,behavior}` + `actions`；`done` 可作起点；连线由 `ruleWires` 从规则投影 | 达成 |
| <a id="b4"></a>B4 | 条件与延迟同规则，连线不另存逻辑 | `if[]`（AND）在事件触发时求值；延迟用 `after` 动作；布局只是元数据 | 达成 |
| <a id="b5"></a>B5 | 持有是关系：单槽、暂停巡逻与接触、放下独立于启停 | `actor.holding` 单槽；持有时跳过被持物巡逻与对持有者接触；`drop` 不改变状态 | 达成 |
| <a id="b6"></a>B6 | 持续行走与显式通行 | 恒速前进、不自动等待；梯子 `enabled` 才进；电梯轿厢到位才登车，`board` 规则驱动运输 | 达成 |
| <a id="b7"></a>B7 | 多层空间：脚底 y、楼层隔离、无跳跃/寻路 | `y` 为脚底高度（160–560，越小越高）；支撑、接触、终点均按楼层隔离 | 达成 |
| <a id="b8"></a>B8 | 资源后挂载：图片随关卡保存，后续以资源 ID/动画映射扩展 | 图片以 `appearance.image` 内联 data URI（单图 32,768 字符、地图合计 98,304、上传 24,000 字节）；无 assetId、无内容包、无动画映射 | 部分 |

<a id="b1-design"></a>

**B1 的设计决定：能力是数据，不是类型**

物体 = 外观 + 能力集合 + 行为集合 + 事件槽（机制见 [C11](#c11)）。

- 同一贴图配不同能力，即得到「可被持有」「落地伤人」「拿起后不再伤人」三种玩法，代码零分支。
- 事件槽、可点击性、可用动作都由能力声明，因此「能不能被拿走」「碰了会不会死」是数据开关，不是新类型。
- 既有 9 种 `kind` 转为**预设**（能力包 + 外观 + 默认行为），由迁移表映射，关卡语义不变。

<a id="b8-design"></a>

**B8 的设计决定：物件是「JSON 定义 + 位图」的内容包，关卡只引用**

一个可交互物体往往同时有定义（能力、属性、行为、默认外观）与多张位图（状态帧、图标、叠加层）。因此内容分两层：

| 层 | 制品 | 里有什么 |
|---|---|---|
| 内容包（pack） | `manifest.json` + `objects/*.json` + `assets/*.png` | 物件/预设定义、位图与状态帧、`sha256`、包版本、位图规格（尺寸/像素密度/anchor） |
| 关卡（level） | 单个 JSON | 实体列表（引用 `objectId@version` + `assetId`）、规则、布局、`meta.origin` |

```json
{ "entities": [ { "object": "axe@1", "visual": { "stateMap": { "default": "tex-axe" } } } ],
  "requires": { "packs": [ { "id": "core", "version": 1 } ] } }
```

- **不复制**：同一物件被 10 张关卡引用时，定义与位图只有一份，改包即全局生效。
- **可分开分发**：包可随平台内置（内置包），也可作为玩家自制包挂载。
- **资源解析是端口**：`readJSON(path)` / `readBytes(assetId)` / `listPacks()` 由 shell 注入——开发态走 HTTP、桌面走文件、单文件走内联 base64。
- **缺失与不匹配**：`ASSET_MISSING` / `PACK_MISSING` / `PACK_VERSION_MISMATCH` / `PACK_CORRUPT`；渲染回退占位，**校验与模拟不受影响**（与 [C4](#c4) 同一条回退路径）。
- **位图规格写在 manifest**：尺寸、像素密度、anchor、状态帧；渲染器只读 manifest，美术不决定玩法（[B1](#b1)）。
- **体积**：内联 base64 膨胀约 33%。沿用单图上限（32,768 字符），并设**包级上限**（2 MiB 量级，与草稿工作区同量级）。
- **兼容**：现有 `appearance.image` 导入时转为内置包的一个 asset + `assetId`；导出的单文件产物全部内联，不产生外部请求。

## 3. C 架构目的

<a id="sC"></a>

### C1 单一事实源

<a id="c1"></a>

编辑器、试玩、回放、导入导出读写同一份文档；连线是规则的投影，不另存玩法数据。

契约摘要（`schemaVersion: 1`）：

| 层 | 字段 |
|---|---|
| 顶层 | `schemaVersion` · `id` · `name` · `description` · `hint` · `world{width,height,groundY}` · `actor{x,speed,direction?,y?}` · `goal{x,y?}` · `platforms[]` · `entities[]` · `rules[]` · `assets[]?` · `layout?` · `meta?` |
| 实体 | `id` · `kind`（预设） · `state` · `x` · `y?` · `width?` · `label` · `capabilities?` · `contact?` · `behaviors[]` · `appearance?` · `motion?` · 通行类 `toY/speed/upperDirection/lowerDirection` |
| 规则 | `id` · `on{type,source,behavior?}` · `if[]` · `actions[]` |
| 动作 | `set` · `invoke` · `hold` · `drop` · `hurt` · `turn` · `after` |

判定：**部分**——编辑器与 JSON 已一致；生成器与 CLI/Agent 未接入；内置关卡仍是 JS 模块（[C12](#c12)）。

### C2 模拟与表现分离

<a id="c2"></a>

| 机制 | 设计 |
|---|---|
| 纯度 | `src/core/` 不 import DOM、不 import `node:*`、不引用渲染器；`snapshot()` 返深拷贝 |
| 时间 | 固定 60 tick；浏览器用 rAF 累加器决定每帧 step 次数（每帧 ≤24），切后台暂停；内核不读墙钟 |
| 顺序 | 时钟 → 到期动作（due/order）→ 点击 → 巡逻/电梯 → 行走与通行 → 接触/区域/踩板 → 支撑/门 → 终点/边界。顺序即语义 |
| 量化 | 位移量化到 `1e-6`，避免跨平台漂移 |
| 预算 | 36,000 tick / 每 tick 1,024 动作 / 计时器 256 / 调用深度 32 / 点击队列 32；超限即失败 |
| 回放 | 记录输入 `{inputs[{tick,source}], untilTick, status}` 并用同一内核重推；不是逐帧记录 |

判定：**达成**。缺口：失败只有中文文案（见 [C7](#c7)）。

### C3 带版本的 Schema：可校验、可迁移、可发现

<a id="c3"></a>

| 能力 | 设计 | 现状 |
|---|---|---|
| 可校验 | 四层分离：结构（骨架/范围）→ 类型（注册表声明）→ 引用（id 图）→ 语义（几何可达）。编辑器只跑前两层，因此可加载「暂时不可玩」的文档 | 四层混在 `validateLevel()`；编辑器用伪造几何绕过 |
| 带版本 | 文档级 `schemaVersion` + 每类型 `typeVersion` + 能力级 `capabilityVersion`。新增可选字段/事件不升 major；删字段、改语义、改默认值必须升对应类型版本 | 仅文档级版本号 |
| 可迁移 | `migrate(level, target)` 为纯函数，表驱动 `MIGRATIONS[{from,to,apply}]`；最低要求：当前版本直通、遇到更高版本明确拒绝而非尽力解析 | 无 |
| 可发现 | `describe(kind)` 输出字段、状态、事件、参数说明，供检查面板、`--json` 与文档生成共用（与 [C6](#c6) 同一元数据） | 无；`catalog.js` 只有展示用常量 |

判定：**部分**。硬性要求：在第一次破坏性变更之前，迁移表必须存在——这是「带版本」与「有版本号」的区别。

**版本是三维的**：`schemaVersion`（文档骨架）、`typeVersion`（类型，如 `object@2`）、`capabilityVersion`（能力语义，如 `damageOnContact@1`）。三者共同构成文档的版本要求，平台侧靠解释器的**支持矩阵**匹配（[C12](#c12)）。判定标准：文档显式固化版本；任一要求无解释器覆盖即失败，并回报具体缺口。

### C4 渲染器可注册、可插拔

<a id="c4"></a>

目的有四条：可注册、可替换、缺失回退占位、加载失败不影响模拟。

```js
// manifest：声明能力，不声明来源
{ id: 'placeholder', apiVersion: 1, supportedTypes: ['*'], strategy: 'placeholder@1' }

// 工厂 → 实例
create(ctx) → { mount(container, binding), update(frame), dispose(), hitTest?(point) }
```

- **注册发生在构建期**：渲染器表是静态 import，被打包器内联进单文件产物；运行时**不**加载外部 ESM。
- **回退链**：`render.strategy` → 该策略工厂 → 失败/缺失 → `placeholder`；告警记为 `RENDERER_FAILED` / `RENDERER_NOT_FOUND`，**只影响画面**。
- **隔离**：工厂或 `update()` 抛异常时捕获并降级为占位，不中断 tick。

判定：**目标**。现状是单渲染器加注册表里的 `render.strategy`，没有 manifest、工厂与回退链。可插拔限定为构建期注册，是同时满足 [A1](#a1) 与零外部请求的唯一形态（裁决见 [§7](#s-conflicts)）。

### C5 编辑器与 CLI/Agent 共享应用服务

<a id="c5"></a>

设计：薄用例层 `src/app/`（无 IO、无 DOM、可被 Node 直接 import）：

| 用例 | 签名（示意） | 消费者 |
|---|---|---|
| `load(json)` | → `{doc, errors[]}` | 编辑器、导入、CLI |
| `describe(kind?)` | → 字段/状态/事件元数据 | 检查面板、`--json`、文档 |
| `validate(doc, mode)` | `mode: 'editable' \| 'playable'` | 编辑器保存前、试玩前、Agent |
| `applyOps(doc, ops)` | → `{doc, diff, revision}` | 编辑器操作、Agent patch |
| `simulate(doc, inputs, until)` | → `{frames?, terminal, code}` | 试玩、回放、生成器筛选 |
| `diff(before, after)` | 结构化 diff（实体/规则/布局） | dry-run、Agent |
| `exportJson(doc)` | 规范化输出（稳定键序） | 导出、备份、分享 |

原则：**同一操作只有一份实现**。编辑器点「新增行为」与 Agent 调 `behavior.add` 必须走同一个 `applyOps`。判定标准：新增一个编辑操作时若需要写两份代码，即为设计失败。

判定：**目标**。现状编辑器直接调 `core/`，编排逻辑散在 `editor/ui.js`（467 行）与 `main.js`。

### C6 Schema 驱动编辑器与 CLI

<a id="c6"></a>

元数据单一来源是注册表：

```js
lift: {
  states: ['lower','upper'],
  events: ['board','arrive'],
  fields: [
    { key:'toY', type:'number', min:160, max:540, step:10, label:'上层脚底高度' },
    { key:'speed', type:'number', min:15, max:180, step:5, label:'速度' },
    { key:'upperDirection', type:'enum', options:[-1,1], label:'上层朝向' },
  ],
}
```

- 检查面板：`type` → 控件（数字/枚举/开关/实体引用/行为引用），不写死表单。
- 仓库列表：由注册表派生（名称、分组、图标、描述、关键词、顺序）。
- CLI 参数：由同一条目派生；`--json` 输出 `describe` 结果。
- 判定标准：新增类型不改面板、不改命令定义；新增字段只加一行元数据。

判定：**部分**——`catalog.js` 已是常量表（17 行），但只有展示信息；面板仍手写。

### C7 Agent 友好

<a id="c7"></a>

拆成两层，避免把契约稳定与传输协议绑在一起：

| 层 | 内容 | 阶段 |
|---|---|---|
| **C7a 契约级** | 稳定错误码（`SCHEMA_INVALID` / `VALIDATION_FAILED` / `SIM_BUDGET_EXCEEDED` / `UNSUPPORTED_VERSION` / `PACK_CORRUPT` / `PACK_VERSION_MISMATCH` / `THEME_TOKEN_MISSING` / `THEME_TOKEN_UNKNOWN` / `REVISION_CONFLICT`）、`--json` 结果对象 `{ok, code, errors[], diff?, revision}`、`dry-run` 返回 diff 不落盘、结构化 diff、退出码约定（0 成功 / 2 用法错误 / 3 校验失败 / 4 模拟失败 / 5 内部错误） | V1（与 [D3](#d3) 同批） |
| **C7b 传输级** | `--stdio` JSON-RPC、`--port` 本地端口、`revision` 乐观锁（多写者时才需要） | V2 之后 |

判定：**目标**。现状内核以 `lose(reason, 中文文案)` 结束，`reason` 是稳定枚举（`limit`/`hurt`/`fall`/`gate`/`boundary`/`timeout`），但没有对外 `code`；没有 JSON 输出、没有 diff、没有 revision。
C7a 是给人类与脚本用的契约；Agent 需要更上一层的**可发现能力包**，见 [C15](#c15)——该能力包只覆盖创作侧，不含游戏运行与玩家侧行为。
### C8 不运行任意脚本

<a id="c8"></a>

关卡只能声明事件、条件、动作、行为。动作是封闭枚举（7 种），规则与行为由内核解释执行，没有 `eval`、`new Function`、模板字符串执行。

判定：**达成**。约束：新增动作类型必须走内核白名单，注册表不提供自定义逻辑入口。

### C9 草稿与模拟隔离

<a id="c9"></a>

草稿在本地存储（≤32 槽、总计 2 MiB、每槽历史 ≤100 步），模拟读取不可变快照；重置与失败不改写文档。进入试玩前用 `mode: 'playable'` 全量校验。

判定：**达成**。

### C10 后台执行

<a id="c10"></a>

所有自动验证隐藏运行：浏览器无头、Electron 不开窗（测试开关）、服务只打印地址、CLI/测试不主动弹编辑器或游戏窗口。

判定：**达成**。

### C11 模块划分与粘连（解耦）

<a id="c11"></a>

**目的**：让「高抽象物体 / 连线联动 / DSL / 程序生成 / 种子还原」五件事各自独立演进；任一模块内部改动不扩散到其他模块。

<a id="g1"></a><a id="g2"></a><a id="g3"></a>

| 深层目标 | 承载模块 | 判定标准 | 判定 |
|---|---|---|---|
| **G1** 用 DSL 描述关卡创作 | `dsl/`（parse / serialize） | 文本 ↔ IR round-trip 深度相等；关键字由能力注册表派生 | 部分（JSON 已是数据 DSL，缺面向创作的文本语法与双向工具） |
| **G2** 在 G1 基础上程序生成 | `gen/`（因果结构 → 时空布置 → IR） | 生成器只产出 IR，靠 `app.validate` + 内核回放自检 | 目标 |
| **G3** 种子还原并分享 | `app/seed` + `app/share` | 同 seed + 同 `generatorVersion` 逐字节相等 IR；分享码自包含 | 目标 |

#### 模块清单与依赖方向

| 模块 | 职责 | 允许依赖 | 禁止 |
|---|---|---|---|
| `core/contract` | IR 类型、能力/类型注册表、四层校验、迁移表、PRNG、常量、diff | 无（纯数据与纯函数） | DOM、`node:*`、UI 状态 |
| `core/kernel` | 固定 60 tick 推进、能力 hook 调度、预算、快照、回放 | contract | 渲染、IO、编辑器 |
| `app` | 用例：load / describe / validate / applyOps / simulate / diff / export；预设展开、种子还原、分享码 | contract、kernel | DOM、渲染器、编辑器 |
| `app/assets` | 内容包：manifest 解析、`sha256` 校验、`readJSON` / `readBytes` / `listPacks` 端口（HTTP / 文件 / 内联三实现） | contract | DOM、直连网络 |
| `dsl` | 文本语法 ↔ IR | contract | kernel、app、UI |
| `gen` | 因果图 → 空间/时间布置 → IR | contract、app（校验）、kernel（自检） | 编辑器、渲染器 |
| `editor` | 画布编辑、面板、仓库、连线、草稿、撤销 | contract、app | 内核内部状态、渲染器实现 |
| `render` | 渲染策略实现（占位/美术） | contract 类型 | 内核状态写入、编辑器 |
| `shell` | 组装与平台：浏览器入口、Electron、未来 CLI | 全部（**唯一**允许全量依赖的地方） | 业务规则 |

```text
                 shell（唯一组装点）
        ┌──────────┼───────────┬─────────┐
     editor      gen         dsl      render
        │          │           │          │
        └────► app ◄┘           │          │
               │  ▲             │          │
               ▼  └─────────────┘          │
          core/kernel                       │
               │                           │
               ▼                           ▼
          core/contract ◄──────────────────┘
```

依赖只向下：`shell → {editor, gen, dsl, render} → app → kernel → contract`。`contract` 不认识任何上层。

#### 六个粘连机制（模块之间不互相 import，只通过这些契约协作）

1. **IR 是唯一交换格式**：DSL、生成器、编辑器、分享解码器的产物都是 IR，谁都不直接调用对方。
2. **注册表是唯一扩展点**：能力、字段、事件、默认值、DSL 关键字、生成器可用集合全部读同一张表。
3. **用例层是唯一写入路径**：任何来源的修改都走 `app.applyOps(doc, ops)`，由它做校验、diff、撤销记录、revision 递增。
4. **端口注入**：`clock` / `storage` / `assetResolver` / `rand` / `renderers` 由 shell 注入；`app` 与 `kernel` 只持有接口，不 import 平台。
5. **投影视图**：规则 → 连线（只读）；布局挂在 wire id 上，回写只改 `layout`，永不改 `rules`。连线的稳定标识 = `rule.id` + 动作路径，不使用数组下标。
6. **门禁**：import 图检查、DSL round-trip、种子黄金回归、能力矩阵测试。

#### 能力模型（高抽象的落地）

物体 = 外观 + 能力集合 + 行为集合 + 事件槽。能力是**数据**，不是代码分支。

```js
// 能力声明（内置能力由内核提供 hook 实现；参数与事件由注册表声明）
holdable:        { params: { slot: 'hand' }, events: [], actions: ['hold','drop'], hook: 'onHold' }
damageOnContact: { params: { effect: 'lethal', message: '', whenHeld: false, whenInactive: false },
                   events: ['contact'], hook: 'onContact' }
patrol:          { params: { minX, maxX, speed }, events: [], hook: 'onTick' }
clickable:       { params: {}, events: ['click'], hook: 'onClick' }
region:          { params: {}, events: ['enter'], hook: 'onEnter' }
passable:        { params: { type: 'gate'|'bridge'|'ladder'|'lift', … }, events: ['board','arrive'], hook: 'onRoute' }
```

斧子的三种配置（同一贴图，代码零分支）：

```json
// 1) 只是一把可拿的斧子
{ "visual": { "assetId": "tex-axe" }, "capabilities": { "holdable": {} } }
// 2) 只是掉在地上的危险物
{ "visual": { "assetId": "tex-axe" }, "capabilities": { "damageOnContact": { "effect": "lethal" } } }
// 3) 拿起后不再伤人，放下后恢复危险
{ "visual": { "assetId": "tex-axe" },
  "capabilities": { "holdable": {}, "damageOnContact": { "whenHeld": false } } }
```

- 事件槽由能力声明：`damageOnContact` 出 `contact`，`clickable` 出 `click`，`passable` 出 `board`/`arrive`，`done` 恒有。
- 面板字段由能力 `params` 生成（[C6](#c6)）——「能不能被持有」就是勾选 `holdable`，不写代码。
- 内核按**实体声明顺序 → 能力声明顺序**调度 hook，顺序固定，[C2](#c2) 的确定性不变。
- **预设** = 能力包 + 外观 + 默认行为（例如 `preset: 'axe'`）；既有 9 种 `kind` 作为预设名，由迁移表映射（[C3](#c3)）。

#### 种子还原

```json
{ "meta": { "origin": { "type": "seed", "seed": 184277,
  "generatorId": "causal-v1", "generatorVersion": 3, "params": { "rooms": 4, "difficulty": 2 } } } }
```

- `core/contract/prng`：纯函数 PRNG（如 xorshift128+），禁用 `Math.random` 与 `Date`。
- 还原 = 用同一 `generatorVersion` 重跑生成器。**IR 才是权威**，seed 是来源凭据与「再生成」入口。
- 生成器版本变化会让同一 seed 产出不同 IR，因此 `generatorVersion` 进入契约，每个版本保留一份黄金 IR 做回归。
- 分享两条路：**完整性优先**用分享码——压缩「关卡 IR + 它所依赖的内容包」+ 校验和 + `schemaVersion`，图随之内联，对方无需额外资源即可打开；缺包时报 `PACK_MISSING`。**体积优先**用 seed 码（seed + `generatorId` + `generatorVersion` + `params`），要求玩家端有同版本生成器。

#### DSL 与 IR 的关系

- IR（JSON）是唯一事实源；文本 DSL 是创作与生成的便捷语法，**编译到 IR**，不形成第二真相。
- 关键字由注册表派生：能力名、字段名、枚举值即 DSL 词汇表；新增能力自动获得语法，无需改 parser。
- 双向：`parse(text) → {doc, errors}`、`serialize(doc) → text`；门禁要求 `parse(serialize(doc))` 与 `doc` 深度相等（布局不参与 round-trip）。

#### 解耦的可检查规则

| 规则 | 检查方式 |
|---|---|
| `core/` 不 import 上层 | 解析 import 图，白名单外即失败 |
| `editor/` 不直接写 IR 字段 | 只调 `app.applyOps`；直接赋值即失败 |
| `render/` 不写内核状态 | 只接受快照与只读帧 |
| `dsl/`、`gen/` 不 import 编辑器 | import 图检查 |
| 新增能力不改内核/面板/DSL | 能力矩阵测试：注册一个 `testOnly` 能力，断言校验、面板、DSL 均能识别 |
| 布局不影响模拟 | 同一文档两种 `layout`，模拟快照逐 tick 相等 |

判定：**部分**——`core/` 已保持纯净，编辑器未直接改内核内部状态；缺用例层与 import 图门禁，能力仍以 `kind` 硬编码。

### C12 平台与内容分层：解释器编译在平台内，内容以 JSON 实时解释

<a id="c12"></a>

**两条硬边界**

| 制品 | 形态 | 包含什么 |
|---|---|---|
| **平台** | **编译产物**（单文件 HTML / Electron 包 / 未来 CLI） | 解释器与支持矩阵、内核、渲染策略、交互绑定、编辑器、迁移表 |
| **内容** | **内容包**（JSON + 位图等二进制）+ **关卡 JSON**，运行期解释 | 物件/预设定义、能力与参数、行为、规则、贴图与状态帧、manifest 与校验和 |

- 解释器（= schema + version 的处理模块）**编译在平台里**；内容既不能携带代码，也不能提供解释器。
- 内容不参与编译：没有「每关构建」这一步，新增关卡 = 新增一个 JSON 文件。
- 「可插拔」只存在于平台内部（[C4](#c4) 的构建期策略注册），绝不由内容决定。

**版本锁定：schema + 类型版本 → 选一个解释器**

版本不是一维的。文档声明两类版本：`schemaVersion`（文档骨架）与用到的**类型/能力版本**（如 `object@2`、`damageOnContact@1`）。解释器不与版本一对一，而是声明一张**支持矩阵**——一个解释器可以支持某种类型的某些版本。

```js
// 解释器 manifest（编译在平台内，可多个共存）
{ id: 'interp-a', apiVersion: 3,
  supports: { schema: [1], types: { object: [1,2], lift: [1], damageOnContact: [1,2] } } }
{ id: 'interp-b', apiVersion: 1,
  supports: { schema: [2], types: { object: [2], ropeBridge: [1] } } }

// 选择：找一个覆盖文档全部版本要求的解释器
resolve(doc) → interpreter | null
// null → UNSUPPORTED_VERSION，并回报缺口：{ schema: 2, type: 'lift', required: 2, supported: [1] }
```

| 规则 | 说明 |
|---|---|
| 一个解释器多版本 | 内部按「类型版本」分派语义：同一类型的 v1/v2 可以行为不同，但都在同一解释器里实现 |
| 声明式要求 | 文档显式固化版本（导出时写入），不靠「默认最新」，否则无法复现 |
| 确定性选择 | 多个候选时按 `apiVersion` 降序、`id` 升序取第一个；选中结果写入日志/trace |
| 不猜 | 任一要求无解释器覆盖 → 明确失败，绝不「尽力解释」 |
| 语义变更 = 升类型版本 | 改能力默认值或判定顺序，必须升该类型版本；旧版本行为保留在解释器里 |
| 运行时从不迁移 | 迁移是显式动作（打开旧文档、导出前），迁移表本身也在平台内 |
| 平台多解释器 | 平台可同时编译多个解释器；新增 `schemaVersion` = 发布新平台，旧平台拒绝新内容 |

**实时解释渲染**

```text
level.json ──► JSON.parse（仅加载期一次）
     │
     ├─► resolve(schemaVersion, typeVersions) → 解释器（编译在平台内）
     ├─► 四层校验（editable / playable）
     ├─► 场景构建：entity.id → 渲染节点；capability → 交互绑定
     └─► 每帧：解释内核快照 → 按 id 差量更新节点 → 玩家输入只入队
```

| 规则 | 设计 |
|---|---|
| 解析一次，解释每帧 | `JSON.parse` 只在加载期发生；每帧只处理快照，不重解析文本 |
| 差量更新 | 渲染器维护 `entityId → node`，随快照增删改，不整树重建 |
| 交互由数据声明 | 可点击性、事件槽、可用动作来自能力声明；玩家点击只产生输入 `{tick, source}`，不触发关卡专属代码 |
| 未知可选字段 | 忽略 + 告警（前向兼容） |
| 未知能力/动作/事件 | 校验失败（解释器不认识，不能猜） |
| 资源自包含 | 位图与定义在内容包内，导出时全部内联（[B8](#b8-design)） |
| 无代码入口 | 内容不含表达式、模板、函数字符串（[C8](#c8)） |

**内容的两层制品与资源解析**

| 层 | 单份制品 | 职责 |
|---|---|---|
| 内容包 | `manifest.json` + `objects/*.json` + `assets/*.png` | 描述「东西是什么」：能力、参数、行为、位图与状态帧、`sha256`、包版本 |
| 关卡 | `*.level.json` | 描述「东西在哪、怎么连」：实体位置、`objectId@version` + `assetId` 引用、规则、布局、`meta.origin` |

- 关卡**只引用不复制**：同一物件被多关引用时定义与位图只有一份。
- 平台提供三个端口：`readJSON(path)`、`readBytes(assetId)`、`listPacks()`；由 shell 注入（HTTP / 文件 / 内联 base64）。
- 校验和与版本：包 `sha256` 不符 → `PACK_CORRUPT`；包版本不满足 → `PACK_VERSION_MISMATCH`；资源缺失 → `ASSET_MISSING`。
- 三种失败均**只影响画面**，校验与模拟照常完成（与 [C4](#c4) 的回退链一致），并在检查面板与日志里告警。
- 位图规格（尺寸、像素密度、anchor、状态帧）属于 manifest，渲染器只读 manifest；美术不得决定玩法（[B1](#b1)）。

**交付产物清单**

<a id="c12-artifacts"></a>

平台与内容最终产出的全部制品，以及它们的验收口径：

| # | 产物 | 形态 | 面向 | 生成方式 | 验收标准 | 状态 |
|---|---|---|---|---|---|---|
| 1 | 完整平台 | 单个 `.html`，脚本/样式/位图全部内联 | 玩家与创作者 | `pnpm build` → `dist/gothere-play.html` | 断网双击可玩、可进工坊、零外部请求 | 达成（与站点入口同字节） |
| 2 | 站点入口 | 静态文件集（`index.html` + 下载文件） | 访问者 | Pages 工作流 | 推送 `main` 后自动发布 | 达成 |
| 3 | 桌面容器包 | `zip`（Electron + 单文件产物） | 开发验证 | `pnpm build:windows` | 无 Node 环境可运行；测试不开窗 | 达成（未签名，见 [E6](#e6)） |
| 4 | 关卡 | `*.level.json` | 创作者 / Agent / 生成器 | 编辑器导出、DSL 编译、生成器 | 用已发布平台加载即可玩通，不需构建 | 目标 |
| 5 | 物件包 | `packs/<id>/manifest.json + objects + assets` | 创作者 | 编辑器导出 / 手写 | manifest 与 `sha256` 校验通过；缺失只降级画面 | 目标 |
| 6 | 主题包 | `packs/theme-<id>/manifest.json + tokens.json` | 创作者 / 玩家 | 同上 | `theme@1` 校验通过；仅换令牌后玩法不变 | 目标 |
| 7 | 分享码 | 字符串（关卡 + 依赖包 + 校验和） | 玩家 | `app.share.encode` | 解码后与源 IR 深度相等；缺包报 `PACK_MISSING` | 目标 |
| 8 | seed 码 | 短字符串（seed + 生成器版本 + 参数） | 玩家 / 生成器 | `app.seed.encode` | 同版本下逐字节还原同一 IR | 目标 |
| 9 | 回放记录 | JSON `{inputs, untilTick, status}` | 玩家 / 回归 | 试玩导出 | 用同一内核重推后终态一致 | 达成 |
| 10 | 草稿 | 本地存储（≤32 槽、2 MiB、历史 ≤100 步） | 创作者 | 编辑器自动保存 | 重载一致；失败与重置不改写 | 达成 |
| 11 | trace（可选） | JSONL，逐 tick 事件 | 生成器 / 调试 | `simulate` 可选通道 | 可逐 tick 比对；默认关闭 | 目标 |
| 12 | 进度存档 | 本地文件（外壳提供路径） | 玩家 | 外壳 bridge | 断点续玩；版本不符不静默；[D8](#d8) 前定契约 | 目标 |
| 13 | Skill 清单 | `skills/manifest.json` 或 `gothere skills --json` 输出 | AI Agent（仅创作侧）/ 工具链 | 由注册表与用例自动生成 | 与已实现用例一一对应；含平台版本与支持矩阵；不含玩家侧 skill | 目标 |

三条产物级约束：

1. **同字节原则**：产物 1 与 2 目前完全相同（构建只写一份 HTML，两个文件名）。若未来试玩版要去掉工坊，必须显式设计两个入口，而不是让它们自行分叉。
2. **零外部请求**：产物 1、2、3 均不得在运行时请求任何外部资源；内容包与主题包内联进单文件。
3. **不发布中间物**：`src/style.css` 与任何构建缓存不入仓、不进站点；站点只含入口与下载文件。

**判定标准（可执行）**

1. 复制一份 JSON 到任意位置，用**已发布的平台**加载即可玩通，全程不需构建；
2. 平台移除覆盖某类型版本的解释器后，该内容明确报 `UNSUPPORTED_VERSION` 并指出缺口，不崩溃、不白屏；
3. 同一 JSON 在开发服务器、离线单文件、Electron 三处模拟结果逐 tick 相同；
4. 平台升级但版本未变时，旧内容的回放结果不变（golden replay 门禁）；
5. 内容中出现任何可执行片段 → 校验失败；
6. 删掉内容包里的位图文件，关卡仍能校验、模拟、导出，画面降级为占位并告警；
7. 把内容包的 `sha256` 改错一位，加载明确报 `PACK_CORRUPT`，不静默使用。

**现状与目标形态**

内置 10 关 + 3 示例写在 `src/levels.js` / `src/examples.js`，是 **JS 模块**，被打包器编进平台代码；位图以 `appearance.image` 直接内联在关卡里，没有内容包、没有 manifest、没有校验和。目标形态：

```text
levels/first-bridge.level.json …（10）
examples/example-carry.level.json …（3）
packs/core/manifest.json + objects/*.json + assets/*.png
src/app/levelSource.js   端口 readText(id)：dev 走 HTTP，portable/Electron 读内联 JSON 块
dist/gothere-play.html   <script id="levels-data" type="application/json">[…]</script>
```

判定：**部分**——模拟与渲染已由数据驱动，但内置关卡是代码、平台没有解释器支持矩阵（只有单一实现）、也没有「未知能力即报错」的守卫。

### C13 技术底座：Node.js + pnpm + Tailwind CSS

<a id="c13"></a>

**目的**：用确定的工具链支撑交付与质量；工具选型不反向约束契约与内核。

| 层 | 选型 | 约束 | 理由 |
|---|---|---|---|
| 运行时 | Node.js 22 LTS | `engines.node >= 22.12.0`，CI 固定 `22` | 原生 ESM、`node:test`、稳定 `fetch`；服务、构建、桌面启动、验收脚本全在 Node 内 |
| 包管理 | **pnpm** | `packageManager` 锁版本；只提交 `pnpm-lock.yaml`；CI `pnpm install --frozen-lockfile` | 确定性安装、可复现；npm / npx 一律不用 |
| 样式 | **Tailwind CSS v4（声明式）** | `tailwindcss` + `@tailwindcss/cli`（devDeps）；只引 `theme` 与 `utilities`，不引 preflight | 令牌即 CSS 变量，主题可运行时替换（[C14](#c14)）；CLI 产出单文件 CSS，便于内联 |
| 语言 | 原生 JavaScript（ESM） | 无 TypeScript、无通用打包器 | 单文件打包器用正则剥离 import/export，只接受命名导入 + 本地相对路径 |
| 渲染 | Canvas 2D | 单渲染器 + `render.strategy` | 占位美术阶段足够 |
| 桌面 | Electron | devDep，容器角色 | 开发验证与 Windows 测试包（[E4](#e4)） |

**包管理约定**

- `packageManager` 字段锁定 pnpm 版本，本地与 CI 同版本。
- 只保留 `pnpm-lock.yaml`；CI 用 `pnpm/action-setup` + `--frozen-lockfile`；文档与脚本命令统一写 `pnpm`，脚本内禁用 `npx`（改用 `pnpm exec`）。
- pnpm 默认拦截依赖的安装脚本：Electron 二进制需在 `pnpm-workspace.yaml` 放行，或显式 `pnpm exec install-electron`；验收命令 `pnpm exec electron --version`。
- 脚本必须跨平台：不得使用 `&`、`rm -rf`、`cp -r` 等仅 POSIX 的写法。

**声明式样式的落地**

```text
src/styles/app.css（唯一手写样式，三层）
  ① @layer theme       @theme 定义设计令牌的默认值
  ② @layer base        基础 reset
  ③ @layer components  既有类名，逐步收敛到 utilities
        │  pnpm css（@tailwindcss/cli --minify）
        ▼
src/style.css（生成物，gitignore，禁止手改）
        │
        ├─ 开发：index.html <link href="/src/style.css">
        └─ 构建：scripts/build.mjs 内联 <style>（零外部请求）
```

- 顺序由 pnpm 钩子保证（`prebuild`、`pretest` 都先跑 `css`）。
- `build.mjs` 只读生成后的 `src/style.css`；打包后断言无 `<link rel="stylesheet">`、无 `<script src>`、内联 `<style>` 非空。
- 断点保留显式 `@media`（现有 1600 / 900 / 600 / 380 与 Tailwind 默认断点不对齐，不为用 `md:` 改视觉）。
- 动态类名只允许字面量常量表，禁止 `bg-${x}` 拼接；极少数运行时拼接用 `@source inline(…)` 登记。

判定：**目标**——当前是 npm + 单文件手写 CSS，无 Tailwind、无令牌层。

### C14 主题包：可增减、带 schema

<a id="c14"></a>

**目的**：视觉可换而不改代码、不重新构建；主题包的增删只是数据操作。

**主题包是内容包的一种**

| 项 | 设计 |
|---|---|
| 形态 | `packs/theme-<id>/manifest.json` + `tokens.json` + 可选位图（图标、底纹） |
| 复用 | 与 [B8](#b8-design) 同一套包机制：`sha256`、包版本、`requires.packs`、资源端口；不另造分发格式 |
| 激活 | 同时只激活一个主题包；可选叠加 0–1 个无障碍覆盖包（只允许对比度类令牌） |
| 增删 | 增加 = 放入包并登记；删除 = 移除包，令牌回退默认值，**不需重新构建** |

**主题包 schema（`theme@1`）**

```json
{
  "schema": "theme@1",
  "id": "paper-green",
  "name": "纸绿",
  "version": 1,
  "tokens": {
    "color": { "paper": "#f7f7ef", "ink": "#2e4339", "accent": "#3c624b", "line": "#dde2d0" },
    "font":  { "body": "\"Noto Sans SC\", system-ui, sans-serif", "display": "inherit" },
    "radius":{ "card": "19px", "control": "8px" },
    "shadow":{ "card": "0 18px 40px rgb(46 67 57 / 12%)" },
    "space": { "gutter": "52px" }
  },
  "assets": { "logo": "tex-logo" },
  "a11y": { "contrastTarget": "AA", "notes": "正文与纸面对比 ≥ 7:1" }
}
```

```json
// packs/theme-paper-green/manifest.json
{ "schema": "pack@1", "kind": "theme", "id": "paper-green", "version": 1,
  "files": [ { "path": "tokens.json", "sha256": "9f2c…" } ],
  "requires": { "themeSchema": [1] } }
```

约束（全部可校验）：

| 规则 | 说明 |
|---|---|
| 只允许令牌值 | 不能写选择器、不能写任意 CSS 规则、不能带脚本；只允许改令牌**值** |
| 必需令牌集 | 见下方表格；**任一缺失即校验失败**（`THEME_TOKEN_MISSING`），不允许部分生效 |
| 值格式 | 颜色接受 hex / `rgb()` / `oklch()`；字体只接受字体族列表；尺寸只接受 px / rem |
| 令牌白名单 | 键必须出现在平台的令牌注册表里；未知名 → `THEME_TOKEN_UNKNOWN` |
| 体积 | `tokens.json` ≤ 8 KiB；随包位图沿用单图上限 |
| 自带版本 | `tokens.schema` 与 `version` 均必填，且必须通过下方三层版本校验 |

**必需令牌集（`theme@1` 固定）**

| 组 | 必填键 | 说明 |
|---|---|---|
| `color` | `paper` · `ink` · `accent` · `line` | 页面底色、正文、强调、分隔线；缺任一项不得激活 |
| `font` | `body` | 正文字体族；`display` 可选 |
| `radius` | `card` | 卡片圆角；`control` 可选 |

> `shadow`、`space` 等仅为可选令牌：不提供时使用默认值，不报错。

**版本校验（三层，顺序固定）**

| 次序 | 字段 | 检查 | 失败码 |
|---|---|---|---|
| 1 | `manifest.schema`（如 `pack@1`） | 平台支持该包清单版本 | `UNSUPPORTED_VERSION` |
| 2 | `tokens.schema`（`theme@1`） | 平台声明的 `themeSchemaVersions` 包含它 | `UNSUPPORTED_VERSION` |
| 3 | `manifest.version`（正整数，单调递增） | 与登记版本一致；被关卡 `requires.themes[{id,version}]` 引用时不得低于要求版本 | `PACK_VERSION_MISMATCH` |
| 4 | `manifest.files[].sha256` | 与包内实际字节一致 | `PACK_CORRUPT` |

- 校验顺序固定：**版本先于内容**——版本不符直接终止，不再解析令牌值。
- 任一失败都不激活主题，回退默认外观并告警，不影响玩法与模拟。
- 新增 `theme@2` 时，平台可同时支持 `1` 与 `2`（与 [C12](#c12) 的解释器矩阵同构：支持集声明，不一对一）。
- 主题包**不参与运行时迁移**：旧版本令牌由平台内置迁移表在**激活前**转换，失败则拒绝激活。

**运行时应用方式（与零外部请求兼容）**

- Tailwind 的 `@theme` 在构建期生成 `:root` 的 CSS 变量默认值；主题包在运行期只做一件事：**把这些变量的值覆盖到 `:root`（或 `[data-theme]` 作用域）**，通过 CSSOM 写入内联样式，不请求任何外部 CSS。
- 因此「换主题」= 换一组变量值；组件与渲染器只引用 `var(--color-*)`，不感知主题存在。
- 回退链：`主题包令牌 → 默认令牌 → 硬编码兜底`；主题包缺失或损坏时告警并回退默认，**不影响玩法与模拟**（与 [C4](#c4) 同一条回退路径）。

**判定标准（可执行）**

1. 新增一个主题包 → 放进 `packs/` 并激活即可看到变化，**全程不重新构建**；
2. 删掉主题包 → 回到默认外观，无报错残留；
3. 主题包里写入选择器或脚本 → 校验失败（只允许令牌）；
4. 主题包只改令牌值时，**玩法与回放结果不变**（同一 JSON 两种主题，模拟快照逐 tick 相等）；
5. 删掉 `color.line` → `THEME_TOKEN_MISSING`，主题不激活、自动回退默认；
6. 加一个未登记令牌 → `THEME_TOKEN_UNKNOWN`；
7. 把 `tokens.schema` 改成平台未支持的版本 → `UNSUPPORTED_VERSION`，且**在解析令牌值之前**就终止；
8. 把 `manifest.version` 改成与登记不符（或低于关卡要求）→ `PACK_VERSION_MISMATCH`；
9. 改动包内任一文件但不更新 `sha256` → `PACK_CORRUPT`。

判定：**目标**——当前样式是单文件手写 CSS，无令牌层、无主题包。

### C15 AI Skill：面向 Agent 的可发现能力包

<a id="c15"></a>

**目的**：让 AI Agent 在不读源码、不读本稿的前提下，仅凭一份机器可读的能力清单就能发现、调用并自检**关卡创作**。

**作用域（硬边界）**：`gothere agent` 只服务创作侧——读写关卡文档、校验、自检。**不参与游戏运行**，也不接管玩家侧行为（[§7](#s-conflicts) 有对应裁决）。

**定义**：Skill = 一个可被发现的调用单元，等于「一个 app 用例 + 一份元数据 + 一个稳定输出契约」。Skill 不是新逻辑，不得绕过用例层（[C5](#c5)）。

| 组成 | 内容 |
|---|---|
| 标识 | 点号命名（如 `level.validate`），发布后稳定不变 |
| 元数据 | 摘要、是否写操作、是否幂等、输入/输出 schema、错误码集合、示例 |
| 实现 | 直接委派 `app.*`；不带自己的业务规则 |
| 输出 | `--json` 单对象：`{ok, code, data?, errors?, diff?}`；错误码见 [C7a](#c7) |
| 副作用 | 写操作必须支持 `--dry-run`；默认调用是只读 |

**Skill 清单（首版）**

| 分组 | Skill | 写 | 说明 |
|---|---|---|---|
| 发现 | `skills.list` | — | 本清单自身，含平台版本与解释器支持矩阵 |
| 发现 | `schema.describe` | — | 类型、能力、字段、令牌、版本 |
| 读 | `level.get` / `level.list` | — | 取关卡与草稿列表 |
| 校验 | `level.validate` | — | `mode: editable \| playable`，返回错误码 |
| 写 | `level.apply` | ✔ | ops + `expectRevision` + `dryRun`，原子替换 |
| 写 | `level.export` | ✔ | 输出 JSON 或分享码（含依赖包） |
| 对比 | `level.diff` | — | 结构化 diff（实体/规则/布局） |
| 模拟 | `level.simulate` | — | 创作自检：给定输入序列，返回终态与 `code` |
| 模拟 | `level.replay` | — | 创作自检：回放记录校验，终态不一致即失败 |
| 内容 | `asset.list` / `theme.list` | — | 内容包与主题包清单及版本 |
| 文本 | `dsl.parse` / `dsl.serialize` | ✔ | G1，round-trip 一致 |
| 生成 | `gen.run` / `seed.restore` | ✔ | G2 / G3，目标态 |

**不在范围（永不作为 skill）**

| 项 | 归属 | 理由 |
|---|---|---|
| 启动试玩、切关、暂停/单步 | 平台 UI（浏览器 / Electron） | 游戏运行不是创作动作；混入后 agent 变成第二个玩家入口 |
| 注入玩家点击/输入 | 内核输入队列（UI 产生） | 创作自检只能通过 `level.simulate` 的录制输入，不得作弊 |
| 玩家进度存档、成就、云存档 | 外壳 bridge（[E4](#e4)） | 与关卡创作无关，且涉及平台账号 |
| 托管、发布、在线工坊 | 路线阶段外（[A3](#a3)） | 需要服务器与审核，不属于单机创作 |
| 渲染器/主题的运行时切换并影响玩法 | 平台设置 | 主题只能换令牌，不得改变玩法与判定（[C14](#c14)） |

**调用形态**

```bash
gothere skills --json                 # 发现：清单 + 平台版本 + 支持矩阵
gothere schema describe lift --json   # 发现粒度：单个类型
gothere level validate demo.level.json --mode playable --json
gothere level apply demo.level.json --ops ops.json --dry-run --json
gothere agent --stdio                 # JSON-RPC 2.0，一行一条消息
```

四条协议纪律：

1. **stdout 纯净**：`--json` 与 `agent --stdio` 模式下 stdout 只输出协议内容，日志一律走 stderr；否则 Agent 无法可靠解析。
2. **错误只靠码**：`code` 稳定、文案可改；退出码 0/2/3/4/5 与 [C7a](#c7) 一致。
3. **写操作可预览**：`--dry-run` 返回与真实 `apply` 完全相同的 diff；`apply` 是原子的（生成新文档后整体替换）。
4. **诚实发现**：未实现的 skill 不出现在清单里；废弃的标 `deprecated` 并给出替代 skill。

**与 AI 的闭环**：`skills list` → `schema.describe` 取字段 → `level.get` 取文档与 revision → `level.apply --dry-run` 看 diff → `level.apply --expect-revision` 落盘 → `level.validate --mode playable` → `level.simulate` 判可解 → 必要时 `level.replay` 自证可复现。整条链路只用 JSON 与错误码，不需要任何 prompt 约定。

**验收标准（可执行）**

1. 仅凭 `skills.list` 与 `schema.describe`，一个 Agent 能独立完成 [D3](#d3) 的任务链；
2. `--json` 输出可被 `jq` 直接解析，stdout 不含日志；
3. 同一 ops 序列的 dry-run diff 与 apply 后的 diff 逐字节一致；
4. 改一条错误文案后，Agent 侧的断言不需要改；
5. 新增一个 app 用例时，若对应 skill 未同步，测试失败（清单与用例一一对应）；
6. 清单中不存在任何玩家侧 / 运行时 skill（无 `game.*` / `save.*` / `player.*`）——出现即视为设计返工。

判定：**目标**——现状没有 CLI、没有 JSON 输出、没有错误码，Agent 无法在不读源码的前提下操作关卡。

## 4. D 当前阶段目的

<a id="sD"></a>

阶段划分与退出条件（每阶段只在前一阶段退出后开始）：

| 阶段 | 目的 | 退出条件 | 设计前置 |
|---|---|---|---|
| **V1 内容抽象 + 创作体验** | <a id="d1"></a>D1 优先验证内容抽象与编辑体验，占位画面保留资源挂载<br><a id="d2"></a>D2 发起人试玩：左右布局、仓库、事件槽、折线整理<br><a id="d3"></a>D3 工坊独立完成「区域启动生物 → 开关休息 → 拿物开门 → 梯子/电梯到终点」<br><a id="d4"></a>D4 记录困惑并优先修复 | D3 由发起人**独立完成**；D4 困惑清单闭合；回归全绿；Agent 用同一契约完成同一任务链 | [C3](#c3) 四层校验 + `describe`、[C4](#c4) 回退链、[C5](#c5) 用例层、[C6](#c6) 面板元数据、[C7a](#c7) 错误码与 diff、[B8](#b8-design) 内容包、布局外置、[C12](#c12) 平台与内容分界（内置关卡转 JSON）、[C15](#c15) Skill 清单与 stdout 纯净 |
| **V2 行为预设** | <a id="d5"></a>D5 保存/复用物体配置；观察事件发出、行为调用、条件未满足与延迟 | 用预设能拼出 V1 全部 10 关 + 3 示例，且不改契约 | 预设 = 能力包 + 外观 + 默认行为（[C11](#c11)）；只读模板，不进运行时契约；可导出为 DSL 片段 |
| **V2.5 程序生成试验** | <a id="d6"></a>D6 先生成因果结构与预期操作，再安排空间与时间<br><a id="d7"></a>D7 可解性与趣味分别验收，用同一内核回放筛选 | 生成器产物 100% 通过自动可解性筛选；趣味由人评分并留档；同 seed 可逐字节还原 | [C7a](#c7) 全量（JSON、错误码、diff）、可选 trace 通道、布局与语义分离、`dsl/` 与 `gen/` 只依赖 IR、纯函数 PRNG、`meta.origin` 种子契约（[C11](#c11)） |
| **V3 Steam Demo** | <a id="d8"></a>D8 按创作核心与生成试验结果定范围，再投入引导、进度、设置、音效、动画 | Demo 范围冻结；上述体验项完成 | [C4](#c4) 多渲染策略、[B8](#b8-design) 动画状态映射 |
| **发行** | <a id="d9"></a>D9 第二台干净 Windows、≥2 位外部试玩者、性能与长时存档、Steamworks 实测 | 全部通过 | 外壳可替换（[E4](#e4)）、签名、体积评估 |

判定：D1 达成；D2–D4 **未验**；D5–D9 目标。

## 5. E 非目的与边界

<a id="sE"></a>

| # | 非目的 | 设计如何保证 | 判定 |
|---|---|---|---|
| <a id="e1"></a>E1 | 不做多手持槽、血量 | `actor.holding` 为单值；伤害动作与接触效果直接结束本局 | 成立 |
| <a id="e2"></a>E2 | 不做自由跳跃、连续坠层、自动寻路 | 内核没有重力积分与路径搜索；支撑按楼层离散判定 | 成立 |
| <a id="e3"></a>E3 | 不在关卡中运行脚本 | 动作封闭枚举 + 内核白名单（[C8](#c8)） | 成立 |
| <a id="e4"></a>E4 | 当前不以 Electron 作为分发容器 | Electron 只作开发验证容器（Windows 包即开发测试包）。设计要求**外壳可替换**：渲染进程只依赖单文件产物，外壳只提供最小 bridge（存档路径、全屏、禁用网络），换壳不动内核与编辑器 | 成立（需在 README 与路线中持续对齐） |
| <a id="e5"></a>E5 | 不承诺移动端创作体验 | 布局按桌面优先；移动端仅「能看能玩」 | 成立 |
| <a id="e6"></a>E6 | 当前包未签名，未完成第二台干净机器与发行验收 | 事实陈述；[D9](#d9) 的退出条件 | 成立 |
| <a id="e7"></a>E7 | 临时公网链接不保证持续可用 | 离线单文件是主要交付物；隧道只是临时分享手段 | 成立 |
| <a id="e8"></a>E8 | 自动验证通过不代替真人与外部玩家验收 | 见 [§6](#s-accept) 的验收责任划分 | 成立（需落到流程） |

## 6. 验收责任：自动化只做回归

<a id="s-accept"></a>

| 类型 | 谁执行 | 验什么 | 证据 |
|---|---|---|---|
| 回归（自动化） | CI + 本地脚本 | 内核语义、预算、10 关解法、工坊重建、注册表一致性、UI 冒烟、样式与体积、桌面启动 | 测试报告；失败即阻断合并 |
| 自动回放 | 脚本 | 输入序列重推后终态一致（**不叫「试玩」**） | 回放断言 |
| 好玩 | 发起人 + ≥2 位外部玩家（[D9](#d9)） | 难度曲线、因果是否可理解、重复游玩意愿 | 试玩记录（[D2](#d2) / [D4](#d4)） |
| 创作顺手 | 发起人独立执行 [D3](#d3) | 完成率、耗时、困惑点清单 | 记录表，逐条关闭 |
| 可解性 | 生成试验自动化 | 每个生成关卡存在解法 | 回放 + trace |
| 趣味 | 人工评分 | 生成关卡是否值得玩 | 评分表 |

硬话：**自动化通过 ≠ 验收通过**。凡涉及体验的判定，一律标注「需真人」。

## 7. 目的冲突与裁决

<a id="s-conflicts"></a>

| 冲突 | 裁决 | 依据 |
|---|---|---|
| C4 可插拔 vs 零外部请求 | 可插拔限定为**构建期注册**，运行时加载外部 ESM 永不采用 | [A1](#a1)/[A2](#a2) 要求断网可玩；C4 的实质（可替换、可回退、失败隔离）不依赖运行时加载 |
| C3 可迁移 vs 契约稳定 | 迁移表在第一次破坏性变更前必须存在；之前只做「更高版本明确拒绝」 | 没有迁移器的版本号是装饰 |
| C5 用例层 vs 约 3,700 行单包 | 只加一个 `src/app/` 薄层，不拆包、不引框架 | 共享逻辑是 C5 的全部要求，单仓多包不是 |
| C6 元数据驱动 vs 现成面板 | 先做类型级元数据（字段/状态/事件），面板生成逐步替换手写部分 | 一次性重写面板会中断 [D2](#d2) 的试玩验证 |
| C7 乐观锁 vs 本地草稿 | V1 只做错误码 + JSON + diff；`revision` 在多写者出现时引入 | 单机单一写者时锁是空转 |
| B8 内容包引用 vs 单文件自包含 | 分发时把包内联进单文件（base64），开发/桌面走外部包 | 「内容不参与编译」与「断网可玩」需同时成立 |
| B8 位图体积 vs 内联膨胀 | base64 膨胀约 33%：保留单图上限，新增包级上限（2 MiB 量级） | 避免分享码因两三张贴图就不可用 |
| E4 外壳可替换 vs 已有 Electron 包 | Electron 包定位为开发验证容器；外壳接口保持最小 | 现状是事实，定位要写清 |
| A3 分享 vs 无服务器 | 先做「自包含文件 + 分享码」，在线工坊后置 | 分享的 90% 价值在「能发出去、能打开」 |
| 能力组合 vs `kind` 枚举 | 引入能力层，`kind` 降级为预设；迁移表一次性映射 | 「同贴图不同交互」用 `kind` 表达会类型爆炸，并违背 [B1](#b1) |
| 文本 DSL vs JSON 唯一事实源 | DSL 只编译到 IR，永不反向成为真相；round-trip 门禁 | [C1](#c1) |
| 种子还原 vs 生成器演进 | `generatorVersion` 进契约 + 每版本黄金 IR 回归；IR 为权威 | 不能为「可还原」冻结生成器演进 |
| 包可升级 vs 关卡可复现 | 关卡声明 `requires.packs[{id,version}]`；包语义变更必须升包版本 | 不能因美术更新改变旧关卡玩法结果 |
| 一解释器支持多版本 vs 实现简洁 | 解释器内部按类型版本分派语义，而不是每版本一个解释器 | 版本矩阵比「版本 × 类型」的解释器数量小得多，且能保证旧内容行为不变 |
| 解释器选择 vs 可重现 | 候选多个时按 `apiVersion` 降序、`id` 升序固定选择，并记入 trace | 同一平台重复加载必须选中同一解释器 |
| 模块化 vs 约 3,700 行单包 | 单包内按目录分层 + import 图门禁，不拆 workspace | 解耦靠边界与检查，不靠多包 |
| 实时解释 vs 性能 | 解析一次 + 差量更新；每帧只解释快照 | 实时渲染不等于每帧重解析 |
| Skill 可发现 vs 实现自由 | 每个 skill 必须绑定一个 app 用例，清单与用例一一对应并由测试保证 | 否则 Agent 会依赖一套与人类不一致的逻辑 |
| stdout 纯净 vs 人类可读 | `--json` / `--stdio` 启用时 stdout 只放协议，人类输出走单独模式 | 日志混进 stdout 会让 Agent 解析失败 |
| 写权限 vs 安全 | 默认只读；写需显式 `--apply` 且先给 `--dry-run` diff | 一个人/一个 Agent 误操作不应直接覆盖关卡 |
| Agent 范围 vs 功能扩张 | agent CLI 只做创作侧（读写关卡 + 校验 + 自检）；游戏运行、玩家输入、进度存档一律走平台 UI | 作用域混入运行时后，agent 会变成第二个玩家入口，破坏确定性与验收边界 |
| 主题包运行时替换 vs Tailwind 编译期 @theme | `@theme` 只提供默认值；主题包运行期覆盖同名 CSS 变量 | 两者不冲突：编译期定结构，运行期换值 |
| 主题包自由度 vs 像素级回归 | 主题包只允许改令牌值，不允许写选择器 | 否则无法用视觉回归验证，也无法防注入 |
| 主题包可增减 vs 零外部请求 | 主题包内联进单文件（与物件包同机制） | 换主题不能引入外部 CSS 请求 |

## 8. 总判定

<a id="s-verdict"></a>

> 用统一、带版本、可插拔的关卡数据与内核，先把「内容抽象 + 编辑/Agent 创作体验」验证透，再逐步扩展到行为预设、程序生成、Steam Demo 与发行；游戏好玩与创作顺手分别验收，自动化只做回归，不代替真人试玩。

| 片段 | 判定 | 缺什么 |
|---|---|---|
| 统一 | ✅ 成立 | — |
| 带版本 | ⚠️ 名义成立 | [C3](#c3)：迁移表 + 更高版本拒绝 + `describe` |
| 可插拔 | ⚠️ 需按 [C4](#c4) 的定义才成立 | manifest + 工厂 + 回退链（构建期） |
| 关卡数据 | ✅ 契约已冻结 | [B8](#b8-design) 内容包、布局外置 |
| 内核 | ✅ 确定性与预算成立 | 对外错误码（[C7](#c7)） |
| 先验证内容抽象 | 进行中 | [C6](#c6) 元数据、[C3](#c3) 四层校验 |
| 编辑创作体验 | 进行中 | [D2](#d2)/[D3](#d3)/[D4](#d4) 真人执行 |
| Agent 创作体验 | ❌ 未开始 | [C5](#c5) 用例层 + [C7a](#c7) 契约级接口 |
| 行为预设 | ❌ 无实现 | [D5](#d5) 的预设形态（能力包 + 外观 + 默认行为） |
| 程序生成 | ❌ 未开始 | 稳定 JSON/diff + trace 通道 + 布局分离 |
| Steam Demo / 发行 | ❌ 阶段外 | 路线承载；设计只保证零外部请求与外壳可替换 |
| 好玩与创作分别验收 | ⚠️ 未成文 | [§6](#s-accept) 已给划分，需落到试玩流程 |
| 自动化只做回归 | ⚠️ 未成文 | 同上；把「自动试玩」统一称「自动回放」 |

结论：这句话作为**方向**成立，作为**当前事实**只有一半成立。要让整句成立，V1 的最小增项是：注册表（含字段元数据与能力声明）、四层校验、薄用例层、错误码 + diff、构建期渲染回退、内容包、布局外置、验收责任成文。

比这句话更基础的要求：**平台编译、内容 JSON、解释器随平台**（[C12](#c12)）。它决定了 DSL、生成器、分享码只能产出数据，也决定了「可插拔」只能发生在平台内部。

### 深层目标 G1–G3 的判定

<a id="s-verdict-g"></a>

| 目标 | 当前 | 成立所需 |
|---|---|---|
| [G1](#g1) DSL 描述关卡创作 | JSON 已是数据 DSL（可读写、可校验），缺面向创作的文本语法与双向工具 | 能力注册表先就位（关键字由它派生）→ `dsl/parse` + `serialize` → round-trip 门禁 |
| [G2](#g2) 在 G1 上程序生成 | 未开始 | 生成器只输出 IR；用 `app.validate('playable')` + 内核回放自检；需要稳定错误码与可选 trace |
| [G3](#g3) 种子还原与分享 | 未开始 | 纯函数 PRNG + `generatorVersion` + 黄金 IR 回归 + 分享码编解码（IR 自包含） |

三者共用同一个前提：**能力层 + 注册表**。没有它，DSL 的词汇表、生成器的可用构件、分享码的兼容性都无处声明——这也是注册表被定为唯一扩展点的原因。

## 9. 术语

<a id="s-glossary"></a>

| 术语 | 含义 |
|---|---|
| 平台（platform） | 编译产物：解释器与支持矩阵、内核、渲染策略、交互绑定、编辑器、迁移表 |
| 内容（content） | 制品：内容包（物件 JSON + 位图 + manifest）与关卡 JSON |
| 解释器（interpreter） | schema + version 对应的处理模块，编译在平台内，按文档的版本要求选中 |
| 支持矩阵 | 解释器声明的 `{schema:[…], types:{类型:[…]}}`；一个解释器可覆盖某些类型的某些版本 |
| 类型版本（typeVersion） | 单个类型或能力自己的版本，如 `object@2`；升版本即语义变更 |
| 内容包（pack） | 物件/预设定义 + 位图等二进制 + `manifest.json`（含 `sha256`、包版本、位图规格） |
| 关卡（level） | 单个 JSON：只引用物件与资源，不复制它们 |
| 资源解析器 | 平台端口：`readJSON` / `readBytes` / `listPacks`，由 shell 注入 HTTP / 文件 / 内联实现 |
| 主题包（theme pack） | 内容包的一类：一组设计令牌（颜色/字体/圆角/阴影/间距）+ 可选位图，schema 为 `theme@1`；只允许改令牌值 |
| 设计令牌（design tokens） | 颜色、字体、圆角、阴影、间距等命名的视觉常量；在平台里映射为 CSS 变量 |
| 令牌注册表 | 平台声明的令牌键集合（含必需/可选、值格式）；主题包只能用其中的键（`THEME_TOKEN_UNKNOWN` / `THEME_TOKEN_MISSING`） |
| 统一关卡数据 / IR | 编辑器、试玩、回放、导入导出、DSL、生成器共用的关卡 JSON，唯一交换格式与唯一事实源 |
| 类型注册表 | 一种实体类型的全部元数据（状态、事件、字段、几何、默认值、渲染策略）的单点声明 |
| 能力（capability） | 物体的一种可组合交互声明（可持有、接触伤害、可点击、巡逻、可通行、区域）；是数据，不是类型 |
| 预设（preset） | 能力包 + 外观 + 默认行为的命名组合；既有 `kind` 作为预设名 |
| 用例层 | `src/app/`：无 IO、无 DOM，被编辑器与 CLI/Agent 共用的编排函数 |
| 行为 | 由有限动作组成、可含延迟与嵌套调用的命名程序 |
| 规则 | 触发事件 + 条件 + 动作；连线是它的投影 |
| 布局 | 折线与转接点，只影响编辑视图，不进入模拟 |
| wire id | 连线的稳定标识 = `rule.id` + 动作路径，布局挂在它上面，不用数组下标 |
| 分享码 | 压缩「关卡 IR + 依赖内容包」+ 校验和 + `schemaVersion` 的字符串，自包含、可离线还原 |
| 产物矩阵 | [C12 产物清单](#c12-artifacts)：平台 4 项（单文件、站点、容器包、Skill 清单）+ 内容 4 项（关卡、物件包、主题包、分享码）+ 运行副产物 5 项 |
| Skill | 可被 AI 发现与调用的能力单元：一个 app 用例 + 元数据 + 稳定输出契约（[C15](#c15)）；仅限关卡创作 |
| Skill 清单 | 机器可读的能力目录（`skills/manifest.json`）：标识、输入/输出 schema、错误码、示例、是否写操作 |
| 自动回放 | 用记录的操作序列重推模拟并校验终态，属回归，不属试玩 |
| 预算 | 内核强制的执行上限，超限即失败 |
| 零外部请求 | 产物不发起任何网络请求，由单文件打包、CSP、Electron 拦截共同保证 |
