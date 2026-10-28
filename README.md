# 一定要到达那里

一个轻松诙谐、以关卡数据驱动的 2D 环境解谜原型。主角是一个认准目的地就往前走的倔家伙；点击场景中的编号机关，或下方同名按钮，帮助他越过麻烦、到达目的地。

最终目标：制作在 Steam 发行的原创解谜游戏与关卡创作工具。目前已完成六关可玩原型、按类别划分的解释器与 schema、纯声明的元素（物品只说自己是什么、机关只说自己在什么状态下做什么）、多层地图、巡逻与碾压类机关、确定性回放和手机浏览器试玩。

![游戏原型：旅行者、伸缩木桥和目的地旗帜](docs/images/gameplay.png)

下一里程碑为 **v0.3：关卡编辑器与十关验证**。先完成拖放、属性、事件配置、保存和立即试玩的创作闭环，用编辑器制作累计十张关卡，同时验证 Windows 独立包的发行路径。详细范围与验收标准见 [project.md](project.md)。

## 启动

需要 Node.js 26 与 pnpm 12。

```sh
pnpm install
pnpm dev
```

浏览器打开 http://localhost:4173。`pnpm dev` 会同时监听 Tailwind 样式并启动静态服务器；只跑 `pnpm start` 也可以，但样式要先由 `pnpm css` 生成。

服务器会显示局域网地址。局域网访问受网络隔离、防火墙和客户端影响；手机优先使用下面的公网试玩方式。

## 给 AI Agent 的创作侧 CLI

平台把「解析器（interpreter）」和「运行」分开：每个解释器声明自己支持的 schema、
类型与声明版本，平台按文档的版本要求选一个解释器来解析并运行；内容只贡献 JSON。

三类内容各有自己的 schema：`map`（世界 / 角色 / 终点 / 地面 / 楼梯）、`mechanism`
（反应 `reacts`、阻挡 `blocks`、伤害 `harms`、自走 `moves`、提供地面 `ground`、载人
`lifts`）、`item`（标签 `tags`、可携带 `carryable`、伤害 `harms`、反应 `reacts`）。
写错类别（比如给物品写 `blocks`）会在加载前被拒绝。

CLI 是一个**独立制品**：`pnpm build:cli` 会把 `src/app/cli.js` 依赖的全部模块和
内置关卡打成一个 `dist/gothere-cli.mjs`（约 137 KiB），除 node 内置模块外没有任何
依赖。它可以直接复制走、单独运行，也可以当 bin 装：

```sh
pnpm build:cli                         # 产出 dist/gothere-cli.mjs
node dist/gothere-cli.mjs --version     # 制品自带版本，不需要仓库
cp dist/gothere-cli.mjs /tmp/ && cd /tmp && ./gothere-cli.mjs level list
```

源码树里改完逻辑，用 `pnpm cli`（跑制品，跑前自动重建）或 `pnpm cli:src`（直接跑
源码，省一次构建）。**要接管道（`| jq`、脚本调用）请直接用
`node dist/gothere-cli.mjs`**：`pnpm cli` 会额外打印 pnpm 自己的命令行，那是包管理器
的输出，不是 CLI 的协议流。

```sh
pnpm cli skills --json                  # 技能清单 + 解释器支持矩阵
pnpm cli platform                       # 解释器与平台整体支持集
pnpm cli schema bridge                  # 某类型的字段、状态、声明
pnpm cli schema                         # 三个类别的 schema 与声明槽词汇
pnpm cli level list
pnpm cli level validate demo.level.json --mode playable --json
pnpm cli level simulate first-bridge --inputs '[{"tick":1,"source":"lever"}]' --json
pnpm cli level diff first-bridge quiet-corner --json
```

约定：`--json` 时 stdout 只有协议对象（日志走 stderr）；错误只靠稳定错误码；退出码
0 成功 / 2 用法错误 / 3 校验失败 / 4 模拟失败 / 5 内部错误。清单只列已实现的只读
能力，写操作（如 `level.apply`）在实现之前不会出现。浏览器里可以用
`window.gothere.platform()` 拿到同一份支持矩阵。

制品与源码树入口的输出必须一致（`tests/cli-artifact.test.mjs` 逐条比对），并且会
把制品单独复制到临时目录里跑一遍内置关卡，确保它在没有 `src/`、`levels/`、
`node_modules/` 的地方也能工作。

## 单一可执行文件（可跨平台构建）

不装 Node 也能跑：用 Node 26 自带的 SEA（single executable application）把 CLI 嵌进
node 本体，产出一个二进制。

```sh
pnpm build:bin                              # 宿主平台
node scripts/build-binary.mjs --target win32-x64     # 任何平台都能构建目标平台
node scripts/build-release.mjs --target darwin-arm64  # 二进制 + 技能包 + 桌面客户端
```

支持的目标：`linux-x64`、`linux-arm64`、`darwin-arm64`、`darwin-x64`、`win32-x64`。

**为什么能跨平台**：`node --build-sea` 只能用「当前运行的 node」当底，但 SEA 其实是
两步——先生成一个**与平台无关的 blob**，再把 blob 注入到 node 本体。所以这里改成：
用官方 `nodejs.org/dist` 的**目标平台 node** 当底，用 `postject` 注入我们生成的 blob。
macOS 注入后签名必然失效（Apple Silicon 上不签名不给跑），于是在非 Mac 宿主上用
[rcodesign](https://github.com/indygreg/apple-platform-rs) 做 ad-hoc 签名——**一台
ubuntu 就能产出全部四个平台的制品，不需要 macOS / Windows runner**。

自检分两级：目标平台就是宿主时（比如在 Linux 上构建 linux-x64）会真的跑一遍
`--version` / `level list` / `level simulate`；跨平台构建时做结构校验（PE / ELF / Mach-O
魔数与 CPU 类型 + SEA sentinel 是否注入成功）。

其余两条硬约束：

- **体积 ≈ node 本体**（约 100–150 MB），所以它不进 npm 包，只在 Release 里发。
- macOS 下载后可能被 Gatekeeper 拦一次：`xattr -d com.apple.quarantine ./gothere-darwin-arm64`。

## 发版：推 tag 即发布

```sh
git tag v0.1.0 && git push origin v0.1.0
```

`.github/workflows/release.yml` 会先校验（tag 必须等于 `package.json` 的版本、跑测试
与分层门禁），再在三个平台各自构建单二进制，最后把下面这些挂到 GitHub Release：

目标平台：`linux-x64`、`linux-arm64`、`win32-x64`、`darwin-arm64`。发布只有**三类**制品：

| 类别 | 文件 | 内容 |
|---|---|---|
| ① Agent 技能包 | `gothere-agent-<目标>.tar.gz` / `.zip` | `SKILL.md` + 该平台的单二进制（包内叫 `gothere-cli`），解压即用、无外部依赖 |
| ② HTML 静态站点包 | `gothere-web.tar.gz` | 只有一个 `index.html`（样式/脚本/关卡全内联），解压到站点根即可给 nginx 用 |
| ③ 桌面端客户端 | `gothere-desktop-<目标>.tar.gz` / `.zip` | Electron 绿色版（macOS 已 ad-hoc 签名） |
| — | `SHA256SUMS.txt` | 以上全部文件的校验和 |

除此之外不发布裸二进制、单独的 CLI 脚本或单独的 `SKILL.md`：它们都已经在对应的压缩包里，
单独挂出去只会让人多下载一次。SKILL.md 的源是仓库里的 `skills/gothere-levels/SKILL.md`。

本地也能拿到同样的东西：`node scripts/build-release.mjs --target linux-x64`（二进制 →
技能包 → 桌面端）和 `node scripts/build-web.mjs`（静态站点包）。

文件名固定、版本靠 tag，所以可以直接用稳定链接，例如
`https://github.com/dezhishen/gothere/releases/latest/download/gothere-linux-x64`。
也可以在 Actions 页面手动触发 release 工作流并指定已有 tag。

流水线三段、**全在 ubuntu 上跑**：`verify`（版本一致性 + 测试 + 分层门禁 + 单文件产物
+ node 版技能包）→ `targets`（四个目标平台各跑一次 `build-release.mjs`，产出二进制 +
技能包 + 桌面客户端）→ `publish`（汇总 + 校验和 + 发布）。压缩包后缀跟**目标平台**走：
posix 是 `.tar.gz`（保留符号链接与可执行位，macOS 的 `.app` 需要），Windows 是 `.zip`
（本仓库自带一个零依赖的 ZIP 写入器，所以不需要 Windows 机器）。

### Agent 技能包

`pnpm skill` 依据 schema 重新生成 `skills/gothere-levels/SKILL.md`；打包时它和一平台一个
的单二进制装进同一个压缩包：

```sh
pnpm skill                                            # 重新生成仓库里的 SKILL.md
node scripts/build-release.mjs --target win32-x64      # → 二进制 + 技能包 + 桌面端
```

技能源文件就在仓库里：**`skills/gothere-levels/SKILL.md`**。它不是手写的第二份文档——
类别、字段、声明槽、类型、状态、范例关卡全部由 `describe()` 与关卡清单生成，改完 schema
跑一次 `pnpm build:agent` 重新生成即可；`pnpm check:skill`（以及 `pnpm test`）会比对
仓库里那份是不是最新的，跑偏了就失败。

`skills/` 里放的是「Agent 怎么用这个项目」的说明书，和代码同仓库、同 PR 评审；Release
里的技能包只是把它和可执行文件装进一个压缩包。

### 桌面端客户端

`pnpm build:desktop` 用 Electron 把单文件游戏包成一个绿色版客户端
（`@electron/packager`，不做安装器）：

```sh
pnpm build:desktop                                  # → dist/gothere-desktop-<宿主平台>.tar.gz
node scripts/build-desktop.mjs --target win32-x64   # 在 Linux 上产出 Windows 客户端
```

跨平台不需要对应的 runner：packager 只是下载目标平台的 Electron 再组装（Windows 的
版本信息由纯 JS 的 `resedit` 写入）。macOS 的 `.app` 组装后签名失效，用 rcodesign
在本机 ad-hoc 签名。

客户端里只有三样东西：`index.html`（游戏）、`main.cjs`（主进程）、`package.json`。
构建脚本会解开 `app.asar` 自检内容，多一个文件就报错。主进程的安全默认值：不开 node
集成、开上下文隔离与沙箱、外链一律交给系统浏览器、拒绝所有权限请求。

## 手机与异地试玩

```sh
pnpm share
```

命令会构建单文件版本，并用系统自带的 SSH 通过 [localhost.run](https://localhost.run/docs/) 提供临时 HTTPS 地址，不需要账号。手机在浏览器里打开输出的地址即可，不需要与电脑连接同一 Wi-Fi。试玩期间需要保持电脑、网络和这个命令运行；重新运行可能得到不同地址。

分享服务器只提供游戏页面和 `/play.html` 下载，不开放源码目录、测试产物或内部项目文档。地址记录在 artifacts/share.json；单文件内置的是公开试玩说明。

这个方法适合把本地改动临时发给别人看。想要一个长期可用的公开地址，用下面的 GitHub Pages 发布即可。

## 保存或分发单文件版本

```sh
pnpm build
```

构建会先用 Tailwind 编译 `src/styles/app.css`，再把样式、脚本和地图打成单文件。

生成 dist/gothere-play.html 和 dist/index.html，包含所有画面、样式、逻辑和六张地图。现代桌面浏览器可以直接打开 HTML 离线试玩，也可以将 dist/index.html 放到静态网站托管服务。手机优先使用 HTTPS 链接；不同系统的文件预览器对本地 HTML 执行的支持不同。

## 发布到 GitHub Pages

推送到 `main` 会自动运行 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)：安装依赖 → `pnpm test` → `pnpm build` → 把 `dist/` 作为 Pages 产物发布。也可以在 Actions 页面手动触发 `Deploy to GitHub Pages`。

首次使用需要在仓库 **Settings → Pages** 把 **Source** 设为 **GitHub Actions**。没开启之前工作流会在 `Configure Pages` 步骤报 `Get Pages site failed`；开启后到 Actions 页面重跑一次 `Deploy to GitHub Pages` 即可发布。

发布地址：https://dezhishen.github.io/gothere/ 。发布的是单文件版本（样式、脚本、关卡全部内联），所以放在 `/<repo>/` 子路径下也不需要改配置；`project.md`、源码和测试产物都不会发布。

## 新增一种机关 / 物品（只写数据）

类型是**数据**，不是代码：`types/<category>/<kind>.type.json` 就是权威来源。

```bash
# 1. 放一个文件（不用碰 manifest，目录扫描会自动收进来）
cat > types/mechanism/trapdoor.type.json <<'JSON'
{ "category": "mechanism", "kind": "trapdoor", "version": 1,
  "defaultWidth": 40, "iconOffset": 96, "art": "gate",
  "states": [{ "id": "shut", "label": "关着" }, { "id": "open", "label": "打开" }],
  "slots": {
    "reacts": { "on": "input", "from": "shut", "actions": [{ "type": "become", "state": "open" }] },
    "blocks": { "inState": "shut", "reason": "gate", "message": "翻板关着，过不去。" } } }
JSON

# 2. 在 types/manifest.json 的 files 里登记一行（只决定顺序与加载清单）
#    到这里就结束了——没有代码生成步骤，运行时直接读这些 JSON。
# 3.（可选）刷新 SKILL.md 这份文档生成物
pnpm skill
```

不需要改工厂、校验器、内核、渲染、CLI 或测试：`art` 复用现成图元（不写就用占位图），
状态与声明全部由数据决定。浏览器、CLI、单二进制都直接吃这份 JSON（构建时内联，
开发时 HTTP 读）。**新解释器**（新的一类，比如「地形」）才是加工厂文件的层级。

类型 JSON 的 schema 与校验函数（`parseTypes`）在
`src/core/interpreters/factories/types.js`，它们是纯函数，外部地图编辑器可以直接复用：
读同一批 `types/*.type.json`，用同一套规则校验，得到同样一份
`{ mechanism: {...}, item: {...} }` 交给 `resetFactories`。

## 样式

样式入口是 `src/styles/app.css`，由 Tailwind CSS v4 编译成 `src/style.css`（生成物，不入库）。

- 颜色、字体等设计令牌定义在 `@theme`，可直接使用 `bg-paper`、`text-ink`、`font-serif` 等工具类。
- 现有组件保留语义类名（`.game-shell`、`.hotspot` 等），内部用 `@apply` 组合工具类；新增界面可以直接在 HTML 里写工具类。
- 不启用 Tailwind 的 preflight，基础重置留在 `@layer base`，以保持既有像素级设计不变。
- `pnpm css` 单次编译，`pnpm css:watch` 持续监听，`pnpm dev` 会自动同时启动样式监听和开发服务器。

## 操作

- 点击「出发！」，然后轻点编号机关。机关按钮也可用键盘聚焦后操作。
- 「暂停一下」停止时间；暂停时可单步前进。点击 1× 可切换 2×、4×。
- 空格：开始/暂停；R：重置；1～6：切换关卡。焦点在按钮、输入框或对话框时保留原生键盘行为。
- 「回放本次」从头播放当前关卡已执行的操作。回放期间机关交互锁定。
- 「需要一点提示？」显示本关的时序提示。
- 「关卡数据」支持 JSON 编辑、文件导入、校验、加载、导出。加载无效数据不会替换当前关卡。

## 六张关卡

1. 桥呢？桥呢！：开关改变木桥状态，验证点击和因果。
2. 借过一下：风扇仅停 4 秒；踩下压力板后自动开门。
3. 赶个巧：木桥保持 5 秒，风扇保持 4 秒，需要分时操作。
4. 斧头与锤子：走过斧头会自动拿起（拿着就不扎脚），点一下放进身后的地面；
   再拿起锤子点一下，木栅门才开。
5. 上下两趟：地图是多层的——走进电梯轿厢再点开关，电梯把人送到二楼，
   然后沿楼梯走回地面。
6. 全都来一遍：把上面的机制摆在同一张图上。先点斧头放下（等一下要拿回来），
   再让巡逻守卫停下，拿起钥匙才踩得开压力板；木桥只延伸 5 秒、电梯要等
   人进轿厢再按，最后爬楼梯到二楼终点。

关卡是 `levels/*.level.json` 内容制品，不参与编译；每张地图都可以不依赖画面运行，
没有单独的关卡专用代码。

## 目录

- `project.md`：项目愿景、架构与后续路线。
- `docs/design.md` / `docs/architecture.md`：平台与内容的边界、模块分层与里程碑。
- `src/core/contract/`：类型与字段注册表、版本与支持矩阵、四层校验、编译、diff、PRNG、迁移。
- `src/core/capabilities/`：**声明槽词汇**（reacts / blocks / harms / carryable /
  moves / ground / lifts），每个文件只导出参数模板与所属阶段，**不含任何函数**；
  门禁会拦住想在元素里写行为代码的改动。
- `src/core/kernel/`：固定 60 tick 推进、相位顺序、预算、快照与回放。
- `types/<category>/<kind>.type.json`：机关/物品的**类型数据**（状态、声明槽、默认宽度、
  画法名），纯 JSON；`types/manifest.json` 决定加载顺序，构建时内联进产物。
- `src/core/interpreters/`：两层注册表。数据制品解释器固定 4 种（`level` / `bundle` /
  `manifest` / `recording`）；内容抽象工厂固定 3 种（`factories/` 下的 `map` / `mechanism` /
  `item`），每类工厂按同一份接口产出自己的类型，注册只能落到已有类型上。
- `src/app/`：用例层、内容源端口、错误码与 Agent skill 清单。
- `skills/gothere-levels/SKILL.md`：Agent 技能说明书（**生成物，入库**；改 schema 后
  `pnpm build:agent` 重新生成）。
- `levels/*.level.json` + `levels/manifest.json`：关卡内容制品。
- `bin/gothere.mjs`：源码树上的 CLI shell（把 process / 文件系统接给 `src/app/cli.js`）；
  交付用的是独立制品 `dist/gothere-cli.mjs`。
- `src/app/cli.js`：CLI 产品逻辑（参数解析、输出格式、退出码），只用注入的端口，不碰
  process 与文件系统，因此可以被单文件打包。
- `src/styles/app.css`：Tailwind CSS v4 入口。设计令牌放在 `@theme`，组件类用 `@apply` 组合工具类；构建输出到 `src/style.css`（生成物，不入库）。
- `src/scene.js`：Canvas 场景与原创程序绘制角色；未知类型走占位回退。
- `src/main.js`：界面、输入、固定步长驱动和关卡数据面板。
- `tests/`：契约、声明槽、解释器、用例、CLI、内容与 HTTP 测试。
- `scripts/build.mjs`：无第三方运行时依赖的单文件打包，构建期校验并内联关卡。
- `scripts/build-cli.mjs`：把 CLI 打成单文件独立制品（`gothere-cli.mjs` 与给 SEA 用的
  `gothere-cli.cjs`）。
- `scripts/build-binary.mjs`：用 SEA blob + postject 产出**任意目标平台**的单二进制并自检。
- `scripts/build-release.mjs`：一个目标平台的全套制品（二进制 + 技能包 + 桌面客户端）。
- `scripts/targets.mjs`：目标平台解析、官方 node 下载与魔数校验。
- `scripts/rcodesign.mjs`：在非 macOS 宿主上给 Mach-O / .app 做 ad-hoc 签名。
- `scripts/build-skill.mjs`：生成 `SKILL.md`（据 schema 现算）并打出 Agent 技能包。
- `scripts/build-web.mjs`：产出给 nginx 用的静态站点包（单个 index.html）。
- `scripts/build-desktop.mjs`：把单文件游戏包成 Electron 客户端（asar + 平台压缩包）。
- `scripts/archive.mjs`：按平台用系统自带工具打包（tar.gz / zip），不引第三方依赖。
- `desktop/main.cjs`：Electron 主进程（窗口、菜单、外链与权限策略）。
- `scripts/bundle.mjs` / `scripts/content.mjs`：两条制品共用的模块打包器与内容读取。
- `scripts/check-layers.mjs`：分层门禁（依赖只向下、声明槽必须是叶子模块且不含函数）。
- `scripts/css.mjs`：调用 Tailwind CLI 编译样式；`scripts/dev.mjs` 同时跑样式监听与开发服务器。
- `scripts/browser.mjs`：端到端脚本共用的 Chromium 选择逻辑。
- `scripts/share.mjs`：只转发单文件游戏的临时 HTTPS 试玩。

## DSL 语义

当前空间为 1200×640，地面高度 440；角色只向右自动行走，speed 单位为世界单位/秒。地面由水平区间组成，桥延伸时补足地面。渲染器可以完全替换。

实体类型（预设）：机关族 switch（off/on）、bridge（folded/extended）、hazard（running/stopped）、gate（closed/open）、plate（idle/pressed）、lift（lower/upper）、guard（patrolling/stopped）、crusher（active/parked）；物品族 axe、hammer 与 key（idle/held/used，标签 `key`、`yellow`，被用掉后变成 `used` 且不再绘制）。类型只是「声明 + 外观」的数据，元素里没有代码：想给某个实例换配置就覆盖同名字段（`"blocks": false` 关掉一条声明），不需要新类型。

机关需要物品时，需求写在**自己**身上，读的是角色的物品卡：

```json
"reacts": {
  "on": "contact",
  "need": { "kind": "key", "tags": ["key", "yellow"] },
  "consume": true,
  "actions": [{ "type": "become", "state": "pressed" }, { "type": "publish", "event": "enter" }],
  "unmet": { "reason": "locked", "message": "踏板下面有个锁眼，要一把黄钥匙。" }
}
```

条件不满足时机关只提示一次、不改变任何状态；满足时物品会变成它自己声明的 `consumedState`。若某条需求的标签在关卡里无人提供，加载期就会报「没有任何元素提供」。

规则是**纯连线表**：`on: { type: "click" | "enter", source: "entity-id" }` 加 `actions`，**没有 `if`**。条件只能出现在元素自己的声明里（`reacts.from` / `reacts.need` / `blocks.inState`），写 `if` 会在加载前被拒绝并提示改法。动作支持 `{type:"set",target,state}` 和 `{type:"after",ticks,actions}`。未知字段、跨类别的声明、非法引用、重复 ID 和错误状态都会在加载前拒绝。

每个 tick 的固定阶段（元素无法改变这个顺序）：① 到期动作按 due/order → ② 输入（元素自己决定听不听，听懂才发事件给连线表）→ ③ 自走（`moves`）→ ④ 角色前进与脚底支撑 → ⑤ 携带同步（拿起 / 跟随 / 放下）→ ⑥ 接触（`reacts` / `harms` / `lifts`）→ ⑦ 阻挡（`blocks`）→ ⑧ 终点与超时。规则按声明顺序执行，后续规则可以观察前面规则的状态变化。延迟相对动作实际执行的 tick 计算；after 不支持取消，同一目标的到期写入按上述顺序依次生效。条件在规则触发时检查，延迟动作不重新判断条件。

输入只在 running 状态接收，并在下一个 tick 处理。暂停不处理输入；单步可从 ready/paused 执行一个 tick。每局上限 36,000 tick；暂停、切关、重置和倍速均不改变模拟规则。这里的确定性面向同一份关卡数据和兼容的 JS 运行时，不是跨版本物理引擎的承诺。

运行时最多执行 1,024 个动作/tick，并最多保留 256 个待执行计时器。超过预算会结束当前局并显示原因，重置后可以继续测试，避免重复触发的导入规则堆积任务。

## 验证

```sh
pnpm test
pnpm test:coverage
```

核心测试使用 Node 内置 test，样式由 Tailwind 预构建（`pretest` 自动执行）。覆盖率阈值针对可复用的 `src/core/`，画面和交互通过浏览器流程测试验证。

浏览器测试脚本使用 Playwright（版本由 `package.json` 锁定）。首次运行需要下载 Chromium，Windows 已安装标准位置的 Edge 时脚本会直接使用它：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

测试截图保存在 artifacts/。

分享命令运行期间，可用 `pnpm test:share` 检查真实公网 HTTPS 链接，并通过手机视口的触控操作实际通关。`pnpm test:e2e` 也覆盖断网后从本地 HTML 直接试玩，以及公开预览服务器的内容安全策略。

原型不包含拖放编辑器和随机地图生成；后续阶段见 project.md。
